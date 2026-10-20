import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativePlayEffects} from '../src/rules/native-play-import.mjs';
import {rolledWorkshopWound} from '../src/rules/workshop-resources.mjs';
const catalog=JSON.parse(await readFile(new URL('../static/data/wounds.json',import.meta.url)));
function options(){let n=0;return {woundsCatalog:catalog,randomID:()=>String(++n).padStart(16,'0')};}
function woundFor(record){return rolledWorkshopWound({catalog,damageType:record.table==='elemental'?'fire':record.table,priorWounds:0,faces:[...record.key].map(Number),id:'wound-import'});}
test('import retains edited condition state and links it to the original wound without duplicating effects',()=>{
 const record=catalog.records.find(r=>r.effects.some(e=>e.kind==='condition'&&e.persistence==='starred'));
 const {wound,effects}=woundFor(record),index=effects.findIndex(e=>e.kind==='condition'&&e.persistence==='starred'),effect=effects[index];
 const result=nativePlayEffects({play:{wounds:[wound],conditions:[{id:`${wound.id}-${index}`,key:effect.key,rating:1,persistence:'starred',source:'Edited cause'}]}},{},options());
 const condition=result.effects.filter(e=>e.flags['heroes-of-legend'].condition);assert.equal(condition.length,1);assert.equal(condition[0].flags['heroes-of-legend'].condition.source,'Edited cause');assert.equal(condition[0].flags['heroes-of-legend'].condition.rating,1);
 const saved=Object.values(result.wounds)[0];assert.ok(saved.effectIds.includes(condition[0]._id));assert.equal(saved.importSource.id,wound.id);
});
test('fully treated wound keeps scar and progress without restoring removed effects or conditions',()=>{
 const record=catalog.records.find(r=>r.recoveryValue&&r.effects.some(e=>e.kind==='movementPenalty'||e.kind==='rollModifier'));
 const {wound}=woundFor(record);wound.progress=record.recoveryValue;
 const result=nativePlayEffects({play:{wounds:[wound],conditions:[]}},{},options());
 assert.equal(result.effects.length,0);assert.equal(Object.values(result.wounds)[0].scar,true);assert.equal(Object.values(result.wounds)[0].recoveryProgress,record.recoveryValue);
});
test('manual scars and active printed modifiers survive import; no immediate wound consequence is repeated',()=>{
 const record=catalog.records.find(r=>r.effects.some(e=>e.kind==='movementPenalty'));
 const {wound}=woundFor(record);const result=nativePlayEffects({play:{wounds:[wound,{id:'manual',name:'Old scar',notes:'Local remedy',progress:2}]}},{},options());
 assert.equal(Object.keys(result.wounds).length,2);assert.ok(result.effects.some(e=>e.flags['heroes-of-legend'].woundModifier?.kind==='movementPenalty'));
 const manual=Object.values(result.wounds).find(w=>w.importSource.id==='manual');assert.equal(manual.injury,'Old scar');assert.equal(manual.remedy,'Local remedy');assert.equal(manual.recoveryProgress,2);
});
