import { inventoryCheck } from "../src/rules/inventory.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { startWorkshopCraft, workshopCraft } from "../src/rules/workshop-crafting.mjs";
import { classifyRoll } from "../src/rules/roll.mjs";
import { equipmentItemSource } from "../src/rules/item-construction.mjs";
const source = await readFile(new URL("../src/services/crafting.mjs", import.meta.url), "utf8");
const inventory = JSON.parse(await readFile(new URL("../static/data/inventory.json", import.meta.url)));
const choices = JSON.parse(await readFile(new URL("../static/data/choices.json", import.meta.url)));
async function fixture({ owner = true, authority = true, material = false } = {}) {
  const recipe = inventory.recipes.find(r => r.id === "recipe-twisted-cord");
  const flags = { development: { recipes: [recipe.id] }, operationReceipts: {} };
  let items = [{ _id: "ability", type: "ability", flags: { "heroes-of-legend": { catalogId: recipe.permissions[0], source: choices.records.find(record => record.id === recipe.permissions[0]).source } } }];
  if(material) items.push({_id:"materials",type:"equipment",system:{catalogId:"item-material-bundle",quantity:1,inventoryDie:6,carried:true}});
  const actor = { uuid: "Actor.hero", type: "character", system: { attributes: { knowledge: { effective: 1 },reason:{effective:2} } },
    get items() { return items.map(i => ({ ...i, id: i._id, getFlag: (_id, key) => i.flags?.["heroes-of-legend"]?.[key] })); },
    getFlag: (_id, key) => flags[key], testUserPermission: () => owner, toObject: () => ({ items: structuredClone(items) }) };
  const messages = new Map(); let writes = 0, rolls = 0, supplyRolls=0,lastAttribute;
  const faults = {};
  const context = createContext({ structuredClone, fromUuid: async () => actor, ui: {}, Hooks: {},
    foundry: { dice: { Roll: class {
      constructor(formula){this.formula=formula;this.total=1;}
      async evaluate(){supplyRolls++;if(faults.supplyRoll)throw Error("supply result lost");return this;}
      toJSON(){return{formula:this.formula,total:this.total};}
      static fromData(data){return{toJSON:()=>data};}
    } }, utils: { randomID: () => "newproduct123456", escapeHTML: s => s } },
    game: { user: { id: "owner" }, settings: { get: () => "authority" }, messages, users: [{ id: "owner" }] },
    ChatMessage: { create: async data => { const message = { id: `request${messages.size}`, author: { id: "owner" }, ...data, getFlag: (_id, key) => data.flags["heroes-of-legend"][key], update: async changes => Object.assign(message, changes) }; messages.set(message.id, message); return message; } } });
  const mocks = {
    "../rules/roll.mjs": { classifyRoll },
    "../rules/inventory.mjs": {inventoryCheck},
    "./catalog.mjs": { loadCatalogs: async () => ({ choices: choices.records, inventory, commit: choices.sourceCommit }) },
    "./authority.mjs": {ensureAuthorityReady:async()=>{}, createActionMessage: data => context.ChatMessage.create(data), shouldProcessRequest: () => true, isCreationAuthority: () => authority, enqueueCharacterOperation: async fn => fn(), writeAuthorityDocument: async (_actor, changes) => { writes++; if (faults.write === writes) throw new Error("write failed"); if (changes.items) items = structuredClone(changes.items); for (const [key,value] of Object.entries(changes)) { if (key.startsWith("flags.heroes-of-legend.operationReceipts.")) flags.operationReceipts[key.split(".").at(-1)] = structuredClone(value); else if (key.startsWith("flags.heroes-of-legend.")) flags[key.slice("flags.heroes-of-legend.".length)] = structuredClone(value); } } },
    "./creation.mjs": { validateCreationChanges: () => {} },
    "../rules/item-construction.mjs": { equipmentItemSource },
    "../rules/workshop-crafting.mjs": { startWorkshopCraft, workshopCraft },
    "./roll-preparation.mjs": { rollBasis: (_actor,attribute) => {lastAttribute=attribute;return{};}, prepareRoll: () => ({ net: 0, attribute: 1 }) },
    "./roll.mjs": { evaluatePreparedRoll: async () => { rolls++; if (faults.roll) throw new Error("roll result lost"); return { roll: { toJSON: () => "{}" }, snapshot: { tier: "standard", total: 12 } }; } },
    "../rules/situational-adjustment.mjs": { effectiveRollDraft: () => ({}), situationalRollDraft: () => ({}) },
    "./turn-lock.mjs": { assertNoPendingTurn: () => {} },
  };
  const module = new SourceTextModule(source, { context });
  await module.link(name => { const values = mocks[name]; return new SyntheticModule(Object.keys(values), function() { for (const [key,value] of Object.entries(values)) this.setExport(key,value); }, { context }); });
  await module.evaluate();
  return { actor, flags, service: module.namespace, recipe, get writes() { return writes; }, get rolls() { return rolls; }, get supplyRolls(){return supplyRolls;},get lastAttribute(){return lastAttribute;}, messages, faults };
}
test("native crafting atomically starts, progresses, grants one product and deduplicates replay", async () => {
  const f = await fixture();
  const send = async payload => { const m = await f.service.requestCrafting(f.actor, { recipeId: f.recipe.id, ...payload }); await f.service.resolveCraftingRequest(m.id); return m; };
  await send({ kind: "start" });
  await send({ kind: "attempt", abilityId: f.recipe.permissions[0], adjustment: 0 });
  assert.equal(f.flags.craftingState[f.recipe.id].progress, 2);
  const final = await send({ kind: "attempt", abilityId: f.recipe.permissions[0], adjustment: 0 });
  assert.equal(f.flags.craftingState[f.recipe.id].completed, 1);
  assert.equal(f.actor.items.filter(i => i.type === "equipment").length, 1);
  assert.equal(f.rolls, 2); assert.equal(f.writes, 7);
  await f.service.resolveCraftingRequest(final.id);
  assert.equal(f.writes, 7); assert.equal(f.rolls, 2);
});
test("crafting permission requires the reviewed owned card source, not an unverified catalog flag", async () => {
  const f = await fixture();
  const forged = { ...f.actor, items: [{type:"ability",getFlag:(_id,key)=>key==="catalogId"?f.recipe.permissions[0]:{path:"changed",sha256:"changed"}}] };
  const catalogs = {choices:choices.records,inventory};
  assert.equal(f.service.nativeCraftingRecipes(f.actor,catalogs)[0].abilities.length,1);
  assert.equal(f.service.nativeCraftingRecipes(forged,catalogs)[0].abilities.length,0);
});
test("native crafting refuses unauthorized, stale and missing-ability requests before rolling", async () => {
  const denied = await fixture({ owner: false });
  await assert.rejects(denied.service.requestCrafting(denied.actor, {}), /owner/);
  const f = await fixture();
  const request = await f.service.requestCrafting(f.actor, { kind: "start", recipeId: f.recipe.id });
  f.flags.craftingState = { changed: true };
  await assert.rejects(f.service.resolveCraftingRequest(request.id), /changed/);
  assert.equal(f.rolls, 0); assert.equal(f.writes, 0);
  f.flags.development.recipes = [];
  await assert.rejects(f.service.resolveCraftingRequest(request.id), /known recipe/);
});

