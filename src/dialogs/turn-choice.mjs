import { actionConditions, actorMovement } from "../services/turn-budget.mjs";
import { ACTION_CATEGORIES } from "../rules/actions.mjs";
import { requestCombat } from "../services/combat.mjs";
export async function chooseCombatParticipant(combat, id) {
  const actor = combat.combatants.get(id)?.actor;
  if (!actor) throw new Error("This participant needs an Actor.");
  const conditions = actionConditions(actor),
    count = 3 - Math.min(3, Math.max(conditions.dazed, conditions.grappled));
  let needsSpeed = false;
  if (!combat.getFlag("heroes-of-legend", "encounter")?.speedRulings?.[id])
    try {
      actorMovement(actor);
    } catch {
      needsSpeed = true;
    }
  const payload = { id };
  if (needsSpeed && !game.user.isGM)
    throw new Error(
      "Ask the DA to set this participant's movement speed before its turn.",
    );
  if ((count > 0 && count < 3) || needsSpeed) {
    const content = `<div class="hol-body"><p>Choose the categories retained for this turn. Later Dazed/Grappled changes do not change this selection.</p>${count > 0 && count < 3 ? `<p>Retain exactly ${count}.</p>${ACTION_CATEGORIES.map((c) => `<label><input type="checkbox" name="${c}">${c}</label>`).join("")}` : ""}${needsSpeed ? '<label>Speed before Slowed or grapple<input name="speed" type="number" min="0" step="1" required></label><label>DA ruling reason<input name="reason" type="text" required></label>' : ""}</div>`;
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: `${actor.name}: begin turn` },
      classes: ["heroes-of-legend", "hol-turn-choice"],
      position: { width: 440 },
      content,
      ok: { label: "Begin turn" },
    });
    if (!result) return;
    if (count > 0 && count < 3)
      payload.retained = ACTION_CATEGORIES.filter((c) => result[c]);
    if (needsSpeed) {
      payload.speedOverride = Number(result.speed);
      payload.reason = result.reason;
    }
  }
  return requestCombat(combat, "choose", payload);
}
