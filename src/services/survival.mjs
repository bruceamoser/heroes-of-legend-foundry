import { ensureAuthorityReady } from "./authority.mjs";
import {
  chooseSurvival,
  resolveSurvival,
  validateSurvival,
} from "../rules/survival.mjs";
import { rollBasis, prepareRoll } from "./roll-preparation.mjs";
import { evaluatePreparedRoll } from "./roll.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export async function requestSurvival(actor, basis, draft, kind = "roll") {
  await ensureAuthorityReady();
  return ChatMessage.create({
    content: `Survival ${kind} requested.`,
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: { survivalRequest: { actorUuid: actor.uuid, basis, draft, kind } },
    },
  });
}
export function resolveSurvivalRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function present(actor, id, message) {
  const result = actor.getFlag(ID, "survivalResults")?.[id];
  if (!message || !result) return;
  await message.update({
    content: result.content,
    ...(result.nativeRoll
      ? {
          rolls: [result.nativeRoll],
          flags: { [ID]: { roll: result.snapshot } },
        }
      : {}),
  });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "survivalRequest"),
    actor =
      typeof request?.actorUuid === "string"
        ? await fromUuid(request.actorUuid)
        : null;
  if (
    actor?.type !== "character" ||
    actor.pack ||
    !message.author ||
    !actor.testUserPermission(message.author, "OWNER")
  )
    throw new Error("Only a character owner or the DA chooses survival.");
  if (!["grit", "roll", "recover"].includes(request.kind))
    throw new Error("Unknown survival choice.");
  const signature = JSON.stringify(request),
    receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id)
      throw new Error("The completed survival request changed.");
    await present(actor, receipt.resultId ?? id, message);
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor, { allowDeath: true });
  let pending = actor.getFlag(ID, "pendingDeath"),
    basis,
    choice,
    originalId = id,
    originalAuthor = message.author.id,
    originalSignature = signature,
    retained,
    snapshot,
    nativeRoll,
    recovery = null;
  if (request.kind === "recover") {
    if (
      !message.author.isGM ||
      !pending
    )
      throw new Error(
        "Recover an unresolved death roll as the actual DA.",
      );
    retained = request.draft.retained;
    recovery = { reason: typeof request.draft.reason === "string" ? request.draft.reason : "", authorId: message.author.id };
    basis = pending.basis;
    choice = pending.choice;
    originalId = pending.requestId;
    originalAuthor = pending.authorId;
    originalSignature = pending.signature;
  } else {
    if (pending)
      throw new Error(
        "This death roll may have no saved result. The DA must recover the pending choice; retry will not reroll.",
      );
    basis = rollBasis(actor, "fortitude", "death");
    if (JSON.stringify(basis) !== JSON.stringify(request.basis))
      throw new Error(
        "Survival or roll sources changed. Review the choice again.",
      );
    if (
      Object.values(actor.getFlag(ID, "pendingWounds") ?? {}).some(
        (w) => w.status !== "resolved",
      )
    )
      throw new Error(
        "Resolve pending wounds before choosing Grit or the death roll; their result may be Last Words.",
      );
    const state = {
      ...actor.getFlag(ID, "survival"),
      maxHp: actor.system.health.max,
      gritAvailable: actor.system.grit.available,
    };
    validateSurvival(state);
    choice = chooseSurvival(state, request.kind);
    if (request.kind === "roll") {
      prepareRoll(basis, request.draft);
      pending = {
        requestId: id,
        authorId: message.author.id,
        signature,
        basis,
        draft: request.draft,
        choice,
      };
      await writeAuthorityDocument(actor, {
        [`flags.${ID}.survival`]: choice,
        [`flags.${ID}.pendingDeath`]: pending,
        [`flags.${ID}.damageRevision`]:
          (actor.getFlag(ID, "damageRevision") ?? 0) + 1,
      });
      const evaluated = await evaluatePreparedRoll(
        actor,
        basis,
        request.draft,
        { rollerId: message.author.id },
      );
      retained = evaluated.snapshot.retained;
      snapshot = evaluated.snapshot;
      nativeRoll = evaluated.roll.toJSON();
    }
  }
  if (
    actor.system.health.value !== basis.survival.hp ||
    actor.system.grit.available !== basis.survival.gritAvailable ||
    (pending &&
      JSON.stringify(actor.getFlag(ID, "survival")) !== JSON.stringify(choice))
  )
    throw new Error(
      "Survival changed during the reserved choice; the DA must reconcile it without repeating dice or payment.",
    );
  const next = resolveSurvival(choice, {
    retained,
    fortitude: basis.attribute,
  });
  const spent = actor.system.grit.spent + (request.kind === "grit" ? 1 : 0);
  const content = recovery
    ? `DA recorded retained death dice ${retained.join(", ")}. ${next.status}; HP ${next.hp}, death marks ${next.marks}. No new dice were rolled.`
    : request.kind === "grit"
      ? `One Grit spent. HP restored to ${next.hp}; wounds remain.`
      : `Death roll resolved: ${next.status}; HP ${next.hp}, death marks ${next.marks}.`;
  const result = {
    content,
    ...(snapshot ? { snapshot } : {}),
    ...(nativeRoll ? { nativeRoll } : {}),
    ...(recovery ? { recovery, retained } : {}),
    state: next,
  };
  const changes = {
    "system.health.value": next.hp,
    "system.grit.spent": spent,
    [`flags.${ID}.survival`]: next,
    [`flags.${ID}.pendingDeath`]: null,
    [`flags.${ID}.damageRevision`]:
      (actor.getFlag(ID, "damageRevision") ?? 0) + 1,
    [`flags.${ID}.survivalResults.${originalId}`]: result,
    [`flags.${ID}.operationReceipts.${originalId}`]: {
      applied: true,
      authorId: originalAuthor,
      request: originalSignature,
      resultId: originalId,
    },
    ...(id !== originalId
      ? {
          [`flags.${ID}.operationReceipts.${id}`]: {
            applied: true,
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
  await present(actor, originalId, message);
  if (id !== originalId)
    await present(actor, originalId, game.messages.get(originalId));
  return { status: "complete", replay: false };
}
export function registerSurvivalRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "survivalRequest") && isCreationAuthority())
      resolveSurvivalRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Survival needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
