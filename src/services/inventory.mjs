import { inventoryCheck } from "../rules/inventory.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";

const ID = "heroes-of-legend";

const mutableJson = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function activeInventoryDie(die, label = "Supply die") {
  if (![4, 6, 8, 10, 12, 20].includes(die))
    throw new Error(`${label} must be d4, d6, d8, d10, d12 or d20.`);
  return die;
}

function wholeFaces(value, label = "Retained face") {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${label} must be a positive whole number.`);
  return value;
}

function itemSnapshot(item) {
  return mutableJson({
    itemId: item.id,
    itemUuid: item.uuid,
    type: item.type,
    name: item.name,
    catalogId: item.system.catalogId,
    inventoryDie: item.system.inventoryDie,
    quantity: item.system.quantity,
    source: item.getFlag(ID, "source") ?? null,
  });
}

export function inventoryBasis(actor, item) {
  if (!item || item.actor?.uuid !== actor?.uuid || item.type !== "equipment")
    throw new Error("Choose an equipment item owned by this character.");
  return mutableJson({
    inventoryRevision: actor.getFlag(ID, "inventoryRevision") ?? 0,
    equipmentRevision: actor.getFlag(ID, "equipmentRevision") ?? 0,
    item: itemSnapshot(item),
  });
}

export function inventoryActorTargets() {
  const actors = new Map([...game.actors].map((actor) => [actor.uuid, actor]));
  for (const scene of game.scenes)
    for (const token of scene.tokens)
      if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

export function findInventoryActor(requestId) {
  return inventoryActorTargets().find(
    (actor) =>
      actor.getFlag(ID, "pendingInventory")?.requestId === requestId ||
      actor.getFlag(ID, "inventoryResults")?.[requestId] ||
      actor.getFlag(ID, "operationReceipts")?.[requestId]?.kind === "inventory",
  );
}

function assertNoInventoryConflict(actor, requestId = null) {
  assertNoPendingTurn(actor);
  const potionPending = game.combats.find((combat) => {
    const requestId = combat.getFlag(ID, "pendingPotion"),
      operation = combat.getFlag(ID, "potionOperations")?.[requestId];
    return requestId && operation?.giver?.actorUuid === actor.uuid;
  });
  if (potionPending)
    throw new Error(
      "Finish the pending healing-potion use before checking this item's supply.",
    );
  const pending = actor.getFlag(ID, "pendingInventory");
  if (pending && pending.requestId !== requestId)
    throw new Error(
      "This character already has an unfinished supply check. Finish or recover it first.",
    );
}

function requestRecipients(actor) {
  return game.users
    .filter(
      (user) =>
        user.isGM ||
        user.id === game.user.id ||
        actor.testUserPermission(user, "OWNER"),
    )
    .map((user) => user.id);
}

function validatedReason(value, label = "Completed use or reason") {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} is required.`);
  return value.trim();
}

export async function requestInventory(
  actor,
  item,
  reason,
  basis = inventoryBasis(actor, item),
) {
  if (!item || item.actor?.uuid !== actor?.uuid || item.type !== "equipment")
    throw new Error("Choose an equipment item owned by this character.");
  if (!actor.testUserPermission(game.user, "OWNER"))
    throw new Error("Only an owner or the DA can check this item’s supply.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error(
      "Ask the DA to enable the automation coordinator before checking supply.",
    );
  activeInventoryDie(item.system.inventoryDie);
  assertNoInventoryConflict(actor);
  assertCurrentBasis(actor, basis);
  return ChatMessage.create({
    content: `Check ${foundry.utils.escapeHTML(item.name)} supply after its approved use.`,
    whisper: requestRecipients(actor),
    flags: {
      [ID]: {
        inventoryRequest: {
          actorUuid: actor.uuid,
          basis: mutableJson(basis),
          reason: validatedReason(reason),
        },
      },
    },
  });
}

