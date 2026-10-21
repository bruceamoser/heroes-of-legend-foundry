import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { woundRoll, woundResult } from "../src/rules/wounds.mjs";
import { enterLastWords, validateSurvival, survivalState } from "../src/rules/survival.mjs";
import { DAMAGE_TYPES, WOUND_TABLES } from "../src/rules/damage.mjs";
const directSource = await readFile(new URL("../src/services/wound-roll.mjs", import.meta.url), "utf8");
const source = await readFile(new URL("../src/services/wounds.mjs", import.meta.url), "utf8");
const catalog = JSON.parse(await readFile(new URL("../static/data/wounds.json", import.meta.url)));
async function fixture({ owner = true, state = null, face = 1 } = {}) {
  const flags = { ...(state ? { survival: structuredClone(state) } : {}) };
  const items = new Map(), effects = new Map(), messages = new Map(); messages.find=fn=>[...messages.values()].find(fn);
  let writes = 0, rolls = 0, gm = false, failChat = false;
  const actor = { type: "character", uuid: "Actor.hero", system: { health: { value: state?.hp ?? 12, max: state?.maxHp ?? 12 }, grit: { available: 2 } }, effects, items,
    getFlag: (_id, key) => flags[key], testUserPermission: () => owner,
    validate() {}, toObject: () => ({ effects: [...effects.values()] }) };
  const set = (key, value) => { if(key==="effects"){effects.clear();for(const effect of value)effects.set(effect._id,effect);return;} if(key==="system.health.value"){actor.system.health.value=value;return;}const parts = key.split("."); if (parts[0] !== "flags") throw new Error(`Unexpected system write ${key}`); let target = flags; for (const part of parts.slice(2,-1)) target = target[part] ??= {};const last=parts.at(-1);if(last.startsWith("-="))delete target[last.slice(2)];else target[last] = structuredClone(value); };
  actor.update=async changes=>{writes++;for(const [key,value]of Object.entries(changes))set(key,value);return actor;};
  let unique=0;
  const context = createContext({ structuredClone, Date, fetch: async () => ({ ok: true, json: async () => catalog }),
    fromUuid: async () => actor, foundry: { utils: { expandObject: value => value, randomID: () => `id${++unique}`, escapeHTML:value=>value }, dice: { Roll: class {
      constructor(formula) { this.isDice=formula.includes("d6");this.total=Number(formula);this.count = this.isDice?Number(formula.match(/^\d+/)[0]):0; this.dice = [{ results: Array.from({ length: this.count }, () => ({ result: face })) }]; }
      async evaluate() { if(this.isDice)rolls++; return this; } toJSON() { return {}; } static fromData(){return {};}
    } }, documents: { ActiveEffect: class { validate() {} } } },
    CONST: { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 1 } },
    game: {world:{id:"test"},packs:{get:()=>({getDocuments:async()=>Object.values(WOUND_TABLES).map(name=>{
      const results=catalog.records.filter(r=>r.table===name).map((r,i)=>({id:r.id,range:[i+1,i+1],getFlag:()=>r.key}));
      return {uuid:`Table.${name}`,getFlag:()=>name,results,draw:async({roll})=>({results:[results[roll.total-1]]})};
    })})}, user: { id: "owner",isGM:false }, settings: { get: () => "authority" }, users: [{ id: "owner" }], messages },
    ChatMessage: {getSpeaker:()=>({}), create: async data => { if(failChat){failChat=false;throw Error("Chat write failed");} const m = { id: `r${messages.size}`, author: { id: "owner", isGM: gm },isOwner:true, getFlag: (_id,key) => data.flags["heroes-of-legend"][key], update: async changes => Object.assign(m,changes) }; messages.set(m.id,m); return m; } },
  });
  const mocks = {
    "./turn-lock.mjs": { assertNoPendingTurn: () => {} },
    "../rules/wounds.mjs": { woundRoll, woundResult },
    "../rules/damage.mjs": { DAMAGE_TYPES, WOUND_TABLES },
    "../rules/survival.mjs": { enterLastWords, validateSurvival, survivalState },
    "./conditions.mjs": { conditionIcon: key => key },
    "./authority.mjs": {ensureAuthorityReady:async()=>{}, isCreationAuthority: () => true, enqueueCharacterOperation: fn => fn(), writeAuthorityDocument: async (_actor, changes) => { writes++; for (const [key,value] of Object.entries(changes)) if (key !== "effects") set(key,value); } },
  };
  let module,direct;
  async function mock(name){const values=mocks[name];if(!values)throw Error(name);const m=new SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});await m.link(()=>{});await m.evaluate();return m;}
  const resolve=async name=>name==="./wounds.mjs"?module:name==="./wound-roll.mjs"?direct:mock(name);
  module=new SourceTextModule(source,{context,importModuleDynamically:resolve});
  direct=new SourceTextModule(directSource,{context,importModuleDynamically:resolve});
  await module.link(resolve);await module.evaluate();await direct.link(resolve);await direct.evaluate();
  const service=module.namespace;
  const makeRequest=async(event,kind,payload={})=>context.ChatMessage.create({flags:{"heroes-of-legend":{woundRequest:{actorUuid:actor.uuid,eventId:event,kind,basis:service.woundBasis(actor,event),...payload}}}});
  const send=async(event,kind,payload={})=>{const message=await makeRequest(event,kind,payload);const result=await service.resolveWoundRequest(message.id);return{message,result};};
  return { service, direct:direct.namespace, makeRequest, send, actor, flags, messages, failNextChat(){failChat=true;}, setGM(value) { gm=value; }, get writes() { return writes; }, get rolls() { return rolls; } };
}
test("explicit manual wound records one persistent pending event and count without changing HP/status", async () => {
  const f = await fixture({ state: survivalState({ hp: 8, maxHp: 12, wounds: 2, gritAvailable: 2 }) });
  const { message, result } = await f.send(null,"record");
  assert.equal(f.flags.survival.wounds, 3); assert.equal(f.flags.survival.hp,8); assert.equal(f.flags.survival.status,"active");
  const pending = f.flags.pendingWounds[result.eventId];
  assert.equal(pending.priorWounds,2); assert.equal(pending.status,"awaiting-roll");
  assert.deepEqual([...pending.types],DAMAGE_TYPES); assert.equal(f.rolls,0);
  await f.service.resolveWoundRequest(message.id);
  assert.equal(f.flags.survival.wounds,3); assert.equal(f.writes,1);
});
test("owner can roll and apply an ordinary manual wound once; no opening-side effect", async () => {
  const f = await fixture();
  assert.equal(f.flags.pendingWounds,undefined);
  const { result } = await f.send(null,"record");
  await f.send(result.eventId,"roll",{ damageType:"physical" });
  await f.send(result.eventId,"apply");
  assert.equal(f.rolls,1); assert.equal(f.flags.wounds[result.eventId].key,"111");
  assert.equal(f.flags.pendingWounds[result.eventId].status,"resolved");
  assert.equal(f.flags.survival.wounds,1); assert.equal(f.actor.system.health.value,12);
});
test("manual wounds reject unauthorized/stale requests and preserve operation preconditions", async () => {
  const denied = await fixture({ owner:false });
  await assert.rejects(denied.send(null,"record"),/owner/);
  const f=await fixture();
  const stale=await f.makeRequest(null,"record");
  await f.send(null,"record");
  await assert.rejects(f.service.resolveWoundRequest(stale.id),/changed/);
  const eventId=Object.keys(f.flags.pendingWounds)[0];
  await assert.rejects(f.send(eventId,"recover",{ faces:[1,1,1] }),/Only an unresolved/);
  await assert.rejects(f.send(eventId,"apply",{ skipped:[{key:"111"}] }),/Wound or character state changed/);
});

