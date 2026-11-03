import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { rollPlan, classifyRoll } from "../src/rules/roll.mjs";
import * as recovery from "../src/rules/recovery.mjs";
import * as debt from "../src/rules/debt-reroll.mjs";
import * as ancestry from "../src/rules/ancestry.mjs";
import { survivalState, validateSurvival, receiveHealing, safeBreath, chooseSurvival, resolveSurvival, startSurvivalTurn } from "../src/rules/survival.mjs";
import { recoveryPreview } from "../src/services/recovery.mjs";
import { importedCharacterState } from "../src/rules/native-character-state.mjs";

const ID = "heroes-of-legend";
function original() {
  return { actorUuid:"Actor.hero", mode:"attribute", attributeKey:"knowledge", rollerId:"owner",
    ...rollPlan({attribute:1,boons:2,banes:1}), retained:[2,3,4], ...classifyRoll([2,3,4],1),
    sources:[{id:"saved-context",kind:"boon",amount:1,label:"Original context"}], references:[] };
}

async function fixture({failWrite = 0, failRoll = false, failPresent = false} = {}) {
  let writes = 0, rolls = 0, requested;
  const formulas = [];
  const flags = {development:{creation:{traitIds:["trait-oath-bound-the-debt-comes-due"]}},
    survival:survivalState({hp:10,maxHp:20,wounds:3,gritAvailable:1,ownTurn:5})};
  const owner = {id:"owner",isGM:false}, gm = {id:"gm",isGM:true};
  const actor = {uuid:"Actor.hero",type:"character",system:{health:{value:10,max:20},recovery:{unavailableHp:0,debtUsed:false}},
    getFlag:(_id,key)=>flags[key],testUserPermission:user=>user.id==="owner"||user.isGM,validate:()=>{}};
  const sourceFlags = {roll:original()};
  const source = {id:"original",isContentVisible:true,rolls:[{dice:[{results:[{result:1,active:false},...[2,3,4].map(result=>({result,active:true}))]}]}],
    getFlag:(_id,key)=>sourceFlags[key], update:async changes=>{
      if (failPresent) {failPresent=false;throw new Error("chat update failed");}
      for (const [key,value] of Object.entries(changes)) {
        if (key==="rolls") source.rolls=structuredClone(value);
        else sourceFlags[key.split(".").at(-1)]=structuredClone(value);
      }
    }};
  const basis = () => structuredClone({hp:actor.system.health.value,maxHp:20,recovery:actor.system.recovery,survival:flags.survival,revision:flags.damageRevision??0});
  const message = {id:"request1",author:owner,update:async changes=>Object.assign(message,changes)};
  const request = {actorUuid:actor.uuid,basis:basis(),draft:{kind:"debt",rollMessageId:source.id,rollSnapshot:structuredClone(sourceFlags.roll)}};
  const signature = JSON.stringify(request);
  const applyChanges = changes => {
    for (const [key,value] of Object.entries(changes)) {
      const path = key.split(".");
      let target = path[0]==="system" ? actor.system : flags;
      const keys = path.slice(path[0]==="system"?1:2);
      for (const part of keys.slice(0,-1)) target=target[part]??={};
      target[keys.at(-1)]=structuredClone(value);
    }
  };
  const dependencies = {
    "./authority.mjs":{ensureAuthorityReady:async()=>{},createActionMessage:async data=>(requested=data),
      writeAuthorityDocument:async(_actor,changes)=>{writes++;applyChanges(changes);if(writes===failWrite)throw new Error("acknowledgement lost");}},
    "./damage.mjs":{damageBasis:basis}, "../rules/recovery.mjs":recovery,
    "../rules/ancestry.mjs":ancestry, "../rules/debt-reroll.mjs":debt,
    "../rules/survival.mjs":{validateSurvival},
  };
  const context = createContext({structuredClone,game:{user:owner,users:[owner,gm],messages:new Map([[source.id,source]])},
    foundry:{utils:{expandObject:value=>value},dice:{Roll:class{
      constructor(formula){formulas.push(formula);}
      async evaluate(){rolls++;if(failRoll)throw new Error("native dice interrupted");this.dice=[{results:[{result:1,active:false},...[6,6,6].map(result=>({result,active:true}))]}];return this;}
      toJSON(){return {formula:formulas.at(-1),dice:this.dice};}
    }}}});
  const module = new SourceTextModule(await readFile(new URL("../src/services/debt-reroll.mjs",import.meta.url),"utf8"),{context});
  await module.link(specifier=>{const values=dependencies[specifier];return new SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value);},{context});});
  await module.evaluate();
  return {api:module.namespace,actor,flags,source,sourceFlags,message,request,signature,gm,basis,formulas,
    get rolls(){return rolls;},get writes(){return writes;},get requested(){return requested;},
    apply:()=>module.namespace.applyDebtReroll(actor,message,request,basis(),signature)};
}

