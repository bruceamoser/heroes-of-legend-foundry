import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  itemArrangement,
  normalizeWorkshopPlay,
} from "../src/rules/workshop-play.mjs";
import {
  workshopCharacter,
  emptyLevelDraft,
} from "../src/rules/workshop-character.mjs";
import {
  readPortableCharacter,
  writePortableCharacter,
} from "../src/rules/portable-character.mjs";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const choices = await read("../static/data/choices.json"),
  inventory = await read("../static/data/inventory.json"),
  heroes = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: choices.records,
  inventory,
  commit: choices.sourceCommit,
};
const borin = () => structuredClone(heroes.characters[0].draft);

test("held and worn imply carried; clearing carried clears both without item-type restrictions", () => {
  const both = { held: true, worn: true, carried: true };
  const stored = itemArrangement(both, "carried", false);
  assert.deepEqual(stored, { held: false, worn: false, carried: false });
  assert.deepEqual(itemArrangement(stored, "held", true), {
    held: true,
    worn: false,
    carried: true,
  });
  assert.deepEqual(itemArrangement(stored, "worn", true), {
    held: false,
    worn: true,
    carried: true,
  });
  assert.deepEqual(itemArrangement(both, "worn", false), {
    held: true,
    worn: false,
    carried: true,
  });
});

test("play inventory changes affect Bulk and defenses but never rewrite or rerun grants", () => {
  const d = borin(),
    original = workshopCharacter(d, catalogs);
  const armor = original.inventory.items.find(
    (i) => i.catalogId === "item-ordinary-light-armor",
  );
  d.play = {
    inventory: {
      added: [
        { id: "item-rope-coil", instanceId: "inventory-rope", quantity: 3 },
      ],
      removed: [armor.instanceId],
    },
  };
  d.loadout = {
    [armor.instanceId]: { worn: true },
    "inventory-rope": { held: true, worn: true },
  };
  let p = workshopCharacter(d, catalogs);
  assert.equal(p.inventory.bulk, original.inventory.bulk + 2);
  assert(!p.inventory.items.some((i) => i.instanceId === armor.instanceId));
  assert.equal(p.resistances.physical ?? 0, 0);
  assert.deepEqual(p.creation.inventory, original.creation.inventory);
  assert.equal(p.inventory.remainingCoins, original.inventory.remainingCoins);
  d.progression = { level: 2, levels: {} };
  p = workshopCharacter(d, catalogs);
  assert(!p.inventory.items.some((i) => i.instanceId === armor.instanceId));
  assert.equal(
    p.inventory.items.filter((i) => i.instanceId === "inventory-rope").length,
    1,
  );
  d.loadout["inventory-rope"] = itemArrangement(
    d.loadout["inventory-rope"],
    "carried",
    false,
  );
  assert.equal(
    workshopCharacter(d, catalogs).inventory.bulk,
    original.inventory.bulk - 1,
  );
});

test("play languages and conditions round trip without altering creation identity", () => {
  const d = borin(),
    original = workshopCharacter(d, catalogs);
  d.play = {
    languages: {
      added: [
        {
          id: "river-sign",
          name: "River Sign",
          form: "signed",
          written: false,
        },
      ],
      removed: ["common"],
    },
    conditions: [
      {
        id: "burn-1",
        key: "burning",
        rating: 2,
        persistence: "starred",
        source: "sheet",
      },
      {
        id: "prone-1",
        key: "prone",
        rating: 1,
        persistence: "binary",
        source: "sheet",
      },
    ],
  };
  const text = writePortableCharacter(d, catalogs, { ready: true });
  assert.equal(JSON.parse(text).schemaVersion, 3);
  const { draft, preview: p } = readPortableCharacter(text, catalogs);
  assert(!p.play.languages.some((l) => l.id === "common"));
  const lang = p.play.languages.find((l) => l.id === "river-sign");
  assert(lang.permissions.sign);
  assert.equal(lang.permissions.speak, false);
  assert.equal(lang.permissions.read, false);
  assert.equal(lang.permissions.write, false);
  assert.equal(p.play.conditionSummary.burning.rating, 2);
  assert.equal(p.play.conditionSummary.prone.active, true);
  assert.deepEqual(
    p.creation.summary.languages,
    original.creation.summary.languages,
  );
  assert.deepEqual(draft.play.conditions, d.play.conditions);
  assert.equal(writePortableCharacter(draft, catalogs, { ready: true }), text);
});