test("crafting failed reservation never rolls, ambiguous roll never rerolls, saved result resumes once", async () => {
  const prep = async () => {
    const f = await fixture();
    const start = await f.service.requestCrafting(f.actor, { kind: "start", recipeId: f.recipe.id });
    await f.service.resolveCraftingRequest(start.id);
    const attempt = await f.service.requestCrafting(f.actor, { kind: "attempt", recipeId: f.recipe.id, abilityId: f.recipe.permissions[0], adjustment: 0 });
    return { f, attempt };
  };
  {
    const { f, attempt } = await prep(); f.faults.write = 2;
    await assert.rejects(f.service.resolveCraftingRequest(attempt.id), /write failed/);
    assert.equal(f.rolls, 0);
  }
  {
    const { f, attempt } = await prep(); f.faults.roll = true;
    await assert.rejects(f.service.resolveCraftingRequest(attempt.id), /lost/);
    await assert.rejects(f.service.resolveCraftingRequest(attempt.id), /will not reroll/);
    assert.equal(f.rolls, 1);
  }
  {
    const { f, attempt } = await prep(); f.faults.write = 4;
    await assert.rejects(f.service.resolveCraftingRequest(attempt.id), /write failed/);
    assert.equal(f.flags.pendingCrafting.status, "rolled");
    const resume = await f.service.requestCrafting(f.actor, { kind: "resume" });
    await f.service.resolveCraftingRequest(resume.id);
    assert.equal(f.rolls, 1);
    assert.equal(f.flags.craftingState[f.recipe.id].progress, 2);
    assert.equal(f.flags.pendingCrafting, null);
    await f.service.resolveCraftingRequest(attempt.id);
    assert.equal(f.rolls, 1);
  }
});
test("DA recovers ambiguous crafting from retained dice without a second roll", async () => {
  const f = await fixture();
  const start = await f.service.requestCrafting(f.actor, { kind: "start", recipeId: f.recipe.id });
  await f.service.resolveCraftingRequest(start.id);
  const attempt = await f.service.requestCrafting(f.actor, { kind: "attempt", recipeId: f.recipe.id, abilityId: f.recipe.permissions[0], adjustment: 0 });
  f.faults.roll = true;
  await assert.rejects(f.service.resolveCraftingRequest(attempt.id), /lost/);
  const recovery = await f.service.requestCrafting(f.actor, { kind: "recover", faces: [3, 4, 4] });
  recovery.author.isGM = true;
  await f.service.resolveCraftingRequest(recovery.id);
  assert.equal(f.rolls, 1);
  assert.equal(f.flags.craftingState[f.recipe.id].progress, 2);
  assert.equal(f.flags.pendingCrafting, null);
  await f.service.resolveCraftingRequest(attempt.id);
  assert.equal(f.rolls, 1);
});

