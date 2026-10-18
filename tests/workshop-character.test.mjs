import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  workshopCharacter,
  mainActions,
  actionTiming,
  craftingActions,
  emptyLevelDraft,
} from "../src/rules/workshop-character.mjs";
import {
  readPortableCharacter,
  writePortableCharacter,
} from "../src/rules/portable-character.mjs";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const source = await read("../static/data/choices.json"),
  inventory = await read("../static/data/inventory.json"),
  heroes = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: source.records,
  inventory,
  commit: source.sourceCommit,
};
const borin = () => structuredClone(heroes.characters[0].draft);
test("grants, supply dice, armor and carried Bulk remain separate from creation history", () => {
  const d = borin(),
    original = workshopCharacter(d, catalogs);
  const armor = original.inventory.items.find(
    (i) => i.catalogId === "item-ordinary-medium-armor",
  );
  assert.equal(armor.source, "ability-wear-medium-armor");
  assert.equal(original.resistances.physical ?? 0, 0);
  d.loadout = { [armor.instanceId]: { worn: true } };
  const worn = workshopCharacter(d, catalogs);
  assert.equal(worn.resistances.physical, 2);
  assert.equal(worn.inventory.bulk, original.inventory.bulk);
  d.loadout[armor.instanceId] = { carried: false, worn: true };
  const stored = workshopCharacter(d, catalogs);
  assert.equal(stored.resistances.physical ?? 0, 0);
  assert.equal(stored.inventory.bulk, original.inventory.bulk - 1);
  assert.deepEqual(stored.creation.inventory, original.creation.inventory);
  assert.equal(
    stored.inventory.items.find((i) => i.catalogId === "item-food-bundle")
      .inventoryDie,
    8,
  );
  d.shopping.push({
    id: "item-rope-coil",
    quantity: 10,
    hands: 0,
    instanceId: "shop-rope",
  });
  d.coinOverride = true;
  const loaded = workshopCharacter(d, catalogs);
  assert(loaded.inventory.encumbrance > 0);
  d.loadout["shop-rope"] = { carried: false };
  const unloaded = workshopCharacter(d, catalogs);
  assert.equal(unloaded.inventory.bulk, loaded.inventory.bulk - 10);
  assert(unloaded.summary.speed > loaded.summary.speed);
});
test("coin override is explicit and survives transfer without creating coins", () => {
  const d = borin();
  d.shopping.push({ id: "item-ordinary-heavy-armor", quantity: 100, hands: 0 });
  const rejected = workshopCharacter(d, catalogs);
  assert(rejected.errors.some((e) => e.code === "coins"));
  d.coinOverride = true;
  const restored = readPortableCharacter(
    writePortableCharacter(d, catalogs, { ready: true }),
    catalogs,
  );
  assert(restored.preview.valid);
  assert(restored.preview.inventory.remainingCoins < 0);
  assert.equal(
    restored.preview.inventory.startingCoins,
    rejected.inventory.startingCoins,
  );
  assert.equal(
    restored.preview.inventory.overBudget,
    -restored.preview.inventory.remainingCoins,
  );
});
test("lowering and raising levels replays awards, purchases and signatures without duplicates", () => {
  const d = borin();
  d.progression = {
    level: 2,
    levels: {
      2: {
        ...emptyLevelDraft(),
        purchases: [{ id: "ability-conditioned-body" }],
      },
    },
  };
  let p = workshopCharacter(d, catalogs);
  assert.deepEqual(p.errors, []);
  const cost = catalogs.choices.find(
    (r) => r.id === "ability-conditioned-body",
  ).cost;
  assert.deepEqual(p.development, {
    level: 2,
    current: 10 - cost,
    spent: 21 + cost,
    total: 31,
    expired: 0,
  });
  assert.equal(p.summary.maximumHp, 26);
  d.progression.level = 3;
  p = workshopCharacter(d, catalogs);
  assert(p.errors.some((e) => e.code === "signature"));
  const signature = catalogs.choices.find((r) => r.id === d.classId)
    .signatures[3][0];
  d.progression.levels[3] = {
    ...emptyLevelDraft(),
    signatures: { 3: signature },
  };
  p = workshopCharacter(d, catalogs);
  assert.deepEqual(p.errors, []);
  assert.equal(p.development.total, 42);
  assert.equal(p.development.current, 21 - cost);
  assert.equal(p.summary.gritGranted, 3);
  assert(p.state.abilities.includes(signature));
  const snapshot = structuredClone(p);
  d.progression.level = 1;
  p = workshopCharacter(d, catalogs);
  assert.equal(p.development.total, 21);
  assert.equal(p.summary.maximumHp, 25);
  assert(!p.state.abilities.includes(signature));
  d.progression.level = 3;
  p = workshopCharacter(d, catalogs);
  assert.deepEqual(p, snapshot);
  const restored = readPortableCharacter(
    writePortableCharacter(d, catalogs),
    catalogs,
  );
  assert.deepEqual(restored.preview.state, p.state);
  assert.deepEqual(restored.draft.progression, d.progression);
});
test("main actions follow carried weapons and manual visibility, preserve timing and known recipes", () => {
  const d = borin(),
    p = workshopCharacter(d, catalogs);
  let actions = mainActions(p, d, catalogs);
  assert(actions.find((e) => e.record.id === "ability-basic-melee").visible);
  assert(!actions.find((e) => e.record.id === "ability-basic-ranged").visible);
  d.basicActions = {
    "ability-basic-melee": false,
    "ability-basic-ranged": true,
  };
  actions = mainActions(p, d, catalogs);
  assert(!actions.find((e) => e.record.id === "ability-basic-melee").visible);
  assert(actions.find((e) => e.record.id === "ability-basic-ranged").visible);
  assert.deepEqual(
    actionTiming(
      catalogs.choices.find((r) => r.id === "ability-wear-medium-armor"),
    ),
    ["Passive"],
  );
  const crafter = workshopCharacter(
    heroes.characters.find((h) => h.id === "oren-brass").draft,
    catalogs,
  );
  const crafts = craftingActions(crafter, catalogs);
  assert(crafts.length >= 2);
  assert(
    crafts.every(
      (c) =>
        crafter.state.recipes.includes(c.recipe.id) &&
        crafter.state.abilities.includes(c.ability.id) &&
        c.attribute,
    ),
  );
});
test("v1 files remain readable; v2 validates persistent choices before restoring them", () => {
  const v = JSON.parse(writePortableCharacter(borin(), catalogs));
  v.schemaVersion = 1;
  assert(readPortableCharacter(v, catalogs).preview.valid);
  for (const mutate of [
    (d) => (d.coinOverride = "yes"),
    (d) => (d.loadout = { "creation-outfit": { worn: 1 } }),
    (d) => (d.basicActions = { "ability-basic-melee": "false" }),
    (d) => (d.progression = { level: 0, levels: {} }),
    (d) =>
      (d.progression = {
        level: 2,
        levels: { 2: { purchases: [], signatures: { 4: "bad" } } },
      }),
    (d) => (d.shopping[0].instanceId = "grant:duplicate"),
  ]) {
    const invalid = structuredClone(v);
    mutate(invalid.draft);
    assert.throws(() => readPortableCharacter(invalid, catalogs));
  }
});
