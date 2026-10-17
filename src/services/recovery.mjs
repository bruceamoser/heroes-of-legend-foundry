import { assertNoPendingTurn } from "./turn-lock.mjs";
import { damageBasis } from "./damage.mjs";
import { healingPlan } from "../rules/damage.mjs";
import {
  survivalState,
  validateSurvival,
  receiveHealing,
  safeBreath,
  stabilize,
  enterLastWords,
} from "../rules/survival.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function recoveryPreview(actor, basis, draft) {
  if (!["heal", "breath", "stabilize", "correct"].includes(draft.kind))
    throw new Error("Unknown recovery operation.");
  let state = null,
    after = basis.hp;
  if (draft.kind === "correct") {
    if (
      !Number.isSafeInteger(draft.hp) ||
      draft.hp < 0 ||
      draft.hp > basis.maxHp
    )
      throw new Error("Corrected HP must be within the actor’s maximum.");
    after = draft.hp;
    if (actor.type === "character") {
      const ownTurn = basis.survival?.ownTurn ?? 0;
      state = survivalState({
        hp: after,
        maxHp: basis.maxHp,
        wounds: draft.wounds,
        marks:
          draft.status === "lastWords" ? Math.min(2, draft.marks) : draft.marks,
        status: draft.status === "lastWords" ? "dying" : draft.status,
        gritAvailable: basis.gritAvailable,
        ownTurn,
      });
      if (draft.status === "lastWords")
        state =
          basis.survival?.status === "lastWords"
            ? {
                ...basis.survival,
                hp: 0,
                wounds: draft.wounds,
                marks: draft.marks,
                maxHp: basis.maxHp,
                gritAvailable: basis.gritAvailable,
              }
            : enterLastWords(state);
      if (draft.status === "lastWords") state.marks = draft.marks;
      validateSurvival(state);
    }
  } else {
    if (actor.type === "character") {
      if (basis.survival?.hp !== undefined && basis.survival.hp !== basis.hp)
        throw new Error("Reconcile the edited HP and survival state first.");
      if (!basis.survival && basis.hp === 0)
        throw new Error("Record the existing survival state before recovery.");
      state = basis.survival
        ? {
            ...basis.survival,
            maxHp: basis.maxHp,
            gritAvailable: basis.gritAvailable,
          }
        : survivalState({
            hp: basis.hp,
            maxHp: basis.maxHp,
            gritAvailable: basis.gritAvailable,
          });
      validateSurvival(state);
    } else if (basis.hp === 0)
      throw new Error(
        "Ordinary recovery cannot revive a defeated creature. Use an explicit DA correction for an exception.",
      );
    if (draft.kind === "heal") {
      const plan = healingPlan({
        amount: draft.amount,
        current: basis.hp,
        max: basis.maxHp,
        lifeResistances: [draft.lifeResistance],
        recipientKind: actor.type,
      });
      if (!plan.allowed)
        throw new Error("This target cannot receive ordinary healing.");
      after = plan.after;
      if (state) state = receiveHealing(state, plan.restored);
    } else if (draft.kind === "breath") {
      if (state) state = safeBreath(state);
      after = basis.maxHp;
    } else {
      if (!state)
        throw new Error("Stabilization requires a character survival track.");
      state = stabilize(state);
      after = state.hp;
    }
  }
  return { after, state };
}
export async function requestRecovery(actor, basis, draft) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: "Recovery adjustment requested.",
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    flags: {
      [ID]: { recoveryRequest: { actorUuid: actor.uuid, basis, draft } },
    },
  });
}
export function resolveRecoveryRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "recoveryRequest");
  if (!message?.author?.isGM)
    throw new Error("The DA must authorize recorded recovery or corrections.");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  const basis = damageBasis(actor),
    signature = JSON.stringify(request),
    receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id)
      throw new Error("The completed recovery request changed.");
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  if (JSON.stringify(basis) !== JSON.stringify(request.basis))
    throw new Error("HP or survival changed. Review recovery again.");
  if (typeof request.draft?.reason !== "string" || !request.draft.reason.trim())
    throw new Error(
      "Record why this healing, safe breath, stabilization or correction applies.",
    );
  const plan = recoveryPreview(actor, basis, request.draft);
  const changes = {
    "system.health.value": plan.after,
    [`flags.${ID}.damageRevision`]: basis.revision + 1,
    [`flags.${ID}.recoveryEvents.${id}`]: {
      kind: request.draft.kind,
      reason: request.draft.reason,
      authorId: message.author.id,
      before: basis,
      after: plan,
    },
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: signature,
    },
  };
  if (plan.state) changes[`flags.${ID}.survival`] = plan.state;
  else changes[`flags.${ID}.creatureDefeated`] = plan.after === 0;
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  await message.update({
    content: `Recovery recorded: HP ${basis.hp} → ${plan.after}. Spent Grit and wound records remain.`,
  });
  return { status: "complete", replay: false };
}
export function registerRecoveryRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "recoveryRequest") && isCreationAuthority())
      resolveRecoveryRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Recovery needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