test("native Debt retains original attribute/pool and natural dice, replaces the result once, and preserves live resources",async()=>{
  const f=await fixture();
  await f.api.requestDebtReroll(f.actor,f.source);
  assert.equal(f.requested.flags[ID].recoveryRequest.draft.rollSnapshot.formula,"4d6kh3 + (1)");
  const before=structuredClone(f.flags.survival);
  await f.apply();
  assert.deepEqual(f.formulas,["4d6kh3 + (1)"]);
  assert.equal(f.actor.system.health.value,9);
  assert.deepEqual(f.actor.system.recovery,{unavailableHp:1,debtUsed:true});
  assert.deepEqual(f.flags.survival,{...before,hp:9,recovery:{unavailableHp:1,debtUsed:true}});
  assert.equal(f.sourceFlags.roll.attribute,1);
  assert.equal(f.sourceFlags.roll.net,1);
  assert.equal(f.sourceFlags.roll.natural,"critical");
  assert.deepEqual(f.sourceFlags.roll.retained,[6,6,6]);
  assert.deepEqual(f.sourceFlags.roll.sources,original().sources);
  assert.equal(f.sourceFlags.debtReroll.original.total,10);
  await f.apply();
  assert.equal(f.rolls,1);
  assert.equal(f.writes,2);
  assert.equal(f.actor.system.health.value,9);
});

test("paid daily use and native request permissions are enforced before another roll",async()=>{
  const f=await fixture();
  f.message.author={id:"stranger",isGM:false};
  await assert.rejects(f.apply(),/owner/);assert.equal(f.writes,0);
  await assert.rejects(f.api.requestDebtReroll({...f.actor,testUserPermission:()=>false},f.source),/owner/);
  f.message.author={id:"owner",isGM:false};
  f.sourceFlags.roll.mode="attack";
  await assert.rejects(f.apply(),/manual Debt procedure/);assert.equal(f.writes,0);
  f.sourceFlags.roll=original();
  await f.apply();
  const nextRequest={...f.request,basis:f.basis(),draft:{...f.request.draft,rollSnapshot:structuredClone(f.sourceFlags.roll)}};
  await assert.rejects(f.api.applyDebtReroll(f.actor,{...f.message,id:"request2"},nextRequest,f.basis(),JSON.stringify(nextRequest)),/already been used/);
  assert.equal(f.rolls,1);
});

test("lost reservation acknowledgement never pays or rolls twice; DA can recover retained dice",async()=>{
  const f=await fixture({failWrite:1});
  await assert.rejects(f.apply(),/acknowledgement lost/);
  assert.equal(f.rolls,0);assert.equal(f.actor.system.health.value,9);
  await assert.rejects(f.apply(),/may already have rolled/);
  const draft={kind:"debt-result",debtOperationId:"request1",retained:[1,1,1]};
  const request={actorUuid:f.actor.uuid,basis:f.basis(),draft};
  await assert.rejects(f.api.applyDebtReroll(f.actor,{id:"recover",author:{id:"owner"}},request,f.basis(),JSON.stringify(request)),/Only the DA/);
  const message={id:"recover",author:f.gm,update:async()=>{}};
  await f.api.applyDebtReroll(f.actor,message,request,f.basis(),JSON.stringify(request));
  assert.equal(f.rolls,0);assert.equal(f.actor.system.health.value,9);
  assert.equal(f.sourceFlags.roll.natural,"fumble");assert.deepEqual(f.source.rolls,[]);
  await f.api.applyDebtReroll(f.actor,message,request,f.basis(),JSON.stringify(request));
  const edited={...request,draft:{...draft,retained:[6,6,6]}};
  await assert.rejects(f.api.applyDebtReroll(f.actor,message,edited,f.basis(),JSON.stringify(edited)),/completed Debt request changed/);
});

