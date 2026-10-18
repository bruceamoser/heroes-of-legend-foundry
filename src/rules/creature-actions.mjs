import { ATTRIBUTES } from "./character.mjs";
const TIERS = ["weak", "standard", "strong"];

/** Reference outcomes are text, never input to automatic damage. */
export function validReferenceAttack(attack) {
  return attack?.resolution === "reference" &&
    ATTRIBUTES.includes(attack.attributeKey) &&
    typeof attack.effect === "string" &&
    typeof attack.referenceMarkdown === "string" &&
    (attack.outcomes === null || TIERS.every(key =>
      typeof attack.outcomes?.[key] === "string" && attack.outcomes[key].length > 0));
}

export function incomingOutcome(incoming, tier) {
  if (!incoming) return null;
  if (!TIERS.includes(tier)) throw new Error("Unknown defense result.");
  if (incoming.resolution === "reference") {
    if (!validReferenceAttack(incoming)) throw new Error("Invalid reference attack.");
    return { resolution: "reference", text: incoming.outcomes?.[tier] ?? incoming.effect,
      applied: false };
  }
  return { damage: incoming.damage[tier], type: "physical", applied: false };
}