export async function requestInventoryRecovery(
  actor,
  itemId,
  retainedFace,
  reason,
) {
  if (!game.user.isGM)
    throw new Error("Only the DA can recover a missing supply result.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error(
      "Enable the automation coordinator before recovering supply.",
    );
  const pending = actor.getFlag(ID, "pendingInventory");
  if (
    !pending ||
    pending.phase !== "reserved" ||
    pending.target?.itemId !== itemId
  )
    throw new Error("This supply check does not have a missing result.");
  activeInventoryDie(pending.target.inventoryDie);
  inventoryCheck({
    die: pending.target.inventoryDie,
    retained: wholeFaces(retainedFace),
  });
  return ChatMessage.create({
    content: `Record the supply result seen for ${foundry.utils.escapeHTML(pending.target.name)} without rolling again.`,
    whisper: requestRecipients(actor),
    flags: {
      [ID]: {
        inventoryRequest: {
          kind: "recover",
          actorUuid: actor.uuid,
          pendingRequestId: pending.requestId,
          targetItemId: pending.target.itemId,
          retainedFace,
          reason: validatedReason(reason, "DA recovery reason"),
        },
      },
    },
  });
}

export async function requestInventoryResume(actor) {
  if (!game.user.isGM)
    throw new Error("Only the DA can apply a saved supply result.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error(
      "Enable the automation coordinator before applying supply.",
    );
  const pending = actor.getFlag(ID, "pendingInventory");
  if (!pending || pending.phase !== "result")
    throw new Error("This supply check does not have a saved result.");
  return ChatMessage.create({
    content: `Apply the saved supply result for ${foundry.utils.escapeHTML(pending.target.name)} without rolling again.`,
    whisper: requestRecipients(actor),
    flags: {
      [ID]: {
        inventoryRequest: {
          kind: "resume",
          actorUuid: actor.uuid,
          pendingRequestId: pending.requestId,
          targetItemId: pending.target.itemId,
        },
      },
    },
  });
}

export async function requestInventoryAbandon(actor, reason) {
  if (!game.user.isGM)
    throw new Error("Only the DA can close a supply check without changes.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error(
      "Enable the automation coordinator before closing a supply check.",
    );
  const pending = actor.getFlag(ID, "pendingInventory");
  if (!pending || pending.phase !== "result")
    throw new Error("Only a supply check with a saved result can be closed.");
  return ChatMessage.create({
    content: `Close the saved supply check for ${foundry.utils.escapeHTML(pending.target.name)} without changing supply.`,
    whisper: requestRecipients(actor),
    flags: {
      [ID]: {
        inventoryRequest: {
          kind: "abandon",
          actorUuid: actor.uuid,
          pendingRequestId: pending.requestId,
          targetItemId: pending.target.itemId,
          reason: validatedReason(reason, "DA reason"),
        },
      },
    },
  });
}

export function resolveInventoryRequest(id, actorUuid = null) {
  const targetUuid =
    actorUuid ??
    game.messages.get(id)?.getFlag(ID, "inventoryRequest")?.actorUuid ??
    null;
  return enqueueCharacterOperation(() => apply(id, actorUuid), {
    requestId: id,
    targetUuid: typeof targetUuid === "string" ? targetUuid : null,
  });
}

function rollFromJson(data) {
  if (!data) return null;
  return foundry.dice.Roll.fromData(mutableJson(data));
}

function recoveryAudit(recovery) {
  if (
    !recovery ||
    typeof recovery.authorId !== "string" ||
    typeof recovery.signature !== "string"
  )
    throw new Error(
      "The missing supply result has no recorded DA review. Do not roll again.",
    );
  validatedReason(recovery.reason, "DA recovery reason");
  return recovery;
}

function assertNativeRoll(nativeRoll, die, retainedFace, recovery = null) {
  activeInventoryDie(die);
  wholeFaces(retainedFace, "Saved supply result");
  if (nativeRoll === null) {
    recoveryAudit(recovery);
    return null;
  }
  let serialized, roll;
  try {
    serialized = mutableJson(nativeRoll);
    roll = rollFromJson(serialized);
  } catch {
    serialized = null;
    roll = null;
  }
  const dieResult = roll?.dice?.[0],
    activeResults = dieResult?.results?.filter((result) => result.active) ?? [];
  if (
    !serialized ||
    !roll ||
    serialized.evaluated !== true ||
    typeof roll.formula !== "string" ||
    roll.formula.replace(/\s+/g, "").toLowerCase() !== `1d${die}` ||
    roll.terms?.length !== 1 ||
    roll.dice?.length !== 1 ||
    dieResult.faces !== die ||
    dieResult.number !== 1 ||
    dieResult.results?.length !== 1 ||
    activeResults.length !== 1 ||
    activeResults[0].result !== retainedFace ||
    roll.total !== retainedFace
  )
    throw new Error(
      "The saved supply result does not match its recorded die. Ask the DA to review it; do not roll again.",
    );
  return roll;
}

