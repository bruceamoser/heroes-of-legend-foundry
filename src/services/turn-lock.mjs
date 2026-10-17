export function assertNoPendingTurn(actor, { allowDeath = false } = {}) {
  if (!allowDeath && actor.getFlag("heroes-of-legend", "pendingDeath"))
    throw new Error(
      "Resolve the pending death roll before changing this character.",
    );
  if (
    game.combats.some(
      (c) =>
        c.getFlag("heroes-of-legend", "pendingTurnPhase")?.actorUuid ===
        actor.uuid,
    )
  )
    throw new Error(
      "Finish or reconcile the pending turn phase before changing this character.",
    );
}
