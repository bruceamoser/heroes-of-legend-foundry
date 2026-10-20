import { HEALING_POTION_IDS } from "../rules/potions.mjs";
import { refillInventory } from "../rules/inventory.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import { inventoryBasis, inventoryActorTargets, validateEmbeddedItems } from "./inventory.mjs";
import { enqueueCharacterOperation, isCreationAuthority, writeAuthorityDocument } from "./authority.mjs";
const ID = "heroes-of-legend";
export const resupplyBasis = inventoryBasis;
function assertSteps(steps) {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 6) throw new Error("Choose 1–6 resupply steps.");
}
function assertAvailable(actor) {
  assertNoPendingTurn(actor);
  if (actor.getFlag(ID, "pendingInventory")) throw new Error("Finish the pending supply check before resupplying.");
  for (const host of [...game.combats, ...inventoryActorTargets()]) {
    const id = host.getFlag(ID, "pendingPotion"), op = host.getFlag(ID, "potionOperations")?.[id];
    if (id && op?.giver?.actorUuid === actor.uuid) throw new Error("Finish the pending healing-potion use before resupplying.");
  }
}
export function planResupply(actor, item, steps, inventory) {
  assertSteps(steps);
  const record = inventory.equipment.find(entry => entry.id === item.system.catalogId);
  if (!record || ![4,6,8,10,12,20].includes(record.inventoryDie)) throw new Error("This item has no printed supply maximum.");
  const result = refillInventory({ die: item.system.inventoryDie, steps, maximumDie: HEALING_POTION_IDS.includes(record.id) ? 4 : record.inventoryDie });
  return result;
}
export async function requestResupply(actor, item, steps = 1, basis = resupplyBasis(actor, item)) {
  if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("Only an owner or the DA can resupply this item.");
  if (!game.settings.get(ID, "creationAuthorityClient")) throw new Error("Enable the automation coordinator before resupplying.");
  assertAvailable(actor);
  if (JSON.stringify(resupplyBasis(actor,item)) !== JSON.stringify(basis)) throw new Error("The item changed. Review its current supply.");
  planResupply(actor,item,steps,(await loadCatalogs()).inventory);
  return ChatMessage.create({
    content: `Resupply ${foundry.utils.escapeHTML(item.name)}.`,
    whisper: game.users.filter(user=>user.isGM || user.id===game.user.id || actor.testUserPermission(user,"OWNER")).map(user=>user.id),
    flags: { [ID]: { resupplyRequest: { actorUuid: actor.uuid, itemId: item.id, steps, basis } } }
  });
}
export function resolveResupplyRequest(id) {
  const actorUuid = game.messages.get(id)?.getFlag(ID,"resupplyRequest")?.actorUuid;
  return enqueueCharacterOperation(()=>applyResupplyRequest(id),{requestId:id,targetUuid:actorUuid});
}
export async function applyResupplyRequest(id) {
  const message = game.messages.get(id), request = message?.getFlag(ID,"resupplyRequest");
  const actor = typeof request?.actorUuid === "string" ? await fromUuid(request.actorUuid) : null;
  if (actor?.documentName !== "Actor" || actor.pack || !message.author || !actor.testUserPermission(message.author,"OWNER")) throw new Error("Only an owner or the DA can resupply this Actor.");
  const signature = JSON.stringify(request), prior = actor.getFlag(ID,"operationReceipts")?.[id];
  if (prior?.applied) {
    if (prior.kind !== "resupply" || prior.authorId !== message.author.id || prior.request !== signature) throw new Error("The completed resupply request changed.");
    return {status:"complete",replay:true,result:prior.result};
  }
  assertAvailable(actor);
  const item = actor.items.get(request.itemId);
  if (!item || JSON.stringify(resupplyBasis(actor,item)) !== JSON.stringify(request.basis)) throw new Error("The item changed. Review its current supply.");
  const result = planResupply(actor,item,request.steps,(await loadCatalogs()).inventory);
  const items = actor.toObject().items, matches = items.filter(entry=>entry._id===item.id);
  if (matches.length !== 1) throw new Error("The supply item identity is ambiguous.");
  matches[0].system.inventoryDie = result.after;
  validateEmbeddedItems(actor,items);
  const changes = {
    items,
    [`flags.${ID}.inventoryRevision`]: request.basis.inventoryRevision+1,
    [`flags.${ID}.operationReceipts.${id}`]: {applied:true,kind:"resupply",authorId:message.author.id,request:signature,result},
  };
  actor.validate({changes:foundry.utils.expandObject(changes),strict:true,fallback:false});
  await writeAuthorityDocument(actor,changes);
  if (actor.items.get(item.id)?.system.inventoryDie !== result.after || actor.items.get(item.id)?.system.quantity !== request.basis.item.quantity) throw new Error("Resupply needs reconciliation; do not repeat the change.");
  await message.update({content:`${foundry.utils.escapeHTML(item.name)} resupplied: ${result.after ? `d${result.after}` : "Empty"}.`});
  return {status:"complete",replay:false,result};
}
export function registerResupplyRequests() {
  Hooks.on("createChatMessage",message=>{
    if(message.getFlag(ID,"resupplyRequest") && isCreationAuthority()) resolveResupplyRequest(message.id).catch(async error=>{
      ui.notifications.error(error.message);
      await message.update({content:`Resupply needs attention: ${foundry.utils.escapeHTML(error.message)}`});
    });
  });
}
