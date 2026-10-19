import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rolledWorkshopWound,
  workshopWoundEffects,
  workshopSupplyUse,
  workshopSpendGrit,
} from "../src/rules/workshop-resources.mjs";
import { woundRoll, woundResult, WOUND_KEYS } from "../src/rules/wounds.mjs";
import { DAMAGE_TYPES } from "../src/rules/damage.mjs";
import { workshopCharacter } from "../src/rules/workshop-character.mjs";
import { workshopVitals } from "../src/rules/workshop-vitals.mjs";
import { normalizeWorkshopPlay } from "../src/rules/workshop-play.mjs";
import {
  writePortableCharacter,
  readPortableCharacter,
} from "../src/rules/portable-character.mjs";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const wounds = await read("../static/data/wounds.json"),
  inventory = await read("../static/data/inventory.json"),
  choices = await read("../static/data/choices.json"),
  heroes = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: choices.records,
  inventory,
  wounds,
  commit: choices.sourceCommit,
};
const hero = () => structuredClone(heroes.characters[0].draft);

test("web wound records use every approved type/result and highest-three prior-wound cap", () => {
  for (const type of DAMAGE_TYPES)
    for (const key of WOUND_KEYS) {
      const faces = key.split("").map(Number),
        result = rolledWorkshopWound({
          catalog: wounds,
          damageType: type,
          priorWounds: 0,
          faces,
          id: "wound-test",
        });
      assert.equal(result.wound.roll.key, key);
      assert.deepEqual(result.effects, woundResult(wounds, type, key).effects);
      assert.deepEqual(
        workshopWoundEffects([result.wound], wounds).map(
          ({ id, injury, ...e }) => e,
        ),
        result.effects,
      );
    }
  const result = rolledWorkshopWound({
    catalog: wounds,
    damageType: "cold",
    priorWounds: 20,
    faces: [1, 1, 3, 5, 6],
    id: "wound-test",
  });
  assert.equal(result.wound.roll.key, woundRoll(20, [1, 1, 3, 5, 6]).key);
});

test("rolled lasting wound Speed is additive with Slowed and survives portable state", () => {
  const draft = hero(),
    w = rolledWorkshopWound({
      catalog: wounds,
      damageType: "physical",
      priorWounds: 0,
      faces: [1, 6, 6],
      id: "wound-foot",
    }).wound;
  draft.play = {
    wounds: [w],
    gritSpent: 1,
    collapsed: { defenses: true, "actions-main-action": true },
    favorites: {
      abilities: ["ability-treat-soft-tissue"],
      items: ["creation-outfit"],
    },
    conditions: [
      {
        id: "slowed",
        source: "spell",
        key: "slowed",
        rating: 2,
        persistence: "temporary",
      },
    ],
  };
  const saved = readPortableCharacter(
    writePortableCharacter(draft, catalogs),
    catalogs,
  ).draft;
  assert.deepEqual(
    saved.play,
    draft.play.inventory
      ? draft.play
      : {
          ...draft.play,
          inventory: { added: [], removed: [] },
          languages: { added: [], removed: [] },
        },
  );
  const p = workshopCharacter(saved, catalogs),
    v = workshopVitals(p, saved, wounds);
  assert.equal(v.speed, Math.max(0, p.summary.speed - 3));
  assert.equal(v.grit, p.summary.gritGranted - 1);
});

