import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {outcomeEffects} from '../src/rules/outcome-effects.mjs';
import {outcomeDamage} from '../src/rules/ability-roll.mjs';

test('damage buttons use complete numeric outcomes without guessing conditional or variable effects',()=>{
  assert.deepEqual(outcomeDamage('5 physical damage.'),[{type:'physical',amount:5}]);
  assert.deepEqual(outcomeDamage('Deal 3 mental damage.'),[{type:'mental',amount:3}]);
  for(const text of ['If adjacent, 5 fire damage.','Double the damage.','3 physical damage and move the target.','3 poison damage.']) assert.equal(outcomeDamage(text),null);
});

test('an incoming defense rolls immediately without coordinator, encounter or actor writes',async()=>{
  const basis={mode:'defense',attributeKey:'agility',attribute:1,attackMessageId:'incoming',incoming:{damage:{standard:3}}};
  const actor={uuid:'Actor.hero',update(){throw Error('Roll must not mutate actor');}};
  let evaluations=0,posts=0;
  const context=vm.createContext({structuredClone,game:{user:{id:'player'},users:new Map(),settings:{get:()=> 'public'},i18n:{localize:key=>key}},ChatMessage:{getSpeaker:()=>({actor:'hero'})},foundry:{dice:{Roll:class{
    constructor(){this.dice=[{results:[3,3,4].map(result=>({result,active:true}))}];}
    async evaluate(){evaluations++;return this;}
    async toMessage(data){posts++;return {id:'result',...data};}
  }}}});
  const dependencies={
    './attack-equipment.mjs':{attackEquipmentSnapshot:()=>{throw Error('Defense has no attack equipment');}},
    '../rules/outcome-effects.mjs':{outcomeEffects},
    '../rules/ability-roll.mjs':{abilityRollConfiguration:()=>{},assertAbilityConfiguration:()=>{},outcomeDamage},
    './catalog.mjs':{loadCatalogs:()=>{}},
    './reference-play.mjs':{selectedReferences:()=>[]},
    '../rules/creature-actions.mjs':{incomingOutcome:()=>({damage:3,type:'physical',applied:false})},
    './roll-preparation.mjs':{rollBasis:()=>basis,prepareRoll:()=>({formula:'3d6 + 1',attribute:1})},
    '../rules/roll.mjs':{classifyRoll:()=>({tier:'standard',total:11})},
  };
  const mod=new vm.SourceTextModule(await readFile(new URL('../src/services/roll.mjs',import.meta.url),'utf8'),{context});
  await mod.link(spec=>{const values=dependencies[spec];assert.ok(values,`unexpected dependency ${spec}`);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});});
  await mod.evaluate();
  const result=await mod.namespace.rollPrepared(actor,basis,{});
  assert.equal(evaluations,1);assert.equal(posts,1);
  assert.equal(result.flags['heroes-of-legend'].roll.attackOutcome.damage,3);
  assert.equal(result.flags['heroes-of-legend'].roll.attackOutcome.applied,false);
});

test('attack target Evasion is optional and death rolls need no encounter survival checkpoint',async()=>{
  const {rollBasis,prepareRoll}=await import('../src/services/roll-preparation.mjs');
  const actor={uuid:'Actor.hero',type:'character',effects:[],items:[],system:{attributes:{brawn:{effective:1},fortitude:{effective:2}},health:{value:4},grit:{available:1}},getFlag:()=>null,testUserPermission:()=>true};
  const target={uuid:'Scene.s.Token.t',documentName:'Token',actor:{uuid:'Actor.enemy',type:'creature',effects:[],system:{evasion:{boons:0,banes:2}}}};
  globalThis.fromUuidSync=uuid=>uuid===actor.uuid?actor:uuid===target.uuid?target:null;
  globalThis.game={user:{id:'owner',targets:new Set()}};
  const untargeted=rollBasis(actor,'brawn','attack');
  assert.equal(untargeted.targetTokenUuid,null);
  assert.equal(prepareRoll(untargeted,{}).banes,0);
  game.user.targets.add({document:target});
  const targeted=rollBasis(actor,'brawn','attack');
  assert.equal(targeted.targetTokenUuid,target.uuid);
  assert.equal(prepareRoll(targeted,{}).banes,2);
  game.user.targets.add({document:{...target,uuid:'Scene.s.Token.other'}});
  assert.equal(rollBasis(actor,'brawn','attack').targetTokenUuid,null);
  const death=rollBasis(actor,'fortitude','death');
  assert.equal(death.survival.pending,false);
  assert.equal(death.attribute,2);
});
