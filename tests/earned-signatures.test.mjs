import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {changeCharacterLevel,refundLearnedAbility} from '../src/rules/development.mjs';
import {signatureChoicePreview,advancementPreview} from '../src/rules/advancement.mjs';
import {signatureTierState,earnedSignatureTiers,pendingSignatureTiers} from '../src/rules/signatures.mjs';
const choices=JSON.parse(await readFile(new URL('../static/data/choices.json',import.meta.url))).records;
const inventory=JSON.parse(await readFile(new URL('../static/data/inventory.json',import.meta.url)));
const cls=choices.find(choice=>choice.id==='class-shadow'),sig=(level,index=0)=>cls.signatures[level][index];
const state=()=>({level:2,stage:'advancement',dp:10,classId:cls.id,ranks:{},abilities:[sig(1)],purchases:[],recipes:[],capabilities:[],compatibleRecipes:[],items:[],acquisitionReceipts:[],gritGranted:2,gritSpent:1,languages:[],creation:{signatureId:sig(1)},ledger:[]});
function select(current,level,id=sig(level)) {const result=signatureChoicePreview(current,{level,id},choices,inventory);assert(result.valid,JSON.stringify(result.errors));return {...result.state,ledger:[...(current.ledger??[]),...result.ledger]};}
test('the real Add level rule unlocks level 3/7 choices without fixture markers or extra resource grants',()=>{
 let current=state(),before=structuredClone(current);current=changeCharacterLevel(current,1).state;assert.deepEqual(current.pendingSignatures,[3]);assert.equal(current.gritGranted,2);assert.equal(current.gritSpent,1);assert.equal(current.dp,21);assert(signatureTierState(current,3,choices).pending);current=select(current,3);for(let level=4;level<=7;level++)current=changeCharacterLevel(current,1).state;assert(signatureTierState(current,7,choices).pending);current=select(current,7);assert.deepEqual(pendingSignatureTiers(current,choices),[]);assert.deepEqual(before,state());
});
test('legacy level-7 Shadow with no marker can choose missing signatures while a paid alternative stays paid',()=>{
 const current={...state(),level:7,purchases:[{id:sig(3,2),cost:4,level:3}],abilities:[sig(1),sig(3,2)],ledger:[{kind:'purchase',id:sig(3,2),delta:-4,level:3}]};assert.deepEqual(earnedSignatureTiers(current,choices),[1,3,7]);assert.deepEqual(pendingSignatureTiers(current,choices),[3,7]);assert.equal(signatureTierState(current,3,choices).selectedId,null);const chosen=select(current,3);assert(chosen.abilities.includes(sig(3,2)));assert(chosen.abilities.includes(sig(3)));assert.equal(chosen.dp,current.dp);assert.deepEqual(chosen.purchases,current.purchases);
});
test('switching a free slot to a paid alternative and back preserves DP, purchases and once-only acquisition receipts',()=>{
 let current={...state(),level:7,purchases:[{id:sig(3,2),cost:4,level:3}],abilities:[sig(1),sig(3,2)],ledger:[{kind:'purchase',id:sig(3,2),delta:-4,level:3}]};current=select(current,3);const receiptCount=current.acquisitionReceipts.length,paid=structuredClone(current.purchases);current=select(current,3,sig(3,2));assert(!current.abilities.includes(sig(3)));assert(current.abilities.includes(sig(3,2)));assert.equal(current.ledger.at(-1).kind,'signature-switch');current=select(current,3,sig(3));assert(current.abilities.includes(sig(3)));assert(current.abilities.includes(sig(3,2)));assert.equal(current.dp,10);assert.deepEqual(current.purchases,paid);assert.equal(current.acquisitionReceipts.length,receiptCount);
});
test('level 1 switches update the current creation choice while retiring only the old free ability',()=>{
 let current={...state(),ledger:[{kind:'ability-grant',id:sig(1),sourceId:cls.id}]};const result=signatureChoicePreview(current,{level:1,id:sig(1,1)},choices,inventory);assert(result.valid);assert.equal(result.state.creation.signatureId,sig(1,1));assert.deepEqual(result.signature.removeAbilityIds,[sig(1)]);assert(!result.state.abilities.includes(sig(1)));assert(result.state.abilities.includes(sig(1,1)));assert.equal(current.creation.signatureId,sig(1));
});
test('level reduction and re-add keep the chosen slot rather than awarding it twice',()=>{
 let current=select({...state(),level:3},3);current=changeCharacterLevel(current,-1).state;assert.equal(signatureTierState(current,3,choices).earned,false);current=changeCharacterLevel(current,1).state;assert.equal(signatureTierState(current,3,choices).pending,false);assert.equal(signatureTierState(current,3,choices).selectedId,sig(3));const repeated=signatureChoicePreview(current,{level:3,id:sig(3)},choices,inventory);assert(repeated.valid);assert(repeated.signature.unchanged);assert.deepEqual(repeated.ledger,[]);assert.equal(repeated.state.abilities.filter(id=>id===sig(3)).length,1);
});
test('refunds do not retain a switched-out historical free grant or remove the active paid/free signature',()=>{
 let current={...state(),level:3,abilities:[sig(1),sig(3),sig(3,1)],purchases:[{id:sig(3),cost:4,level:3},{id:sig(3,1),cost:4,level:3}],ledger:[{kind:'signature-grant',id:sig(3),level:3,delta:0},{kind:'purchase',id:sig(3),level:3,delta:-4},{kind:'purchase',id:sig(3,1),level:3,delta:-4}]};current=select(current,3,sig(3,1));const oldRefund=refundLearnedAbility(current,sig(3));assert(!oldRefund.abilities.includes(sig(3)));assert(oldRefund.abilities.includes(sig(3,1)));const activeRefund=refundLearnedAbility(oldRefund,sig(3,1));assert(activeRefund.abilities.includes(sig(3,1)));assert.equal(activeRefund.dp,current.dp+8);
});
test('ambiguous legacy free copies are not guessed or deleted and foreign/locked choices remain invalid',()=>{
 const current={...state(),level:7,abilities:[sig(1),sig(3),sig(3,1)]};assert(signatureTierState(current,3,choices).ambiguous);const result=signatureChoicePreview(current,{level:3,id:sig(3,2)},choices,inventory);assert(!result.valid);assert.deepEqual(result.state,current);assert(!signatureChoicePreview(state(),{level:7,id:sig(7)},choices,inventory).valid);assert(!signatureChoicePreview({...state(),level:7},{level:3,id:'ability-basic-melee'},choices,inventory).valid);
});

