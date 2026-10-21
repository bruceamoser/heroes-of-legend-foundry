import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, SourceTextModule } from "node:vm";
const ID = "heroes-of-legend";
const source = await readFile(new URL("../src/services/authority.mjs", import.meta.url), "utf8");
async function fixture({isGM = false, activeGM = null, socket = "owner-tab", settings = {}} = {}) {
  const values = new Map(Object.entries(settings)), hooks = new Map(), writes = [], messages = new Map();
  const user = {id: isGM ? "gm" : "player", isGM};
  const context = createContext({
    game: {user, users: {activeGM}, socket: {id:socket,on(){}}, messages,
      settings: {get: (_id,key) => values.get(key),register(_id,key,option){if(!values.has(key))values.set(key,option.default);},
        async set(_id,key,value){writes.push(key);values.set(key,value);}}},
    Hooks: {once:(name,fn)=>hooks.set(name,fn),on:(name,fn)=>hooks.set(name,fn)},
    ChatMessage: {async create(data){const message={id:"action",author:user,...data,getFlag:(_id,key)=>data.flags[ID][key]};messages.set(message.id,message);return message;}},
  });
  const module = new SourceTextModule(source,{context}); await module.link(()=>{});await module.evaluate();
  const api = module.namespace; api.registerAuthority();
  return {api,context,values,hooks,writes,messages,user};
}
test("owned action runs without GM, browser locks, secure context, or legacy checkpoint recovery",async()=>{
  const f=await fixture({settings:{authorityWork:{busy:true,uncertain:true},authorityMeta:{clientId:"abandoned"}}});
  await f.hooks.get("ready")();await f.api.ensureAuthorityReady();
  const message=await f.api.createActionMessage({flags:{[ID]:{creationRequest:{actorUuid:"Actor.hero"}}}});
  assert.equal(f.api.shouldProcessRequest(message),true);
  let applied=0;
  const doc={testUserPermission:user=>user.id==="player",update:async()=>++applied};
  await f.api.enqueueCharacterOperation(()=>f.api.writeAuthorityDocument(doc,{}),{requestId:message.id});
  assert.equal(applied,1);assert.deepEqual(f.writes,[]);
});
test("owner request executes only in its originating client",async()=>{
  const a=await fixture(),b=await fixture({socket:"second-tab"});
  const message=await a.api.createActionMessage({});
  assert.equal(a.api.shouldProcessRequest(message),true);assert.equal(b.api.shouldProcessRequest(message),false);
  b.messages.set(message.id,message);
  const result=await b.api.enqueueCharacterOperation(()=>{throw Error("must not run");},{requestId:message.id});
  assert.equal(result.status,"not-authority");
});
test("shared action needs connected GM but owned action never does",async()=>{
  const f=await fixture();
  await assert.rejects(f.api.createActionMessage({}, {shared:true}),/GM must be connected/);
  assert.ok(await f.api.createActionMessage({}));
});
test("shared action is routed to one automatic active GM client",async()=>{
  const p=await fixture({activeGM:{id:"gm"},settings:{actionRelay:{userId:"gm",clientId:"gm-tab"}}}),gm=await fixture({isGM:true,activeGM:{isSelf:true},socket:"gm-tab"});
  await gm.hooks.get("ready")();
  const message=await p.api.createActionMessage({}, {shared:true});
  assert.equal(p.api.shouldProcessRequest(message),false);assert.equal(gm.api.shouldProcessRequest(message),true);
  const other=await fixture({isGM:true,activeGM:{isSelf:true},socket:"other-tab",settings:Object.fromEntries(gm.values)});
  assert.equal(other.api.shouldProcessRequest(message),false);
});
test("GM clicks execute directly even when another GM is active",async()=>{
  const f=await fixture({isGM:true,activeGM:{isSelf:false}});
  const message=await f.api.createActionMessage({}, {shared:true});
  assert.equal(message.getFlag(ID,"actionExecution").shared,false);
  assert.equal(f.api.shouldProcessRequest(message),true);
});
test("operation writes retain current user permissions",async()=>{
  const f=await fixture(),message=await f.api.createActionMessage({});
  await assert.rejects(f.api.enqueueCharacterOperation(()=>f.api.writeAuthorityDocument({testUserPermission:()=>false,update:()=>{throw Error("must not write");}},{}),{requestId:message.id}),/permission/);
});
test("a failed action does not poison the local queue",async()=>{
  const f=await fixture(),message=await f.api.createActionMessage({});
  await assert.rejects(f.api.enqueueCharacterOperation(()=>{throw Error("bad input");},{requestId:message.id}),/bad input/);
  assert.equal(await f.api.enqueueCharacterOperation(()=>"saved",{requestId:message.id}),"saved");
});
test("mismatched request author cannot choose an execution identity",async()=>{
  const f=await fixture(),message=await f.api.createActionMessage({});message.author={id:"someone-else"};
  assert.equal(f.api.shouldProcessRequest(message),false);
});

test("shared request retains its exact executor when another GM tab takes relay binding",async()=>{
  const p=await fixture({activeGM:{id:"gm"},settings:{actionRelay:{userId:"gm",clientId:"first"}}});
  const message=await p.api.createActionMessage({}, {shared:true});
  const first=await fixture({isGM:true,socket:"first",settings:{actionRelay:{userId:"gm",clientId:"second"}}});
  const second=await fixture({isGM:true,socket:"second",settings:{actionRelay:{userId:"gm",clientId:"second"}}});
  assert.equal(first.api.shouldProcessRequest(message),true);assert.equal(second.api.shouldProcessRequest(message),false);
  first.messages.set(message.id,message);second.messages.set(message.id,message);
  let count=0;await first.api.enqueueCharacterOperation(()=>count++,{requestId:message.id});
  await second.api.enqueueCharacterOperation(()=>count++,{requestId:message.id});assert.equal(count,1);
});
test("missing or former-GM relay gives an actionable shared retry without blocking owned actions",async()=>{
  const p=await fixture({activeGM:{id:"new-gm"},settings:{actionRelay:{userId:"former-gm",clientId:"old"}}});
  await assert.rejects(p.api.createActionMessage({}, {shared:true}),/GM is still connecting/);
  assert.ok(await p.api.createActionMessage({}));
});
