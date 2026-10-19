/** Printed training requirements; purchasing equipment never grants its training. */
export const EQUIPMENT_TRAINING = Object.freeze({
  "item-ordinary-light-armor": "ability-wear-light-armor",
  "item-ordinary-medium-armor": "ability-wear-medium-armor",
  "item-ordinary-heavy-armor": "ability-wear-heavy-armor",
  "item-smoke-supply": "ability-smoke-in-a-bottle",
});
export function equipmentEligibility(id, abilities) {
  const requiredAbilityId = EQUIPMENT_TRAINING[id] ?? null;
  return {
    eligible: !requiredAbilityId || abilities.includes(requiredAbilityId),
    requiredAbilityId,
  };
}
export function isUniversalAbility(record) {
  return (
    record.kind === "ability" &&
    !record.classId &&
    !(record.requirements ?? []).some((r) => r.kind === "discipline")
  );
}
