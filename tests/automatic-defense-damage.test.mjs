import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {damageEvent,canonicalDamageType} from "../src/rules/damage.mjs";
import * as survival from "../src/rules/survival.mjs";
import {classifyRoll} from "../src/rules/roll.mjs";
const ID="heroes-of-legend";
async function fixture({faces=[3,3,3],amount=3,hp=12,resistance=0,forged=false,uncertain=false,edited=false,missingDigest=false,printedResistance=null,printedWeakness=null}={}) {
 const flags={};let writes=0;
 const actor={uuid:"Actor.hero",documentName:"Actor",type:"character",items:[],system:{health:{value:hp,max:12},grit:{available:0},resistances:{numeric:printedResistance?[printedResistance]:[]},weaknesses:{numeric:printedWeakness?[printedWeakness]:[]}},getFlag:(_id,key)=>flags[key],validate:()=>{}};
 const result={actorUuid:actor.uuid,attackMessageId:"attack",attribute:0,retained:faces,tier:classifyRoll(faces,0).tier,attackOutcome:{damage:forged?amount+1:amount,type:"physical"}};
 const message={id:"roll",author:{id:"player",isGM:false},rolls:[{dice:[{results:faces.map(result=>({result,active:true}))}]}],getFlag:(_id,key)=>key==="roll"?result:{actorUuid:actor.uuid}};
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(result)));
 const resultSignature=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
 if(edited){result.retained=[6,6,6];result.tier="strong";message.rolls[0].dice[0].results=[6,6,6].map(result=>({result,active:true}));}
 const attack={author:{isGM:true},getFlag:(_id,key)=>key==="defenseResponses"?[{requestId:"roll",actorUuid:actor.uuid,status:"resolved",resultSignature:missingDigest?undefined:resultSignature}]:{damage:{[result.tier]:amount}}};
 const ctx=vm.createContext({structuredClone,crypto,TextEncoder,Uint8Array,game:{messages:new Map([["attack",attack]])},fromUuid:async()=>actor,Hooks:{callAll:()=>{}},foundry:{utils:{expandObject:v=>v}}});
 const deps={"./condition-apply.mjs":{conditionApplication:()=>{}},"./turn-lock.mjs":{assertNoPendingTurn:()=>{}},"../rules/roll.mjs":{classifyRoll},"../rules/damage.mjs":{damageEvent,canonicalDamageType},"../rules/passive-defenses.mjs":{passiveDefenseSources:()=>({resistances:resistance?[{type:"physical",value:resistance,label:"Armor"}]:[],weaknesses:[]})},"../rules/survival.mjs":survival,"./player-attacks.mjs":{playerBasicMeleeDamage:()=>{}},"./authority.mjs":{ensureAuthorityReady:async()=>{},isCreationAuthority:()=>true,enqueueCharacterOperation:fn=>fn(),writeAuthorityDocument:async(a,changes)=>{writes++;for(const [key,value]of Object.entries(changes)){if(key==="system.health.value")actor.system.health.value=value;else {const parts=key.split(".").slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=value;}}if(uncertain){uncertain=false;throw new Error("acknowledgement lost");}}}};
 const mod=new vm.SourceTextModule(await readFile(new URL("../src/services/damage.mjs",import.meta.url),"utf8"),{context:ctx});await mod.link(async spec=>{const e=deps[spec];return new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v);},{context:ctx});});await mod.evaluate();return {api:mod.namespace,apply:()=>mod.namespace.settleDefenseDamage(message),actor,flags,get writes(){return writes;}};
}
test("numeric defense tiers apply their saved outcome once, including zero and resistance minimum",async()=>{
 for(const [faces,amount,resistance,total]of [[[1,1,1],5,0,5],[[3,3,3],3,0,3],[[6,6,6],0,0,0],[[3,3,3],2,3,1]]){const f=await fixture({faces,amount,resistance});const result=await f.apply();assert.equal(result.event.total,total);await f.apply();assert.equal(f.writes,1);assert.equal(f.actor.system.health.value,12-total);}
});
test("lost Actor update acknowledgement resumes from durable event without second HP change",async()=>{const f=await fixture({uncertain:true});await assert.rejects(f.apply(),/acknowledgement/);const hp=f.actor.system.health.value;await f.apply();assert.equal(f.writes,1);assert.equal(f.actor.system.health.value,hp);assert.equal(f.flags.operationReceipts.roll.applied,true);});
test("forged player outcome is rejected before any mutation",async()=>{const f=await fixture({forged:true});await assert.rejects(f.apply(),/outcome changed/);assert.equal(f.writes,0);});
test("legacy explicit settlement changes HP without creating survival or wounds",async()=>{const f=await fixture({hp:2,amount:5});await f.apply();assert.equal(f.actor.system.health.value,0);assert.equal(f.flags.survival,undefined);assert.equal(f.flags.pendingWounds,undefined);assert.equal(f.writes,1);});

test("edited native dice and snapshot or legacy unbound results cannot apply damage",async()=>{for(const options of [{edited:true},{missingDigest:true}]){const f=await fixture(options);await assert.rejects(f.apply(),/unverified or changed/);assert.equal(f.writes,0);}});

test("printed creature defense labels normalize before canonical damage calculation", async () => {
  const f = await fixture({
    printedResistance: { type: "Physical", value: 2 },
    printedWeakness: { type: " PHYSICAL ", value: 1 },
  });
  f.actor.type = "creature";
  const basis = f.api.damageBasis(f.actor);
  assert.equal(basis.passiveDefenses.resistances[0].type, "physical");
  assert.equal(basis.passiveDefenses.weaknesses[0].type, "physical");
  const plan = f.api.damagePreview(f.actor, basis, {
    components: [{ type: "physical", amount: 5 }],
  });
  assert.equal(plan.event.total, 4);
  assert.equal(f.actor.system.resistances.numeric[0].type, "Physical");
});

test("all external damage and modifier labels use the shared canonical enum",async()=>{
 const f=await fixture();const basis=f.api.damageBasis(f.actor);
 for(const type of ["Physical","Fire","Cold","Lightning","Mental","Radiant","Life"]){
  const plan=f.api.damagePreview(f.actor,basis,{components:[{type,amount:4}],resistances:[{type,value:1,label:"Event resistance"}],weaknesses:[{type,value:1,label:"Event weakness"}]});
  assert.equal(plan.event.total,4);
 }
});
