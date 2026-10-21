import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEquipment,equipmentBasis} from '../src/services/equipment.mjs';
import {depleteOwnedSupply,supplyResultState} from '../src/services/inventory.mjs';
const ID='heroes-of-legend';
function fixture(owner=true){
 const flags={},source=[{_id:'sword',name:'Excalibur',type:'equipment',system:{catalogId:'item-ordinary-melee-weapon',description:'A blade of legend.',hands:2,held:false,worn:false,carried:true,quantity:1,inventoryDie:0}},{_id:'bow',name:'Bow',type:'equipment',system:{hands:2,held:false,worn:false,carried:true,quantity:1,inventoryDie:8}}];let writes=0;
 const actor={uuid:'Actor.table',id:'table',documentName:'Actor',testUserPermission:()=>owner,getFlag:(_,key)=>flags[key],toObject:()=>structuredClone({items:source}),async update(changes){writes++;if(changes.items)source.splice(0,source.length,...structuredClone(changes.items));for(const[k,v]of Object.entries(changes))if(k.startsWith(`flags.${ID}.`))flags[k.slice(`flags.${ID}.`.length)]=v;return actor;}};
 Object.defineProperty(actor,'items',{get(){const items=source.map(s=>({...s,id:s._id,actor,getFlag:()=>null}));items.get=id=>items.find(i=>i.id===id);return items;}});
 globalThis.game={user:{id:'owner'},i18n:{localize:()=> 'No permission'}};
 globalThis.ChatMessage={create(){throw Error('Equipment edits must not post chat');}};
 return {actor,source,get writes(){return writes;}};
}
test('owner arrangement is silent and permits equipment exceeding hand capacity while preserving identity and authored edits',async()=>{
 const f=fixture(),basis=equipmentBasis(f.actor),items=basis.items.map(item=>({...item,held:true}));
 await requestEquipment(f.actor,basis,items,2);
 assert(f.source.every(item=>item.system.held));assert.equal(f.source.reduce((n,item)=>n+item.system.hands,0),4);
 assert.equal(f.source[0].name,'Excalibur');assert.equal(f.source[0].system.description,'A blade of legend.');assert.equal(f.source[0].system.catalogId,'item-ordinary-melee-weapon');assert.equal(f.writes,1);
});
test('equipment permission and document identity remain enforced without hand regulation',async()=>{
 const denied=fixture(false);await assert.rejects(requestEquipment(denied.actor,null,[],2),/owner/);assert.equal(denied.writes,0);
 const f=fixture(),basis=equipmentBasis(f.actor);await assert.rejects(requestEquipment(f.actor,basis,[basis.items[0],basis.items[0]],2),/list changed/);assert.equal(f.writes,0);
});
test('manual depletion is an immediate silent correction preserving item quantity and other edits',async()=>{
 const f=fixture();const result=await depleteOwnedSupply(f.actor,f.actor.items.get('bow'));
 assert.equal(result.changed,true);assert.equal(f.source[1].system.inventoryDie,0);assert.equal(f.source[1].system.quantity,1);assert.equal(f.source[0].name,'Excalibur');
 assert.equal((await depleteOwnedSupply(f.actor,f.actor.items.get('bow'))).changed,false);assert.equal(f.writes,1);
 const denied=fixture(false);await assert.rejects(depleteOwnedSupply(denied.actor,denied.actor.items.get('bow')),/own/);assert.equal(denied.writes,0);
});
test('supply cards distinguish moving down one die size from depletion',()=>{
 assert.equal(supplyResultState({before:8,after:6,exhausted:false}),'Moved down one size · d8 → d6 · Not depleted');
 assert.equal(supplyResultState({before:4,after:0,exhausted:true}),'Moved down one size · d4 → 0 · Depleted');
 assert.equal(supplyResultState({before:8,after:8,exhausted:false}),'Not depleted');
});
