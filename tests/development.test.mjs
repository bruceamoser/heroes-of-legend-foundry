import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classEligibility,
  purchaseEligibility,
  eligibleFirst,
  recipeStudyChoices,
  purchase,
  creationLedger,
  awardMilestones,
} from "../src/rules/development.mjs";
import { craftingPermissions } from "../src/rules/acquisition.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/choices.json", import.meta.url),
    "utf8",
  ),
).records;
const inventory = JSON.parse(
  await readFile(
    new URL("../static/data/inventory.json", import.meta.url),
    "utf8",
  ),
);
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
test("per-level purchases cannot be banked", () => {
  const hp = get("ability-conditioned-body");
  let state = purchase(base(), hp, catalog).state;
  assert(!purchaseEligibility(hp, state, catalog).eligible);
  assert(purchaseEligibility(hp, { ...state, level: 2 }, catalog).eligible);
});
test("recipe study requires exactly two distinct compatible unlearned recipes", () => {
  const study = get("ability-ordinary-recipe-study");
  const state = {
    ...base(),
    capabilities: ["compatible-crafting"],
    compatibleRecipes: [
      "recipe-bound-torches",
      "recipe-fletched-ammunition",
      "recipe-simple-replacement-leg",
      "recipe-twisted-cord",
    ],
    recipes: [],
  };
  const reasons = (recipeIds) =>
    purchaseEligibility(study, state, catalog, { recipeIds }).reasons;
  assert(reasons(undefined).some((r) => r.text.includes("exactly two")));
  assert(
    reasons(["recipe-bound-torches"]).some((r) =>
      r.text.includes("exactly two"),
    ),
  );
  assert(
    reasons([
      "recipe-bound-torches",
      "recipe-fletched-ammunition",
      "recipe-simple-replacement-leg",
    ]).some((r) => r.text.includes("exactly two")),
  );
  assert(
    reasons(["recipe-bound-torches", "recipe-bound-torches"]).some((r) =>
      r.text.includes("distinct"),
    ),
  );
  assert(
    reasons(["recipe-bound-torches", "recipe-camp-shelter"]).some((r) =>
      r.text.includes("compatible"),
    ),
  );
  assert(
    purchaseEligibility(
      study,
      { ...state, recipes: ["recipe-bound-torches"] },
      catalog,
      {
        recipeIds: ["recipe-bound-torches", "recipe-fletched-ammunition"],
      },
    ).reasons.some((r) => r.text.includes("not already be known")),
  );
});
test("saved one-recipe purchases are rejected without inventing a second recipe", () => {
  const study = get("ability-ordinary-recipe-study");
  const result = purchaseEligibility(
    study,
    {
      ...base(),
      capabilities: ["compatible-crafting"],
      compatibleRecipes: ["recipe-bound-torches", "recipe-fletched-ammunition"],
    },
    catalog,
    { recipeId: "recipe-bound-torches" },
  );
  assert.equal(result.eligible, false);
  assert(
    result.reasons.some(
      (r) =>
        r.code === "recipe-legacy" &&
        r.text.includes("needs two recipe choices"),
    ),
  );
});
test("recipe study availability requires two remaining compatible choices", () => {
  const study = get("ability-ordinary-recipe-study");
  const compatibleRecipes = [
    "recipe-bound-torches",
    "recipe-fletched-ammunition",
    "recipe-simple-replacement-leg",
  ];
  const evaluate = (recipes) => {
    const state = {
      ...base(),
      capabilities: ["compatible-crafting"],
      compatibleRecipes,
      recipes,
    };
    const recipeIds = state.compatibleRecipes
      .filter((id) => !state.recipes.includes(id))
      .slice(0, 2);
    return purchaseEligibility(study, state, catalog, { recipeIds });
  };
  assert(evaluate(["recipe-bound-torches"]).eligible);
  const oneRemaining = evaluate([
    "recipe-bound-torches",
    "recipe-fletched-ammunition",
  ]);
  assert(!oneRemaining.eligible);
  assert(
    oneRemaining.reasons.some((r) => r.text.includes("only 1 is available")),
  );
});
test("recipe study options keep blocked ordinary recipes visible after eligible choices", () => {
  const study = get("ability-ordinary-recipe-study"),
    state = {
      ...base(),
      capabilities: ["compatible-crafting"],
      compatibleRecipes: [
        "recipe-bound-torches",
        "recipe-fletched-ammunition",
        "recipe-simple-replacement-leg",
        "recipe-twisted-cord",
      ],
      recipes: ["recipe-travel-food"],
    },
    result = recipeStudyChoices(state, inventory.recipes),
    ordinaryRecipeCount = inventory.recipes.filter(
      (recipe) => recipe.ordinary,
    ).length,
    eligibleCount = result.options.filter((option) => !option.disabled).length;
  assert.equal(result.options.length, ordinaryRecipeCount);
  assert(
    result.options.slice(0, eligibleCount).every((option) => !option.disabled),
  );
  assert(
    result.options.slice(eligibleCount).every((option) => option.disabled),
  );
  assert.deepEqual(result.defaultRecipeIds, [
    "recipe-bound-torches",
    "recipe-fletched-ammunition",
  ]);
  const known = result.options.find(
      (option) => option.id === "recipe-travel-food",
    ),
    incompatible = result.options.find(
      (option) => option.id === "recipe-camp-shelter",
    );
  assert.equal(known.disabled, true);
  assert.equal(known.reason, "Already known.");
  assert.equal(incompatible.disabled, true);
  assert.equal(
    incompatible.reason,
    "Incompatible with your crafting abilities.",
  );

  const oneRemaining = recipeStudyChoices(
    {
      ...state,
      compatibleRecipes: ["recipe-bound-torches", "recipe-fletched-ammunition"],
      recipes: ["recipe-bound-torches", "recipe-travel-food"],
    },
    inventory.recipes,
  );
  assert.deepEqual(oneRemaining.defaultRecipeIds, []);
  const unavailable = purchaseEligibility(
    study,
    {
      ...state,
      compatibleRecipes: ["recipe-bound-torches", "recipe-fletched-ammunition"],
      recipes: ["recipe-bound-torches", "recipe-travel-food"],
    },
    catalog,
    { recipeIds: oneRemaining.defaultRecipeIds },
  );
  assert.equal(unavailable.eligible, false);
  assert(
    unavailable.reasons.some((reason) =>
      reason.text.includes("only 1 is available"),
    ),
  );
});
test("one recipe-study purchase spends 2 DP and repeat purchases accept new pairs", () => {
  const study = get("ability-ordinary-recipe-study");
  const first = purchase(
    {
      ...base(),
      capabilities: ["compatible-crafting"],
      compatibleRecipes: [
        "recipe-bound-torches",
        "recipe-fletched-ammunition",
        "recipe-simple-replacement-leg",
        "recipe-travel-food",
      ],
    },
    study,
    catalog,
    {
      recipeIds: ["recipe-bound-torches", "recipe-fletched-ammunition"],
    },
  );
  assert(first.applied);
  assert.equal(first.state.dp, 8);
  assert.equal(first.state.purchases.length, 1);
  assert.deepEqual(first.state.purchases[0].recipeIds, [
    "recipe-bound-torches",
    "recipe-fletched-ammunition",
  ]);
  const second = purchase(first.state, study, catalog, {
    recipeIds: ["recipe-simple-replacement-leg", "recipe-travel-food"],
  });
  assert(second.applied);
  assert.equal(second.state.dp, 6);
  assert.equal(
    second.state.purchases.filter(
      (entry) => entry.id === "ability-ordinary-recipe-study",
    ).length,
    2,
  );
  assert.equal(
    second.state.abilities.filter(
      (id) => id === "ability-ordinary-recipe-study",
    ).length,
    1,
  );
  assert.deepEqual(second.state.recipes, [
    "recipe-bound-torches",
    "recipe-fletched-ammunition",
    "recipe-simple-replacement-leg",
    "recipe-travel-food",
  ]);
  assert(
    !purchase(second.state, study, catalog, {
      recipeIds: ["recipe-bound-torches", "recipe-simple-replacement-leg"],
    }).applied,
  );
});
test("downstream recipe context comes from crafting grants", () => {
  const study = get("ability-ordinary-recipe-study");
  const state = {
    ...base(),
    abilities: ["ability-trail-workshop"],
    recipes: ["recipe-travel-food", "recipe-bound-torches"],
    ...craftingPermissions(["ability-trail-workshop"], inventory),
  };
  const result = purchase(state, study, catalog, {
    recipeIds: ["recipe-fletched-ammunition", "recipe-simple-replacement-leg"],
  });
  assert(result.applied);
  assert(result.state.compatibleRecipes.includes("recipe-fletched-ammunition"));
  assert(result.state.recipes.includes("recipe-simple-replacement-leg"));
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

test("all six one-DP general abilities spend exactly one at novice creation, level one and later", () => {
  const ids = [
    "a-party-piece",
    "another-tongue",
    "catch-that",
    "look-over-here",
    "message-by-heart",
    "quick-exit",
  ].map((id) => `ability-${id}`);
  for (const level of [0, 1, 4]) {
    let state = {
      ...base(),
      level,
      stage: level < 2 ? level : "advancement",
      dp: 6,
    };
    for (const id of ids) {
      const eligibility = purchaseEligibility(get(id), state, catalog);
      assert.equal(eligibility.eligible, true, `${id} at level ${level}`);
      assert.equal(eligibility.cost, 1);
      const before = state.dp;
      const result = purchase(state, get(id), catalog);
      assert.equal(result.applied, true);
      assert.equal(result.state.dp, before - 1);
      state = result.state;
      assert.equal(
        purchase(state, get(id), catalog).applied,
        false,
        "once only",
      );
    }
    assert.equal(state.dp, 0);
    const unowned = { ...state, abilities: [], purchases: [] };
    assert.equal(
      purchase(unowned, get(ids[0]), catalog).applied,
      false,
      "no overspending",
    );
    const universal = catalog.find(
      (choice) => choice.kind === "ability" && choice.universal,
    );
    const free = purchaseEligibility(universal, state, catalog);
    assert.equal(free.eligible, false);
    assert(free.reasons.some((reason) => reason.code === "universal"));
  }
});

test("creation ledgers record one-DP purchases at each creation stage", () => {
  for (const stage of [0, 1]) {
    const entry = draft();
    entry.purchases[stage] = [
      "a-party-piece",
      "another-tongue",
      "catch-that",
      "look-over-here",
      "message-by-heart",
      "quick-exit",
    ].map((id) => ({ id: `ability-${id}` }));
    const result = creationLedger(entry, catalog);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const purchases = result.ledger.filter((row) => row.kind === "purchase");
    assert.equal(purchases.length, 6);
    assert(purchases.every((row) => row.delta === -1 && row.stage === stage));
  }
});
