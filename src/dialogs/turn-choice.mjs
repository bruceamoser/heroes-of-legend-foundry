import { requestCombat } from "../services/combat.mjs";
/** The table chooses a participant; action limits and movement remain editable. */
export async function chooseCombatParticipant(combat, id) {
  if (!combat.combatants.get(id)?.actor) throw new Error("This participant needs an Actor.");
  return requestCombat(combat, "choose", {id});
}
