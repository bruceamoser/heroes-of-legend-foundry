import { acquireAbility, craftingPermissions } from "./acquisition.mjs";
import { ATTRIBUTES } from "./character.mjs";
const clone = (value) => structuredClone(value);
const find = (catalog, id) => catalog.find((r) => r.id === id);
const reason = (code, text) => ({ code, text });
const integer = (v, label, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min)
    throw new TypeError(`Invalid ${label}`);
  return v;
};
export function classEligibility(choice, attributes) {
  const reasons = [];
  for (const key of choice.minimumAttributes)
    if (!Number.isInteger(attributes[key]) || attributes[key] < 0)
      reasons.push(reason("attribute", `${key} must be at least 0.`));
  return { eligible: reasons.length === 0, reasons, cost: 0 };
}
export function purchaseEligibility(choice, state, catalog, selection = {}) {
  let { rank } = selection;
  const { recipeIds } = selection;
  integer(state.level, "level");
  integer(state.dp, "DP");
  const reasons = [];
  let cost = null;
  if (!choice || !["ability", "discipline"].includes(choice.kind))
    return {
      eligible: false,
      cost,
      reasons: [reason("kind", "This choice is not a purchase.")],
    };
  if (state.stage === "advancement" && !state.safePlace)
    reasons.push(
      reason("safe-place", "DP can be spent only in a DA-approved safe place."),
    );
  if (choice.kind === "discipline") {
    const current = state.ranks[choice.id] ?? 0;
    rank ??= current + 1;
    if (state.level === 0)
      reasons.push(
        reason("stage", "Discipline ranks cannot be purchased at level 0."),
      );
    if (!Number.isInteger(rank) || rank !== current + 1 || rank > 3)
      reasons.push(
        reason(
          "rank",
          current >= 3
            ? "Rank 3 is already held."
            : `Purchase rank ${current + 1} next.`,
        ),
      );
    const cls = find(catalog, state.classId);
    cost = cls?.prices?.[choice.id]?.[rank - 1] ?? null;
    if (cost === null)
      reasons.push(reason("class", "Choose a class to determine rank prices."));
  } else {
    cost = choice.cost;
    if (choice.universal)
      reasons.push(
        reason(
          "universal",
          "Universal actions are available without a DP purchase.",
        ),
      );
    const noviceCreation =
      state.level === 0 && choice.minimumLevel === 1 && !choice.classId;
    if (state.level < choice.minimumLevel && !noviceCreation)
      reasons.push(reason("level", `Requires level ${choice.minimumLevel}.`));
    if (choice.classId && choice.classId !== state.classId)
      reasons.push(
        reason(
          "class",
          `Requires ${find(catalog, choice.classId)?.name ?? choice.classId}.`,
        ),
      );
    for (const req of choice.requirements) {
      if (req.kind === "discipline" && (state.ranks[req.id] ?? 0) < req.rank)
        reasons.push(
          reason(
            "discipline",
            `Requires ${find(catalog, req.id)?.name ?? req.id} ${req.rank}.`,
          ),
        );
      else if (
        req.kind === "capability" &&
        !state.capabilities.includes(req.capability)
      )
        reasons.push(
          reason(
            "capability",
            "Requires a known crafting ability compatible with the chosen recipe.",
          ),
        );
    }
    const prior = state.purchases.filter((p) => p.id === choice.id);
    if (choice.purchasePolicy === "once" && state.abilities.includes(choice.id))
      reasons.push(reason("owned", "Already learned."));
    if (
      choice.purchasePolicy === "per-level" &&
      prior.some((p) => p.level === state.level)
    )
      reasons.push(
        reason("per-level", `Already purchased at level ${state.level}.`),
      );
    if (choice.purchasePolicy === "new-recipe") {
      if (Object.hasOwn(selection, "recipeId"))
        reasons.push(
          reason(
            "recipe-legacy",
            "This saved recipe purchase needs two recipe choices. Remove it, then add Ordinary Recipe Study with your chosen pair.",
          ),
        );
      else if (!Array.isArray(recipeIds) || recipeIds.length !== 2) {
        const availableRecipes = new Set(
          state.compatibleRecipes.filter((id) => !state.recipes.includes(id)),
        ).size;
        reasons.push(
          reason(
            "recipe",
            availableRecipes < 2
              ? `Choose two recipes you can learn; only ${availableRecipes} ${availableRecipes === 1 ? "is" : "are"} available.`
              : "Choose exactly two unlearned compatible recipes.",
          ),
        );
      } else if (new Set(recipeIds).size !== 2)
        reasons.push(reason("recipe", "Choose two distinct recipes."));
      else {
        if (recipeIds.some((id) => state.recipes.includes(id)))
          reasons.push(
            reason("recipe", "Each recipe must not already be known."),
          );
        if (recipeIds.some((id) => !state.compatibleRecipes.includes(id)))
          reasons.push(
            reason(
              "recipe",
              "Each recipe must be compatible with your known crafting abilities.",
            ),
          );
      }
    }
  }
  if (cost !== null && state.dp < cost)
    reasons.push(reason("dp", `Requires ${cost} DP; ${state.dp} DP remains.`));
  return { eligible: reasons.length === 0, reasons, cost, rank };
}
export function eligibleFirst(choices, evaluate) {
  return choices
    .map((choice) => ({ choice, ...evaluate(choice) }))
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        a.choice.name.localeCompare(b.choice.name, "en") ||
        a.choice.id.localeCompare(b.choice.id, "en"),
    );
}
export function recipeStudyChoices(state, recipes) {
  const knownRecipes = new Set(state.recipes ?? []),
    compatibleRecipes = new Set(state.compatibleRecipes ?? []);
  const options = recipes
    .filter((recipe) => recipe.ordinary)
    .map((recipe) => {
      const reason = knownRecipes.has(recipe.id)
        ? "Already known."
        : compatibleRecipes.has(recipe.id)
          ? ""
          : "Incompatible with your crafting abilities.";
      return {
        ...recipe,
        disabled: Boolean(reason),
        reason,
      };
    })
    .sort(
      (a, b) =>
        Number(a.disabled) - Number(b.disabled) ||
        a.name.localeCompare(b.name, "en") ||
        a.id.localeCompare(b.id, "en"),
    );
  const eligibleRecipeIds = options
    .filter((option) => !option.disabled)
    .map((option) => option.id);
  return {
    options,
    defaultRecipeIds:
      eligibleRecipeIds.length >= 2 ? eligibleRecipeIds.slice(0, 2) : [],
  };
}
export function purchase(state, choice, catalog, selection = {}) {
  const result = purchaseEligibility(choice, state, catalog, selection);
  if (!result.eligible)
    return { state, reasons: result.reasons, applied: false };
  const next = clone(state);
  next.dp -= result.cost;
  if (choice.kind === "discipline") next.ranks[choice.id] = result.rank;
  else if (!next.abilities.includes(choice.id)) next.abilities.push(choice.id);
  if (choice.purchasePolicy === "new-recipe")
    next.recipes.push(...selection.recipeIds);
  next.purchases.push({
    id: choice.id,
    level: state.level,
    cost: result.cost,
    ...(result.rank ? { rank: result.rank } : {}),
    ...(choice.purchasePolicy === "new-recipe"
      ? { recipeIds: [...selection.recipeIds] }
      : {}),
  });
  return { state: next, reasons: [], applied: true };
}
/** Rebuild in order: invalid choices remain in the returned draft and receive repair reasons. */
export function creationLedger(
  draft,
  catalog,
  { inventoryCatalog, languages, initialLanguages = [] } = {},
) {
  const errors = [],
    ledger = [],
    stages = {};
  const attributes = draft.attributes ?? {};
  const invalidAttributes = ATTRIBUTES.some(
    (key) =>
      !Number.isInteger(attributes[key]) ||
      attributes[key] < -2 ||
      attributes[key] > 2,
  );
  if (
    invalidAttributes ||
    ATTRIBUTES.reduce((s, key) => s + (attributes[key] ?? 0), 0) !== 3
  )
    errors.push(
      reason("attributes", "Assign six attributes from -2 to +2 totaling +3."),
    );
  const pool = invalidAttributes
    ? null
    : 10 + attributes.knowledge + attributes.reason + attributes.guile;
  let state = {
    languages: structuredClone(initialLanguages),
    stage: 0,
    level: 0,
    dp: pool ?? 0,
    classId: null,
    gritGranted: 0,
    gritSpent: 0,
    ranks: {},
    abilities: [],
    purchases: [],
    recipes: [],
    capabilities: [],
    compatibleRecipes: [],
    safePlace: true,
  };
  const syncAcquisitions = () => {
    state.gritGranted =
      (state.level >= 1 ? 2 : 0) +
      Number(state.abilities.includes("ability-one-more-dawn"));
    if (!inventoryCatalog) return;
    for (const id of state.abilities) {
      const result = acquireAbility(
        state,
        id,
        draft.acquisitions?.[id] ?? {},
        inventoryCatalog,
        { languages },
      );
      if (result.valid) state = result.state;
    }
    Object.assign(
      state,
      craftingPermissions(state.abilities, inventoryCatalog),
    );
  };
  const add = (kind, sourceId, delta, extra = {}) => {
    state.dp += delta;
    ledger.push({
      stage: state.stage,
      kind,
      sourceId,
      delta,
      balance: state.dp,
      ...extra,
    });
  };
  ledger.push({ stage: 0, kind: "pool", delta: state.dp, balance: state.dp });
  const grantRank = (id, source) => {
    if (state.ranks[id]) add("duplicate-rank", source, 1, { id });
    else {
      state.ranks[id] = 1;
      add("rank-grant", source, 0, { id, rank: 1 });
    }
  };
  const grantAbility = (id, source) => {
    if (state.abilities.includes(id))
      add("duplicate-ability", source, 1, { id });
    else {
      state.abilities.push(id);
      add("ability-grant", source, 0, { id });
      syncAcquisitions();
    }
  };
  for (const originType of ["culture", "background"]) {
    const selection = draft[originType];
    const origin = find(catalog, selection?.id);
    const pair = Number.isInteger(selection?.pair)
      ? origin?.pairs?.[selection.pair]
      : null;
    if (
      origin?.kind !== "origin" ||
      origin.originType !== originType ||
      !pair
    ) {
      errors.push(
        reason(originType, `Choose one complete ${originType} grant pair.`),
      );
      continue;
    }
    grantRank(pair.disciplineId, origin.id);
    grantAbility(pair.abilityId, origin.id);
  }
  const applyStage = (stage) => {
    for (const [index, entry] of (draft.purchases?.[stage] ?? []).entries()) {
      const outcome = purchase(state, find(catalog, entry.id), catalog, entry);
      if (!outcome.applied) {
        errors.push({
          code: "purchase",
          stage,
          index,
          id: entry.id,
          reasons: outcome.reasons,
        });
        continue;
      }
      const before = state.dp;
      state = outcome.state;
      syncAcquisitions();
      ledger.push({
        stage,
        kind: "purchase",
        sourceId: entry.id,
        delta: state.dp - before,
        balance: state.dp,
        ...(entry.recipeIds ? { recipeIds: [...entry.recipeIds] } : {}),
      });
    }
  };
  applyStage(0);
  stages[0] = clone(state);
  add("expired-pool", null, -state.dp);
  state.stage = 1;
  state.level = 1;
  syncAcquisitions();
  state.dp = pool ?? 0;
  ledger.push({ stage: 1, kind: "pool", delta: state.dp, balance: state.dp });
  const cls = find(catalog, draft.classId);
  if (cls?.kind !== "class") errors.push(reason("class", "Choose a class."));
  else {
    const eligibility = classEligibility(cls, attributes);
    if (!eligibility.eligible)
      errors.push({ code: "class", reasons: eligibility.reasons });
    else {
      state.classId = cls.id;
      const choices = draft.classDisciplines ?? [];
      if (
        choices.length !== 2 ||
        new Set(choices).size !== 2 ||
        choices.some((id) => !cls.startingDisciplines.includes(id))
      )
        errors.push(
          reason(
            "class-disciplines",
            "Choose two distinct starting disciplines from your class.",
          ),
        );
      else for (const id of choices) grantRank(id, cls.id);
      if (!cls.signatures[1].includes(draft.signatureId))
        errors.push(reason("signature", "Choose one level-1 class signature."));
      else grantAbility(draft.signatureId, cls.id);
    }
  }
  applyStage(1);
  stages[1] = clone(state);
  add("expired-pool", null, -state.dp);
  if (inventoryCatalog)
    for (const id of state.abilities) {
      const result = acquireAbility(
        state,
        id,
        draft.acquisitions?.[id] ?? {},
        inventoryCatalog,
        { languages },
      );
      if (!result.valid)
        errors.push({
          code: "acquisition",
          id,
          reasons: result.errors.map((text) => reason("selection", text)),
        });
    }
  return {
    draft: clone(draft),
    valid: errors.length === 0,
    errors,
    ledger,
    stages,
    state,
  };
}
/** Level high-water mark makes repeated awards idempotent; never restores spent Grit. */
export function awardMilestones(state, newLevel) {
  integer(state.level, "current level", 1);
  integer(state.gritGranted, "Grit grants");
  integer(state.gritSpent, "spent Grit");
  if (state.gritSpent > state.gritGranted)
    throw new RangeError("Spent Grit exceeds grants");
  integer(newLevel, "new level", 1);
  if (newLevel < state.level)
    throw new RangeError(
      "Level reduction requires a separate correction workflow",
    );
  const next = clone(state);
  if (newLevel === state.level) return next;
  const dp = integer(
    ((newLevel - state.level) * (16 + state.level + 1 + newLevel)) / 2,
    "milestone DP",
  );
  const milestones = [3, 7].filter(
    (level) => level > state.level && level <= newLevel,
  );
  next.dp = integer(state.dp + dp, "DP");
  next.gritGranted = integer(
    state.gritGranted + milestones.length,
    "Grit grants",
  );
  next.pendingSignatures = [
    ...new Set([...(state.pendingSignatures ?? []), ...milestones]),
  ];
  next.level = newLevel;
  next.stage = "advancement";
  next.safePlace = false;
  next.awards = [
    ...(state.awards ?? []),
    { from: state.level, to: newLevel, dp, grit: milestones.length },
  ];
  return next;
}
