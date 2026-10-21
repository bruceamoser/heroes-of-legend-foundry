import test from 'node:test';
import assert from 'node:assert/strict';
import {outcomeEffects} from '../src/rules/outcome-effects.mjs';
import {incomingOutcome} from '../src/rules/creature-actions.mjs';
import {rangedAmmunition} from '../src/services/ranged-ammunition.mjs';

test('Adder standard defense resolves fixed damage and Poisoned together',()=>{
 const result=incomingOutcome({resolution:'reference',attributeKey:'agility',effect:'',referenceMarkdown:'**Damage type:** physical.',outcomes:{weak:'2 + Poisoned 2',standard:'1 + Poisoned 1',strong:'1'}},'standard');
 assert.equal(result.resolution,'effects');assert.deepEqual(result.components,[{type:'physical',amount:1}]);assert.deepEqual(result.conditions,[{key:'poisoned',rating:1}]);
});
test('elemental and condition-only outcomes preserve printed type; conditional or invented damage stays manual',()=>{
 assert.deepEqual(outcomeEffects('3 fire damage + Burning 2'),{components:[{type:'fire',amount:3}],conditions:[{key:'burning',rating:2}]});
 assert.deepEqual(outcomeEffects('Prone'),{components:[],conditions:[{key:'prone',rating:1}]});
 for(const text of ['If the target moves, 2 physical damage.','2 + Poisoned 1 for two turns','Deal double damage','3 venom damage','3 fire damage or Slowed 1'])assert.equal(outcomeEffects(text),null);
});
test('ranged weapon requires its exact assigned available ammunition stack',()=>{
 const weapon={id:'bow',name:'Bow',type:'equipment',system:{catalogId:'item-ordinary-ranged-weapon',quantity:1,held:true},getFlag:()=>ammoId};
 const ammo={id:'arrows',type:'equipment',system:{catalogId:'item-ammunition-bundle',quantity:1,inventoryDie:8}};let ammoId;
 const actor={items:[weapon,ammo]};actor.items.get=id=>actor.items.find(item=>item.id===id);
 assert.throws(()=>rangedAmmunition(actor),/Assign ammunition to Bow/);ammoId='arrows';assert.equal(rangedAmmunition(actor).ammo,ammo);
 ammo.system.inventoryDie=0;assert.throws(()=>rangedAmmunition(actor),/Assign ammunition/);
});
