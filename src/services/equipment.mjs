import { updateOwnedDocument } from "./documents.mjs";
import { shouldProcessRequest, enqueueCharacterOperation } from "./authority.mjs";
const ID = "heroes-of-legend";
const queues = new Map();
export function equipmentBasis(actor) {
  return {
    revision: actor.getFlag(ID, "equipmentRevision") ?? 0,
    capacity: actor.getFlag(ID, "handCapacity") ?? 2,
    items: actor.items.filter(item => item.type === "equipment").map(item => ({
      id:item.id, catalogId:item.system.catalogId, source:structuredClone(item.getFlag(ID,"source") ?? null),
      hands:item.system.hands, held:item.system.held, worn:item.system.worn,
      carried:item.system.carried !== false, quantity:item.system.quantity,
    })).sort((a,b)=>a.id.localeCompare(b.id)),
    encounters: [],
  };
}
/** Arrangement is an owner edit, not a chat action or an anatomy adjudication. */
export function requestEquipment(actor, _basis, items, _capacity, _reason = "") {
  const previous=queues.get(actor.uuid) ?? Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if(actor?.documentName!=="Actor" || actor.pack || !actor.testUserPermission(game.user,"OWNER"))
      throw new Error("Only this actor's owner can edit equipment.");
    const current=equipmentBasis(actor), ids=new Set();
    if(!Array.isArray(items) || items.length!==current.items.length || items.some(item=>{
      const bad=!current.items.some(existing=>existing.id===item.id)||ids.has(item.id)||!Number.isSafeInteger(item.hands)||item.hands<0||item.hands>2||typeof item.held!=="boolean"||typeof item.worn!=="boolean"||(item.carried!==undefined&&typeof item.carried!=="boolean");
      ids.add(item.id);return bad;
    }))throw new Error("The equipment list changed. Reopen Inventory and try again.");
    const sources=actor.toObject().items;
    for(const source of sources){
      const state=items.find(item=>item.id===source._id);if(!state)continue;
      source.system.hands=state.hands;source.system.held=state.held;source.system.worn=state.worn;
      source.system.carried=state.carried ?? current.items.find(item=>item.id===source._id).carried;
    }
    await updateOwnedDocument(actor,{items:sources,[`flags.${ID}.equipmentRevision`]:current.revision+1});
    return {status:"complete"};
  });
  queues.set(actor.uuid,task);task.finally(()=>{if(queues.get(actor.uuid)===task)queues.delete(actor.uuid);}).catch(()=>{});
  return task;
}
/** Old saved requests can be deliberately retried; new edits never create them. */
export function resolveEquipmentRequest(id) {
  return enqueueCharacterOperation(async()=>{
    const message=game.messages.get(id),request=message?.getFlag(ID,"equipmentRequest");
    const actor=typeof request?.actorUuid==="string"?await fromUuid(request.actorUuid):null;
    if(!message?.author || !actor?.testUserPermission(message.author,"OWNER"))throw new Error("Only this actor's owner can edit equipment.");
    const result=await requestEquipment(actor,request.basis,request.items,request.capacity,request.reason);
    if(message.isOwner)await message.delete();return result;
  },{requestId:id});
}
export function registerEquipmentRequests(){
  Hooks.on("createChatMessage",message=>{
    if(message.getFlag(ID,"equipmentRequest")&&shouldProcessRequest(message))resolveEquipmentRequest(message.id).catch(error=>ui.notifications.error(error.message));
  });
}
