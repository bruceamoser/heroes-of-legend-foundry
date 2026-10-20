import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { workshopCraft } from "../src/rules/workshop-crafting.mjs";
import { normalizeWorkshopPlay } from "../src/rules/workshop-play.mjs";
import {
  writePortableCharacter,
  readPortableCharacter,
} from "../src/rules/portable-character.mjs";
const read = async (p) =>
  JSON.parse(await readFile(new URL(p, import.meta.url)));
const inventory = await read("../static/data/inventory.json");
const choices = await read("../static/data/choices.json");
const heroes = await read("./fixtures/reference-heroes.json");
const catalogs = {
  inventory,
  choices: choices.records,
  commit: choices.sourceCommit,
};
const recipe = (id) => inventory.recipes.find((r) => r.id === `recipe-${id}`);
const apply = (play, r, tier = "standard", extra = {}) =>
  workshopCraft({
    play,
    recipe: recipe(r),
    tier,
    items: [],
    instanceId: "inventory-craft-test",
    ...extra,
  }).play;
test("permanent projects persist progress, finish exactly at target and start another product", () => {
  const initial = { inventory: { added: [], removed: [] } };
  let play = apply(initial, "twisted-cord");
  assert.equal(play.crafting["recipe-twisted-cord"].progress, 2);
  assert.equal(initial.crafting, undefined);
  play = apply(play, "twisted-cord");
  assert.equal(play.inventory.added[0].id, "item-rope-coil");
  assert.equal(play.crafting["recipe-twisted-cord"].completed, 1);
  play = apply(play, "twisted-cord", "weak");
  assert.equal(play.crafting["recipe-twisted-cord"].progress, 1);
  assert.equal(play.inventory.added.length, 1);
  const draft = structuredClone(
    heroes.characters.find((h) => h.id === "oren-brass").draft,
  );
  draft.play = play;
  const loaded = readPortableCharacter(
    writePortableCharacter(draft, catalogs),
    catalogs,
  );
  assert.deepEqual(loaded.draft.play.crafting, play.crafting);
  assert.deepEqual(loaded.draft.play.inventory.added, play.inventory.added);
});
test("recipes without inventory products record independent completed projects", () => {
  let play = apply({}, "wooden-brace", "strong");
  play = apply(play, "wooden-brace", "weak");
  play = apply(play, "twisted-cord", "weak");
  assert.equal(play.crafting["recipe-wooden-brace"].completed, 1);
  assert.equal(play.crafting["recipe-twisted-cord"].progress, 1);
  assert.equal(play.inventory.added.length, 0);
});
test("supply crafting creates from empty, refills the selected stack and respects caps", () => {
  let play = apply({}, "bound-torches", "weak");
  assert.equal(
    play.inventory.overrides["inventory-craft-test"].inventoryDie,
    4,
  );
  const items = [
    {
      instanceId: "inventory-craft-test",
      catalogId: "item-lighting-bundle",
      quantity: 1,
      inventoryDie: 4,
    },
  ];
  play = apply(play, "bound-torches", "strong", {
    items,
    supplyId: "inventory-craft-test",
  });
  assert.equal(
    play.inventory.overrides["inventory-craft-test"].inventoryDie,
    6,
  );
  assert.equal(play.inventory.added.length, 1);
  items[0].inventoryDie = 8;
  play = apply(play, "bound-torches", "weak", {
    items,
    supplyId: "inventory-craft-test",
  });
  assert.equal(
    play.inventory.overrides["inventory-craft-test"].inventoryDie,
    8,
  );
  assert.throws(
    () =>
      apply(play, "bound-torches", "weak", {
        items,
        supplyId: "inventory-other",
      }),
    /matching supply/,
  );
});
test("portable crafting rejects unknown recipes and malformed progress", () => {
  for (const crafting of [
    { unknown: { progress: 0, completed: 0, attempts: 1 } },
    { "recipe-twisted-cord": { progress: 5, completed: 0, attempts: 1 } },
    { "recipe-twisted-cord": { progress: 1, completed: -1, attempts: 1 } },
  ])
    assert.throws(
      () => normalizeWorkshopPlay({ crafting }, catalogs),
      /malformed/,
    );
});
