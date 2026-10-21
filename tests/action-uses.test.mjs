import test from 'node:test';
import assert from 'node:assert/strict';
import {actionUses, spendOwnedAction, resetOwnedActions} from '../src/services/action-uses.mjs';
function fixture(owner=true){
 const flags={}, effects=[{_id:'manual',flags:{'heroes-of-legend':{benefit:{manual:true}}}},{_id:'other',flags:{}}];
 globalThis.game={user:{id:'player'},i18n:{localize:()=> 'No permission'}};
 const actor={id:'hero',uuid:'Actor.hero',getFlag:(_,key)=>flags[key],testUserPermission:()=>owner,toObject:()=>({effects}),update:async changes=>{for(const[key,value]of Object.entries(changes)){if(key==='effects'){effects.splice(0,effects.length,...value);continue;}const parts=key.split('.').slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=value;}}};
 return {actor,flags,effects};
}
test('owned action counts without encounter or GM, exact roll replay does not spend again',async()=>{
 const {actor}=fixture();
 await Promise.all([spendOwnedAction(actor,'main',{operationId:'roll1'}),spendOwnedAction(actor,'main',{operationId:'roll1'})]);
 assert.deepEqual(actionUses(actor),{main:1,maneuver:0,reaction:0});
 await spendOwnedAction(actor,'main',{operationId:'roll2'});
 assert.equal(actionUses(actor).main,2);
});
test('reset clears spent actions and only manual defense benefits; old roll cannot respend',async()=>{
 const {actor,effects}=fixture();
 await spendOwnedAction(actor,'reaction',{operationId:'roll'});
 await resetOwnedActions(actor);
 assert.deepEqual(actionUses(actor),{main:0,maneuver:0,reaction:0});
 assert.equal(effects[0].disabled,true);assert.equal(effects[1].disabled,undefined);
 await spendOwnedAction(actor,'reaction',{operationId:'roll'});
 assert.equal(actionUses(actor).reaction,0);
});
test('nonowners cannot spend or reset, passive use does not consume action',async()=>{
 const {actor}=fixture(false);
 await assert.rejects(spendOwnedAction(actor,'main'),/owner/);
 await assert.rejects(resetOwnedActions(actor),/permission/);
 assert.equal((await spendOwnedAction(actor,'passive')).spent,false);
});
