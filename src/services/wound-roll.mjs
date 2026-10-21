import { DAMAGE_TYPES, WOUND_TABLES } from "../rules/damage.mjs";
import { woundResult } from "../rules/wounds.mjs";
import { woundCatalog, woundBasis, applyWoundOperation } from "./wounds.mjs";
const ID = "heroes-of-legend";
const queues = new Map();
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
function owner(actor) {
  if(actor?.type!=="character" || actor.pack || !actor.testUserPermission(game.user,"OWNER"))throw new Error("Choose a character you own.");
}
function serialized(actor, task) {
  owner(actor);
  const previous=queues.get(actor.uuid)??Promise.resolve();
  const run=previous.catch(()=>{}).then(()=>globalThis.navigator?.locks?.request
    ? navigator.locks.request(`${ID}:wound:${game.world.id}:${actor.uuid}`,task) : task());
  queues.set(actor.uuid,run);run.finally(()=>{if(queues.get(actor.uuid)===run)queues.delete(actor.uuid);}).catch(()=>{});
  return run;
}
export async function drawWoundTableResult(damageType,key) {
  const pack=game.packs.get(`${ID}.wounds`);
  if(!pack)throw new Error("The wound table compendium is missing. Update the system package.");
  const table=(await pack.getDocuments()).find(table=>table.getFlag(ID,"woundTable")===WOUND_TABLES[damageType]);
  const result=table?.results.find(result=>result.getFlag(ID,"woundKey")===key);
  if(!result)throw new Error("The selected wound table entry is unavailable.");
  // The canonical dice were already evaluated. Select their weighted native
  // table range without rolling a second, unrelated set of dice.
  const selector=await new foundry.dice.Roll(String(result.range[0])).evaluate({allowInteractive:false});
  const draw=await table.draw({roll:selector,recursive:false,displayChat:false});
  if(draw.results.length!==1 || draw.results[0].id!==result.id)throw new Error("The wound table no longer matches its canonical dice key.");
  return {table,result};
}
function state(actor) {
  return {hp:actor.system.health.value,survival:structuredClone(actor.getFlag(ID,"survival")??null),
    wounds:structuredClone(actor.getFlag(ID,"wounds")??{}),pending:structuredClone(actor.getFlag(ID,"pendingWounds")??{}),
    effects:actor.toObject().effects,damageRevision:actor.getFlag(ID,"damageRevision")??0,conditionRevision:actor.getFlag(ID,"conditionRevision")??0};
}
const same=(a,b)=>JSON.stringify({...a,damageRevision:0,conditionRevision:0})===JSON.stringify({...b,damageRevision:0,conditionRevision:0});
function effectSummary(effects) {
  return effects.map(e=>e.kind==="condition"?`${e.key} ${e.rating}${e.persistence==="starred"?"*":""}`:e.kind==="movementPenalty"?`Movement −${e.amount}`:e.kind==="rollModifier"?`${e.amount} ${e.polarity}: ${e.context}`:e.kind==="forcedMovement"?`${e.direction} ${e.distance} squares (place token)`:"Last Words").join(" · ")||"Lasting scar; no mechanical penalty.";
}
export function woundChatCard({actor,eventId,pending,result,applied=true,undone=false}) {
  return `<article class="hol-wound-chat"><header><strong>${escape(actor.name)} · ${escape(result.record.injury)}</strong></header><p><b>${escape(pending.damageType)} ${escape(pending.result.key)}</b> · ${pending.priorWounds} prior · ${pending.result.retained.join(" · ")}</p><p>${escape(effectSummary(result.effects))}</p><p><b>Remedy</b> ${escape(result.record.remedy)}${result.record.recoveryValue?` · RV ${result.record.recoveryValue}`:""}</p>${undone?'<p><em>Undone</em></p>':`<button type="button" data-hol-wound-undo data-actor-uuid="${escape(actor.uuid)}" data-event-id="${escape(eventId)}">Undo wound</button>`}${!applied?'<p>Result saved. Open Wounds to finish applying it.</p>':""}</article>`;
}
async function ensureWoundMessage(actor,operationId,action) {
  let message=game.messages.get(action.messageId)??game.messages.find(message=>message.getFlag(ID,"woundResult")?.operationId===operationId&&message.getFlag(ID,"woundResult")?.actorUuid===actor.uuid);
  if(!message){
    const {pending,result}=action.presentation;
    message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:woundChatCard({actor,eventId:action.eventId,pending,result,applied:!action.needsSource,undone:action.undone}),rolls:pending.nativeRoll?[foundry.dice.Roll.fromData(pending.nativeRoll)]:[],flags:{[ID]:{woundResult:{actorUuid:actor.uuid,eventId:action.eventId,operationId,tableUuid:pending.tableUuid,tableResultId:pending.tableResultId}}}});
  }
  if(action.undone && message.isOwner && !message.getFlag(ID,"woundResult")?.undone)await message.update({content:'<article class="hol-wound-chat"><p><strong>Wound undone.</strong> Previous wound count, effects and survival restored.</p></article>',[`flags.${ID}.woundResult.undone`]:true});
  if(action.messageId!==message.id)await actor.update({[`flags.${ID}.woundActions.${operationId}.messageId`]:message.id});
  return message;
}
/** Owned-character operation: no GM permission or coordinator is required. */
export function rollCharacterWound(actor,damageType,{eventId=null,fearSource="",operationId=foundry.utils.randomID()}={}) {
  return serialized(actor,async()=>{
    owner(actor);
    if(!DAMAGE_TYPES.includes(damageType))throw new Error("Choose a wound damage type.");
    const existing=actor.getFlag(ID,"woundActions")?.[operationId];
    if(existing?.complete)return {eventId:existing.eventId,replay:true,message:await ensureWoundMessage(actor,operationId,existing)};
    if(existing)throw new Error("This wound action was interrupted. Its saved result is available in Wounds; do not roll it again.");
    const before=state(actor), user=game.user;
    const requestMessage={author:user,update:async()=>{}};
    const write=async(document,changes)=>{owner(document);return document.update(changes);};
    await write(actor,{[`flags.${ID}.woundActions.${operationId}`]:{complete:false,before,eventId}});
    const stage=async(kind,payload={})=>{
      const request={actorUuid:actor.uuid,eventId,kind,basis:woundBasis(actor,eventId),...payload};
      return applyWoundOperation(`${operationId}-${kind}`,{message:requestMessage,request,write});
    };
    if(!eventId){const record=await stage("record");eventId=record.eventId;}
    await stage("roll",{damageType});
    const pending=structuredClone(actor.getFlag(ID,"pendingWounds")[eventId]);
    const result=woundResult(await woundCatalog(),damageType,pending.result.key);
    // A fear source is a factual input, not a permission gate. Keep the rolled
    // result if it was not supplied rather than inventing a source or rerolling.
    const needsSource=result.effects.some(effect=>effect.requiresSource)&&!fearSource.trim();
    if(!needsSource)await stage("apply",{fearSource});
    const after=state(actor);
    const action={complete:true,eventId,before,after,needsSource,presentation:{pending,result}};
    await write(actor,{[`flags.${ID}.woundActions.${operationId}`]:action});
    // Mechanics settle before presentation. A retry repairs only the missing
    // card, using these saved dice; it never applies or rolls the wound twice.
    const message=await ensureWoundMessage(actor,operationId,action);
    if(needsSource)ui.notifications.info("Wound rolled and saved. Name its fear source in Wounds to apply that result.");
    return {eventId,message,needsSource,replay:false};
  });
}
export function undoCharacterWound(actor,operationId) {
  return serialized(actor,async()=>{
    owner(actor);
    const action=actor.getFlag(ID,"woundActions")?.[operationId];
    if(!action?.complete)throw new Error("This wound action is unavailable.");
    if(action.undone){await ensureWoundMessage(actor,operationId,action);return {replay:true};}
    if(!same(state(actor),action.after))throw new Error("The character has changed since this wound. Undo later wound or treatment changes first; this action will not overwrite them.");
    const before=action.before;
    const changes={"system.health.value":before.hp,effects:before.effects,
      [`flags.${ID}.survival`]:before.survival,
      [`flags.${ID}.damageRevision`]:(actor.getFlag(ID,"damageRevision")??0)+1,[`flags.${ID}.conditionRevision`]:(actor.getFlag(ID,"conditionRevision")??0)+1,
      [`flags.${ID}.woundActions.${operationId}.undone`]:true};
    for(const [flag,values] of [["wounds",before.wounds],["pendingWounds",before.pending]]){
      for(const key of Object.keys(actor.getFlag(ID,flag)??{}))if(!(key in values))changes[`flags.${ID}.${flag}.-=${key}`]=null;
      for(const [key,value] of Object.entries(values))changes[`flags.${ID}.${flag}.${key}`]=value;
    }
    await actor.update(changes);
    const message=game.messages.get(action.messageId);
    if(message?.isOwner)await message.update({content:'<article class="hol-wound-chat"><p><strong>Wound undone.</strong> Previous wound count, effects and survival restored.</p></article>',[`flags.${ID}.woundResult.undone`]:true});
    return {replay:false};
  });
}
export function registerWoundChatActions(){
  Hooks.on("renderRollTableSheet",(app,html)=>{
    if(app.document?.getFlag(ID,"woundTable"))html.classList.add("hol-wound-table");
  });
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    const button=html.querySelector("[data-hol-wound-undo]");if(!button)return;
    const data=message.getFlag(ID,"woundResult");
    button.hidden=true;
    void fromUuid(data.actorUuid).then(actor=>{button.hidden=!actor?.testUserPermission(game.user,"OWNER");if(actor?.getFlag(ID,"woundActions")?.[data.operationId]?.undone){button.disabled=true;button.textContent="Undone";}}).catch(()=>{});
    button.addEventListener("click",async()=>{button.disabled=true;try{const actor=await fromUuid(data.actorUuid);await undoCharacterWound(actor,data.operationId);button.textContent="Undone";}catch(error){ui.notifications.error(error.message);button.disabled=false;}});
  });
}

