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
async function fixture({ owner = true, authority = true } = {}) {
  const recipe = inventory.recipes.find(r => r.id === "recipe-twisted-cord");
  const flags = { development: { recipes: [recipe.id] }, operationReceipts: {} };
  let items = [{ _id: "ability", type: "ability", flags: { "heroes-of-legend": { catalogId: recipe.permissions[0], source: choices.records.find(record => record.id === recipe.permissions[0]).source } } }];
  const actor = { uuid: "Actor.hero", type: "character", system: { attributes: { knowledge: { effective: 1 } } },
    get items() { return items.map(i => ({ ...i, id: i._id, getFlag: (_id, key) => i.flags?.["heroes-of-legend"]?.[key] })); },
    getFlag: (_id, key) => flags[key], testUserPermission: () => owner, toObject: () => ({ items: structuredClone(items) }) };
  const messages = new Map(); let writes = 0, rolls = 0;
  const faults = {};
  const context = createContext({ structuredClone, fromUuid: async () => actor, ui: {}, Hooks: {},
    foundry: { dice: { Roll: { fromData: data => ({ toJSON: () => data }) } }, utils: { randomID: () => "newproduct123456", escapeHTML: s => s } },
    game: { user: { id: "owner" }, settings: { get: () => "authority" }, messages, users: [{ id: "owner" }] },
    ChatMessage: { create: async data => { const message = { id: `request${messages.size}`, author: { id: "owner" }, ...data, getFlag: (_id, key) => data.flags["heroes-of-legend"][key], update: async changes => Object.assign(message, changes) }; messages.set(message.id, message); return message; } } });
  const mocks = {
    "../rules/roll.mjs": { classifyRoll },
    "./catalog.mjs": { loadCatalogs: async () => ({ choices: choices.records, inventory, commit: choices.sourceCommit }) },
    "./authority.mjs": { isCreationAuthority: () => authority, enqueueCharacterOperation: async fn => fn(), writeAuthorityDocument: async (_actor, changes) => { writes++; if (faults.write === writes) throw new Error("write failed"); if (changes.items) items = structuredClone(changes.items); for (const [key,value] of Object.entries(changes)) { if (key.startsWith("flags.heroes-of-legend.operationReceipts.")) flags.operationReceipts[key.split(".").at(-1)] = structuredClone(value); else if (key.startsWith("flags.heroes-of-legend.")) flags[key.slice("flags.heroes-of-legend.".length)] = structuredClone(value); } } },
    "./creation.mjs": { validateCreationChanges: () => {} },
    "../rules/item-construction.mjs": { equipmentItemSource },
    "../rules/workshop-crafting.mjs": { startWorkshopCraft, workshopCraft },
    "./roll-preparation.mjs": { rollBasis: () => ({}), prepareRoll: () => ({ net: 0, attribute: 1 }) },
    "./roll.mjs": { evaluatePreparedRoll: async () => { rolls++; if (faults.roll) throw new Error("roll result lost"); return { roll: { toJSON: () => "{}" }, snapshot: { tier: "standard", total: 12 } }; } },
    "../rules/situational-adjustment.mjs": { effectiveRollDraft: () => ({}), situationalRollDraft: () => ({}) },
    "./turn-lock.mjs": { assertNoPendingTurn: () => {} },
  };
  const module = new SourceTextModule(source, { context });
  await module.link(name => { const values = mocks[name]; return new SyntheticModule(Object.keys(values), function() { for (const [key,value] of Object.entries(values)) this.setExport(key,value); }, { context }); });
  await module.evaluate();
  return { actor, flags, service: module.namespace, recipe, get writes() { return writes; }, get rolls() { return rolls; }, messages, faults };
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
