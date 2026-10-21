import test from "node:test";
import assert from "node:assert/strict";
import {startTurnSelection,reconcileTurnRoster,availableTurnParticipants,selectTurn,finishSelectedTurn} from "../src/rules/encounter.mjs";
import {changeCharacterLevel,refundLearnedAbility,refundableAbilityPurchase,purchaseEligibility} from "../src/rules/development.mjs";
import {advancementPreview} from "../src/rules/advancement.mjs";
const roster=[{id:"hero",side:"players"},{id:"other",side:"players"},{id:"adder",side:"opposition"}];
test("table turn selection tracks acted participants and starts the next round after all finish",()=>{
 const initial=startTurnSelection(roster);assert.equal(initial.opening,undefined);assert.equal(initial.budgets,undefined);
 let state=selectTurn(initial,"adder");assert.deepEqual(availableTurnParticipants(state),[]);assert.throws(()=>selectTurn(state,"hero"),/Finish/);
 state=finishSelectedTurn(state);assert.deepEqual(availableTurnParticipants(state).map(p=>p.id),["hero","other"]);assert.throws(()=>selectTurn(state,"adder"),/not acted/);
 state=finishSelectedTurn(selectTurn(state,"hero"));assert.equal(state.round,1);assert.deepEqual(state.acted,["adder","hero"]);
 state=finishSelectedTurn(selectTurn(state,"other"));assert.equal(state.round,2);assert.equal(state.current,null);assert.deepEqual(state.acted,[]);assert.equal(state.serial,3);
 assert.equal(initial.current,null);assert.equal(initial.round,1);
});
test("earlier encounter snapshots retain round participation while shedding side/action restrictions",()=>{
 const old={...startTurnSelection(roster),schemaVersion:1,acted:["hero"],nextSide:"opposition",startingSide:"opposition",budgets:{hero:{remaining:{main:0}}},opening:{total:3}};
 const state=selectTurn(old,"other");assert.equal(state.current,"other");assert.deepEqual(state.acted,["hero"]);for(const key of ["budgets","nextSide","startingSide","opening"])assert.equal(state[key],undefined);
 assert.equal(old.budgets.hero.remaining.main,0);
});
test("Add and Remove level adjust canonical DP only, permit debt, preserve learned choices/resources",()=>{
 const initial={level:2,dp:3,abilities:["paid"],ranks:{craft:2},gritGranted:3,gritSpent:2,pendingSignatures:[3]};
 const add=changeCharacterLevel(initial,1);assert.equal(add.state.level,3);assert.equal(add.state.dp,14);assert.equal(add.delta,11);assert.equal(add.state.gritGranted,3);assert.deepEqual(add.state.pendingSignatures,[3]);
 const remove=changeCharacterLevel(initial,-1);assert.equal(remove.state.level,1);assert.equal(remove.state.dp,-7);assert.deepEqual(remove.state.abilities,["paid"]);assert.equal(initial.dp,3);assert.throws(()=>changeCharacterLevel(remove.state,-1),/level 1/);
});
test("negative DP is a repairable validation state and paid ability refund is exact/once",()=>{
 const initial={level:1,stage:"advancement",dp:-4,purchases:[],abilities:["paid","grant"],recipes:[],capabilities:[],compatibleRecipes:[],items:[],ranks:{},ledger:[{kind:"purchase",sourceId:"paid",delta:-5}]};
 const preview=advancementPreview(initial,{purchases:[]},[],{acquisitions:[],recipes:[]});assert.equal(preview.valid,false);assert.match(preview.errors[0].text,/Overspent by 4/);
 const next=refundLearnedAbility(initial,"paid");assert.equal(next.dp,1);assert.deepEqual(next.abilities,["grant"]);assert.equal(refundableAbilityPurchase(next,"paid"),null);assert.throws(()=>refundLearnedAbility(next,"paid"),/not learned/);assert.throws(()=>refundLearnedAbility(initial,"grant"),/granted/);
 const eligibility=purchaseEligibility({id:"new",kind:"ability",cost:1,minimumLevel:1,requirements:[]},initial,[]);assert.equal(eligibility.eligible,false);assert(eligibility.reasons.some(reason=>reason.code==="dp"));
});
test("repeatable ability refunds retain other paid purchases until each is explicitly removed",()=>{
 const state={level:3,dp:-3,abilities:["repeat"],purchases:[{id:"repeat",level:1},{id:"repeat",level:2}],ledger:[{kind:"purchase",id:"repeat",delta:-2},{kind:"purchase",id:"repeat",delta:-2}]};
 const first=refundLearnedAbility(state,"repeat");assert.equal(first.dp,-1);assert.deepEqual(first.abilities,["repeat"]);assert.equal(first.purchases.length,1);
 const second=refundLearnedAbility(first,"repeat");assert.equal(second.dp,1);assert.deepEqual(second.abilities,[]);assert.equal(second.purchases.length,0);
});

test("removing the last unacted or current participant releases a new round once without mutating previews",()=>{
 const initial=startTurnSelection(roster.slice(0,2));
 const aFinished=finishSelectedTurn(selectTurn(initial,"hero"));
 for(const saved of [aFinished,selectTurn(aFinished,"other")]){
  const reconciled=reconcileTurnRoster(saved,roster.slice(0,1));
  assert.equal(reconciled.round,2);assert.equal(reconciled.current,null);assert.deepEqual(reconciled.acted,[]);assert.deepEqual(availableTurnParticipants(reconciled).map(p=>p.id),["hero"]);
  assert.equal(reconcileTurnRoster(saved,roster.slice(0,1)).round,2);assert.equal(saved.round,1);
  assert.equal(reconcileTurnRoster(reconciled,roster.slice(0,1)).round,2);
  assert.equal(selectTurn(reconciled,"hero").current,"hero");
 }
 const inProgress=selectTurn(initial,"hero"),preserved=reconcileTurnRoster(inProgress,roster.slice(0,1));assert.equal(preserved.current,"hero");assert.equal(preserved.round,1);
 const empty=reconcileTurnRoster(aFinished,[]);assert.equal(empty.round,1);assert.equal(empty.current,null);assert.deepEqual(empty.roster,[]);
});