function assertSavedResult(record) {
  if (!record?.target || !record.result)
    throw new Error(
      "The saved supply result is unavailable. Do not roll again.",
    );
  const checked = inventoryCheck({
    die: activeInventoryDie(record.target.inventoryDie),
    retained: wholeFaces(record.retainedFace, "Saved supply result"),
  });
  if (JSON.stringify(checked) !== JSON.stringify(record.result))
    throw new Error(
      "The saved supply result is inconsistent. Ask the DA to review it; do not roll again.",
    );
  return assertNativeRoll(
    record.nativeRoll,
    record.target.inventoryDie,
    record.retainedFace,
    record.recovery ?? record.provenance?.recovery ?? null,
  );
}

async function presentInventory(actor, resultId, message) {
  const result = actor.getFlag(ID, "inventoryResults")?.[resultId];
  if (!result) {
    if (message)
      throw new Error(
        "The saved supply result is missing. Ask the DA to review it.",
      );
    return;
  }
  const roll = assertSavedResult(result);
  if (!message) return;
  await message.update({
    content: result.content,
    ...(roll ? { rolls: [roll] } : {}),
    [`flags.${ID}.inventoryResult`]: mutableJson(result),
  });
}

function receiptFor(actor, id) {
  return actor.getFlag(ID, "operationReceipts")?.[id];
}

function validateReceipt(receipt, signature, authorId, label) {
  if (
    receipt?.request !== signature ||
    receipt?.authorId !== authorId ||
    receipt?.kind !== "inventory"
  )
    throw new Error(`The completed ${label} inventory request changed.`);
}

function assertCurrentBasis(actor, basis) {
  const item = actor.items.get(basis?.item?.itemId);
  if (!item) throw new Error("The checked item was deleted.");
  const current = inventoryBasis(actor, item);
  if (JSON.stringify(current) !== JSON.stringify(basis))
    throw new Error(
      "This character or item changed. Review the current item before checking again.",
    );
  return item;
}

function validateItems(actor, items) {
  for (const data of items) {
    const item = new CONFIG.Item.documentClass(data, {
      parent: actor,
      strict: true,
    });
    item.validate({ strict: true, fallback: false });
  }
}

function settlementChanges(
  actor,
  pending,
  result,
  continuation = null,
  resultRecord = result,
) {
  const items = actor.toObject().items ?? [],
    matches = items.filter((item) => item._id === pending.target.itemId);
  if (
    matches.length !== 1 ||
    matches[0].type !== "equipment" ||
    matches[0].system.quantity !== pending.target.quantity
  )
    throw new Error(
      "The checked item or quantity changed. Ask the DA to review the saved result; do not roll again.",
    );
  matches[0].system.inventoryDie = result.after;
  validateItems(actor, items);

  const originalId = pending.requestId,
    receipt = {
      applied: true,
      kind: "inventory",
      status: "applied",
      authorId: pending.authorId,
      request: pending.signature,
      resultId: originalId,
      ...(pending.recovery ? { recoveredBy: pending.recovery.authorId } : {}),
    },
    changes = {
      items,
      [`flags.${ID}.inventoryRevision`]: pending.basis.inventoryRevision + 1,
      [`flags.${ID}.pendingInventory`]: null,
      [`flags.${ID}.inventoryResults.${originalId}`]: mutableJson(resultRecord),
      [`flags.${ID}.operationReceipts.${originalId}`]: receipt,
      ...(continuation && continuation.id !== originalId
        ? {
            [`flags.${ID}.operationReceipts.${continuation.id}`]: {
              applied: true,
              kind: "inventory",
              status: "applied",
              authorId: continuation.authorId,
              request: continuation.signature,
              resultId: originalId,
            },
          }
        : {}),
    };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  return { changes, items };
}

