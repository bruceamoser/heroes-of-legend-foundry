import { actorContributions } from "./conditions.mjs";
import { conditionSummary } from "../rules/conditions.mjs";

/** One combined event; condition sources and their durations remain unchanged. */
export function conditionApplication(actor, key) {
  if (!["burning", "freezing", "bleeding"].includes(key)) throw new Error("Choose Burning, Freezing or Bleeding.");
  const contributions = actorContributions(actor).filter(c => c.key === key);
  const rating = conditionSummary(contributions)[key].rating;
  if (!rating) throw new Error("This condition is not active.");
  const type = key === "burning" ? "fire" : key === "freezing" ? "cold" : "physical";
  const printed = property => (actor.system[property]?.numeric ?? []).map((s, i) => ({ ...s, sourceId: `printed-${property}-${i}`, label: `Printed ${property}` }));
  return { components: [{ type, amount: rating }], resistances: printed("resistances"), weaknesses: printed("weaknesses"), conditionKey: key, conditionSnapshot: contributions, reason: `Apply ${key} ${rating}` };
}
export async function requestConditionApply(actor, key) {
  if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("Only this actor’s owner can apply a condition.");
  const { damageBasis, requestDamage } = await import("./damage.mjs");
  return requestDamage(actor, damageBasis(actor), conditionApplication(actor, key));
}
