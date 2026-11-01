import {summonState} from "../rules/summon-profile.mjs";
import {summonTurnKey, recordSummonCommand, expireUncommandedSummon} from "../rules/summon-lifecycle.mjs";
import {createActionMessage, shouldProcessRequest, enqueueCharacterOperation, writeAuthorityDocument} from "./authority.mjs";
const ID = "heroes-of-legend";
export const summonDocument = actor => actor?.isToken && actor.token && !actor.token.actorLink ? actor.token : actor;
export function requestSummonCommand(actor, register = false) {
  const combat = game.combat, state = combat?.getFlag(ID, "encounter");
  const controller = combat?.combatants.get(state?.current)?.actor;
  const turnKey = summonTurnKey(combat?.uuid, state);
  if (!controller) throw new Error("Choose the summoner's turn first.");
  return createActionMessage({content: register ? "Register summon and initial free Main command." : "Command summon (resolve printed action cost manually).", flags:{[ID]:{summonCommand:{actorUuid:actor.uuid, controllerUuid:controller.uuid, combatUuid:combat.uuid, turnKey, register}}}}, {shared:true});
}
export function resolveSummonCommand(message) {
  return enqueueCharacterOperation(async () => {
    const request = message.getFlag(ID,"summonCommand");
    const actor = await fromUuid(request.actorUuid), controller = await fromUuid(request.controllerUuid), combat = await fromUuid(request.combatUuid);
    if (!actor || !controller || !combat || !summonState(actor)?.record) throw new Error("The summon or controller is unavailable.");
    for (const target of [actor, controller]) if (!message.author?.isGM && !target.testUserPermission(message.author,"OWNER")) throw new Error("Own both the summon and its controller, or ask the DA.");
    const state = combat.getFlag(ID,"encounter"), profile = summonState(actor), document = summonDocument(actor);
    if (request.register !== true && request.register !== false) throw new Error("Invalid summon registration mode.");
    const prior = profile.lifecycle?.receipts?.[message.id];
    if (!prior && (summonTurnKey(combat.uuid,state) !== request.turnKey || combat.combatants.get(state.current)?.actor?.uuid !== controller.uuid)) throw new Error("The controller's turn changed. Command again on its own turn.");
    const lifecycle = recordSummonCommand(profile.lifecycle,{...request, operationId:message.id});
    if (lifecycle !== profile.lifecycle) await writeAuthorityDocument(document,{[`flags.${ID}.summon`]:{...profile,lifecycle}});
    return {status:"complete",replay:Boolean(prior)};
  },{requestId:message.id});
}
/** Called only inside the serialized authoritative Finish request. */
export async function settleSummonExpiry(combat, controller, state) {
  const turnKey = summonTurnKey(combat.uuid,state), seen = new Set();
  // Include off-scene tokens; a controller's summons need not join the roster.
  const actors = [...game.actors.contents, ...game.scenes.contents.flatMap(scene => scene.tokens.contents.map(token => token.actor).filter(Boolean))];
  for (const actor of actors) {
    const profile = summonState(actor), document = summonDocument(actor);
    if (!profile?.lifecycle || seen.has(document.uuid)) continue;
    seen.add(document.uuid);
    const lifecycle = expireUncommandedSummon(profile.lifecycle,controller.uuid,turnKey);
    if (lifecycle !== profile.lifecycle) await writeAuthorityDocument(document,{[`flags.${ID}.summon`]:{...profile,lifecycle}});
    // A retry completes hiding if interrupted after writing the expiry receipt.
    if (lifecycle.expired && lifecycle.controllerUuid === controller.uuid) {
      const tokens = actor.isToken ? [actor.token] : game.scenes.contents.flatMap(scene => scene.tokens.contents.filter(token => token.actorLink && token.actorId === actor.id));
      for (const token of tokens) if (!token.hidden) await writeAuthorityDocument(token,{hidden:true});
    }
  }
}
export function registerSummonLifecycleRequests() {
  Hooks.on("createChatMessage",message=>{
    if (message.getFlag(ID,"summonCommand") && shouldProcessRequest(message)) resolveSummonCommand(message).catch(error=>ui.notifications.error(error.message));
  });
}
