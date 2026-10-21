import test from "node:test";
import assert from "node:assert/strict";
import {recoveryPreview} from "../src/services/recovery.mjs";
import {spendParticipantBudget} from "../src/services/turn-budget.mjs";
import {startTurn} from "../src/rules/actions.mjs";
test("inline manual HP edits preserve wounds and Grit and reconcile all survival states",()=>{
 const actor={type:"character"};
 const state={hp:0,maxHp:15,marks:2,wounds:4,gritAvailable:1,ownTurn:3,due:null,choice:null,status:"dying"};
 const basis={hp:0,maxHp:15,gritAvailable:1,survival:state};
 const healed=recoveryPreview(actor,basis,{kind:"setHp",hp:7});
 assert.equal(healed.after,7);assert.equal(healed.state.status,"active");assert.equal(healed.state.marks,0);assert.equal(healed.state.wounds,4);assert.equal(healed.state.gritAvailable,1);
 assert.deepEqual(recoveryPreview(actor,basis,{kind:"setHp",hp:0}).state,state);
 const down=recoveryPreview(actor,{...basis,hp:7,survival:healed.state},{kind:"setHp",hp:0});assert.equal(down.state.status,"dying");assert.equal(down.state.wounds,4);
 const lastWords={...state,status:"lastWords",marks:3,lastWordsAt:2,lastWordsEnds:4};
 assert.deepEqual(recoveryPreview(actor,{...basis,survival:lastWords},{kind:"setHp",hp:0}).state,lastWords);
 const returned=recoveryPreview(actor,{...basis,survival:lastWords},{kind:"setHp",hp:1});assert.equal(returned.state.status,"active");assert.equal(returned.state.lastWordsAt,undefined);
 for(const hp of [-1,16,1.5])assert.throws(()=>recoveryPreview(actor,basis,{kind:"setHp",hp}),/whole number/);
});
test("native tracker manual spend uses existing action arithmetic and preserves source state",()=>{
 const actor={effects:[],system:{health:{value:10}}};
 const combat={combatants:new Map([["hero",{actor}]])};
 const state={current:"hero",revision:1,round:1,history:[],budgets:{hero:startTurn({turnId:"test",speed:6})}};
 const spent=spendParticipantBudget(combat,state,{id:"hero",category:"main"},{},"main1");assert.equal(spent.budgets.hero.remaining.main,0);assert.equal(state.budgets.hero.remaining.main,1);
 const moved=spendParticipantBudget(combat,spent,{id:"hero",category:"movement"},{},"move1");assert.equal(moved.budgets.hero.movementSpent,1);assert.equal(moved.revision,3);
 const replay=spendParticipantBudget(combat,moved,{id:"hero",category:"movement"},{},"move1");assert.equal(replay.budgets.hero.movementSpent,1);
 assert.throws(()=>spendParticipantBudget(combat,state,{id:"other",category:"main"},{},"bad"),/active participant/);
 assert.throws(()=>spendParticipantBudget(combat,state,{id:"hero",category:"free"},{},"bad"),/Choose Main/);
});
test("encounter presentation shows available actors without side or action tracking and preserves hidden actors",async()=>{
 const previousFoundry=globalThis.foundry,previousGame=globalThis.game,previousUI=globalThis.ui;
 globalThis.foundry={applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}};globalThis.game={user:{isGM:false}};
 try{
  const {EncounterPanel}=await import("../src/applications/encounter.mjs");
  const {WoundPanel}=await import("../src/applications/wounds.mjs");const wounds=Object.create(WoundPanel.prototype);wounds.skipped=[];wounds.actor={name:"Hero",isOwner:true,testUserPermission:()=>true,getFlag:(namespace,key)=>key==="wounds"?{event:{eventId:"event",injury:"Scar",recoveryValue:2,recoveryProgress:2}}:{},effects:[{name:"Persistent active consequence",active:true,getFlag:(namespace,key)=>key==="woundEvent"?"event":false},{name:"Resolved consequence",active:false,getFlag:()=>"event"}]};const woundContext=await wounds._prepareContext();assert.equal(woundContext.wounds[0].effectSummary,"Persistent active consequence");assert.equal(woundContext.wounds[0].canTreat,false);
  const {RecoveryPanel}=await import("../src/applications/recovery.mjs");const recovery=Object.create(RecoveryPanel.prototype);recovery.element={querySelector:selector=>({"[name=kind]":{value:"correct"},"[name=hp]":{value:"  "},"[name=amount]":{value:"6"}}[selector]??null)};assert.ok(Number.isNaN(recovery.draft().hp));assert.equal(recovery.draft().amount,6);
  const combatants=[{id:"visible",name:"Visible",actor:{system:{health:{value:0}},testUserPermission:()=>true},getFlag:()=>"opposition"},{id:"private",name:"Private",actor:{system:{health:{value:17}},testUserPermission:()=>false},getFlag:()=>"players"},{id:"hidden",name:"Hidden",hidden:true,getFlag:()=>"players"}];
  const state={round:1,nextSide:"players",startingSide:"players",roster:[{id:"visible",side:"players",eligibleRound:1},{id:"private",side:"players",eligibleRound:1},{id:"hidden",side:"players",eligibleRound:1}],acted:[]};
  const collection={get:id=>combatants.find(c=>c.id===id),filter:predicate=>combatants.filter(predicate)};
  const app=Object.create(EncounterPanel.prototype);app.combat={combatants:collection,getFlag:()=>state};
  const context=await app._prepareContext();assert.deepEqual(context.participants.map(p=>p.id),["visible","private"]);assert.equal(context.currentName,"Choose a turn");assert.equal(context.canFinish,false);assert.equal(context.budgets,undefined);
  state.current="visible";const active=await app._prepareContext();assert.equal(active.currentName,"Visible’s turn");assert(active.participants.every(participant=>!participant.canChoose));

 }finally{globalThis.foundry=previousFoundry;globalThis.game=previousGame;globalThis.ui=previousUI;}
});

test("recovery uses manually corrected HP without demanding survival reconciliation",()=>{
 const actor={type:"character",getFlag:()=>null};
 const old={hp:5,maxHp:15,gritAvailable:2,wounds:1,marks:0,ownTurn:0,status:"active",due:null,choice:null};
 const basis={hp:0,maxHp:15,gritAvailable:2,survival:old,passiveDefenses:{resistances:[]}};
 const healed=recoveryPreview(actor,basis,{kind:"heal",amount:3,lifeResistance:0});
 assert.equal(healed.after,3);assert.equal(healed.state.status,"active");assert.equal(healed.state.wounds,1);
 const corrected=recoveryPreview(actor,{...basis,hp:7,survival:{...old,hp:0,status:"dying",marks:2}},{kind:"heal",amount:2,lifeResistance:0});
 assert.equal(corrected.after,9);assert.equal(corrected.state.marks,0);assert.equal(old.hp,5);
});
