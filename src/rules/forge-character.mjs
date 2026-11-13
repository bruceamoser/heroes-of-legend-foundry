import { ATTRIBUTES } from "./character.mjs";
import { ancestryBenefits, ancestrySelection } from "./ancestry.mjs";
import { acquireAbility } from "./acquisition.mjs";
import { classEligibility } from "./development.mjs";
import { forgeIndex, forgeLearning, learnForgeEntry } from "./forge.mjs";

const trailRecipeIds = new Set(["recipe-bound-torches", "recipe-fletched-ammunition", "recipe-travel-food", "recipe-twisted-cord", "recipe-wooden-brace"]);
const recipeSteps = new Set(["craft:supplies:1", "craft:supplies:2"]);

export function forgeArmorRequirement(itemId) {
  return {
    "item-ordinary-light-armor": "armor:harness:1",
    "item-ordinary-medium-armor": "armor:harness:2",
    "item-ordinary-heavy-armor": "armor:harness:3",
  }[itemId];
}

function applyLearning(state, id, selections, inventory, languages, errors, knownLanguages) {
  const selection = selections?.[id] ?? {};
  if (recipeSteps.has(id)) {
    const selected = selection.recipes ?? [];
    if (selected.length !== 2 || new Set(selected).size !== 2 ||
        selected.some((recipe) => !trailRecipeIds.has(recipe) || state.recipes.includes(recipe))) {
      errors.push({ code: "acquisition", id, reasons: [{ text: "Choose two distinct unlearned Trail Workshop recipes." }] });
      return state;
    }
    return { ...state, recipes: [...state.recipes, ...selected] };
  }
  if (!inventory.acquisitions.some((entry) => entry.id === id)) return state;
  const result = acquireAbility(state, id, selection, inventory, { languages, knownLanguages });
  if (result.valid) return result.state;
  errors.push({ code: "acquisition", id, reasons: result.errors.map((text) => ({ text })) });
  return state;
}

export function forgeInventory(inventory, graph) {
  const current = new Map([...graph.signatures, ...graph.nodes.filter((node) => node.kind === "talent")].map((record) => [record.id, record]));
  return {
    ...inventory,
    acquisitions: [
      ...inventory.acquisitions.filter((entry) => current.has(entry.id)).map((entry) => ({
        ...entry,
        items: /grants one ordinary melee weapon/i.test(current.get(entry.id).equipment ?? "") ? ["item-ordinary-melee-weapon"] : [],
        recipes: [],
        weaponChoice: null,
        recipeChoices: 0,
      })),
      ...[...recipeSteps].map((id) => ({ id, recipeChoices: 2, items: [], recipes: [] })),
    ],
    recipes: inventory.recipes.map((recipe) => trailRecipeIds.has(recipe.id)
      ? { ...recipe, genericChoice: true, permissions: [...recipeSteps] }
      : recipe),
  };
}

function summarize(state, graph) {
  const learning = forgeLearning(graph, state.learned);
  return {
    ...state,
    abilities: [...learning.abilities.map((entry) => entry.id), ...Object.values(state.signatureChoices)],
    compatibleRecipes: [...trailRecipeIds].filter((id) => state.learned.includes("craft:supplies:1")),
    learning,
  };
}

function applyPurchases(state, entries, graph, acquisitions, inventory, languages, errors, add, knownLanguages) {
  for (const [index, entry] of (entries ?? []).entries()) {
    const outcome = learnForgeEntry(graph, state, entry.id);
    if (!outcome.eligible) {
      errors.push({ code: "purchase", stage: state.stage, index, id: entry.id, reasons: outcome.reasons.map((text) => ({ text })) });
      continue;
    }
    state = outcome.state;
    state = applyLearning(state, entry.id, acquisitions, inventory, languages, errors, knownLanguages);
    add(state, "purchase", entry.id, -outcome.cost);
  }
  return state;
}

