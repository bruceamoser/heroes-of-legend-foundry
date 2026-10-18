import { purchaseEligibility } from "../rules/development.mjs";

/** A drop identifies a catalog choice; dragged statistics never grant anything. */
export function builderDropChoice(item, choices) {
  if (item?.documentName !== "Item" || item.type !== "ability")
    throw new Error("Drop an ability card on a learning step.");
  const id = item.getFlag("heroes-of-legend", "catalogId"),
    source = item.getFlag("heroes-of-legend", "source"),
    choice = choices.find(record => record.id === id && record.kind === "ability");
  if (!choice || source?.path !== choice.source.path || source?.sha256 !== choice.source.sha256)
    throw new Error("This Item does not match a supported catalog ability.");
  return choice;
}

export async function resolveBuilderDrop(event, choices) {
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data.type !== "Item" || typeof data.uuid !== "string")
    throw new Error("Drop an ability card on a learning step.");
  const item = await fromUuid(data.uuid);
  if (!item?.testUserPermission(game.user, "OBSERVER"))
    throw new Error("This ability card is unavailable.");
  return builderDropChoice(item, choices);
}

/** Capture into a temporary draft, then validate before touching the live draft. */
export function validateBuilderPurchase(wizard, choice, stateForDraft) {
  const original = wizard.draft;
  let candidate;
  try {
    wizard.draft = structuredClone(original);
    wizard.capture();
    candidate = wizard.draft;
  } finally { wizard.draft = original; }
  const recipeIds = choice.purchasePolicy === "new-recipe"
    ? [1, 2].map(slot => wizard.element.querySelector(`[name="recipe-${choice.id}-${slot}"]`)?.value).filter(Boolean)
    : [];
  const eligibility = purchaseEligibility(choice, stateForDraft(candidate), wizard.catalogs.choices,
    choice.purchasePolicy === "new-recipe" ? { recipeIds } : {});
  if (!eligibility.eligible)
    throw new Error(eligibility.reasons.map(reason => reason.text).join(" "));
}

const boundDropElements = new WeakSet();
export function bindBuilderDrop(wizard) {
  if (boundDropElements.has(wizard.element)) return;
  boundDropElements.add(wizard.element);
  wizard.element.addEventListener("dragover", event => event.preventDefault());
  wizard.element.addEventListener("drop", event => {
    event.preventDefault(); event.stopPropagation();
    void wizard.dropAbility(event);
  });
}

export function acquisitionWeaponName(id, inventory) {
  if (id === "unarmed") return "Unarmed";
  return inventory.equipment.find(item => item.id === `item-ordinary-${id}-weapon`)?.name ?? id;
}
