import { creationIdentity, DEFAULT_LANGUAGES } from "./identity.mjs";
import { inventoryTotals } from "./acquisition.mjs";
export function newCreationDraft() {
  return {
    name: "",
    attributes: {
      brawn: 0,
      fortitude: 0,
      agility: 0,
      guile: 0,
      knowledge: 0,
      reason: 0,
    },
    traitIds: [],
    languages: { home: "", extraSpoken: [] },
    purchases: { 0: [], 1: [] },
    classDisciplines: [],
    acquisitions: {},
    shopping: [],
  };
}
export function creationPreview(
  draft,
  choices,
  inventory,
  languages = DEFAULT_LANGUAGES,
) {
  const result = creationIdentity(draft, choices, languages, {
    inventoryCatalog: inventory,
  });
  const errors = [...result.errors];
  if (!draft.name?.trim())
    errors.push({ code: "name", text: "Name your character." });
  const items = structuredClone(result.state.items ?? []);
  items.unshift({
    instanceId: "creation-outfit",
    catalogId: "item-travel-clothes",
    quantity: 1,
    source: "creation",
  });
  let spent = 0;
  for (const [index, entry] of (draft.shopping ?? []).entries()) {
    const definition = inventory.equipment.find((r) => r.id === entry.id);
    if (
      !definition ||
      !Number.isSafeInteger(entry.quantity) ||
      entry.quantity < 1 ||
      definition.specialOrder
    ) {
      errors.push({
        code: "shopping",
        index,
        text: "Choose ordinary equipment with a positive whole quantity. Special orders need DA availability.",
      });
      continue;
    }
    if (
      definition.handChoices.length &&
      !definition.handChoices.includes(entry.hands)
    ) {
      errors.push({
        code: "shopping",
        index,
        text: "Choose the equipment’s required hand use.",
      });
      continue;
    }
    const cost = definition.price * entry.quantity;
    if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(spent + cost)) {
      errors.push({
        code: "shopping",
        index,
        text: "Quantity exceeds the supported coin total.",
      });
      continue;
    }
    spent += cost;
    items.push({
      instanceId: entry.instanceId ?? `purchase:${index}`,
      catalogId: entry.id,
      quantity: entry.quantity,
      hands: entry.hands ?? 0,
      inventoryDie: definition.inventoryDie,
      source: "coins",
    });
  }
  const get = (id) => choices.find((c) => c.id === id);
  const coins =
    40 +
    [
      draft.ancestryId,
      draft.classId,
      draft.culture?.id,
      draft.background?.id,
    ].reduce((n, id) => n + (get(id)?.coins ?? 0), 0);
  if (spent > coins && draft.coinOverride !== true)
    errors.push({
      code: "coins",
      text: `Equipment costs ${spent} coins; only ${coins} coins are available.`,
    });
  const bulk = inventoryTotals(items, inventory, {
    wornOutfitId: "creation-outfit",
  }).bulk;
  return {
    ...result,
    valid: errors.length === 0,
    errors,
    inventory: {
      items,
      spent,
      startingCoins: coins,
      remainingCoins: coins - spent,
      overBudget: Math.max(0, spent - coins),
      coinOverride: draft.coinOverride === true,
      bulk,
    },
  };
}

/** Show requirements only once their creation step is reached; Review keeps all errors. */
export function creationStepErrors(preview, step) {
  if (step >= 7) return preview.errors;
  return preview.errors.filter(error => {
    if (error.level > 1) return false;
    if (error.code === "purchase") return step >= (error.stage === 0 ? 3 : 5);
    if (error.code === "acquisition") return step >= ((preview.stages[0]?.abilities ?? []).includes(error.id) ? 3 : 5);
    if (["class", "class-disciplines", "signature"].includes(error.code)) return step >= 4;
    if (["shopping", "coins"].includes(error.code)) return step >= 6;
    if (["culture", "background"].includes(error.code)) return step >= 2;
    if (["ancestry", "traits", "remembered-community", "language-availability", "duplicate-language", "spoken-language", "extra-languages"].includes(error.code)) return step >= 1;
    return true;
  });
}
