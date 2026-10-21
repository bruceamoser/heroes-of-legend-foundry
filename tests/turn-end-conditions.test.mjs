import test from "node:test";
import assert from "node:assert/strict";
import {settleTurnConditions,turnEndContent} from "../src/services/turn-end-conditions.mjs";
const ID="heroes-of-legend";
function fixture({hp=20,owner=true,synthetic=false}={}) {
 const flags={},effects=[];let writes=0;
 const actor={uuid:synthetic?"Scene.fixture.Token.hero.Actor.hero":"Actor.hero",name:"Ari",type:"character",isToken:synthetic,items:[],system:{health:{value:hp,max:20},grit:{available:2},resistances:{numeric:[{type:"fire",value:2}]},weaknesses:{numeric:[]}},getFlag:(_,key)=>flags[key],testUserPermission:()=>owner,toObject:()=>({effects:structuredClone(effects)})};
 Object.defineProperty(actor,"effects",{get:()=>effects.map(data=>({...data,id:data._id,active:!data.disabled,getFlag:(_,key)=>data.flags?.[ID]?.[key]}))});
 const add=(key,rating,persistence="temporary")=>{const id=`effect${effects.length}`;effects.push({_id:id,name:key,statuses:[`hol.${key}`],showIcon:2,flags:{[ID]:{condition:{id,key,rating,persistence,source:"Hazard",order:effects.length}}}});};
 const write=async(document,changes)=>{assert.equal(document,actor);writes++;actor.system.health.value=changes['system.health.value'];effects.splice(0,effects.length,...changes.effects);for(const[path,value]of Object.entries(changes)){if(!path.startsWith('flags.'))continue;const parts=path.split('.').slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=structuredClone(value);}};
 globalThis.CONST={ACTIVE_EFFECT_SHOW_ICON:{NEVER:0}};globalThis.foundry={utils:{escapeHTML:value=>value.replaceAll('<','&lt;')}};
 return {actor,flags,effects,add,write,get writes(){return writes;}};
}
test("turn-end damage uses matching resistance/minimum, Bleeding bypasses it, Poisoned only decays",async()=>{
 const f=fixture();f.add("burning",1);f.add("bleeding",2);f.add("poisoned",3);
 const result=await settleTurnConditions(f.actor,"combat-1-turn",{author:{},write:f.write});
 assert.equal(f.actor.system.health.value,17);assert.equal(result.events[0].total,1);assert.equal(result.events[0].event.minimumApplied,true);assert.equal(result.events[1].total,2);assert.equal(result.events[1].bypassResistance,true);
 assert.deepEqual(result.changes.map(c=>[c.key,c.after]),[["burning",0],["bleeding",1],["poisoned",2]]);
 assert(f.effects[0].disabled);assert.equal(f.effects[0].showIcon,0);assert.deepEqual(f.effects[0].statuses,[]);
 assert.match(turnEndContent(result),/resistance applied/);assert.match(turnEndContent(result),/Poisoned 3 → 2/);
});
test("multiple temporary sources decay one combined step; starred, maintained and binary do not decay",async()=>{
 const f=fixture();f.add("poisoned",1);f.add("poisoned",1);f.add("poisoned",2,"starred");f.add("grappled",2,"maintained");f.add("prone",1,"binary");f.add("blinded",1);f.add("blinded",2);
 const result=await settleTurnConditions(f.actor,"combined",{author:{},write:f.write});
 assert.deepEqual(result.changes.map(c=>[c.key,c.before,c.after]),[["poisoned",4,3],["blinded",3,2]]);
 assert.equal(f.effects[2].flags[ID].condition.rating,2);assert.equal(f.effects[3].flags[ID].condition.rating,2);assert.equal(f.effects[4].disabled,undefined);
});
test("actor settlement survives interrupted Combat write: retry cannot repeat damage/decay, including synthetic actor",async()=>{
 const f=fixture({synthetic:true});f.add("bleeding",3);
 const result=await settleTurnConditions(f.actor,"combat-2-turn",{author:{},write:f.write});assert.equal(result.after,17);
 // Combat acknowledgement failed after this actor write; the same turn retries.
 const retry=await settleTurnConditions(f.actor,"combat-2-turn",{author:{},write:f.write});assert.equal(retry.replay,true);assert.equal(f.actor.system.health.value,17);assert.equal(f.effects[0].flags[ID].condition.rating,2);assert.equal(f.writes,1);
 await settleTurnConditions(f.actor,"combat-3-turn",{author:{},write:f.write});assert.equal(f.actor.system.health.value,15);assert.equal(f.effects[0].flags[ID].condition.rating,1);
});
test("permission is checked before replay and damage wakes Asleep without adding wounds or survival",async()=>{
 const f=fixture();f.add("burning",3);f.add("asleep",3,"starred");await settleTurnConditions(f.actor,"waking",{author:{},write:f.write});assert(f.effects[1].disabled);assert.equal(f.flags.survival,undefined);assert.equal(f.flags.wounds,undefined);
 const denied=fixture({owner:false});denied.add("bleeding",3);await assert.rejects(settleTurnConditions(denied.actor,"denied",{author:{},write:denied.write}),/Only an owner/);assert.equal(denied.writes,0);
});
test("an actor write rejected before settlement leaves the turn retryable, while lost confirmation reuses its receipt",async()=>{
 const f=fixture();f.add("bleeding",2);
 await assert.rejects(settleTurnConditions(f.actor,"retry",{author:{},write:async()=>{throw Error("Not saved");}}),/Not saved/);
 assert.equal(f.actor.system.health.value,20);assert.equal(f.flags.turnEndConditions,undefined);
 await assert.rejects(settleTurnConditions(f.actor,"retry",{author:{},write:async(...args)=>{await f.write(...args);throw Error("Confirmation lost");}}),/Confirmation lost/);
 assert.equal(f.actor.system.health.value,18);
 const recovered=await settleTurnConditions(f.actor,"retry",{author:{},write:f.write});assert.equal(recovered.replay,true);assert.equal(f.writes,1);assert.equal(f.actor.system.health.value,18);
});