test("owned wound action rolls and applies without a GM, replays once and offers guarded Undo",async()=>{
 const f=await fixture();
 const first=await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"});
 assert.equal(f.flags.survival.wounds,1);assert.equal(f.rolls,1);assert.equal(f.flags.wounds[first.eventId].key,"111");assert.equal(f.messages.size,1);
 const replay=await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"});assert.equal(replay.replay,true);assert.equal(f.rolls,1);
 const undone=await f.direct.undoCharacterWound(f.actor,"one");assert.equal(undone.replay,false);assert.equal(Object.keys(f.flags.wounds).length,0);assert.equal(f.flags.survival,null);assert.equal(f.actor.system.health.value,12);
 assert.equal((await f.direct.undoCharacterWound(f.actor,"one")).replay,true);
});
test("owned wound Undo refuses to overwrite a later HP change",async()=>{
 const f=await fixture();await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"});f.actor.system.health.value=8;
 await assert.rejects(f.direct.undoCharacterWound(f.actor,"one"),/character has changed/);assert.equal(f.flags.survival.wounds,1);assert.equal(f.actor.system.health.value,8);
});

test("failed wound chat creation retries presentation using saved dice without duplicate mechanics",async()=>{
 const f=await fixture();f.failNextChat();await assert.rejects(f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"}),/Chat write failed/);
 assert.equal(f.flags.survival.wounds,1);assert.equal(f.rolls,1);assert.equal(f.messages.size,0);
 const replay=await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"});assert.equal(replay.replay,true);assert(replay.message);assert.equal(f.rolls,1);assert.equal(f.flags.survival.wounds,1);assert.equal(f.messages.size,1);
});
test("Undo increments live revisions even after unrelated no-op updates",async()=>{
 const f=await fixture();await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"one"});f.flags.damageRevision=100;f.flags.conditionRevision=80;
 await f.direct.undoCharacterWound(f.actor,"one");assert.equal(f.flags.damageRevision,101);assert.equal(f.flags.conditionRevision,81);
});

test("Last Words wound applies and Undo restores the exact prior living state",async()=>{
 const f=await fixture({face:6});await f.direct.rollCharacterWound(f.actor,"physical",{operationId:"terminal"});
 assert.equal(f.actor.system.health.value,0);assert.equal(f.flags.survival.status,"lastWords");
 await f.direct.undoCharacterWound(f.actor,"terminal");assert.equal(f.actor.system.health.value,12);assert.equal(f.flags.survival,null);assert.equal(Object.keys(f.flags.wounds).length,0);
});
test("direct wound rolls reject a nonowner before creating a message or modifying the actor",async()=>{
 const f=await fixture({owner:false});assert.throws(()=>f.direct.rollCharacterWound(f.actor,"physical"),/own/);assert.equal(f.writes,0);assert.equal(f.messages.size,0);assert.equal(f.rolls,0);
});