test("quantity overrides change Bulk and zero removes equipment benefits without rewriting creation", () => {
  const draft = hero(),
    p = workshopCharacter(draft, catalogs),
    item = p.inventory.items.find((i) => i.catalogId === "item-food-bundle");
  draft.play = {
    inventory: {
      added: [],
      removed: [],
      overrides: { [item.instanceId]: { quantity: 3, inventoryDie: 6 } },
    },
  };
  const after = workshopCharacter(draft, catalogs);
  assert.equal(
    after.inventory.items.find((i) => i.instanceId === item.instanceId)
      .quantity,
    3,
  );
  assert.equal(
    after.inventory.bulk,
    p.inventory.bulk + item.definition.bulk * (3 - item.quantity),
  );
  assert.equal(
    after.inventory.items.find((i) => i.instanceId === item.instanceId)
      .inventoryDie,
    6,
  );
  const armor = p.inventory.items.find(
    (i) => i.catalogId === "item-ordinary-light-armor",
  );
  draft.loadout ??= {};
  draft.loadout[armor.instanceId] = { worn: true, carried: true };
  assert.equal(workshopCharacter(draft, catalogs).resistances.physical, 1);
  draft.play.inventory.overrides[armor.instanceId] = { quantity: 0 };
  const zero = workshopCharacter(draft, catalogs);
  assert.equal(zero.resistances.physical ?? 0, 0);
  assert.equal(
    zero.inventory.items.find((i) => i.instanceId === armor.instanceId).carried,
    false,
  );
});

test("supply final use heals before exhaustion without consuming quantity; normal supply steps down on 1 only", () => {
  const item = {
    catalogId: "item-lesser-healing-bottle",
    quantity: 2,
    inventoryDie: 4,
  };
  const used = workshopSupplyUse({
    item,
    face: 1,
    hp: 3,
    maxHp: 25,
    catalog: inventory,
  });
  assert.equal(used.hp, 9);
  assert.equal(used.after, 0);
  assert.equal(item.quantity, 2);
  assert.equal(item.inventoryDie, 4);
  assert.equal(
    workshopSupplyUse({
      item: { ...item, catalogId: "item-food-bundle", inventoryDie: 8 },
      face: 1,
      hp: 3,
      maxHp: 25,
      catalog: inventory,
    }).after,
    6,
  );
  assert.equal(
    workshopSupplyUse({ item, face: 4, hp: 24, maxHp: 25, catalog: inventory })
      .hp,
    25,
  );
  assert.throws(
    () =>
      workshopSupplyUse({
        item,
        face: 1,
        hp: 0,
        maxHp: 25,
        catalog: inventory,
        lastWords: true,
      }),
    /Last Words/,
  );
  assert.throws(
    () =>
      workshopSupplyUse({
        item: { ...item, quantity: 0 },
        face: 1,
        hp: 0,
        maxHp: 25,
        catalog: inventory,
      }),
    /quantity/,
  );
});

test("Grit spends once per explicit use, restores full HP, clears marks and cannot reverse Last Words", () => {
  assert.deepEqual(workshopSpendGrit({ spent: 1, granted: 2, maxHp: 25 }), {
    gritSpent: 2,
    hp: 25,
    failedDeathRolls: 0,
  });
  assert.throws(
    () => workshopSpendGrit({ spent: 2, granted: 2, maxHp: 25 }),
    /No Grit/,
  );
  assert.throws(
    () =>
      workshopSpendGrit({ spent: 0, granted: 2, maxHp: 25, lastWords: true }),
    /Last Words/,
  );
});

test("malformed resource state cannot inject effects, impossible wound identities or invalid supply overrides", () => {
  for (const value of [
    { gritSpent: -1 },
    { lastWords: "yes" },
    { collapsed: { defenses: "false" } },
    { favorites: { items: [{}] } },
    {
      inventory: { added: [], removed: [], overrides: { x: { quantity: -1 } } },
    },
    {
      inventory: {
        added: [],
        removed: [],
        overrides: { x: { inventoryDie: 7 } },
      },
    },
  ])
    assert.throws(() => normalizeWorkshopPlay(value, catalogs));
  const w = rolledWorkshopWound({
    catalog: wounds,
    damageType: "physical",
    priorWounds: 0,
    faces: [1, 6, 6],
    id: "wound-test",
  }).wound;
  assert.throws(() =>
    normalizeWorkshopPlay(
      { wounds: [{ ...w, catalogId: "wound-mental-166" }] },
      catalogs,
    ),
  );
  const normalized = normalizeWorkshopPlay(
    { wounds: [{ ...w, effects: [{ kind: "movementPenalty", amount: 99 }] }] },
    catalogs,
  );
  assert.equal(normalized.wounds[0].effects, undefined);
});
