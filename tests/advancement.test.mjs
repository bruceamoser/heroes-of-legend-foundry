import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { advancementPreview } from "../src/rules/advancement.mjs";
import { awardMilestones } from "../src/rules/development.mjs";
const read = async (n) =>
  JSON.parse(
    await readFile(
      new URL(`../static/data/${n}.json`, import.meta.url),
      "utf8",
    ),
  );
const choices = (await read("choices")).records,
  inventory = await read("inventory");
const state = () => ({
  level: 1,
  stage: "advancement",
  dp: 0,
  classId: "class-intellect",
  ranks: { "discipline-craft": 1, "discipline-scholarship": 1 },
  abilities: [],
  recipes: [],
  purchases: [],
  capabilities: [],
  compatibleRecipes: [],
  safePlace: true,
  gritGranted: 2,
  gritSpent: 1,
  items: [],
  acquisitionReceipts: [],
});
test("milestones award each crossed level once and preview resolves both earned signatures", () => {
  const base = awardMilestones(state(), 7);
  assert.equal(base.dp, 75);
  assert.equal(base.gritGranted, 4);
  assert.equal(base.gritSpent, 1);
  const d = {
    signatures: {
      3: "ability-signature-intellect-a-better-angle",
      7: "ability-signature-intellect-a-route-for-everyone",
    },
    purchases: [],
  };
  const r = advancementPreview(base, d, choices, inventory);
  assert(r.valid);
  assert.deepEqual(r.state.pendingSignatures, []);
  assert.equal(r.state.dp, 75);
  assert.deepEqual(base.pendingSignatures, [3, 7]);
  d.signatures[3] = "ability-signature-blade-pressure-point";
  assert(!advancementPreview(base, d, choices, inventory).valid);
});
test("purchases require safe place, are sequential, and preserve invalid choices for repair", () => {
  const base = awardMilestones(state(), 2),
    d = {
      purchases: [
        { id: "discipline-craft" },
        { id: "ability-smoke-in-a-bottle" },
      ],
    };
  assert(!advancementPreview(base, d, choices, inventory).valid);
  base.safePlace = true;
  const r = advancementPreview(base, d, choices, inventory);
  assert(r.valid);
  assert.equal(r.state.ranks["discipline-craft"], 2);
  assert.equal(r.state.dp, 6);
  assert.deepEqual(r.state.recipes, [
    "recipe-smoke-flask",
    "recipe-travel-food",
  ]);
  assert.equal(r.state.items.length, 1);
  d.purchases.unshift({ id: "ability-the-cleverest-mixture" });
  const invalid = advancementPreview(base, d, choices, inventory);
  assert(!invalid.valid);
  assert.equal(invalid.draft.purchases.length, 3);
  assert.equal(invalid.state.ranks["discipline-craft"], 2);
});
test("HP training and once-only Grit grants have explicit deltas without refilling spent resources", () => {
  const base = { ...state(), level: 7, dp: 30, gritGranted: 4, gritSpent: 3 };
  const d = {
    purchases: [
      { id: "ability-conditioned-body" },
      { id: "ability-one-more-dawn" },
    ],
  };
  const r = advancementPreview(base, d, choices, inventory);
  assert(r.valid);
  assert.equal(r.maximumHpDelta, 1);
  assert.equal(r.gritDelta, 1);
  assert.equal(r.state.gritGranted, 5);
  assert.equal(r.state.gritSpent, 3);
  const repeated = advancementPreview(r.state, d, choices, inventory);
  assert(!repeated.valid);
  assert.equal(repeated.maximumHpDelta, 0);
  assert.equal(repeated.gritDelta, 0);
});
test("advancement preserves one-recipe repairs and records two-recipe purchases", () => {
  const base = {
    ...state(),
    dp: 6,
    abilities: ["ability-trail-workshop"],
    recipes: ["recipe-travel-food", "recipe-bound-torches"],
    capabilities: ["compatible-crafting"],
    compatibleRecipes: [
      "recipe-bound-torches",
      "recipe-fletched-ammunition",
      "recipe-simple-replacement-leg",
      "recipe-travel-food",
      "recipe-twisted-cord",
      "recipe-wooden-brace",
    ],
  };
  const oldDraft = {
    purchases: [
      {
        id: "ability-ordinary-recipe-study",
        recipeId: "recipe-fletched-ammunition",
      },
    ],
  };
  const rejected = advancementPreview(base, oldDraft, choices, inventory);
  assert(!rejected.valid);
  assert.equal(rejected.draft.purchases[0].recipeId, "recipe-fletched-ammunition");
  assert(
    rejected.errors.some((entry) =>
      entry.reasons?.some((reason) => reason.code === "recipe-legacy"),
    ),
  );
  assert(!rejected.state.recipes.includes("recipe-fletched-ammunition"));

  const draft = {
    purchases: [
      {
        id: "ability-ordinary-recipe-study",
        recipeIds: [
          "recipe-fletched-ammunition",
          "recipe-simple-replacement-leg",
        ],
      },
    ],
  };
  const result = advancementPreview(base, draft, choices, inventory);
  assert(result.valid);
  assert.equal(result.state.dp, 4);
  assert.deepEqual(result.state.purchases[0].recipeIds, [
    "recipe-fletched-ammunition",
    "recipe-simple-replacement-leg",
  ]);
  assert.deepEqual(result.ledger[0].recipeIds, [
    "recipe-fletched-ammunition",
    "recipe-simple-replacement-leg",
  ]);
  assert(result.state.recipes.includes("recipe-simple-replacement-leg"));
});
test("committed legacy recipe grants are preserved without retroactive additions", () => {
  const legacy = {
    ...state(),
    abilities: ["ability-ordinary-recipe-study"],
    recipes: ["recipe-fletched-ammunition"],
  };
  const result = advancementPreview(
    legacy,
    { purchases: [], signatures: {}, acquisitions: {} },
    choices,
    inventory,
  );
  assert(result.valid);
  assert.deepEqual(result.state.recipes, ["recipe-fletched-ammunition"]);
});
