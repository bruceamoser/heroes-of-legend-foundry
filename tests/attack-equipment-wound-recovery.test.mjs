import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {abilityRollConfiguration} from '../src/rules/ability-roll.mjs';
import {attackEquipmentOptions,attackEquipmentSnapshot} from '../src/services/attack-equipment.mjs';
import {woundTreatmentPlan,retireWoundEffects,repairRecoveredWoundEffects} from '../src/services/wound-treatment.mjs';
import {actorWoundContributionPlan} from '../src/services/wound-effects.mjs';
import {actorContributions} from '../src/services/conditions.mjs';
const ID='heroes-of-legend';
const catalog=JSON.parse(await readFile(new URL('../static/data/choices.json',import.meta.url))).records;
const configuration=id=>abilityRollConfiguration({uuid:`Actor.hero.Item.${id}`,name:id,system:{}},catalog.find(r=>r.id===id));
const equipment=(id,name,kind,held=false)=>({id,uuid:`Actor.hero.Item.${id}`,name,type:'equipment',system:{catalogId:`item-ordinary-${kind}-weapon`,quantity:1,carried:true,held}});
test('weapon cards snapshot renamed selected equipment, with held equipment as default and ability identity intact',()=>{
 const actor={items:[equipment('sword','Excalibur','melee',true),equipment('axe','Axe','melee'),equipment('bow','Moonbow','ranged')]};actor.items.get=id=>actor.items.find(i=>i.id===id);
 const melee=configuration('ability-basic-melee'),ranged=configuration('ability-basic-ranged');
 assert.equal(melee.weaponKind,'melee');assert.equal(ranged.weaponKind,'ranged');
 assert.deepEqual(attackEquipmentOptions(actor,melee).map(x=>[x.id,x.selected]),[['sword',true],['axe',false]]);
 assert.deepEqual(attackEquipmentSnapshot(actor,melee),{itemUuid:'Actor.hero.Item.sword',name:'Excalibur'});
 assert.equal(attackEquipmentSnapshot(actor,melee,'axe').name,'Axe');
 const saved=attackEquipmentSnapshot(actor,ranged,'bow');actor.items.get('bow').name='Renamed later';assert.equal(saved.name,'Moonbow');
 assert.equal(melee.name,'ability-basic-melee');assert.throws(()=>attackEquipmentSnapshot(actor,melee,'bow'),/no longer available/);
 assert.equal(attackEquipmentSnapshot(actor,{attack:true}),null);
});
const wrap=data=>({...data,id:data._id,active:!data.disabled,getFlag:(_,key)=>data.flags?.[ID]?.[key]});
const effect=(_id,event,extra)=>({_id,name:'Strained shoulder',disabled:false,statuses:['hol.slowed'],showIcon:2,flags:{[ID]:{woundEvent:event,...extra}}});
function fixture(){
 globalThis.game={user:{}};globalThis.CONST={ACTIVE_EFFECT_SHOW_ICON:{NEVER:0}};
 const wounds={w:{eventId:'w',injury:'Strained shoulder',scar:true,recoveryValue:2,recoveryProgress:1,effectIds:['penalty','condition']},other:{eventId:'other',recoveryValue:5,recoveryProgress:0}};
 let source=[effect('penalty','w',{woundModifier:{kind:'rollModifier',woundId:'wound-physical-223',injury:'Strained shoulder',polarity:'bane',amount:1,context:'physical',printedContext:'physical activities',requiresContext:true}}),effect('condition','w',{condition:{key:'slowed',rating:1,persistence:'starred',source:'wound',order:0}}),effect('other','other',{condition:{key:'poisoned',rating:1,persistence:'temporary',source:'other',order:1}})];
 const actor={type:'character',testUserPermission:()=>true,get effects(){return source.map(wrap)},getFlag:(_,key)=>key==='wounds'?wounds:0,toObject:()=>({effects:structuredClone(source)}),async update(changes){for(const e of changes.effects??[]){source[source.findIndex(row=>row._id===e._id)]=structuredClone(e);}for(const [key,value]of Object.entries(changes)){const match=/\.wounds\.([^.]+)\.effectIds$/.exec(key);if(match)wounds[match[1]].effectIds=value;}}};
 return{actor,wounds,getSource:()=>source};
}
test('recovery reaching RV disables actual embedded wound effects; scar, unrelated effects and history remain',async()=>{
 const {actor,wounds,getSource}=fixture();assert.equal(actorWoundContributionPlan(actor).rollModifiers.length,1);
 const plan=woundTreatmentPlan({eventId:'w',wound:wounds.w,effects:actor.toObject().effects},1);
 wounds.w=plan.wound;await actor.update({effects:retireWoundEffects(actor.toObject().effects,plan.removeEffectIds)});
 assert.equal(wounds.w.scar,true);assert.equal(wounds.w.recoveryProgress,2);assert.equal(getSource().length,3);
 assert.equal(actorWoundContributionPlan(actor).rollModifiers.length,0);assert.deepEqual(actorContributions(actor).map(c=>c.key),['poisoned']);
 for(const e of getSource().slice(0,2)){assert(e.disabled);assert.deepEqual(e.statuses,[]);assert.equal(e.showIcon,0);}
});
test('old completed wounds stop contributing immediately and native repair retires them idempotently',async()=>{
 const {actor,wounds,getSource}=fixture();wounds.w.recoveryProgress=2;
 assert.equal(actorWoundContributionPlan(actor).rollModifiers.length,0);assert.deepEqual(actorContributions(actor).map(c=>c.key),['poisoned']);
 assert.equal(await repairRecoveredWoundEffects(actor),2);assert.equal(await repairRecoveredWoundEffects(actor),0);
 assert.deepEqual(wounds.w.effectIds,[]);assert.equal(wounds.w.scar,true);assert.equal(getSource()[2].disabled,false);
});
