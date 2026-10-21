import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOwnedCondition,actorContributions,requestCondition,resolveConditionRequest} from '../src/services/conditions.mjs';
import {consumeOwnedSupply} from '../src/services/inventory.mjs';
const ID='heroes-of-legend';
function fixture({owner=true,face=1}={}){
 const flags={}, effects=[],items=[{_id:'ammo',name:'Arrows',type:'equipment',system:{quantity:1,inventoryDie:8}}],messages=new Map();messages.find=fn=>[...messages.values()].find(fn);let draws=0,unique=0;
 const actor={id:'hero',uuid:'Actor.hero',documentName:'Actor',name:'Aria',pack:null,testUserPermission:()=>owner,getFlag:(_,key)=>flags[key],validate(){},toObject:()=>structuredClone({effects,items})};
 Object.defineProperty(actor,'effects',{get:()=>{const list=effects.map(data=>({...data,id:data._id,active:!data.disabled,getFlag:(_,key)=>data.flags?.[ID]?.[key]}));list.has=id=>list.some(e=>e.id===id);return list;}});
 Object.defineProperty(actor,'items',{get:()=>({get:id=>{const data=items.find(i=>i._id===id);return data?{...data,id:data._id,uuid:`Actor.hero.Item.${data._id}`,actor}:null;}})});
 actor.update=async changes=>{for(const[key,value]of Object.entries(changes)){if(key==='effects'){effects.splice(0,effects.length,...structuredClone(value));continue;}if(key==='items'){items.splice(0,items.length,...structuredClone(value));continue;}const parts=key.split('.').slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=structuredClone(value);}return actor;};
 globalThis.fromUuid=async()=>actor;
 globalThis.game={user:{id:'player',isGM:false},socket:{id:'client'},messages,i18n:{localize:()=> 'No permission'}};
 globalThis.CONST={ACTIVE_EFFECT_SHOW_ICON:{ALWAYS:2,NEVER:0}};
 globalThis.foundry={utils:{randomID:()=>`id${++unique}`,expandObject:x=>x,escapeHTML:x=>String(x).replaceAll('<','&lt;')},documents:{ActiveEffect:class{validate(){}}},dice:{Roll:class{constructor(formula){this.formula=formula;this.dice=[{results:[{active:true,result:face}]}];}async evaluate(){draws++;return this;}toJSON(){return {formula:this.formula};}static fromData(data){return data;}}}};
 globalThis.ChatMessage={getSpeaker:()=>({actor:actor.id}),create:async data=>{const m={...data,author:game.user,id:`msg${messages.size}`,getFlag:(_,key)=>data.flags?.[ID]?.[key],update:async changes=>Object.assign(m,changes)};messages.set(m.id,m);return m;}};
 return {actor,flags,effects,items,messages,get draws(){return draws;}};
}
test('owned condition applies without source input; replay is idempotent and wrong values rejected',async()=>{
 const f=fixture();await applyOwnedCondition(f.actor,'poisoned',1,{operationId:'attack-poison',postChat:false});
 assert.equal(actorContributions(f.actor)[0].rating,1);assert.equal(f.effects[0].showIcon,2);assert.equal(f.messages.size,0);
 assert.equal((await applyOwnedCondition(f.actor,'poisoned',1,{operationId:'attack-poison',postChat:false})).replay,true);
 assert.equal(f.effects.length,1);await assert.rejects(applyOwnedCondition(f.actor,'poisoned',2,{operationId:'attack-poison'}),/different values/);
});
test('condition result names actor, condition and rating without generic filler',async()=>{
 const f=fixture();await applyOwnedCondition(f.actor,'poisoned',2,{operationId:'poison'});
 const content=[...f.messages.values()][0].content;assert.match(content,/Aria/);assert.match(content,/Poisoned 2/);assert.match(content,/applied/);assert.doesNotMatch(content,/sources remain|ruling/i);
});
test('direct supply use steps down on one and replays original dice without another depletion',async()=>{
 const f=fixture();const result=await consumeOwnedSupply(f.actor,f.actor.items.get('ammo'),{operationId:'shot'});
 assert.equal(result.retained,1);assert.equal(f.items[0].system.inventoryDie,6);assert.equal(f.draws,1);
 await consumeOwnedSupply(f.actor,f.actor.items.get('ammo'),{operationId:'shot'});assert.equal(f.draws,1);assert.equal(f.items[0].system.inventoryDie,6);assert.equal(f.messages.size,1);
 const content=[...f.messages.values()][0].content;assert.match(content,/Aria/);assert.match(content,/used/);assert.match(content,/Arrows/);assert.match(content,/rolled/);
});
test('d4 one is depleted; other face keeps supply; nonowners cannot modify either resource',async()=>{
 const f=fixture();f.items[0].system.inventoryDie=4;assert.equal((await consumeOwnedSupply(f.actor,f.actor.items.get('ammo'))).exhausted,true);assert.equal(f.items[0].system.inventoryDie,0);
 const g=fixture({face:3});await consumeOwnedSupply(g.actor,g.actor.items.get('ammo'));assert.equal(g.items[0].system.inventoryDie,8);
 const n=fixture({owner:false});await assert.rejects(consumeOwnedSupply(n.actor,n.actor.items.get('ammo')),/own/);await assert.rejects(applyOwnedCondition(n.actor,'poisoned',1),/own/);assert.equal(n.draws,0);assert.equal(n.effects.length,0);
});

test('removing a condition hides its icon and names the removed condition in chat',async()=>{
 const f=fixture();await applyOwnedCondition(f.actor,'poisoned',2,{postChat:false});
 const message=await requestCondition(f.actor,'remove',{effectId:f.effects[0]._id});
 await resolveConditionRequest(message.id);
 assert.equal(f.effects[0].showIcon,0);assert.equal(f.effects[0].disabled,true);assert.deepEqual(f.effects[0].statuses,[]);
 assert.equal(actorContributions(f.actor).length,0);assert.match(message.content,/Aria.*Poisoned 2.*removed/);
});

test('failed condition chat reports applied state and replay repairs chat without duplicate effect',async()=>{
 const f=fixture();const create=ChatMessage.create;let failed=false;const warnings=[];
 globalThis.ui={notifications:{warn:message=>warnings.push(message)}};
 ChatMessage.create=async data=>{if(!failed){failed=true;throw Error('Disconnected');}return create(data);};
 await applyOwnedCondition(f.actor,'poisoned',1,{operationId:'retry'});assert.equal(f.effects.length,1);assert.match(warnings[0],/Condition applied/);assert.equal(f.messages.size,0);
 await applyOwnedCondition(f.actor,'poisoned',1,{operationId:'retry'});assert.equal(f.effects.length,1);assert.equal(f.messages.size,1);
});
