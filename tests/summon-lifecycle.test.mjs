import test from "node:test";
import assert from "node:assert/strict";
import {summonTurnKey,recordSummonCommand,expireUncommandedSummon} from "../src/rules/summon-lifecycle.mjs";
import {summonDocument} from "../src/services/summon-lifecycle.mjs";
const command = (operationId,turnKey,register=false) => ({controllerUuid:"Actor.summoner",turnKey,operationId,register});
test("initial free command persists across reload; replay cannot renew it",()=>{
  const initial=recordSummonCommand(null,command("create","turn1",true));
  const saved=JSON.parse(JSON.stringify(initial));
  assert.equal(recordSummonCommand(saved,command("create","turn1",true)),saved);
  assert.throws(()=>recordSummonCommand(saved,command("create","turn2",true)),/receipt changed/);
  assert.throws(()=>recordSummonCommand(saved,command("new","turn2",true)),/already registered/);
  assert.throws(()=>recordSummonCommand(saved,command("extra","turn1")),/one command/);
  assert.equal(recordSummonCommand(saved,command("paid","turn2")).commandTurn,"turn2");
});
test("expiry separates controllers and multiple summons; repeated settlement is inert",()=>{
 const first=recordSummonCommand(null,command("one","turn1",true));
 const second=recordSummonCommand(null,command("two","turn2",true));
 assert.equal(expireUncommandedSummon(first,"other","turn2"),first);
 assert.equal(expireUncommandedSummon(second,"Actor.summoner","turn2"),second);
 const expired=expireUncommandedSummon(first,"Actor.summoner","turn2");
 assert.equal(expired.expired,true);
 assert.equal(expireUncommandedSummon(expired,"Actor.summoner","turn2"),expired);
 assert.throws(()=>recordSummonCommand(expired,command("three","turn3")),/disappeared/);
});
test("controller and encounter identity must be explicit",()=>{
 assert.throws(()=>summonTurnKey("Combat.one",{serial:1}),/Choose/);
 assert.notEqual(summonTurnKey("Combat.one",{serial:1,current:"pc"}),summonTurnKey("Combat.two",{serial:1,current:"pc"}));
 const state=recordSummonCommand(null,command("one","turn1",true));
 assert.throws(()=>recordSummonCommand(state,{...command("two","turn2"),controllerUuid:"Actor.other"}),/another controller/);
});
test("unlinked lifecycle storage stays on durable TokenDocument",()=>{
 const token={actorLink:false,uuid:"Scene.one.Token.one"};
 const actor={isToken:true,token,uuid:"Scene.one.Token.one.Actor.base"};
 assert.equal(summonDocument(actor),token);
 const base={isToken:false,token}; assert.equal(summonDocument(base),base);
});

test("authoritative Finish persists synthetic expiry and resumes interrupted hiding",async()=>{
 const {enqueueCharacterOperation}=await import("../src/services/authority.mjs");
 const {settleSummonExpiry}=await import("../src/services/summon-lifecycle.mjs");
 const prior=globalThis.game;
 let hideFails=true, writes=0;
 const lifecycle=recordSummonCommand(null,command("created","old",true));
 const profile={record:{id:"profile"},lifecycle};
 const token={uuid:"Scene.test.Token.summon",actorLink:false,hidden:false,getFlag:()=>profile,
   async update(changes){writes++;if(changes.hidden){if(hideFails){hideFails=false;throw new Error("interrupted");}this.hidden=true;}else Object.assign(profile,changes["flags.heroes-of-legend.summon"]);}};
 const actor={isToken:true,token,getFlag:()=>null}; token.actor=actor;
 globalThis.game={user:{isGM:true},actors:{contents:[]},scenes:{contents:[{tokens:{contents:[token]}}]}};
 const combat={uuid:"Combat.test"},controller={uuid:"Actor.summoner"},state={current:"summoner",serial:2};
 try {
   await assert.rejects(enqueueCharacterOperation(()=>settleSummonExpiry(combat,controller,state)),/interrupted/);
   assert.equal(profile.lifecycle.expired,true); assert.equal(token.hidden,false);
   await enqueueCharacterOperation(()=>settleSummonExpiry(combat,controller,state));
   assert.equal(token.hidden,true); assert.equal(writes,3);
   await enqueueCharacterOperation(()=>settleSummonExpiry(combat,controller,state));
   assert.equal(writes,3);
 } finally {globalThis.game=prior;}
});

test("durable token lifecycle overrides inherited base summon profile",async()=>{
 const {summonState}=await import("../src/rules/summon-profile.mjs");
 const inherited={record:{id:"base"}}, durable={record:{id:"token"},lifecycle:{expired:true}};
 const actor={isToken:true,getFlag:()=>inherited,token:{actorLink:false,getFlag:()=>durable}};
 assert.equal(summonState(actor),durable);
 actor.token.actorLink=true;
 assert.equal(summonState(actor),inherited);
});

test("command relay checks author ownership of both summon and controller",async()=>{
 const {resolveSummonCommand}=await import("../src/services/summon-lifecycle.mjs");
 const previousGame=globalThis.game, previousResolver=globalThis.fromUuid;
 const profile={record:{id:"test"}};
 const actor={getFlag:()=>profile,testUserPermission:()=>true};
 const controller={testUserPermission:()=>false};
 globalThis.game={user:{isGM:true},messages:{get:()=>null}};
 globalThis.fromUuid=async uuid=>({summon:actor,controller,combat:{}}[uuid]);
 const message={id:"request",author:{isGM:false},getFlag:()=>({actorUuid:"summon",controllerUuid:"controller",combatUuid:"combat",register:true})};
 try {await assert.rejects(resolveSummonCommand(message),/Own both/);}
 finally {globalThis.game=previousGame;globalThis.fromUuid=previousResolver;}
});

test("expired summons cannot start generic rolls or either creature attack declaration",async()=>{
 const {rollBasis}=await import("../src/services/roll-preparation.mjs");
 const {declareNpcMelee,declareCreatureAction}=await import("../src/services/npc-attacks.mjs");
 const actor={getFlag:()=>({record:{id:"summon"},lifecycle:{expired:true}})};
 assert.throws(()=>rollBasis(actor,"brawn"),/disappeared/);
 await assert.rejects(declareNpcMelee(actor),/disappeared/);
 await assert.rejects(declareCreatureAction(actor,"attack"),/disappeared/);
});