function verifySettlement(actor, pending, result, beforeItems) {
  const item = actor.items.get(pending.target.itemId);
  if (
    !item ||
    item.system.inventoryDie !== result.after ||
    item.system.quantity !== pending.target.quantity ||
    JSON.stringify(item.getFlag(ID, "source") ?? null) !==
      JSON.stringify(pending.target.source) ||
    actor.items.size !== beforeItems.length
  )
    throw new Error(
      "The supply check needs review; do not repeat its roll or use.",
    );
  for (const before of beforeItems) {
    const current = actor.items.get(before._id);
    if (!current || current.system.quantity !== before.system.quantity)
      throw new Error(
        "Another item changed during the supply check. Ask the DA to review it; do not repeat the roll or use.",
      );
  }
}

async function evaluateInventory(actor, pending) {
  assertNoInventoryConflict(actor, pending.requestId);
  assertCurrentBasis(actor, pending.basis);
  activeInventoryDie(pending.target.inventoryDie);
  const roll = await new foundry.dice.Roll(
    `1d${pending.target.inventoryDie}`,
  ).evaluate({ allowInteractive: false });
  const face = roll.dice[0]?.results?.find((result) => result.active)?.result;
  if (!Number.isSafeInteger(face))
    throw new Error("The supply roll produced no result. Do not roll again.");
  const result = mutableJson(
      inventoryCheck({
        die: pending.target.inventoryDie,
        retained: face,
      }),
    ),
    nativeRoll = roll.toJSON();
  assertNativeRoll(nativeRoll, pending.target.inventoryDie, face);
  const saved = mutableJson({
    ...pending,
    phase: "result",
    retainedFace: face,
    nativeRoll,
    result,
  });
  await writeAuthorityDocument(actor, {
    [`flags.${ID}.pendingInventory`]: saved,
  });
  return saved;
}

function resultContent(actor, pending, result, recovered = false) {
  const name = foundry.utils.escapeHTML(pending.target.name),
    actorName = foundry.utils.escapeHTML(actor.name),
    outcome = result.after === 0 ? "out" : `d${result.after}`,
    dice = recovered
      ? `The DA entered the observed result ${result.retained}; no new roll was made.`
      : `The supply roll was ${result.retained}.`;
  return `${actorName}: ${name} supply check recorded. ${dice} Supply d${result.before} → ${outcome}. Quantity remains ${pending.target.quantity}. This records only the supply check.`;
}

function resultProvenance(pending) {
  return mutableJson({
    requestId: pending.requestId,
    actorUuid: pending.actorUuid,
    authorId: pending.authorId,
    signature: pending.signature,
    reason: pending.reason,
    equipmentRevision: pending.basis.equipmentRevision,
    inventoryRevision: pending.basis.inventoryRevision,
    ...(pending.recovery ? { recovery: pending.recovery } : {}),
  });
}

function currentInventoryRevision(actor) {
  const revision = actor.getFlag(ID, "inventoryRevision") ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error(
      "The saved supply revision is invalid. Ask the DA to review it.",
    );
  return revision;
}

