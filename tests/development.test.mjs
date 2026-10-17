import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classEligibility,
  purchaseEligibility,
  eligibleFirst,
  purchase,
  creationLedger,
  awardMilestones,
} from "../src/rules/development.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/choices.json", import.meta.url),
    "utf8",
  ),
).records;
const get = (id) => catalog.find((r) => r.id === id);
const base = () => ({
  stage: 1,
  level: 1,
  dp: 10,
  classId: "class-intellect",
  ranks: { "discipline-craft": 1 },
  abilities: [],
  purchases: [],
  recipes: [],
  capabilities: [],
  compatibleRecipes: [],
  safePlace: true,
  gritGranted: 2,
  gritSpent: 1,
});
const draft = () => ({
  attributes: {
    brawn: 1,
    fortitude: 0,
    agility: 0,
    guile: 0,
    knowledge: 1,
    reason: 1,
  },
  culture: { id: "origin-culture-deep-halls", pair: 0 },
  background: { id: "origin-background-bridge-worker", pair: 0 },
  classId: "class-intellect",
  classDisciplines: ["discipline-craft", "discipline-scholarship"],
  signatureId: get("class-intellect").signatures[1][0],
  purchases: { 0: [], 1: [] },
});
test("eligible options sort first; disabled options keep exact unmet requirements", () => {
  const state = base();
  const choices = [
    get("ability-one-more-dawn"),
    get("ability-conditioned-body"),
  ];
  const rows = eligibleFirst(choices, (c) =>
    purchaseEligibility(c, state, catalog),
  );
  assert.equal(rows[0].choice.id, "ability-conditioned-body");
  assert.equal(rows[1].eligible, false);
  assert(rows[1].reasons.some((r) => r.text === "Requires level 7."));
  assert.equal(rows.length, 2);
  state.dp = 1;
  assert(
    purchaseEligibility(choices[1], state, catalog).reasons.some(
      (r) => r.code === "dp",
    ),
  );
  assert.equal(
    classEligibility(get("class-blade"), { agility: -1, brawn: 0 }).eligible,
    false,
  );
});
test("ordered ranks use class prices and cannot be bought at level zero or skipped", () => {
  const state = base(),
    craft = get("discipline-craft");
  assert.equal(purchaseEligibility(craft, state, catalog, { rank: 2 }).cost, 2);
  assert.equal(
    purchaseEligibility(craft, state, catalog, { rank: 3 }).eligible,
    false,
  );
  assert.equal(
    purchaseEligibility(craft, { ...state, level: 0 }, catalog).eligible,
    false,
  );
  const result = purchase(state, craft, catalog, { rank: 2 });
  assert.equal(result.state.dp, 8);
  assert.equal(result.state.ranks[craft.id], 2);
  assert.equal(state.ranks[craft.id], 1);
});
test("Novice creation exception does not unlock higher tiers or class signatures", () => {
  const state = { ...base(), level: 0, stage: 0, classId: null };
  assert(
    purchaseEligibility(get("ability-conditioned-body"), state, catalog)
      .eligible,
  );
  assert(
    !purchaseEligibility(get("ability-one-more-dawn"), state, catalog).eligible,
  );
  assert(
    !purchaseEligibility(
      get("class-blade").signatures[1].map(get)[0],
      state,
      catalog,
    ).eligible,
  );
  assert(
    !purchaseEligibility(get("ability-basic-melee"), state, catalog).eligible,
  );
});
test("per-level purchases cannot be banked; recipe study requires a new compatible recipe", () => {
  const hp = get("ability-conditioned-body");
  let state = purchase(base(), hp, catalog).state;
  assert(!purchaseEligibility(hp, state, catalog).eligible);
  assert(purchaseEligibility(hp, { ...state, level: 2 }, catalog).eligible);
  const study = get("ability-ordinary-recipe-study");
  state = {
    ...base(),
    capabilities: ["compatible-crafting"],
    compatibleRecipes: ["recipe-cord"],
  };
  assert(!purchaseEligibility(study, state, catalog).eligible);
  assert(
    purchaseEligibility(study, state, catalog, { recipeId: "recipe-cord" })
      .eligible,
  );
  state = purchase(state, study, catalog, { recipeId: "recipe-cord" }).state;
  assert(
    !purchaseEligibility(study, state, catalog, { recipeId: "recipe-cord" })
      .eligible,
  );
});
test("origin duplicate compensation belongs to its stage and unused creation DP expires", () => {
  const d = draft();
  d.signatureId = get("class-intellect").signatures[1][0];
  // Bridge Worker and Deep Halls both grant Craft 1 + Trail Workshop in the selected pair.
  const result = creationLedger(d, catalog);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stages[0].dp, 14);
  assert.equal(result.stages[1].dp, 13);
  assert.equal(result.state.dp, 0);
  assert.equal(result.state.ranks["discipline-craft"], 1);
  assert.equal(
    result.state.abilities.filter((id) => id === "ability-trail-workshop")
      .length,
    1,
  );
  assert.equal(
    result.ledger.filter((e) => e.kind === "expired-pool").length,
    2,
  );
  assert.deepEqual(creationLedger(d, catalog), result);
  assert.deepEqual(d.purchases, { 0: [], 1: [] });
});
test("changing an earlier grant preserves invalid purchases for repair and keeps independent choices", () => {
  const d = draft();
  d.signatureId = get("class-intellect").signatures[1][0];
  d.purchases[0] = [
    { id: "ability-conditioned-body" },
    { id: "ability-one-more-dawn" },
  ];
  d.purchases[1] = [
    { id: "discipline-craft", rank: 3 },
    { id: "ability-conditioned-body" },
  ];
  const r = creationLedger(d, catalog);
  assert.equal(r.valid, false);
  assert.equal(r.errors.filter((e) => e.code === "purchase").length, 2);
  assert.deepEqual(r.draft, d);
  assert.equal(
    r.state.purchases.filter((p) => p.id === "ability-conditioned-body").length,
    2,
  );
  assert.equal(r.state.ranks["discipline-craft"], 1);
});
test("milestone awards are idempotent, bank DP, preserve spent Grit and require safe-place approval", () => {
  const state = base();
  state.dp = 0;
  const level3 = awardMilestones(state, 3);
  assert.equal(level3.dp, 21);
  assert.equal(level3.gritGranted, 3);
  assert.equal(level3.gritSpent, 1);
  assert.deepEqual(level3.pendingSignatures, [3]);
  assert.deepEqual(awardMilestones(level3, 3), level3);
  assert(
    !purchaseEligibility(get("ability-conditioned-body"), level3, catalog)
      .eligible,
  );
  const level7 = awardMilestones(level3, 7);
  assert.equal(level7.dp, 75);
  assert.equal(level7.gritGranted, 4);
  assert.deepEqual(level7.pendingSignatures, [3, 7]);
  assert.throws(() => awardMilestones(level7, 6), /correction/);
  assert.equal(state.level, 1);
});

test("malformed persisted resources cannot turn into free or NaN purchases", () => {
  assert.throws(
    () =>
      purchaseEligibility(
        get("ability-conditioned-body"),
        { ...base(), dp: "10" },
        catalog,
      ),
    /DP/,
  );
  assert.throws(
    () => awardMilestones({ ...base(), gritSpent: 3 }, 3),
    /Spent Grit/,
  );
});
