import { defenseBenefitSources } from "../rules/defense-benefits.mjs";
import { isShieldEquipment } from "../rules/equipment-identity.mjs";
const ID = "heroes-of-legend";
export function benefitCurrent(effect) {
  if (!effect.active) return false;
  const benefit = effect.getFlag(ID, "benefit");
  if (!benefit) return false;
  if (benefit.manual) return true;
  const combat = game.combats.get(benefit.anchor?.combatId),
    state = combat?.getFlag(ID, "encounter"),
    budget = state?.budgets?.[benefit.anchor?.participantId];
  return Boolean(budget && budget.turnId === benefit.anchor.turnId);
}
export function defenseBenefits(actor, { incomingAttack = false } = {}) {
  const heldShieldUuids = actor.items
      .filter((item) => isShieldEquipment(item) && item.system.quantity > 0 && item.system.held)
      .map((item) => item.uuid),
    entries = actor.effects
      .filter((effect) => benefitCurrent(effect))
      .map((effect) => {
        const benefit = effect.getFlag(ID, "benefit");
        return {
          key: benefit?.key,
          effectUuid: effect.uuid,
          shieldItemUuid: benefit?.shieldItemUuid,
          sourceId: benefit?.sourceId,
        };
      });
  return defenseBenefitSources(entries, { incomingAttack, heldShieldUuids });
}
/** Mechanical expiry follows the anchor immediately; this reconciles the native visual record. */
export async function expireStaleBenefits(combat) {
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const stale = actor.effects.filter(
      (e) =>
        e.getFlag(ID, "benefit")?.anchor?.combatId === combat.id &&
        !e.disabled &&
        !benefitCurrent(e),
    );
    if (stale.length)
      await actor.updateEmbeddedDocuments(
        "ActiveEffect",
        stale.map((e) => ({
          _id: e.id,
          disabled: true,
          "flags.heroes-of-legend.expiredAtTurn":
            combat.getFlag(ID, "encounter")?.serial ?? 0,
        })),
      );
  }
}