async function abandonPending(actor, pending, message, request, signature) {
  if (!message?.author?.isGM)
    throw new Error("Only the DA can close a supply check without changes.");
  if (
    pending.phase !== "result" ||
    request.pendingRequestId !== pending.requestId ||
    request.targetItemId !== pending.target.itemId
  )
    throw new Error("The saved supply check or item changed.");
  assertNoInventoryConflict(actor, pending.requestId);
  assertSavedResult(pending);
  try {
    assertCurrentBasis(actor, pending.basis);
  } catch {
    const reason = validatedReason(request.reason, "DA reason"),
      originalId = pending.requestId,
      revision = currentInventoryRevision(actor) + 1,
      disposition = mutableJson({
        status: "abandoned",
        authorId: message.author.id,
        requestId: message.id,
        signature,
        reason,
      }),
      content = `${foundry.utils.escapeHTML(actor.name)}: the saved ${foundry.utils.escapeHTML(pending.target.name)} supply check was closed without changing supply. The original check and saved result remain for review. DA reason: ${foundry.utils.escapeHTML(reason)}. No quantities were changed by this closure.`,
      stored = mutableJson({
        content,
        target: pending.target,
        basis: pending.basis,
        originalRequest: pending.originalRequest,
        retainedFace: pending.retainedFace,
        nativeRoll: pending.nativeRoll ?? null,
        result: pending.result,
        provenance: resultProvenance(pending),
        disposition,
      }),
      receipt = {
        applied: true,
        kind: "inventory",
        status: "abandoned",
        authorId: pending.authorId,
        request: pending.signature,
        resultId: originalId,
        abandonedBy: message.author.id,
      },
      beforeItems = mutableJson(actor.toObject().items ?? []),
      changes = {
        [`flags.${ID}.inventoryRevision`]: revision,
        [`flags.${ID}.pendingInventory`]: null,
        [`flags.${ID}.inventoryResults.${originalId}`]: stored,
        [`flags.${ID}.operationReceipts.${originalId}`]: receipt,
        ...(message.id !== originalId
          ? {
              [`flags.${ID}.operationReceipts.${message.id}`]: {
                applied: true,
                kind: "inventory",
                status: "abandoned",
                authorId: message.author.id,
                request: signature,
                resultId: originalId,
              },
            }
          : {}),
      };
    actor.validate({
      changes: foundry.utils.expandObject(changes),
      strict: true,
      fallback: false,
    });
    await writeAuthorityDocument(actor, changes);
    if (
      actor.getFlag(ID, "pendingInventory") !== null ||
      actor.getFlag(ID, "inventoryRevision") !== revision ||
      JSON.stringify(actor.toObject().items ?? []) !==
        JSON.stringify(beforeItems)
    )
      throw new Error(
        "The supply check changed unexpectedly during closure. Do not retry it.",
      );
    await presentInventory(actor, originalId, message);
    if (message.id !== originalId)
      await presentInventory(actor, originalId, game.messages.get(originalId));
    return { status: "complete", replay: false };
  }
  throw new Error(
    "This supply is unchanged. Apply the saved result instead of closing the check.",
  );
}