test("saved replacement survives lost final acknowledgement and failed chat presentation without another roll",async()=>{
  for(const options of [{failWrite:2},{failPresent:true}]){
    const f=await fixture(options);
    await assert.rejects(f.apply(),/acknowledgement lost|chat update failed/);
    assert.equal(f.flags.debtRerolls.request1.status,"resolved");
    await f.apply();
    assert.equal(f.rolls,1);assert.equal(f.actor.system.health.value,9);
    assert.equal(f.sourceFlags.roll.natural,"critical");
  }
});

test("native interruption and source edits preserve saved payment/result without silently replaying dice",async()=>{
  const f=await fixture({failRoll:true});
  await assert.rejects(f.apply(),/native dice interrupted/);
  await assert.rejects(f.apply(),/may already have rolled/);
  assert.equal(f.rolls,1);assert.equal(f.actor.system.health.value,9);
  const edited=await fixture();edited.sourceFlags.roll.attribute=2;
  await assert.rejects(edited.apply(),/pool changed/);assert.equal(edited.writes,0);
});

test("dawn only unlocks recovery; Debt preserves survival history and Grit never lowers corrected HP",()=>{
  const debtAccounting={unavailableHp:1,debtUsed:true};
  const state={...survivalState({hp:10,maxHp:20,wounds:3,gritAvailable:1,ownTurn:5,recovery:debtAccounting}),due:5,choice:{kind:"roll",turn:4,resolved:true}};
  const actor={type:"character",getFlag:(_id,key)=>key==="development"?{creation:{traitIds:["trait-oath-bound-the-debt-comes-due"]}}:undefined};
  const basis={hp:10,maxHp:20,recovery:debtAccounting,survival:state,gritAvailable:1};
  const dawn=recoveryPreview(actor,basis,{kind:"dawn"});
  assert.equal(dawn.after,10);assert.deepEqual(dawn.state,{...state,recovery:{unavailableHp:0,debtUsed:false}});
  const payment=recoveryPreview(actor,{...basis,recovery:{unavailableHp:0,debtUsed:false},survival:{...state,recovery:{unavailableHp:0,debtUsed:false}}},{kind:"debt"});
  assert.deepEqual(payment.state,{...state,hp:9});
  const high={...basis,hp:20,survival:{...state,hp:20}};
  assert.equal(recoveryPreview(actor,high,{kind:"grit"}).after,20);
  assert.equal(recoveryPreview(actor,high,{kind:"breath"}).after,20);
  assert.equal(recoveryPreview(actor,high,{kind:"heal",amount:6,lifeResistance:0}).after,20);
  const dying=survivalState({hp:0,maxHp:20,gritAvailable:1,recovery:debtAccounting});
  assert.equal(resolveSurvival(chooseSurvival(startSurvivalTurn(dying,1),"grit")).hp,19);
  assert.equal(receiveHealing({...state,hp:18},20).hp,19);
  assert.equal(safeBreath({...state,hp:18}).hp,19);
});

test("portable-to-native bridge preserves recovery accounting beside live HP and wound survival state",()=>{
  const recovery={unavailableHp:1,debtUsed:true};
  const changes=importedCharacterState({play:{hp:9,recovery,gritSpent:1,wounds:[{id:"scar"}]}},{summary:{maximumHp:20,gritGranted:2}},[]);
  assert.deepEqual(changes["system.recovery"],recovery);
  assert.equal(changes[`flags.${ID}.survival`].hp,9);
  assert.equal(changes[`flags.${ID}.survival`].wounds,1);
  assert.equal(changes[`flags.${ID}.survival`].gritAvailable,1);
  assert.deepEqual(changes[`flags.${ID}.survival`].recovery,recovery);
});
