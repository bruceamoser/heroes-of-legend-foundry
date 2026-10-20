import { classifyRoll } from "../rules/roll.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { enqueueCharacterOperation, isCreationAuthority, writeAuthorityDocument } from "./authority.mjs";
import { validateCreationChanges } from "./creation.mjs";
import { equipmentItemSource } from "../rules/item-construction.mjs";
import { startWorkshopCraft, workshopCraft } from "../rules/workshop-crafting.mjs";
import { rollBasis, prepareRoll } from "./roll-preparation.mjs";
import { evaluatePreparedRoll } from "./roll.mjs";
import { effectiveRollDraft, situationalRollDraft } from "../rules/situational-adjustment.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
const ID = "heroes-of-legend";

export function nativeCraftingRecipes(actor, catalogs) {
  const known = actor.getFlag(ID, "development")?.recipes ?? [];
  const learned = new Set(actor.items.filter(item => {
    if (item.type !== "ability") return false;
    const record = catalogs.choices.find(record => record.id === item.getFlag(ID, "catalogId"));
    const source = item.getFlag(ID, "source");
    return record?.source && source?.path === record.source.path && source?.sha256 === record.source.sha256;
  }).map(item => item.getFlag(ID, "catalogId")));
  return catalogs.inventory.recipes.filter(r => known.includes(r.id)).map(recipe => ({
    ...recipe,
    abilities: recipe.permissions.filter(id => learned.has(id)).flatMap(id => {
      const record = catalogs.choices.find(r => r.id === id);
      const attribute = record?.reference?.rules.details.find(d => d.label === "Attribute")?.value?.toLowerCase();
      return actor.system.attributes[attribute] ? [{ id, name: record.name, attribute }] : [];
    }),
    project: actor.getFlag(ID, "craftingState")?.[recipe.id] ?? null,
  }));
}
export function craftingBasis(actor) {
  return JSON.parse(JSON.stringify({
    state: actor.getFlag(ID, "craftingState") ?? {},
    development: actor.getFlag(ID, "development"),
    attributes: actor.system.attributes,
    items: actor.toObject().items,
    effects: actor.toObject().effects,
    conditionRevision: actor.getFlag(ID, "conditionRevision") ?? 0,
    damageRevision: actor.getFlag(ID, "damageRevision") ?? 0,
    inventoryRevision: actor.getFlag(ID, "inventoryRevision") ?? 0,
    equipmentRevision: actor.getFlag(ID, "equipmentRevision") ?? 0,
  }));
}
export async function requestCrafting(actor, payload) {
  if (actor.pack || actor.type !== "character" || !actor.testUserPermission(game.user, "OWNER")) throw new Error("Only this character’s owner can craft.");
  if (!game.settings.get(ID, "creationAuthorityClient")) throw new Error("The DA must enable automation before crafting.");
  const request = { ...payload, actorUuid: actor.uuid, basis: craftingBasis(actor) };
  return ChatMessage.create({ content: "Crafting requested.", whisper: game.users.filter(u => u.isGM || u.id === game.user.id || actor.testUserPermission(u, "OWNER")).map(u => u.id), flags: { [ID]: { craftingRequest: request } } });
}
export function resolveCraftingRequest(messageId) {
  const request = game.messages.get(messageId)?.getFlag(ID, "craftingRequest");
  return enqueueCharacterOperation(() => applyCrafting(messageId), { requestId: messageId, targetUuid: request?.actorUuid });
}
async function applyCrafting(messageId) {
  if (!isCreationAuthority()) return;
  const message = game.messages.get(messageId);
  let request = message?.getFlag(ID, "craftingRequest");
  const actor = request && await fromUuid(request.actorUuid);
  if (actor?.pack || actor?.type !== "character" || !message.author || !actor.testUserPermission(message.author, "OWNER")) throw new Error("Unauthorized crafting request.");
  const signature = JSON.stringify(request);
  const receipt = actor.getFlag(ID, "operationReceipts")?.[messageId];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id) throw new Error("The completed crafting request changed.");
    return { replay: true };
  }
  assertNoPendingTurn(actor);
  let pending = actor.getFlag(ID, "pendingCrafting");
  const recovery = request.kind === "recover" ? request : null;
  if (recovery && !message.author.isGM) throw new Error("Only the DA can reconcile the original retained dice.");
  const operationId = ["resume", "recover"].includes(request.kind) ? pending?.requestId : messageId;
  if (request.kind === "recover") {
    if (!pending || pending.status !== "rolling") throw new Error("Only an unresolved crafting roll can be recovered.");
    request = structuredClone(pending.request);
  } else if (request.kind === "resume") {
    if (!pending || pending.status !== "rolled") throw new Error("Only a saved crafting result can be resumed. An unresolved roll must be reconciled without rerolling.");
    request = structuredClone(pending.request);
  }
  if (pending && pending.requestId !== operationId) throw new Error("Finish or reconcile the pending crafting attempt first.");
  const catalogs = await loadCatalogs();
  const recipe = nativeCraftingRecipes(actor, catalogs).find(r => r.id === request.recipeId);
  if (!recipe || !recipe.abilities.length) throw new Error("Choose a known recipe with a learned crafting ability.");
  if (JSON.stringify(craftingBasis(actor)) !== JSON.stringify(request.basis)) throw new Error("Character or project changed. Review the updated project and try again.");
  let play = { crafting: actor.getFlag(ID, "craftingState") ?? {}, inventory: { added: [], removed: [], overrides: {} } };
  let result, roll, summary = `${recipe.name} · Project started.`;
  if (request.kind === "start") {
    if (play.crafting[recipe.id]?.active) throw new Error("This project is already in progress.");
    play = startWorkshopCraft(play, recipe);
  } else if (request.kind === "attempt") {
    if (!play.crafting[recipe.id]?.active) throw new Error("Start this project before making an attempt.");
    const ability = recipe.abilities.find(a => a.id === request.abilityId);
    if (!ability) throw new Error("Choose a learned crafting ability for this recipe.");
    if (!Number.isInteger(request.adjustment) || Math.abs(request.adjustment) > 3) throw new Error("Choose net Boons/Banes from −3 to +3.");
    const basis = rollBasis(actor, ability.attribute);
    const base = prepareRoll(basis, situationalRollDraft());
    const draft = { ...situationalRollDraft(), ...effectiveRollDraft(base, request.adjustment, true) };
    if (recovery) {
      const plan = pending.plan;
      if (!plan) throw new Error("The saved roll plan is unavailable; reconcile this attempt with the DA.");
      const classified = classifyRoll(recovery.faces, plan.attribute);
      result = { ...plan, ...classified, retained: recovery.faces, dice: recovery.faces.map((face, index) => ({ face, index, kept: true })), attributeKey: ability.attribute, mode: "attribute", actorUuid: actor.uuid, recovery: { authorId: message.author.id, reason: typeof recovery.reason === "string" ? recovery.reason : "" } };
      pending = { ...pending, status: "rolled", result, roll: null };
      await writeAuthorityDocument(actor, { [`flags.${ID}.pendingCrafting`]: pending });
    }
    if (pending?.status === "rolling") throw new Error("This attempt may already have rolled. Reconcile its retained dice; it will not reroll.");
    if (pending?.status === "rolled") {
      result = structuredClone(pending.result);
      roll = pending.roll ? foundry.dice.Roll.fromData(structuredClone(pending.roll)) : null;
    } else {
      pending = { requestId: operationId, request: structuredClone(request), authorId: message.author.id, plan: prepareRoll(basis, draft), status: "rolling" };
      await writeAuthorityDocument(actor, { [`flags.${ID}.pendingCrafting`]: pending });
      ({ roll, snapshot: result } = await evaluatePreparedRoll(actor, basis, draft, { rollerId: message.author.id }));
      pending = { ...pending, status: "rolled", result, roll: roll.toJSON() };
      await writeAuthorityDocument(actor, { [`flags.${ID}.pendingCrafting`]: pending });
    }
    const inventory = actor.items.filter(i => i.type === "equipment").map(i => ({ instanceId: i.id, catalogId: i.system.catalogId, quantity: i.system.quantity, inventoryDie: i.system.inventoryDie }));
    const attempt = workshopCraft({ play, recipe, tier: result.tier, items: inventory, instanceId: foundry.utils.randomID(), supplyId: request.supplyId || "" });
    play = attempt.play;
    summary = `${recipe.name} · ${result.tier} (${result.total}) · ${attempt.message}`;
  } else throw new Error("Unknown crafting operation.");
  const items = actor.toObject().items;
  for (const added of play.inventory.added) {
    const record = catalogs.inventory.equipment.find(r => r.id === added.id);
    items.push({ _id: added.instanceId, ...equipmentItemSource(record, { sourceCommit: catalogs.commit, grantKind: "crafting", quantity: 1, inventoryDie: play.inventory.overrides[added.instanceId]?.inventoryDie }) });
  }
  for (const [id, override] of Object.entries(play.inventory.overrides)) {
    const item = items.find(i => i._id === id);
    if (!item) throw new Error("The project supply is unavailable.");
    item.system.inventoryDie = override.inventoryDie;
  }
  if (JSON.stringify(craftingBasis(actor)) !== JSON.stringify(request.basis)) throw new Error("Character changed during the attempt. No project or inventory changes were applied.");
  const inventoryChanged = play.inventory.added.length > 0 || Object.keys(play.inventory.overrides).length > 0;
  const changes = { items, [`flags.${ID}.pendingCrafting`]: null, ...(inventoryChanged ? { [`flags.${ID}.inventoryRevision`]: (actor.getFlag(ID, "inventoryRevision") ?? 0) + 1, [`flags.${ID}.equipmentRevision`]: (actor.getFlag(ID, "equipmentRevision") ?? 0) + 1 } : {}), [`flags.${ID}.craftingState`]: play.crafting, [`flags.${ID}.operationReceipts.${messageId}`]: { applied: true, kind: "crafting", authorId: message.author.id, request: signature, summary, ...(result ? { result } : {}) } };
  if (operationId !== messageId) changes[`flags.${ID}.operationReceipts.${operationId}`] = { applied: true, kind: "crafting", authorId: pending.authorId, request: JSON.stringify(pending.request), summary, ...(result ? { result } : {}) };
  validateCreationChanges(actor, changes);
  await writeAuthorityDocument(actor, changes);
  await message.update({ content: foundry.utils.escapeHTML(summary), ...(roll ? { rolls: [roll] } : {}), ...(result ? { [`flags.${ID}.roll`]: result } : {}) });
  return { applied: true };
}
export function registerCraftingRequests() {
  Hooks.on("createChatMessage", message => {
    if (message.getFlag(ID, "craftingRequest") && isCreationAuthority()) resolveCraftingRequest(message.id).catch(error => ui.notifications.error(error.message));
  });
}
