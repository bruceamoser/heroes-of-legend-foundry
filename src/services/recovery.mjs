import { createActionMessage, shouldProcessRequest } from "./authority.mjs";
import { ensureAuthorityReady } from "./authority.mjs";
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
  if (!["heal", "breath", "stabilize", "grit", "correct", "setHp"].includes(draft.kind))
    throw new Error("Unknown recovery operation.");
  let state = null,
    after = basis.hp;
  if (draft.kind === "setHp") {
    if (!Number.isSafeInteger(draft.hp) || draft.hp < 0 || draft.hp > basis.maxHp) throw new Error("HP must be a whole number within the actor’s maximum.");
    after = draft.hp;
    if (actor.type === "character") {
      const previous = basis.survival ?? survivalState({hp:basis.hp,maxHp:basis.maxHp,gritAvailable:basis.gritAvailable});
      if (after > 0) state = {...previous,hp:after,maxHp:basis.maxHp,gritAvailable:basis.gritAvailable,status:"active",marks:0,due:null,choice:null};
      else if (basis.hp === 0) state = {...previous,hp:0,maxHp:basis.maxHp,gritAvailable:basis.gritAvailable};
      else state = {...previous,hp:0,maxHp:basis.maxHp,gritAvailable:basis.gritAvailable,status:"dying",marks:0,due:null,choice:null};
      if (after > 0) {delete state.lastWordsAt;delete state.lastWordsEnds;}
      validateSurvival(state);
    }
  } else if (draft.kind === "correct") {
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
      state = basis.survival
        ? {
            ...basis.survival,
            hp: basis.hp,
            ...(basis.hp > 0 ? {status: "active", marks: 0, due: null, choice: null} : basis.survival.status === "active" ? {status: "dying", marks: 0, due: null, choice: null} : {}),
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
        "Ordinary recovery cannot revive a defeated creature. Use Correct a mistake to restore an incorrectly recorded state.",
      );
    if (draft.kind === "grit") {
      if (!state || actor.type !== "character") throw new Error("Only a character can spend Grit.");
      if (basis.gritAvailable < 1) throw new Error("No Grit remains.");
      if (["lastWords", "dead"].includes(state.status)) throw new Error("Ordinary Grit cannot reverse Last Words or death.");
      if (Object.values(actor.getFlag(ID, "pendingWounds") ?? {}).some(wound => wound.status !== "resolved")) throw new Error("Resolve the pending wound before spending Grit.");
      state = { ...state, status: "active", hp: basis.maxHp, marks: 0, due: null, choice: null, gritAvailable: basis.gritAvailable - 1 };
      validateSurvival(state);
      after = basis.maxHp;
    } else if (draft.kind === "heal") {
      const plan = healingPlan({
        amount: draft.amount,
        current: basis.hp,
        max: basis.maxHp,
        lifeResistances: [
          ...(basis.passiveDefenses?.resistances ?? [])
            .filter((source) => source.type === "life")
            .map((source) => source.value),
          draft.lifeResistance,
        ],
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
  await ensureAuthorityReady();
  return createActionMessage({
    content: "Recovery adjustment requested.",
    whisper: game.users.filter((u) => u.isGM || u.id === game.user.id).map((u) => u.id),
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
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (!message?.author || !actor?.testUserPermission(message.author, "OWNER"))
    throw new Error("Only this character’s owner can record recovery or corrections.");
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
    throw new Error(
      "HP, survival or defenses changed. Review recovery again.",
    );
  const plan = recoveryPreview(actor, basis, request.draft);
  const changes = {
    "system.health.value": plan.after,
    [`flags.${ID}.damageRevision`]: basis.revision + 1,
    [`flags.${ID}.recoveryEvents.${id}`]: {
      kind: request.draft.kind,
      reason: typeof request.draft.reason === "string" ? request.draft.reason : "",
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
  if (request.draft.kind === "grit") changes["system.grit.spent"] = actor.system.grit.spent + 1;
  if (plan.state) { changes[`flags.${ID}.survival`] = plan.state; changes[`flags.${ID}.deathMarks`] = plan.state.marks; }
  else changes[`flags.${ID}.creatureDefeated`] = plan.after === 0;
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  await message.update({
    content: `Recovery recorded: HP ${basis.hp} → ${plan.after}. ${request.draft.kind === "grit" ? "One Grit spent; death marks cleared." : "Spent Grit remains."} Wound records remain.`,
  });
  return { status: "complete", replay: false };
}
export function registerRecoveryRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "recoveryRequest") && shouldProcessRequest(message))
      resolveRecoveryRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Recovery needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
