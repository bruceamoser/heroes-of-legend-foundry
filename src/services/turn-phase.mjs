import { conditionTurnBasis, prepareConditionTurn } from "./condition-turn.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import { damageBasis } from "./damage.mjs";
import {
  startSurvivalTurn,
  endSurvivalTurn,
  validateSurvival,
} from "../rules/survival.mjs";
import {
  enqueueCharacterOperation,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function prepareTurnPhase(combat, actor, request, id, commit, authorId) {
  if (
    !["choose", "finish"].includes(request.kind) ||
    !["character", "creature"].includes(actor?.type)
  )
    return null;
  assertNoPendingTurn(actor);
  const basis = {
    ...damageBasis(actor),
    conditions: conditionTurnBasis(actor),
  };
  const conditionChanges =
    request.kind === "finish"
      ? prepareConditionTurn(actor, basis, request, id, authorId)
      : null;
  if (!basis.survival && !conditionChanges) return null;
  if (basis.survival && basis.survival.hp !== basis.hp)
    throw new Error("Reconcile edited HP before advancing this survival turn.");
  const current = basis.survival
    ? {
        ...basis.survival,
        maxHp: basis.maxHp,
        gritAvailable: basis.gritAvailable,
      }
    : null;
  if (current) validateSurvival(current);
  const next = !current
    ? null
    : request.kind === "choose"
      ? startSurvivalTurn(current, current.ownTurn + 1)
      : endSurvivalTurn(current, current.ownTurn);
  const changes = {
    ...(next
      ? { "system.health.value": next.hp, [`flags.${ID}.survival`]: next }
      : {}),
    ...conditionChanges,
    [`flags.${ID}.damageRevision`]: basis.revision + 1,
    [`flags.${ID}.turnPhaseReceipts.${id}`]: {
      applied: true,
      combatUuid: combat.uuid,
      phase: request.kind,
      ownTurn: next?.ownTurn ?? null,
    },
  };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  return {
    requestId: id,
    actorUuid: actor.uuid,
    requestSignature: JSON.stringify(request),
    authorId,
    basis,
    changes,
    commit,
  };
}
export async function resumeTurnPhase(combat, message) {
  const phase = combat.getFlag(ID, "pendingTurnPhase");
  if (!phase) throw new Error("No turn phase awaits continuation.");
  if (
    message &&
    (JSON.stringify(message.getFlag(ID, "combatRequest")) !==
      phase.requestSignature ||
      message.author?.id !== phase.authorId)
  )
    throw new Error("The reserved turn request changed.");
  const actor = await fromUuid(phase.actorUuid);
  if (actor?.documentName !== "Actor")
    throw new Error(
      "The turn-phase actor is unavailable; the DA must reconcile the encounter.",
    );
  if (!actor.getFlag(ID, "turnPhaseReceipts")?.[phase.requestId]?.applied) {
    if (
      JSON.stringify({
        ...damageBasis(actor),
        conditions: conditionTurnBasis(actor),
      }) !== JSON.stringify(phase.basis)
    )
      throw new Error(
        "Character state changed before its reserved phase. The DA can cancel the unapplied turn change and review it again.",
      );
    for (const data of phase.changes.effects ?? [])
      new foundry.documents.ActiveEffect(data, {
        parent: actor,
        strict: true,
      }).validate({ strict: true, fallback: false });
    actor.validate({
      changes: foundry.utils.expandObject(phase.changes),
      strict: true,
      fallback: false,
    });
    await writeAuthorityDocument(actor, phase.changes);
  }
  for (const data of phase.changes.effects ?? []) {
    const effect = actor.effects.get(data._id);
    if (
      !effect ||
      JSON.stringify(effect.getFlag(ID, "condition")) !==
        JSON.stringify(data.flags?.[ID]?.condition) ||
      effect.disabled !== Boolean(data.disabled)
    )
      throw new Error("Turn effects need reconciliation before settlement.");
  }
  await writeAuthorityDocument(combat, {
    ...phase.commit,
    [`flags.${ID}.pendingTurnPhase`]: null,
  });
  return { status: "complete", replay: false };
}
export function cancelTurnPhase(combatUuid, reason) {
  return enqueueCharacterOperation(async () => {
    if (!game.user.isGM || typeof reason !== "string" || !reason.trim())
      throw new Error("Turn cancellation needs the actual DA and a reason.");
    const combat = await fromUuid(combatUuid),
      phase = combat?.getFlag(ID, "pendingTurnPhase");
    if (!phase) throw new Error("No pending turn phase.");
    const actor = await fromUuid(phase.actorUuid);
    if (
      !actor ||
      actor.getFlag(ID, "turnPhaseReceipts")?.[phase.requestId]?.applied
    )
      throw new Error(
        "The Actor phase is applied or unavailable. Resume settlement instead of cancelling.",
      );
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.pendingTurnPhase`]: null,
      [`flags.${ID}.operationReceipts.${phase.requestId}`]: {
        applied: true,
        status: "cancelled",
        authorId: phase.authorId,
        request: phase.requestSignature,
        cancelledBy: game.user.id,
        reason,
      },
    });
    return { status: "cancelled" };
  });
}
