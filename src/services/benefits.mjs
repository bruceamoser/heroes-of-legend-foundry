const ID = "heroes-of-legend";
export function benefitCurrent(effect) {
  if (!effect.active) return false;
  const benefit = effect.getFlag(ID, "benefit");
  if (!benefit) return false;
  const combat = game.combats.get(benefit.anchor?.combatId),
    state = combat?.getFlag(ID, "encounter"),
    budget = state?.budgets?.[benefit.anchor?.participantId];
  return Boolean(budget && budget.turnId === benefit.anchor.turnId);
}
export function defenseBenefits(actor) {
  const effects = actor.effects.filter((e) => benefitCurrent(e)),
    keys = new Set(),
    sources = [];
  for (const effect of effects) {
    const benefit = effect.getFlag(ID, "benefit");
    if (benefit.key !== "defend" || keys.has(benefit.key)) continue;
    keys.add(benefit.key);
    sources.push({
      id: `benefit-${benefit.key}`,
      kind: "boon",
      amount: 1,
      label: "Defend maneuver",
      sourceIds: [effect.uuid],
      automatic: true,
    });
  }
  return sources;
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
