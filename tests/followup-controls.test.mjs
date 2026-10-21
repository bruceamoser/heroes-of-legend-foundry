import test from 'node:test';
import assert from 'node:assert/strict';
import {syncCreatureDeath} from '../src/services/creature-death.mjs';
import {movementBandColor,MOVEMENT_COLORS} from '../src/services/native-movement.mjs';
test('native movement colors preserve inclusive Speed and double-Speed boundaries',()=>{
 for(const cost of [0,5,6])assert.equal(movementBandColor(cost,6),MOVEMENT_COLORS.normal);
 for(const cost of [7,12])assert.equal(movementBandColor(cost,6),MOVEMENT_COLORS.double);
 assert.equal(movementBandColor(13,6),MOVEMENT_COLORS.excess);
});
test('zero-HP creature gains native Dead once; healing removes only the automatic status',async()=>{
 globalThis.game={user:{id:'gm'}};globalThis.CONFIG={specialStatusEffects:{DEFEATED:'dead'}};globalThis.CONST={ACTIVE_EFFECT_SHOW_ICON:{ALWAYS:2}};
 const data=[];let created=0;
 const actor={uuid:'Actor.monster',type:'creature',system:{health:{value:0}},testUserPermission:()=>true,get effects(){return data;},get statuses(){return new Set(data.flatMap(e=>e.statuses));},async createEmbeddedDocuments(type,rows){created++;data.push(...rows.map((r,i)=>({...r,id:String(i),getFlag:(_,key)=>r.flags?.['heroes-of-legend']?.[key]})));},async deleteEmbeddedDocuments(type,ids){for(const id of ids)data.splice(data.findIndex(e=>e.id===id),1);}};
 await Promise.all([syncCreatureDeath(actor),syncCreatureDeath(actor)]);assert.equal(created,1);assert(actor.statuses.has('dead'));
 actor.system.health.value=3;await syncCreatureDeath(actor);assert.equal(data.length,0);
 data.push({id:'manual',statuses:['dead'],getFlag:()=>false});await syncCreatureDeath(actor);assert.equal(data.length,1);
});
