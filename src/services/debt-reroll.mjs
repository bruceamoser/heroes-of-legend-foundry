import { createActionMessage, ensureAuthorityReady, writeAuthorityDocument } from "./authority.mjs";
import { damageBasis } from "./damage.mjs";
import { payDebt } from "../rules/recovery.mjs";
import { ancestryTraitIds } from "../rules/ancestry.mjs";
import { debtRerollPlan, debtReplacement } from "../rules/debt-reroll.mjs";
import { validateSurvival } from "../rules/survival.mjs";

const ID = "heroes-of-legend";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function requestDebtReroll(actor, source) {
  if (!actor?.testUserPermission(game.user, "OWNER")) throw new Error("Only this hero’s owner can pay HP for a reroll.");
  if (!source?.isContentVisible) throw new Error("Choose a visible ordinary attribute check.");
  const rollSnapshot = source.getFlag(ID, "roll");
  debtRerollPlan(rollSnapshot);
  if (rollSnapshot.actorUuid !== actor.uuid) throw new Error("The roll belongs to another hero.");
  await ensureAuthorityReady();
  return createActionMessage({
    content: "The Debt Comes Due reroll requested.",
    whisper: game.users.filter(user => user.isGM || user.id === game.user.id).map(user => user.id),
    flags: { [ID]: { recoveryRequest: { actorUuid: actor.uuid, basis: damageBasis(actor),
      draft: { kind: "debt", rollMessageId: source.id, rollSnapshot } } } },
  });
}

async function present(actor, operation) {
  const source = game.messages.get(operation.sourceMessageId);
  if (!source) throw new Error("The rerolled attribute message is unavailable; its replacement result remains saved on the hero.");
  const current = source.getFlag(ID, "roll");
  if (!same(current, operation.original) && !same(current, operation.snapshot))
    throw new Error("The original chat roll changed; the replacement result remains saved on the hero for DA reconciliation.");
  await source.update({
    rolls: operation.nativeRoll ? [operation.nativeRoll] : [],
    [`flags.${ID}.roll`]: operation.snapshot,
    [`flags.${ID}.debtReroll`]: { requestId: operation.requestId, original: operation.original,
      recovery: operation.recovery ?? null },
  });
}

/** Called only by the serialized recovery coordinator after verifying Actor ownership. */
export async function applyDebtReroll(actor, message, request, basis, signature) {
  if (actor.type !== "character" || actor.pack || !message.author || !actor.testUserPermission(message.author, "OWNER"))
    throw new Error("Only this hero’s owner can pay HP for a reroll.");
  const correction = request.draft.kind === "debt-result";
  const requestId = correction ? request.draft.debtOperationId : message.id;
  let operation = actor.getFlag(ID, "debtRerolls")?.[requestId];
  if (correction && !message.author.isGM) throw new Error("Only the DA can recover an interrupted Debt reroll.");
  const ownReceipt = actor.getFlag(ID, "operationReceipts")?.[message.id];
  if (ownReceipt && (ownReceipt.request !== signature || ownReceipt.authorId !== message.author.id))
    throw new Error("The completed Debt request changed.");
  if (operation) {
    if (!correction && (operation.signature !== signature || operation.authorId !== message.author.id))
      throw new Error("The saved Debt request changed.");
    if (operation.status === "resolved") {
      if (correction && !ownReceipt) throw new Error("That Debt reroll has already been resolved.");
      await present(actor, operation);
      return { status: "complete", replay: true };
    }
    if (!correction) throw new Error("This Debt reroll may already have rolled. The DA must recover its retained dice in Recovery; retry will not roll or pay again.");
  } else if (correction) throw new Error("Choose a saved interrupted Debt reroll.");

  if (!operation) {
    if (!same(basis, request.basis)) throw new Error("HP, survival or defenses changed. Review the reroll again.");
    const source = game.messages.get(request.draft.rollMessageId);
    const original = source?.getFlag(ID, "roll");
    debtRerollPlan(original);
    if (original.actorUuid !== actor.uuid || !same(original, request.draft.rollSnapshot))
      throw new Error("The original attribute check changed.");
    const retained = source.rolls?.[0]?.dice?.[0]?.results.filter(die => die.active).map(die => die.result);
    if (!same(retained, original.retained)) throw new Error("The original native dice do not match the check.");
    const development = actor.getFlag(ID, "development") ?? {};
    const payment = payDebt({ hp: basis.hp, maxHp: basis.maxHp, recovery: basis.recovery,
      traitIds: ancestryTraitIds(development.creation ?? {traitIds:development.ancestryTraitIds}) });
    operation = { status: "rolling", requestId, sourceMessageId: source.id, original:structuredClone(original),
      signature, authorId: message.author.id };
    const changes = {
      "system.health.value": payment.hp, "system.recovery": payment.recovery,
      [`flags.${ID}.debtRerolls.${requestId}`]: operation,
      [`flags.${ID}.damageRevision`]: basis.revision + 1,
    };
    if (basis.survival) {
      if (["lastWords", "dead"].includes(basis.survival.status)) throw new Error("The Debt Comes Due cannot reverse Last Words or death.");
      changes[`flags.${ID}.survival`] = validateSurvival({...basis.survival,hp:payment.hp,recovery:payment.recovery});
    }
    actor.validate({ changes: foundry.utils.expandObject(changes), strict: true, fallback: false });
    await writeAuthorityDocument(actor, changes);
  }

  let retained, dice, nativeRoll = null;
  if (correction) {
    retained = request.draft.retained;
    dice = retained?.map((face, index) => ({index, face, kept:true}));
  } else {
    const plan = debtRerollPlan(operation.original);
    const roll = await new foundry.dice.Roll(plan.formula).evaluate({allowInteractive:false});
    retained = roll.dice[0].results.filter(die => die.active).map(die => die.result);
    dice = roll.dice[0].results.map((die, index) => ({index, face:die.result, kept:Boolean(die.active)}));
    nativeRoll = roll.toJSON();
  }
  const snapshot = debtReplacement(operation.original, retained, dice, requestId);
  operation = { ...operation, status:"resolved", snapshot, nativeRoll,
    ...(correction ? {recovery:{authorId:message.author.id,requestId:message.id}} : {}) };
  const changes = {
    [`flags.${ID}.debtRerolls.${requestId}`]: operation,
    [`flags.${ID}.operationReceipts.${requestId}`]: {applied:true,kind:"debt-reroll",authorId:operation.authorId,request:operation.signature},
  };
  if (correction) changes[`flags.${ID}.operationReceipts.${message.id}`] = {applied:true,kind:"debt-result",authorId:message.author.id,request:signature};
  await writeAuthorityDocument(actor, changes);
  await present(actor, operation);
  await message.update({content: correction
    ? "DA recovered the retained Debt reroll dice; no new roll or HP payment was made. Use the replacement result."
    : "The Debt Comes Due: paid 1 HP and replaced the attribute check using its original attribute and Boons/Banes. Use the new result. The paid HP remains unavailable until next dawn."});
  return {status:"complete",replay:false};
}
