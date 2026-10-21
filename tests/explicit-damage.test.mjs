import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
const ID="heroes-of-legend";
async function fixture() {
 const notifications=[],chats=[];let serial=0;
 const ctx=vm.createContext({Map,Promise,JSON,game:{user:{id:"player"},world:{id:"test"}},canvas:{tokens:{controlled:[]}},foundry:{utils:{randomID:()=>`op${++serial}`,escapeHTML:s=>s}},ui:{notifications:{warn:s=>notifications.push(s)}},ChatMessage:{create:async data=>chats.push(data)}});
 const dependencies={"./damage.mjs":{damageBasis:a=>({hp:a.hp,revision:0}),damagePreview:(a,b,d)=>({after:Math.max(0,b.hp-d.components.reduce((n,c)=>n+c.amount,0)),event:{total:d.components.reduce((n,c)=>n+c.amount,0)}})},"./documents.mjs":{updateOwnedDocument:async(a,changes)=>{a.writes++;a.hp=changes["system.health.value"];for(const[key,value]of Object.entries(changes))if(key.startsWith(`flags.${ID}.explicitDamage.`))a.flags[key.split(".").at(-1)]=value;}}};
 const mod=new vm.SourceTextModule(await readFile(new URL("../src/services/explicit-damage.mjs",import.meta.url),"utf8"),{context:ctx});
 await mod.link(async spec=>{const exports=dependencies[spec];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context:ctx});});await mod.evaluate();
 const actor=(uuid="Actor.hero",owner=true)=>({uuid,name:uuid,type:"character",hp:10,writes:0,flags:{},testUserPermission:()=>owner,getFlag(_id,key){return key==="explicitDamage"?this.flags:undefined;}});
 return {api:mod.namespace,ctx,actor,notifications,chats};
}
test("selected damage needs actual selected tokens",async()=>{const f=await fixture();await assert.rejects(f.api.applySelectedDamage([{type:"physical",amount:3}]),/Select one or more tokens/);assert.equal(f.chats.length,0);});
test("all selected actor targets update; linked duplicates update once",async()=>{const f=await fixture(),a=f.actor(),b=f.actor("Scene.a.Token.b.Actor.hero");f.ctx.canvas.tokens.controlled=[{actor:a},{actor:a},{actor:b}];const r=await f.api.applySelectedDamage([{type:"physical",amount:3}]);assert.equal(r.applied.length,2);assert.equal(a.hp,7);assert.equal(b.hp,7);assert.equal(a.writes,1);assert.equal(f.chats.length,1);});
test("unowned selections are reported without blocking owned selected targets",async()=>{const f=await fixture(),a=f.actor(),b=f.actor("Actor.other",false);f.ctx.canvas.tokens.controlled=[{actor:a},{actor:b}];const r=await f.api.applySelectedDamage([{type:"fire",amount:2}]);assert.equal(a.hp,8);assert.equal(b.hp,10);assert.equal(r.skipped.length,1);assert.match(f.notifications[0],/Actor.other/);});
test("each deliberate application is new; replay of same operation cannot repeat",async()=>{const f=await fixture(),a=f.actor();const d=[{type:"physical",amount:3}];await f.api.applyOwnedDamage(a,d,{operationId:"one"});await f.api.applyOwnedDamage(a,d,{operationId:"one"});assert.equal(a.hp,7);assert.equal(a.writes,1);await f.api.applyOwnedDamage(a,d,{operationId:"two"});assert.equal(a.hp,4);});
test("manual HP correction becomes next damage baseline",async()=>{const f=await fixture(),a=f.actor();await f.api.applyOwnedDamage(a,[{type:"physical",amount:9}]);a.hp=8;await f.api.applyOwnedDamage(a,[{type:"physical",amount:2}]);assert.equal(a.hp,6);});
test("one client concurrent damage clicks serialize against current HP",async()=>{const f=await fixture(),a=f.actor();await Promise.all([f.api.applyOwnedDamage(a,[{type:"physical",amount:2}]),f.api.applyOwnedDamage(a,[{type:"physical",amount:3}])]);assert.equal(a.hp,5);});
test("zero HP does not trigger additional consequences and changed replay is rejected",async()=>{const f=await fixture(),a=f.actor();await f.api.applyOwnedDamage(a,[{type:"physical",amount:20}],{operationId:"one"});assert.equal(a.hp,0);assert.equal(Object.keys(a.flags).length,1);await assert.rejects(f.api.applyOwnedDamage(a,[{type:"physical",amount:21}],{operationId:"one"}),/different values/);});