export function forgeCreationLedger(draft, choices, { graph, inventoryCatalog, languages, initialLanguages = [] }) {
  const errors = [], ledger = [], stages = {};
  const attrs = draft.attributes;
  const validRange = ATTRIBUTES.every((key) => Number.isInteger(attrs[key]) && Math.abs(attrs[key]) <= 2);
  if (!validRange || ATTRIBUTES.reduce((sum, key) => sum + attrs[key], 0) !== 3)
    errors.push({ code: "attributes", text: "Assign six attributes from −2 to +2 totaling +3." });
  const ancestryTraitIds = ancestrySelection(draft, choices).traitIds;
  const basePool = validRange ? 10 + attrs.knowledge + attrs.reason + attrs.guile : 0;
  const bonus = ancestryBenefits(ancestryTraitIds).additionalDpPerLevel;
  let state = {
    level: 0, stage: 0, dp: basePool + bonus, learned: [], signatureChoices: {},
    languages: [...initialLanguages], ancestryTraitIds, recipes: [], items: [],
    classId: null, gritGranted: 0, gritSpent: 0, safePlace: true,
  };
  const add = (snapshot, kind, id, delta) => ledger.push({
    stage: snapshot.stage, kind, sourceId: id, id, delta, balance: snapshot.dp,
  });
  const grant = (id, source) => {
    const duplicate = state.learned.includes(id);
    state = duplicate ? { ...state, dp: state.dp + 1 } : { ...state, learned: [...state.learned, id] };
    add(state, duplicate ? "duplicate-grant" : "grant", id, duplicate ? 1 : 0);
    if (!duplicate) state = applyLearning(state, id, draft.acquisitions, inventoryCatalog, languages, errors);
    ledger.at(-1).grantedBy = source;
  };
  const close = () => {
    stages[state.stage] = summarize(state, graph);
    const expired = state.dp;
    state = { ...state, dp: 0 };
    add(state, "expired-pool", null, -expired);
  };
  add(state, "pool", null, state.dp);
  for (const kind of ["culture", "background"]) {
    const selected = draft[kind];
    const origin = graph.origins.find((entry) => entry.id === selected?.id && entry.kind === kind);
    const pair = origin?.pairs[selected?.pair];
    if (!pair) {
      errors.push({ code: kind, text: `Choose a ${kind} and its learning option.` });
      continue;
    }
    grant(pair.disciplineId, origin.id);
    grant(pair.entryId, origin.id);
  }
  state = applyPurchases(state, draft.purchases[0], graph, draft.acquisitions, inventoryCatalog, languages, errors, add);
  close();
  state = { ...state, stage: 1, level: 1, dp: basePool + bonus, gritGranted: 1 };
  add(state, "pool", null, state.dp);
  const cls = graph.classes.find((entry) => entry.id === draft.classId);
  if (!cls) errors.push({ code: "class", text: "Choose a class." });
  else {
    const eligibility = classEligibility(cls, attrs);
    if (!eligibility.eligible) errors.push({ code: "class", reasons: eligibility.reasons });
    else {
      state.classId = cls.id;
      const picks = draft.classDisciplines ?? [];
      if (picks.length !== 2 || new Set(picks).size !== 2 || picks.some((id) => !cls.disciplineIds.includes(id)))
        errors.push({ code: "class-disciplines", text: "Choose two distinct disciplines from your class." });
      else for (const id of picks) grant(id, cls.id);
      if (!cls.signatures[1].includes(draft.signatureId))
        errors.push({ code: "signature", text: "Choose a level-1 class signature." });
      else {
        state.signatureChoices = { 1: draft.signatureId };
        add(state, "signature-grant", draft.signatureId, 0);
        state = applyLearning(state, draft.signatureId, draft.acquisitions, inventoryCatalog, languages, errors);
      }
    }
  }
  state = applyPurchases(state, draft.purchases[1], graph, draft.acquisitions, inventoryCatalog, languages, errors, add);
  close();
  return { draft, valid: errors.length === 0, errors, ledger, stages, state: summarize(state, graph) };
}

export function forgeAdvancement(state, draft, catalogs, languages, play) {
  const graph = catalogs.forge, inventory = catalogs.inventory;
  const level = state.level;
  const errors = [], ledger = [];
  const add = (snapshot, kind, id, delta) => ledger.push({ level, kind, id, delta, balance: snapshot.dp });
  if ([3, 7].includes(level)) {
    const id = draft.signatures?.[level];
    const cls = graph.classes.find((entry) => entry.id === state.classId);
    if (!cls?.signatures[level].includes(id)) {
      errors.push({ code: "signature", level, text: `Choose a level-${level} class signature.` });
    } else {
      state = {
        ...state,
        signatureChoices: { ...state.signatureChoices, [level]: id },
        pendingSignatures: state.pendingSignatures.filter((tier) => tier !== level),
      };
      add(state, "signature-grant", id, 0);
      state = applyLearning(state, id, draft.acquisitions, inventory, languages, errors, play.languages);
    }
  }
  state = applyPurchases(state, draft.purchases, graph, draft.acquisitions, inventory, languages, errors, add, play.languages);
  return { state: summarize(state, graph), errors, ledger, maximumHpDelta: 0 };
}