async function apply(id, requestedActorUuid) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "inventoryRequest"),
    actorUuid = request?.actorUuid ?? requestedActorUuid,
    actor = typeof actorUuid === "string" ? await fromUuid(actorUuid) : null;
  let pending = structuredClone(actor?.getFlag(ID, "pendingInventory") ?? null);
  const receipt = actor?.getFlag(ID, "operationReceipts")?.[id],
    storedAuthorId =
      pending?.authorId ??
      receipt?.authorId ??
      actor?.getFlag(ID, "inventoryResults")?.[id]?.provenance?.authorId,
    author = message?.author ?? game.users.get(storedAuthorId),
    kind = request?.kind ?? pending?.originalRequest?.kind ?? "check",
    signature = request ? JSON.stringify(request) : null,
    previousReceipt = receiptFor(actor, id);
  if (
    actor?.documentName !== "Actor" ||
    actor.pack ||
    !author ||
    !actor.testUserPermission(author, "OWNER")
  )
    throw new Error(
      "Only an owner or the DA can check this character’s supply.",
    );
  if (!["check", "recover", "resume", "abandon"].includes(kind))
    throw new Error("Unknown supply request.");
  if (kind !== "check" && !message)
    throw new Error("The DA action message is unavailable.");
  if (kind !== "check" && !message.author.isGM)
    throw new Error("Only the DA can continue a saved supply check.");

  if (previousReceipt?.applied) {
    if (message)
      validateReceipt(previousReceipt, signature, message.author.id, "request");
    await presentInventory(actor, previousReceipt.resultId ?? id, message);
    return { status: "complete", replay: true };
  }

  const createdReservation = !pending;
  let continuationMessage = null;

  if (kind === "check")
    activeInventoryDie(
      pending?.target?.inventoryDie ?? request?.basis?.item?.inventoryDie,
    );
  else {
    if (!pending) throw new Error("The saved supply check is unavailable.");
    activeInventoryDie(pending.target?.inventoryDie);
  }

  if (kind === "recover") {
    if (
      pending.phase !== "reserved" ||
      request.pendingRequestId !== pending.requestId ||
      request.targetItemId !== pending.target.itemId
    )
      throw new Error(
        "The missing supply result is unavailable or already recorded.",
      );
    assertNoInventoryConflict(actor, pending.requestId);
    const checked = inventoryCheck({
      die: pending.target.inventoryDie,
      retained: wholeFaces(request.retainedFace, "Observed supply result"),
    });
    pending = {
      ...pending,
      phase: "result",
      retainedFace: checked.retained,
      nativeRoll: null,
      result: mutableJson(checked),
      recovery: {
        authorId: message.author.id,
        signature,
        reason: validatedReason(request.reason, "DA recovery reason"),
      },
    };
    await writeAuthorityDocument(actor, {
      [`flags.${ID}.pendingInventory`]: pending,
    });
    continuationMessage = message;
  } else if (kind === "resume") {
    if (
      pending.phase !== "result" ||
      request.pendingRequestId !== pending.requestId ||
      request.targetItemId !== pending.target.itemId
    )
      throw new Error("The saved supply result or item changed.");
    continuationMessage = message;
  } else if (kind === "abandon") {
    return abandonPending(actor, pending, message, request, signature);
  } else if (!pending) {
    if (!message || !request)
      throw new Error("The original supply request is unavailable.");
    assertNoInventoryConflict(actor);
    const item = actor.items.get(request.basis?.item?.itemId);
    if (!item) throw new Error("The checked item is unavailable.");
    if (item.system.inventoryDie === 0)
      throw new Error("This item’s supply is already out.");
    assertCurrentBasis(actor, request.basis);
    pending = mutableJson({
      requestId: id,
      actorUuid: actor.uuid,
      authorId: message.author.id,
      signature,
      originalRequest: request,
      basis: request.basis,
      target: request.basis.item,
      reason: validatedReason(request.reason),
      phase: "reserved",
    });
    await writeAuthorityDocument(actor, {
      [`flags.${ID}.pendingInventory`]: pending,
    });
  } else {
    if (
      pending.requestId !== id ||
      pending.authorId !== author.id ||
      (message && pending.signature !== signature) ||
      JSON.stringify(pending.originalRequest) !==
        JSON.stringify(request ?? pending.originalRequest)
    )
      throw new Error(
        "A different or changed request owns this character’s saved supply check.",
      );
  }

  if (pending.phase === "reserved") {
    if (kind === "check" && !createdReservation) {
      throw new Error(
        "This supply check may have rolled without a saved result. Ask the DA to enter the result that was seen; do not roll again.",
      );
    }
  } else if (pending.phase !== "result")
    throw new Error("Unknown pending inventory phase.");

  if (!pending.result && kind === "check" && createdReservation) {
    pending = await evaluateInventory(actor, pending);
  }
  if (!pending.result)
    throw new Error(
      "This supply check has no saved result. Ask the DA to enter the result that was seen; do not roll again.",
    );
  assertSavedResult(pending);
  assertNoInventoryConflict(actor, pending.requestId);
  assertCurrentBasis(actor, pending.basis);

  const recovered = Boolean(pending.recovery),
    result = mutableJson(pending.result),
    content = resultContent(actor, pending, result, recovered),
    stored = mutableJson({
      content,
      target: pending.target,
      basis: pending.basis,
      retainedFace: pending.retainedFace,
      nativeRoll: pending.nativeRoll ?? null,
      result,
      provenance: resultProvenance(pending),
    });
  pending = {
    ...pending,
    presentation: stored,
  };
  const beforeItems = actor.toObject().items ?? [],
    continuation =
      continuationMessage && continuationMessage.id !== pending.requestId
        ? {
            id: continuationMessage.id,
            authorId: continuationMessage.author.id,
            signature: JSON.stringify(
              continuationMessage.getFlag(ID, "inventoryRequest"),
            ),
          }
        : null,
    { changes } = settlementChanges(
      actor,
      pending,
      result,
      continuation,
      stored,
    );
  await writeAuthorityDocument(actor, changes);
  verifySettlement(actor, pending, result, beforeItems);
  await presentInventory(actor, pending.requestId, message);
  if (continuationMessage && continuationMessage.id !== message?.id)
    await presentInventory(actor, pending.requestId, continuationMessage);
  if (pending.requestId !== message?.id)
    await presentInventory(
      actor,
      pending.requestId,
      game.messages.get(pending.requestId),
    );
  return { status: "complete", replay: false };
}

export function registerInventoryRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "inventoryRequest") && isCreationAuthority())
      resolveInventoryRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Supply check needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
