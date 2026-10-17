import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { creationPreview, newCreationDraft } from "../src/rules/creation.mjs";
const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../static/data/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const choices = (await read("choices")).records,
  inventory = await read("inventory");
const draft = () => ({
  ...newCreationDraft(),
  name: "Reed",
  attributes: {
    brawn: 1,
    fortitude: 0,
    agility: 0,
    guile: 0,
    knowledge: 1,
    reason: 1,
  },
  ancestryId: "ancestry-human",
  traitIds: ["trait-human-weathered", "trait-human-far-walker"],
  languages: { home: "dwarven", extraSpoken: [] },
  culture: { id: "origin-culture-deep-halls", pair: 0 },
  background: { id: "origin-background-bridge-worker", pair: 0 },
  classId: "class-intellect",
  classDisciplines: ["discipline-craft", "discipline-scholarship"],
  signatureId: "ability-signature-intellect-spot-the-leverage",
  acquisitions: {
    "ability-trail-workshop": {
      recipes: ["recipe-travel-food", "recipe-bound-torches"],
    },
  },
});
test("creation connects origin recipes to later recipe purchases without free products", () => {
  const d = draft();
  d.purchases[0].push({
    id: "ability-ordinary-recipe-study",
    recipeIds: [
      "recipe-fletched-ammunition",
      "recipe-simple-replacement-leg",
    ],
  });
  const r = creationPreview(d, choices, inventory);
  assert.deepEqual(r.errors, []);
  assert(r.valid);
  assert(r.state.recipes.includes("recipe-fletched-ammunition"));
  assert(r.state.recipes.includes("recipe-simple-replacement-leg"));
  assert.deepEqual(
    r.ledger.find(
      (entry) => entry.sourceId === "ability-ordinary-recipe-study",
    ).recipeIds,
    ["recipe-fletched-ammunition", "recipe-simple-replacement-leg"],
  );
  assert.deepEqual(
    r.inventory.items.map((i) => i.catalogId),
    ["item-travel-clothes", "item-craft-tools"],
  );
  assert.equal(r.inventory.bulk, 1);
  assert.equal(
    r.state.acquisitionReceipts.filter(
      (a) => a.abilityId === "ability-trail-workshop",
    ).length,
    1,
  );
  d.acquisitions["ability-trail-workshop"].recipes = [
    "recipe-fletched-ammunition",
    "recipe-bound-torches",
  ];
  const repaired = creationPreview(d, choices, inventory);
  assert(!repaired.valid);
  assert.equal(repaired.draft.purchases[0].length, 1);
  assert(repaired.errors.some((e) => e.code === "purchase"));
  assert(!repaired.state.recipes.includes("recipe-simple-replacement-leg"));
  assert.equal(
    repaired.draft.purchases[0][0].recipeIds[1],
    "recipe-simple-replacement-leg",
  );
});
test("old one-recipe drafts stay visible for explicit two-recipe repair", () => {
  const d = draft();
  d.purchases[0].push({
    id: "ability-ordinary-recipe-study",
    recipeId: "recipe-fletched-ammunition",
  });
  const rejected = creationPreview(d, choices, inventory);
  assert(!rejected.valid);
  assert.equal(rejected.draft.purchases[0].length, 1);
  assert.equal(
    rejected.draft.purchases[0][0].recipeId,
    "recipe-fletched-ammunition",
  );
  assert(
    rejected.errors.some(
      (entry) =>
        entry.code === "purchase" &&
        entry.reasons.some((reason) => reason.code === "recipe-legacy"),
    ),
  );
  assert(!rejected.state.recipes.includes("recipe-fletched-ammunition"));

  d.purchases[0][0] = {
    id: "ability-ordinary-recipe-study",
    recipeIds: [
      "recipe-fletched-ammunition",
      "recipe-simple-replacement-leg",
    ],
  };
  const repaired = creationPreview(d, choices, inventory);
  assert(repaired.valid);
  assert(repaired.state.recipes.includes("recipe-simple-replacement-leg"));
});
test("shopping has exact prices, separate quantities and no free special orders", () => {
  const d = draft();
  d.shopping = [
    { id: "item-ordinary-ranged-weapon", quantity: 1, hands: 2 },
    { id: "item-ammunition-bundle", quantity: 2 },
  ];
  const r = creationPreview(d, choices, inventory);
  assert(r.valid);
  assert.equal(r.inventory.spent, 36);
  assert.equal(r.inventory.bulk, 4);
  d.shopping.push({ id: "item-ember-edge", quantity: 1, hands: 1 });
  assert(!creationPreview(d, choices, inventory).valid);
  d.shopping = [{ id: "item-ordinary-heavy-armor", quantity: 10 }];
  assert(
    creationPreview(d, choices, inventory).errors.some(
      (e) => e.code === "coins",
    ),
  );
});
test("incomplete grants stay repairable and cannot masquerade as valid creation", () => {
  const d = draft();
  d.acquisitions = {};
  const r = creationPreview(d, choices, inventory);
  assert(!r.valid);
  assert(r.errors.some((e) => e.code === "acquisition"));
  assert.deepEqual(d.acquisitions, {});
  assert(!creationPreview(newCreationDraft(), choices, inventory).valid);
});
