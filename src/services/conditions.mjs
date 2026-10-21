import { createActionMessage, shouldProcessRequest } from "./authority.mjs";
import { ensureAuthorityReady } from "./authority.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import {
  CONDITION_KINDS,
  validateContributions,
  reduceTemporary,
} from "../rules/conditions.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function actorContributions(actor) {
  const records = actor.effects
    .filter(
      (e) =>
        e.active && !e.getFlag(ID, "retired") && e.getFlag(ID, "condition"),
    )
    .map((e) => ({ ...structuredClone(e.getFlag(ID, "condition")), id: e.id }));
  validateContributions(records);
  return records;
}
export function conditionIcon(key) {
  return `icons/svg/${{ burning: "fire", freezing: "frozen", bleeding: "blood", poisoned: "poison", frightened: "terror", slowed: "downgrade", dazed: "daze", grappled: "net", blinded: "blind", deafened: "deaf", asleep: "sleep", paralyzed: "paralysis", unconscious: "unconscious", petrified: "statue", prone: "falling", hidden: "mystery-man", invisible: "invisible" }[key] ?? "aura"}.svg`;
}
export function registerHOLStatuses() {
  const keep = new Set([
    CONFIG.specialStatusEffects.DEFEATED,
    CONFIG.specialStatusEffects.BURROW,
    CONFIG.specialStatusEffects.HOVER,
    CONFIG.specialStatusEffects.FLY,
  ]);
  const preserved = CONFIG.statusEffects.filter((s) => keep.has(s.id));
  CONFIG.statusEffects.splice(
    0,
    CONFIG.statusEffects.length,
    ...preserved,
    ...Object.keys(CONDITION_KINDS).map((key) => ({
      id: `hol.${key}`,
      name: key[0].toUpperCase() + key.slice(1),
      img: conditionIcon(key),
    })),
  );
  CONFIG.specialStatusEffects.BLIND = "hol.blinded";
  CONFIG.specialStatusEffects.INVISIBLE = "hol.invisible";
}
export async function requestCondition(actor, kind, payload = {}) {
  await ensureAuthorityReady();
  return createActionMessage({
    content: "Condition adjustment requested.",
    flags: {
      [ID]: {
        conditionRequest: {
          ...payload,
          actorUuid: actor.uuid,
          kind,
          revision: actor.getFlag(ID, "conditionRevision") ?? 0,
        },
      },
    },
  });
}
export function resolveConditionRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id, {message = game.messages.get(id), request = message?.getFlag(ID, "conditionRequest"), write = writeAuthorityDocument} = {}) {
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.documentName !== "Actor" ||
    actor.pack ||
    !["add", "remove", "reduce", "adjust"].includes(request.kind)
  )
    throw new Error("Invalid condition target or adjustment.");
  if (!message?.author || !actor.testUserPermission(message.author, "OWNER")) throw new Error("Only an owner or the Dungeon Architect can adjust conditions.");
  const receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (
      receipt.request !== JSON.stringify(request) ||
      receipt.authorId !== message.author.id
    )
      throw new Error("The completed adjustment was changed.");
    if (receipt.createdId && !actor.effects.has(receipt.createdId))
      throw new Error(
        "Condition effect needs reconciliation; do not apply it again.",
      );
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  if (
    !Number.isSafeInteger(request.revision) ||
    request.revision !== (actor.getFlag(ID, "conditionRevision") ?? 0)
  )
    throw new Error(
      "Conditions changed. Review their current sources and retry.",
    );
  const effects = actor.toObject().effects,
    active = actorContributions(actor);
  let createdId;
  const previousCondition = active.find(c => c.id === request.effectId);
  if (request.kind === "add") {
    createdId = foundry.utils.randomID();
    const condition = {
      id: createdId,
      key: request.key,
      rating: request.rating,
      persistence: request.persistence,
      source: request.source?.trim() || actor.name,
      order: Date.now(),
    };
    validateContributions([condition]);
    effects.push({
      _id: createdId,
      name: `${request.key[0].toUpperCase() + request.key.slice(1)} ${request.rating}${request.persistence === "starred" ? "*" : ""}`,
      img: conditionIcon(request.key),
      statuses: [`hol.${request.key}`],
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      flags: { [ID]: { condition, operationId: id } },
    });
  } else {
    const effect = effects.find((e) => e._id === request.effectId),
      contribution = active.find((c) => c.id === request.effectId);
    if (!effect || !contribution)
      throw new Error("That active condition source is no longer available.");
    if (request.kind === "remove") {
      effect.disabled = true;
      effect.statuses = [];
      effect.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;
      effect.flags[ID].retired = { requestId: id, reason: "DA removed source" };
    } else if (request.kind === "adjust") {
      if (![-1,1].includes(request.delta)) throw new Error("Choose a one-step condition adjustment.");
      const rating = Math.min(10000,contribution.rating + request.delta);
      if (rating <= 0) {
        effect.disabled = true;
        effect.statuses = [];
        effect.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;
        effect.flags[ID].retired = {requestId:id,reason:"Manual condition rating reached zero"};
      } else {
        const adjusted = {...contribution,rating};
        validateContributions([adjusted]);
        effect.flags[ID].condition = adjusted;
        effect.name = `${adjusted.key[0].toUpperCase() + adjusted.key.slice(1)} ${rating}${adjusted.persistence === "starred" ? "*" : ""}`;
      }
    } else {
      if (contribution.persistence !== "temporary")
        throw new Error(
          "A generic temporary reduction cannot remove a persistent source.",
        );
      if (!Number.isSafeInteger(request.amount) || request.amount < 1)
        throw new Error("Choose a positive temporary reduction.");
      const result = reduceTemporary(
        [contribution],
        contribution.key,
        request.amount,
      )[0];
      if (!result) {
        effect.disabled = true;
        effect.statuses = [];
        effect.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;
        effect.flags[ID].retired = {
          requestId: id,
          reason: "Temporary rating reached zero",
        };
      } else {
        effect.flags[ID].condition = result;
        effect.name = `${result.key[0].toUpperCase() + result.key.slice(1)} ${result.rating}`;
      }
    }
  }
  for (const data of effects) {
    const effect = new foundry.documents.ActiveEffect(data, {
      parent: actor,
      strict: true,
    });
    effect.validate({ strict: true, fallback: false });
  }
  const changes = {
    effects,
    [`flags.${ID}.conditionRevision`]: request.revision + 1,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: JSON.stringify(request),
      ...(createdId ? { createdId } : {}),
    },
  };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await write(actor, changes);
  if (createdId && !actor.effects.has(createdId))
    throw new Error(
      "Condition effect needs reconciliation; do not apply it again.",
    );
  const condition = request.kind === "add"
    ? {key: request.key, rating: request.rating, persistence: request.persistence}
    : effects.find(effect => effect._id === request.effectId)?.flags?.[ID]?.condition ?? previousCondition;
  const removed = request.kind === "remove" || effects.find(effect => effect._id === request.effectId)?.disabled;
  await message.update({content:conditionContent(actor,condition,removed ? "removed" : request.kind === "add" ? "applied" : "updated")});
  return { status: "complete", replay: false };
}
export function registerConditionRequests() {
  Hooks.once("ready", () => {
    void hideRetiredConditionIcons().catch(error => console.warn("heroes-of-legend | Condition icons",error.message));
  });
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "conditionRequest") && shouldProcessRequest(message))
      resolveConditionRequest(message.id).catch(async (e) => {
        ui.notifications.error(e.message);
        await message.update({
          content: `Condition adjustment needs attention: ${foundry.utils.escapeHTML(e.message)}`,
        });
      });
  });
}


