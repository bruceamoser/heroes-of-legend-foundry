import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { rollBasis, prepareRoll } from "./roll-preparation.mjs";
import { evaluatePreparedRoll } from "./roll.mjs";
const ID = "heroes-of-legend";
export async function defenseSignature(request) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(request)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function defenseResponses(message) {
  const rows = message?.getFlag(ID, "defenseResponses") ?? [];
  if (
    !Array.isArray(rows) ||
    rows.some(
      (r) =>
        !r ||
        typeof r.requestId !== "string" ||
        typeof r.actorUuid !== "string" ||
        !Number.isSafeInteger(r.attempt) ||
        r.attempt < 1 ||
        !["rolling", "resolved", "abandoned"].includes(r.status),
    ) ||
    new Set(rows.map((r) => r.requestId)).size !== rows.length
  )
    throw new Error(
      "The defense ledger is invalid. The DA must reconcile it before another roll.",
    );
  return rows;
}
export async function requestDefense(actor, basis, draft) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  prepareRoll(basis, draft);
  return ChatMessage.create(
    ChatMessage.applyMode({
      content: "Defense submitted; waiting for the GM coordinator.",
      speaker: ChatMessage.getSpeaker({
        actor,
        token: basis.defenderTokenUuid
          ? fromUuidSync(basis.defenderTokenUuid)
          : undefined,
      }),
      flags: {
        [ID]: {
          defenseRequest: {
            attackMessageId: basis.attackMessageId,
            actorUuid: actor.uuid,
            basis: structuredClone(basis),
            draft: structuredClone(draft),
          },
        },
      },
    }),
  );
}
export function resolveDefenseRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
function validatedRequest(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "defenseRequest"),
    attack = game.messages.get(request?.attackMessageId);
  if (
    !message?.author ||
    typeof request?.actorUuid !== "string" ||
    !request.basis ||
    request.basis.mode !== "defense" ||
    !request.draft ||
    typeof request.draft !== "object" ||
    Array.isArray(request.draft) ||
    !attack?.author?.isGM ||
    !attack.getFlag(ID, "attackCard")
  )
    throw new Error("The defense request or incoming attack is unavailable.");
  return { message, request, attack };
}
async function apply(id) {
  const { message, request, attack } = validatedRequest(id),
    signature = await defenseSignature(request);
  let responses = structuredClone(defenseResponses(attack)),
    record = responses.find((r) => r.requestId === id);
  if (
    record &&
    (record.authorId !== message.author.id || record.signature !== signature)
  )
    throw new Error("The reserved defense request changed.");
  if (attack.getFlag(ID, "operationReceipts")?.[id]?.applied) {
    if (!record)
      throw new Error(
        "The settled attempt ledger is missing; the DA must reconcile it.",
      );
    return { status: record.status, replay: true };
  }
  if (!record) {
    const actor = await fromUuid(request.actorUuid);
    const basis = rollBasis(
      actor,
      request.basis?.attributeKey,
      "defense",
      attack.id,
      request.basis.defenderTokenUuid,
    );
    if (JSON.stringify(basis) !== JSON.stringify(request.basis))
      throw new Error(
        "Roll sources changed. Open Defend again to review them.",
      );
    prepareRoll(basis, request.draft);
    const previous = responses.filter((r) => r.actorUuid === actor.uuid);
    if (previous.some((r) => r.status === "rolling"))
      throw new Error(
        "This defender has an unresolved attempt. The DA must review it before another roll.",
      );
    if (
      previous.length &&
      (request.draft.additionalAttempt !== true ||
        typeof request.draft.attemptReason !== "string" ||
        !request.draft.attemptReason.trim())
    )
      throw new Error(
        "This defender already has an attempt. Explicitly choose an additional attempt and give its reason.",
      );
    record = {
      requestId: id,
      actorUuid: actor.uuid,
      defenderTokenUuid: basis.defenderTokenUuid,
      authorId: message.author.id,
      signature,
      attempt: previous.length + 1,
      status: "rolling",
      reason: previous.length
        ? "Explicit additional attempt"
        : "Initial defense",
    };
    responses.push(record);
    // Persist the uncertain-dice phase BEFORE evaluating. Recovery never rerolls it.
    await writeAuthorityDocument(attack, {
      [`flags.${ID}.defenseResponses`]: responses,
    });
    const current = rollBasis(
      actor,
      basis.attributeKey,
      "defense",
      attack.id,
      basis.defenderTokenUuid,
    );
    if (JSON.stringify(current) !== JSON.stringify(basis)) {
      record.status = "abandoned";
      record.disposition = {
        reason: "Sources changed before dice evaluation",
        userId: game.user.id,
      };
      await writeAuthorityDocument(attack, {
        [`flags.${ID}.defenseResponses`]: responses,
        [`flags.${ID}.operationReceipts.${id}`]: {
          applied: true,
          kind: "defense",
          status: "abandoned",
        },
      });
      throw new Error(
        "Sources changed before rolling. Review Defend and explicitly start a new attempt.",
      );
    }
    const { roll, snapshot } = await evaluatePreparedRoll(
      actor,
      basis,
      request.draft,
      { rollerId: message.author.id },
    );
    await writeAuthorityDocument(message, {
      content: "Defense rolled. Consequences remain manual in this preview.",
      rolls: [roll],
      flavor: `Defense · ${game.i18n.localize(`HOL.Attributes.${basis.attributeKey}`)}`,
      [`flags.${ID}.roll`]: snapshot,
      [`flags.${ID}.defenseStatus`]: "rolled",
    });
  }
  const saved = message.getFlag(ID, "roll");
  if (
    !saved ||
    !message.rolls.length ||
    saved.actorUuid !== record.actorUuid ||
    saved.rollerId !== record.authorId ||
    saved.attackMessageId !== attack.id
  )
    throw new Error(
      "This attempt may have rolled without a saved result. The DA must review and abandon it explicitly; retry will not reroll.",
    );
  record.status = "resolved";
  await writeAuthorityDocument(attack, {
    [`flags.${ID}.defenseResponses`]: responses,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      kind: "defense",
      status: "resolved",
    },
  });
  return { status: "resolved", replay: false };
}
export function abandonDefense(attackId, requestId, reason) {
  return enqueueCharacterOperation(
    async () => {
      if (!game.user.isGM || typeof reason !== "string" || !reason.trim())
        throw new Error("A DA disposition needs a reason.");
      const attack = game.messages.get(attackId),
        responses = structuredClone(defenseResponses(attack)),
        record = responses.find((r) => r.requestId === requestId);
      if (!attack?.author?.isGM || record?.status !== "rolling")
        throw new Error("This attempt is not awaiting disposition.");
      if (game.messages.get(requestId)?.getFlag(ID, "roll"))
        throw new Error(
          "A saved roll exists. Resume settlement instead of abandoning it.",
        );
      record.status = "abandoned";
      record.disposition = { userId: game.user.id, reason: reason.trim() };
      await writeAuthorityDocument(attack, {
        [`flags.${ID}.defenseResponses`]: responses,
        [`flags.${ID}.operationReceipts.${requestId}`]: {
          applied: true,
          kind: "defense",
          status: "abandoned",
        },
      });
      await game.messages
        .get(requestId)
        ?.update({
          content:
            "The DA abandoned this unresolved attempt without rerolling. Any new attempt needs an explicit reason.",
          [`flags.${ID}.defenseStatus`]: "abandoned",
        })
        .catch(() => {});
      return { status: "abandoned" };
    },
    { requestId },
  );
}
export function registerDefenseResponses() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "defenseRequest") && isCreationAuthority())
      resolveDefenseRequest(message.id).catch((error) => {
        ui.notifications.error(error.message);
        // Presentation failure must not cause a second roll or mask settlement.
        message
          .update({
            content: `Defense needs attention: ${foundry.utils.escapeHTML(error.message)}`,
          })
          .catch(() => {});
      });
  });
}
