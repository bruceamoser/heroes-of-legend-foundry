import { outcomeEffects } from "./outcome-effects.mjs";
import { ATTRIBUTES } from "./character.mjs";
const TIERS = ["weak", "standard", "strong"];

/** A complete reference snapshot keeps the printed outcome beside explicit effect controls. */
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
    const text = incoming.outcomes?.[tier] ?? incoming.effect;
    const type = incoming.damageType ?? /\*\*Damage type:\*\*\s*(physical|fire|cold|lightning|mental|radiant|life)/i.exec(incoming.referenceMarkdown ?? "")?.[1]?.toLowerCase();
    const effects = outcomeEffects(text, {defaultType:type ?? "physical",numeric:Boolean(type)});
    return { resolution: effects ? "effects" : "reference", text, ...(effects ?? {}), applied:false };
  }
  return { damage: incoming.damage[tier], type: "physical", applied: false };
}
