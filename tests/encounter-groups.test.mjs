import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';
async function load(game){
 const context=createContext({game,foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}}});
 const module=new SourceTextModule(await readFile(new URL('../src/applications/encounter.mjs',import.meta.url),'utf8'),{context});
 await module.link(async()=>{const dep=new SyntheticModule(['reconcileTurnRoster','chooseCombatParticipant','finishCombatParticipant'],function(){for(const key of ['reconcileTurnRoster','chooseCombatParticipant','finishCombatParticipant'])this.setExport(key,()=>{});},{context});await dep.link(()=>{});await dep.evaluate();return dep;});await module.evaluate();return module.namespace;
}
test('encounter groups keep players before creatures and retain their turn data',async()=>{
 const {encounterGroups}=await load({});
 const rows=[{id:'adder',group:'creatures',acted:true},{id:'hero',group:'players',active:true},{id:'wolf',group:'creatures'}];
 const groups=encounterGroups(rows);assert.equal(groups[0].label,'Players');assert.equal(groups[0].participants[0],rows[1]);assert.equal(groups[1].label,'Creatures');assert.equal(groups[1].participants[0],rows[0]);assert.equal(groups[1].participants[1],rows[2]);assert.equal(rows[0].id,'adder');
});
test('End combat delegates to the native confirmation and rejects players',async()=>{
 const game={user:{isGM:false}},{endEncounter}=await load(game);let called=0;const combat={endCombat(){called++;return 'native';}};
 await assert.rejects(endEncounter(combat),/Only the DA/);assert.equal(called,0);game.user.isGM=true;assert.equal(await endEncounter(combat),'native');assert.equal(called,1);
});