test('ambiguous legacy choice requires an explicitly owned nonpaid previous signature and retains other owned choices',()=>{
 const current={...state(),level:7,abilities:[sig(1),sig(3),sig(3,1)]};const result=signatureChoicePreview(current,{level:3,id:sig(3,2),previousId:sig(3)},choices,inventory);assert(result.valid);assert.equal(result.signature.previousId,sig(3));assert.deepEqual(result.signature.removeAbilityIds,[sig(3)]);assert(result.state.abilities.includes(sig(3,1)));assert(result.state.abilities.includes(sig(3,2)));assert(!result.state.abilities.includes(sig(3)));const recorded=signatureChoicePreview(current,{level:3,id:sig(3),previousId:sig(3)},choices,inventory);assert(recorded.valid);assert.equal(recorded.signature.unchanged,false);assert.equal(recorded.state.signatureChoices[3],sig(3));assert(!signatureChoicePreview(current,{level:3,id:sig(3,2),previousId:sig(7)},choices,inventory).valid);const paid={...current,purchases:[{id:sig(3),cost:4}]};assert(!signatureChoicePreview(paid,{level:3,id:sig(3,2),previousId:sig(3)},choices,inventory).valid);
});
test('a stale pending marker cannot award another free signature through general development',()=>{
 const current={...state(),level:3,abilities:[sig(1),sig(3)],pendingSignatures:[3],signatureChoices:{3:sig(3)}};const result=advancementPreview(current,{purchases:[],signatures:{3:sig(3,1)}},choices,inventory);assert(result.valid);assert.deepEqual(result.state.pendingSignatures,[]);assert(!result.state.abilities.includes(sig(3,1)));assert.deepEqual(result.ledger,[]);
});

test('general development honors an explicitly selected inferred signature without requiring the other inferred tier',()=>{
 const current={...state(),level:7};const chosen=advancementPreview(current,{purchases:[],signatures:{3:sig(3)}},choices,inventory);assert(chosen.valid);assert(chosen.state.abilities.includes(sig(3)));assert.deepEqual(pendingSignatureTiers(chosen.state,choices),[7]);const unrelated=advancementPreview(chosen.state,{purchases:[]},choices,inventory);assert(unrelated.valid);assert(!unrelated.state.abilities.includes(sig(7)));
});
