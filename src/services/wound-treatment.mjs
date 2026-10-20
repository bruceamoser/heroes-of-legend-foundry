import { ensureAuthorityReady } from "./authority.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import { enqueueCharacterOperation, isCreationAuthority, writeAuthorityDocument } from "./authority.mjs";
const ID = "heroes-of-legend";
export function woundTreatmentBasis(actor, eventId) {
  if (actor?.type !== "character" || actor.pack) throw new Error("Choose a world character wound.");
  const wound = actor.getFlag(ID, "wounds")?.[eventId];
  if (!wound) throw new Error("This wound no longer exists.");
  return structuredClone({ eventId, wound, effects: actor.effects.map(effect => effect.toObject()).filter(effect => effect.flags?.[ID]?.woundEvent === eventId) });
}
export async function requestWoundTreatment(actor, eventId, progress, basis = woundTreatmentBasis(actor, eventId)) {
  if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("Only an owner can record wound treatment.");
  await ensureAuthorityReady();
  return ChatMessage.create({ content: "Wound treatment requested.", whisper: game.users.filter(user => user.isGM || user.id === game.user.id).map(user => user.id), flags: { [ID]: { woundTreatmentRequest: { actorUuid: actor.uuid, eventId, progress, basis } } } });
}
export function resolveWoundTreatmentRequest(id) {
  const targetUuid = game.messages.get(id)?.getFlag(ID, "woundTreatmentRequest")?.actorUuid;
  return enqueueCharacterOperation(() => apply(id), { requestId: id, targetUuid });
}
async function apply(id) {
  const message = game.messages.get(id), request = message?.getFlag(ID, "woundTreatmentRequest");
  const actor = typeof request?.actorUuid === "string" ? await fromUuid(request.actorUuid) : null;
  if (!message?.author || !actor?.testUserPermission(message.author, "OWNER")) throw new Error("Only an owner can record wound treatment.");
  const signature = JSON.stringify(request), prior = actor.getFlag(ID, "operationReceipts")?.[id];
  if (prior?.applied) {
    if (prior.request !== signature || prior.authorId !== message.author.id) throw new Error("The completed treatment request changed.");
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  const basis = woundTreatmentBasis(actor, request.eventId);
  if (JSON.stringify(basis) !== JSON.stringify(request.basis)) throw new Error("The wound changed. Review treatment again.");
  const plan = woundTreatmentPlan(basis, request.progress);
  const changes = {
    ...(plan.removeEffectIds.length ? { [`flags.${ID}.conditionRevision`]: (actor.getFlag(ID, "conditionRevision") ?? 0) + 1 } : {}),
    effects: actor.toObject().effects.filter(effect => !plan.removeEffectIds.includes(effect._id)),
    [`flags.${ID}.wounds.${request.eventId}`]: plan.wound,
    [`flags.${ID}.damageRevision`]: (actor.getFlag(ID, "damageRevision") ?? 0) + 1,
    [`flags.${ID}.operationReceipts.${id}`]: { applied: true, authorId: message.author.id, request: signature },
  };
  actor.validate({ changes: foundry.utils.expandObject(changes), strict: true, fallback: false });
  await writeAuthorityDocument(actor, changes);
  await message.update({ content: `Wound treatment: ${plan.wound.recoveryProgress}/${plan.wound.recoveryValue}. ${plan.complete ? "Treatable effects relieved; the scar remains." : "Progress recorded."}` });
  return { status: "complete", replay: false };
}
/** The table resolves capability and printed activity time; recording progress adds no new roll or clock. */
export function woundTreatmentPlan(basis, progress) {
  if (![1, 2, 3].includes(progress)) throw new Error("Record 1, 2 or 3 treatment progress.");
  const wound = structuredClone(basis.wound), value = wound.recoveryValue;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("This wound has no treatment track; follow its printed remedy.");
  const before = wound.recoveryProgress ?? 0;
  if (!Number.isSafeInteger(before) || before < 0) throw new Error("Invalid wound treatment progress.");
  wound.recoveryProgress = Math.min(value, before + progress);
  const complete = wound.recoveryProgress >= value;
  const removeEffectIds = complete ? basis.effects.filter(effect => {
    const flags = effect.flags?.[ID];
    return flags?.woundEvent === basis.eventId && (["movementPenalty", "rollModifier"].includes(flags.woundModifier?.kind) || flags.condition?.persistence === "starred");
  }).map(effect => effect._id) : [];
  wound.effectIds = (wound.effectIds ?? []).filter(id => !removeEffectIds.includes(id));
  return { wound, complete, removeEffectIds };
}
export function registerWoundTreatmentRequests() {
  Hooks.on("createChatMessage", message => {
    if (message.getFlag(ID, "woundTreatmentRequest") && isCreationAuthority()) resolveWoundTreatmentRequest(message.id).catch(async error => {
      ui.notifications.error(error.message);
      await message.update({ content: `Treatment needs attention: ${foundry.utils.escapeHTML(error.message)}` });
    });
  });
}
