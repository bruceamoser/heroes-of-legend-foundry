import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { HEALING_POTION_IDS } from "../src/rules/potions.mjs";
import { refillInventory } from "../src/rules/inventory.mjs";
const ID="heroes-of-legend";
async function fixture({die=0,quantity=1,maximum=4}={}) {
 const flags={};let writes=0;
 const item={id:"bottle",type:"equipment",uuid:"Actor.hero.Item.bottle",name:"Healing bottle",system:{catalogId:"equipment-healing",inventoryDie:die,quantity},getFlag:()=>null};
 const actor={documentName:"Actor",id:"hero",uuid:"Actor.hero",items:new Map([[item.id,item]]),system:{},getFlag:(_id,key)=>flags[key],testUserPermission:()=>true,toObject:()=>({items:[{_id:item.id,type:item.type,system:structuredClone(item.system)}]}),validate:()=>true};
 item.actor=actor;
 const user={id:"owner",isGM:false};let created;
 const messages=new Map();
 const game={user,users:[user],combats:[],actors:[actor],scenes:[],messages,settings:{get:()=>"authority"}};
 const context=vm.createContext({game,structuredClone,console,fromUuid:async(uuid)=>uuid===actor.uuid?actor:null,foundry:{utils:{escapeHTML:s=>s,expandObject:v=>v}},ChatMessage:{create:async(data)=>{created=data;return data;}},Hooks:{on:()=>{}},ui:{notifications:{error:()=>{}}}});
 const basis=(a,i)=>{if(i.actor!==a||i.type!=="equipment")throw new Error("wrong item");return {inventoryRevision:flags.inventoryRevision??0,equipmentRevision:0,item:{itemId:i.id,inventoryDie:i.system.inventoryDie,quantity:i.system.quantity,catalogId:i.system.catalogId}};};
 const deps={
 "../rules/inventory.mjs":{refillInventory},
 "../rules/potions.mjs":{HEALING_POTION_IDS},
 "./catalog.mjs":{loadCatalogs:async()=>({inventory:{equipment:[{id:"equipment-healing",inventoryDie:maximum}]}})},
 "./turn-lock.mjs":{assertNoPendingTurn:()=>{}},
 "./inventory.mjs":{inventoryBasis:basis,inventoryActorTargets:()=>[actor],validateEmbeddedItems:()=>{}},
 "./authority.mjs":{ensureAuthorityReady:async()=>{},enqueueCharacterOperation:async(fn)=>fn(),isCreationAuthority:()=>true,writeAuthorityDocument:async(a,changes)=>{writes++;item.system=changes.items[0].system;for(const [path,value]of Object.entries(changes)){if(path===`flags.${ID}.inventoryRevision`)flags.inventoryRevision=value;const prefix=`flags.${ID}.operationReceipts.`;if(path.startsWith(prefix)){flags.operationReceipts??={};flags.operationReceipts[path.slice(prefix.length)]=value;}}}},
 };
 const mod=new vm.SourceTextModule(await readFile(new URL('../src/services/resupply.mjs',import.meta.url),'utf8'),{context});
 await mod.link(async(specifier)=>{const values=deps[specifier];const m=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});return m;});await mod.evaluate();
 const api=mod.namespace;
 async function request(steps=1){await api.requestResupply(actor,item,steps);const message={id:"request",author:user,getFlag:(_id,key)=>created.flags[ID][key],update:async()=>{}};messages.set(message.id,message);return message;}
 return {api,actor,item,flags,game,request,messages,get writes(){return writes;}};
}
test("resupply caps empty/full healing bottles at d4 without changing zero quantity",async()=>{
 const f=await fixture({quantity:0});await f.request(6);const result=await f.api.applyResupplyRequest("request");assert.equal(result.result.after,4);assert.equal(f.item.system.quantity,0);assert.equal(f.writes,1);
 const replay=await f.api.applyResupplyRequest("request");assert.equal(replay.replay,true);assert.equal(f.writes,1);
});
test("resupply steps preserve all equipment and receipt writes in one atomic Actor update",async()=>{
 const f=await fixture({die:4,quantity:7,maximum:12});await f.request(2);await f.api.applyResupplyRequest("request");assert.equal(f.item.system.inventoryDie,8);assert.equal(f.item.system.quantity,7);assert.equal(f.flags.inventoryRevision,1);assert.equal(f.flags.operationReceipts.request.kind,"resupply");
});
test("resupply rejects nonowners, stale basis, unknown printed caps, pending supply and altered replay",async()=>{
 const f=await fixture();f.actor.testUserPermission=()=>false;await assert.rejects(f.request(),/owner/);assert.equal(f.writes,0);f.actor.testUserPermission=()=>true;
 f.flags.pendingInventory={phase:"reserved"};await assert.rejects(f.request(),/pending supply/);delete f.flags.pendingInventory;
 await f.request();f.item.system.quantity=9;await assert.rejects(f.api.applyResupplyRequest("request"),/changed/);assert.equal(f.writes,0);
 f.item.system.quantity=1;await f.api.applyResupplyRequest("request");f.messages.get("request").author={id:"other"};await assert.rejects(f.api.applyResupplyRequest("request"),/changed/);assert.equal(f.writes,1);
 const unknown=await fixture({maximum:null});await assert.rejects(unknown.request(),/printed supply maximum/);
 for(const steps of [0,-1,7,1.5])await assert.rejects((await fixture()).request(steps),/1–6/);
});
