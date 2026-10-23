import test from 'node:test';
import assert from 'node:assert/strict';
import {creatureSheetProfile,summonAttackConfiguration} from '../src/rules/creature-sheet-profile.mjs';
const source={attributes:{},health:{value:10,max:10},speed:5,footprint:{width:1,height:1},defenseModifier:{boons:0,banes:1},basicMelee:{attribute:'brawn',orientation:'attacker',attackModifier:{boons:1,banes:0},weak:2,standard:3,strong:5},attacks:[{name:'Special attack',attribute:'agility',attackModifier:{boons:0,banes:1},weak:'2 fire damage',standard:'3 fire damage',strong:'4 fire damage'}]};
test('summon projection uses the same stats/action layout without changing its authored orientation',()=>{
 const actor={type:'summon',system:structuredClone(source)};const before=structuredClone(actor.system),view=creatureSheetProfile(actor);
 assert.equal(view.evasion.banes,1);assert.equal(view.threat.boons,0);assert.equal(view.armor,0);
 assert.deepEqual([view.basicMelee.weak,view.basicMelee.standard,view.basicMelee.strong],[2,3,5]);
 assert.equal(view.actions.entries[0].id,'summon-attack-0');
 assert.deepEqual(actor.system,before);
});
test('normal creature projection is unchanged and summon attack rolls retain the printed attribute and tiers',()=>{
 const actor={type:'creature',system:{custom:'unchanged'}};assert.equal(creatureSheetProfile(actor),actor.system);
 const summon={type:'summon',system:source};const basic=summonAttackConfiguration(summon);
 assert.equal(basic.attribute,'brawn');assert.equal(basic.outcomes.strong,'5 physical damage.');assert.equal(basic.attackModifier.boons,1);
 const special=summonAttackConfiguration(summon,'summon-attack-0');assert.equal(special.attribute,'agility');assert.equal(special.outcomes.weak,'2 fire damage');
 assert.throws(()=>summonAttackConfiguration(summon,'bad-id'),/unavailable/);
});

test("all 73 shipped summon profiles project through the shared creature layout",async()=>{
 const {buildContentPackArtifacts,readContentPackCatalogs}=await import("../scripts/content/content-packs.mjs");
 const {documents}=buildContentPackArtifacts(await readContentPackCatalogs(new URL("../",import.meta.url)));
 assert.equal(documents.summons.length,73);
 for(const source of documents.summons){
  const before=structuredClone(source.system),actor={type:"summon",system:source.system};
  const view=creatureSheetProfile(actor);
  assert.equal(view.actions.entries.length,source.system.attacks.length);
  assert.deepEqual(summonAttackConfiguration(actor).outcomes,Object.fromEntries(["weak","standard","strong"].map(t=>[t,`${source.system.basicMelee[t]} physical damage.`])));
  assert.deepEqual(source.system,before);
 }
});

test("fixed summon special attacks retain period-separated damage and conditions",async()=>{
 const {resolvedAttackEffects}=await import("../src/rules/attack-outcomes.mjs");
 assert.deepEqual(resolvedAttackEffects("1 physical damage. Poisoned 1."),{components:[{type:"physical",amount:1}],conditions:[{key:"poisoned",rating:1}]});
 assert.deepEqual(resolvedAttackEffects("No damage. Paralyzed 1."),{components:[],conditions:[{key:"paralyzed",rating:1}]});
});