test("optional carried materials and selected attribute apply atomically and replay never rechecks supply",async()=>{
 const f=await fixture({material:true});
 const send=async payload=>{const message=await f.service.requestCrafting(f.actor,{recipeId:f.recipe.id,...payload});await f.service.resolveCraftingRequest(message.id);return message;};
 await send({kind:"start"});
 const attempt=await send({kind:"attempt",abilityId:f.recipe.permissions[0],attribute:"reason",adjustment:0,materialSupplyId:"materials"});
 assert.equal(f.lastAttribute,"reason");assert.equal(f.rolls,1);assert.equal(f.supplyRolls,1);
 assert.equal(f.actor.items.find(item=>item.id==="materials").system.inventoryDie,4);
 assert.equal(f.flags.craftingState[f.recipe.id].progress,2);
 await f.service.resolveCraftingRequest(attempt.id);assert.equal(f.supplyRolls,1);assert.equal(f.flags.craftingState[f.recipe.id].progress,2);
});
test("ambiguous material checks require original-face recovery and never reroll the crafting or supply dice",async()=>{
 const f=await fixture({material:true});
 const start=await f.service.requestCrafting(f.actor,{recipeId:f.recipe.id,kind:"start"});await f.service.resolveCraftingRequest(start.id);
 const attempt=await f.service.requestCrafting(f.actor,{recipeId:f.recipe.id,kind:"attempt",abilityId:f.recipe.permissions[0],adjustment:0,materialSupplyId:"materials"});
 f.faults.supplyRoll=true;
 await assert.rejects(f.service.resolveCraftingRequest(attempt.id),/supply result lost/);
 await assert.rejects(f.service.resolveCraftingRequest(attempt.id),/will not reroll/);
 assert.equal(f.rolls,1);assert.equal(f.supplyRolls,1);assert.equal(f.actor.items.find(item=>item.id==="materials").system.inventoryDie,6);
 const recover=await f.service.requestCrafting(f.actor,{kind:"recoverMaterial",materialFace:1});recover.author.isGM=true;
 await f.service.resolveCraftingRequest(recover.id);
 assert.equal(f.actor.items.find(item=>item.id==="materials").system.inventoryDie,4);assert.equal(f.rolls,1);assert.equal(f.supplyRolls,1);
 await f.service.resolveCraftingRequest(attempt.id);assert.equal(f.supplyRolls,1);
});
