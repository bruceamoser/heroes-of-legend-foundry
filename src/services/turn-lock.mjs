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

/** Actor-hosted potion writes can overlap a newly started encounter. */
export function assertNoPendingActorPotion(combat) {
  const participants = [...(combat?.combatants ?? [])].map((participant) => participant.actor).filter(Boolean),
    actors = new Map([...participants, ...(game.actors ?? [])].map((actor) => [actor.uuid, actor]));
  for (const scene of game.scenes ?? [])
    for (const token of scene.tokens ?? [])
      if (token.actor) actors.set(token.actor.uuid, token.actor);
  for (const host of actors.values()) {
    const id = host.getFlag("heroes-of-legend", "pendingPotion"),
      operation = host.getFlag("heroes-of-legend", "potionOperations")?.[id];
    if (id && operation && participants.some((actor) =>
      [operation.giver.actorUuid, operation.recipient.actorUuid].includes(actor.uuid)))
      throw new Error("Finish the pending healing-potion use before changing this encounter.");
  }
}