test("portable play controls reject malformed item, language and condition state", () => {
  for (const play of [
    {
      inventory: {
        added: [{ id: "unknown", instanceId: "inventory-test", quantity: 1 }],
        removed: [],
      },
    },
    {
      inventory: {
        added: [
          { id: "item-rope-coil", instanceId: "inventory-test", quantity: -1 },
        ],
        removed: [],
      },
    },
    { inventory: { added: [], removed: ['x" onclick="bad'] } },
    {
      languages: {
        added: [{ id: "custom", name: "", form: "signed", written: true }],
        removed: [],
      },
    },
    {
      conditions: [
        {
          id: "prone",
          key: "prone",
          rating: 2,
          persistence: "binary",
          source: "sheet",
        },
      ],
    },
    {
      conditions: [
        {
          id: "burn",
          key: "burning",
          rating: 0,
          persistence: "starred",
          source: "sheet",
        },
      ],
    },
    {
      conditions: [
        {
          id: "bad",
          key: "nonexistent",
          rating: 1,
          persistence: "binary",
          source: "sheet",
        },
      ],
    },
  ])
    assert.throws(() => normalizeWorkshopPlay(play, catalogs));
  for (const version of [1, 2]) {
    const value = JSON.parse(writePortableCharacter(borin(), catalogs));
    value.schemaVersion = version;
    assert(readPortableCharacter(value, catalogs).preview.valid);
  }
});

test("unselected signatures do not block spending; choosing an earlier signature resolves carried errors", () => {
  const d = borin();
  d.progression = {
    level: 4,
    levels: {
      3: {
        ...emptyLevelDraft(),
        purchases: [{ id: "ability-conditioned-body" }],
      },
    },
  };
  const pending = workshopCharacter(d, catalogs);
  assert(pending.state.abilities.includes("ability-conditioned-body"));
  assert(pending.errors.some((e) => e.code === "signature"));
  const signature = catalogs.choices.find((r) => r.id === d.classId)
    .signatures[3][0];
  // New UI records the choice at its actual tier, even when the hero is already level 4.
  d.progression.levels[3].signatures[3] = signature;
  const completed = workshopCharacter(d, catalogs);
  assert.deepEqual(completed.errors, []);
  assert.equal(completed.development.current, pending.development.current);
  assert.equal(
    completed.state.abilities.filter((id) => id === signature).length,
    1,
  );
  // Older version-2 plans may instead record the delayed signature at level 4.
  delete d.progression.levels[3].signatures[3];
  d.progression.levels[4] = {
    ...emptyLevelDraft(),
    signatures: { 3: signature },
  };
  assert.deepEqual(workshopCharacter(d, catalogs).errors, []);
});

test("memorized message persists with a strict 50 word editing bound", () => {
  const message = Array(50).fill("word").join(" ");
  assert.equal(
    normalizeWorkshopPlay({ memorizedMessage: message }, catalogs)
      .memorizedMessage,
    message,
  );
  assert.throws(() =>
    normalizeWorkshopPlay({ memorizedMessage: message + " extra" }, catalogs),
  );
});

test("web vitals and wound history survive portable current-only saves with bounded validation", () => {
  const draft = borin();
  draft.play = {
    hp: 3,
    failedDeathRolls: 2,
    wounds: [{ id: "wound-arm", name: "Broken arm", notes: "Bone injury" }],
  };
  const saved = readPortableCharacter(
    writePortableCharacter(draft, catalogs),
    catalogs,
  ).draft;
  assert.deepEqual(saved.play.hp, 3);
  assert.deepEqual(saved.play.failedDeathRolls, 2);
  assert.deepEqual(saved.play.wounds, draft.play.wounds);
  for (const play of [
    { hp: -1 },
    { hp: 0.5 },
    { failedDeathRolls: 4 },
    { wounds: [{ id: "bad", name: "", notes: "" }] },
    { wounds: [draft.play.wounds[0], draft.play.wounds[0]] },
  ])
    assert.throws(() => normalizeWorkshopPlay(play, catalogs), /malformed/);
});

test("browser death-roll outcomes agree with native survival for every 3d6 result and prior mark count", async () => {
  const { workshopDeathResult } = await import(
    "../src/rules/workshop-vitals.mjs"
  );
  const { survivalState, resolveSurvival } = await import(
    "../src/rules/survival.mjs"
  );
  for (let failed = 0; failed < 3; failed++)
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        for (let c = 1; c <= 6; c++) {
          const retained = [a, b, c],
            fortitude = 2;
          const state = survivalState({ hp: 0, maxHp: 20, marks: failed });
          state.due = 0;
          state.choice = { kind: "roll", turn: 0, resolved: false };
          const native = resolveSurvival(state, { retained, fortitude });
          const web = workshopDeathResult({
            failed,
            hp: 0,
            retained,
            fortitude,
          });
          assert.equal(web.failed, native.marks);
          assert.equal(web.hp, native.hp);
        }
});

test("web Speed shows Slowed and encumbrance against unencumbered maximum; missing HP starts full", async () => {
  const { workshopVitals } = await import("../src/rules/workshop-vitals.mjs");
  const d = borin(),
    initial = workshopCharacter(d, catalogs);
  assert.equal(workshopVitals(initial, d).hp, initial.summary.maximumHp);
  d.play = {
    hp: 2,
    conditions: [
      {
        id: "slow",
        key: "slowed",
        source: "spell",
        rating: 2,
        persistence: "temporary",
      },
    ],
  };
  const p = workshopCharacter(d, catalogs),
    live = workshopVitals(p, d);
  assert.equal(live.hp, 2);
  assert.equal(live.speed, Math.max(0, p.summary.speed - 2));
  assert.equal(live.maxSpeed, p.summary.unencumberedSpeed);
});