/** Complete older pending wound steps directly for the owning player. */
export function requestOwnedWound(actor,eventId,kind,payload={}) {
  return serialized(actor,async()=>{
    owner(actor);
    const request={actorUuid:actor.uuid,eventId,kind,basis:woundBasis(actor,eventId),...payload};
    const message=await ChatMessage.create({content:`Wound ${escape(kind)}.`,speaker:ChatMessage.getSpeaker({actor}),flags:{[ID]:{ownerWoundRequest:request}}});
    try {
      await applyWoundOperation(message.id,{message,request,write:async(document,changes)=>{owner(document);return document.update(changes);}});
      const actionEntry=Object.entries(actor.getFlag(ID,"woundActions")??{}).find(([,action])=>action.eventId===eventId&&!action.undone);
      if(actionEntry && kind==="apply"){
        const [operationId,action]=actionEntry,pending=actor.getFlag(ID,"pendingWounds")[eventId],result=woundResult(await woundCatalog(),pending.damageType,pending.result.key,request.skipped??[]);
        await actor.update({[`flags.${ID}.woundActions.${operationId}.after`]:state(actor),[`flags.${ID}.woundActions.${operationId}.needsSource`]:false,[`flags.${ID}.woundActions.${operationId}.presentation`]:{pending:structuredClone(pending),result}});
        const original=game.messages.get(action.messageId);if(original?.isOwner)await original.update({content:woundChatCard({actor,eventId,pending,result})});
      }
    }
    catch(error){await message.update({content:`Wound needs attention: ${escape(error.message)}`});throw error;}
    return message;
  });
}
