/** Isolated F06 probe. No combat hooks or production condition automation. */
const ID = "heroes-of-legend";
export const TURN_START = `${ID}.turnStart`;
export const TURN_END = `${ID}.turnEnd`;
let queue = Promise.resolve();
export function registerTimingPrototype() {
  CONFIG.ActiveEffect.expiryEvents[TURN_START] = "HOL turn start";
  CONFIG.ActiveEffect.expiryEvents[TURN_END] = "HOL turn end";
}
export function applyTimingProbe(
  combat,
  { turnId, phase, controllerUuid, actorUuids },
) {
  const job = queue.then(() =>
    apply(combat, { turnId, phase, controllerUuid, actorUuids }),
  );
  queue = job.catch(() => {});
  return job;
}
async function apply(combat, { turnId, phase, controllerUuid, actorUuids }) {
  // Core expiry writes are owned by activeGM; this probe deliberately aligns with it.
  if (!game.user.isGM || !game.users.activeGM?.isSelf)
    return { status: "not-authority" };
  if (
    !combat?.getFlag(ID, "timingProbe") ||
    !/^[A-Za-z0-9_-]+$/.test(turnId) ||
    !["start", "end"].includes(phase)
  )
    throw new Error("Invalid timing probe event");
  const expected = combat.getFlag(ID, "timingProbe");
  if (
    controllerUuid !== expected.controllerUuid ||
    JSON.stringify(actorUuids) !== JSON.stringify(expected.actorUuids)
  )
    throw new Error("Unexpected timing participants");
  const key = `${combat.id}-${turnId}-${phase}`;
  const actors = new Set();
  for (const uuid of actorUuids) {
    const actor = await fromUuid(uuid);
    if (!actor || actor.documentName !== "Actor")
      throw new Error("Timing actor missing");
    actors.add(actor);
    if (actor.getFlag(ID, "timingReceipts")?.[key]) continue;
    const rating = actor.getFlag(ID, "probeBurning") ?? 0;
    const patch = { [`flags.${ID}.timingReceipts.${key}`]: true };
    if (phase === "end" && rating > 0) {
      // Fixture has no defenses or survival transitions. Full damage/condition engine comes later.
      patch["system.health.value"] = Math.max(
        0,
        actor.system.health.value - rating,
      );
      patch[`flags.${ID}.probeBurning`] = Math.max(0, rating - 1);
    }
    // Receipt and HP/decay share the Actor update, allowing retry after a partial multi-actor pass.
    await actor.update(patch);
  }
  // Repeat refresh on replay: a crash after the Actor write must not skip expiry.
  await ActiveEffect.registry.refresh(
    phase === "start" ? TURN_START : TURN_END,
    { combat, actors },
  );
  await combat.update({
    [`flags.${ID}.timingPhase`]: { turnId, phase, controllerUuid, actorUuids },
  });
  return { status: "complete" };
}
