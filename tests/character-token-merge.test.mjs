import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCharacterTokenCopies} from '../src/rules/character-token-merge.mjs';
const base=()=>({name:'Hero',img:'hero.webp',system:{biography:'',memorizedMessage:''},items:[{_id:'sword',name:'Sword',system:{description:'Original'}}],effects:[],flags:{}});
test('different fields of the same embedded item merge without losing either token edit',()=>{
 const actor=base(),a=structuredClone(actor),b=structuredClone(actor);a.items[0].name='Excalibur';b.items[0].system.description='The lake blade';b.system.biography='A legend';const plan=mergeCharacterTokenCopies(actor,[{uuid:'a',data:a},{uuid:'b',data:b}]);assert.deepEqual(plan.conflicts,[]);assert.equal(plan.data.items[0].name,'Excalibur');assert.equal(plan.data.items[0].system.description,'The lake blade');assert.equal(plan.data.system.biography,'A legend');assert.equal(actor.items[0].name,'Sword');
});
test('contradictory values require a preference while unrelated changes survive either choice',()=>{
 const actor=base(),a=structuredClone(actor),b=structuredClone(actor);a.system.biography='A';b.system.biography='B';a.system.memorizedMessage='Keep me';const copies=[{uuid:'a',data:a},{uuid:'b',data:b}];assert.equal(mergeCharacterTokenCopies(actor,copies).conflicts.length,1);assert.equal(mergeCharacterTokenCopies(actor,copies,'a').data.system.biography,'A');assert.equal(mergeCharacterTokenCopies(actor,copies,'b').data.system.biography,'B');assert.equal(mergeCharacterTokenCopies(actor,copies,'b').data.system.memorizedMessage,'Keep me');
});
test('embedded removal conflicts with an edit but not with a different item addition',()=>{
 const actor=base(),a=structuredClone(actor),b=structuredClone(actor);a.items=[];b.items[0].name='Excalibur';assert(mergeCharacterTokenCopies(actor,[{uuid:'a',data:a},{uuid:'b',data:b}]).conflicts.length);assert.deepEqual(mergeCharacterTokenCopies(actor,[{uuid:'a',data:a},{uuid:'b',data:b}],'b').data.items,b.items);b.items=actor.items.concat({_id:'pack',name:'Pack'});const plan=mergeCharacterTokenCopies(actor,[{uuid:'a',data:a},{uuid:'b',data:b}]);assert.deepEqual(plan.conflicts,[]);assert.deepEqual(plan.data.items.map(i=>i._id),['pack']);
});