function conditionContent(actor,condition,verb) {
  const escape=foundry.utils.escapeHTML,name=condition.key[0].toUpperCase()+condition.key.slice(1);
  const rating=CONDITION_KINDS[condition.key]==="binary"?"":` ${condition.rating}${condition.persistence==="starred"?"*":""}`;
  return `<section class="hol-chat-card hol-condition-chat"><p class="hol-chat-effect">${escape(actor.name)} · <strong>${escape(name)}${rating}</strong> ${verb}</p></section>`;
}
async function postOwnedCondition(actor,condition,operationId,content=conditionContent(actor,condition,"applied")) {
  const existing=game.messages.find(message=>message.getFlag(ID,"conditionResult")?.operationId===operationId&&message.getFlag(ID,"conditionResult")?.actorUuid===actor.uuid);
  if(existing)return existing;
  try{return await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,flags:{[ID]:{conditionResult:{actorUuid:actor.uuid,key:condition.key,rating:condition.rating,operationId}}}});}
  catch(error){ui.notifications.warn(`Condition applied to ${actor.name}; chat could not be posted: ${error.message}`);return null;}
}
const conditionQueues = new Map();
/** Explicit effect application used by Apply Damage; no GM or source input is required. */
export function applyOwnedCondition(actor, key, rating = 1, {operationId = foundry.utils.randomID(), persistence = null, source = "", postChat = true} = {}) {
  const previous = conditionQueues.get(actor.uuid) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    if (!actor.testUserPermission(game.user,"OWNER") || actor.pack) throw new Error("Choose an actor you own.");
    if (!Object.hasOwn(CONDITION_KINDS,key)) throw new Error("Unknown condition.");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(operationId)) throw new Error("Invalid condition action identity.");
    const kind = CONDITION_KINDS[key];
    if (kind === "binary") rating = 1;
    persistence ??= kind === "binary" ? "binary" : kind === "maintained" ? "maintained" : "temporary";
    const prior = actor.getFlag(ID,"operationReceipts")?.[operationId];
    if (prior?.applied) {
      const saved = JSON.parse(prior.request);
      if (saved.key !== key || saved.rating !== rating || saved.persistence !== persistence) throw new Error("This condition action has different values.");
      if(postChat)await postOwnedCondition(actor,saved,operationId);
      return {status:"complete",replay:true};
    }
    const request = {actorUuid:actor.uuid,kind:"add",key,rating,persistence,source:source || actor.name,revision:actor.getFlag(ID,"conditionRevision") ?? 0};
    let presentation;
    const result = await apply(operationId,{request,message:{author:game.user,update:async changes=>{presentation=changes.content;}},write:async(document,changes)=>{
      const {updateOwnedDocument} = await import("./documents.mjs");
      return updateOwnedDocument(document,changes);
    }});
    if (postChat) await postOwnedCondition(actor,request,operationId,presentation);
    return result;
  });
  conditionQueues.set(actor.uuid,run);
  run.finally(()=>{if(conditionQueues.get(actor.uuid)===run)conditionQueues.delete(actor.uuid);}).catch(()=>{});
  return run;
}

/** Repair visual remnants of conditions removed by earlier versions. */
export async function hideRetiredConditionIcons() {
  const actors = new Map(game.actors.contents.map(actor=>[actor.uuid,actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) if(token.actor) actors.set(token.actor.uuid,token.actor);
  for (const actor of actors.values()) {
    if(!actor.testUserPermission(game.user,"OWNER"))continue;
    const updates=actor.effects.filter(effect=>effect.getFlag(ID,"condition") && (effect.disabled || effect.getFlag(ID,"retired")) && effect.showIcon!==CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER)
      .map(effect=>({_id:effect.id,showIcon:CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER}));
    if(updates.length)await actor.updateEmbeddedDocuments("ActiveEffect",updates);
  }
}
