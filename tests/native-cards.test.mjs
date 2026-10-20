import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { npcProfileChanges, selectNpcProfile } from "../src/services/npc-profile.mjs";
import { mitigationLabel } from "../src/sheets/card-state.mjs";
const ID = "heroes-of-legend";
function fixture() {
 const system = { health: {value: 12, baseMax: 12}, speed: 6, biography: "catalog prose", actions: {entries:[{name:"Attack"}]} };
 const source = {type:"creature",name:"Shield Soldier",toObject:()=>({system}),getFlag:(_ns,k)=>k==="catalogId"?"creature-shield-soldier":null,testUserPermission:()=>true};
 const actor = {id:"npc",type:"creature",system:{health:{value:3,baseMax:30},biography:"Local notes"},testUserPermission:()=>true};
 return {source,actor,system};
}
test("explicit NPC profile replacement preserves current HP, biography and unrelated document state",()=>{
 const {source,actor,system}=fixture(); const changes=npcProfileChanges(actor,source);
 assert.equal(changes.system.health.value,3); assert.equal(changes.system.health.baseMax,12);
 assert.equal(changes.system.biography,"Local notes"); assert.equal(system.biography,"catalog prose");
 assert.equal(changes[`flags.${ID}.npc.profileName`],"Shield Soldier");
 assert.equal(changes[`flags.${ID}.npc.profileLinked`],true);
 assert(!("name" in changes)); assert(!("effects" in changes)); assert(!("items" in changes));
 assert(!Object.keys(changes).some(key=>/npc\.(detail|want|knowledge|boundary|relationship)/.test(key)));
 actor.system.health.value=25; assert.equal(npcProfileChanges(actor,source).system.health.value,12);
 actor.system.health.value=0; assert.equal(npcProfileChanges(actor,source).system.health.value,0);
 assert.throws(()=>npcProfileChanges({...actor,type:"character"},source),/creature/);
});
test("NPC profile selection checks DA ownership and readable native source before document update",async()=>{
 const {actor,source}=fixture(); let writes=0;
 actor.update=async(data)=>{writes++;return data;};
 globalThis.game={user:{isGM:false},packs:new Map([[`${ID}.creatures`,{documentName:"Actor",getDocument:async()=>source}]])};
 await assert.rejects(selectNpcProfile(actor,"source"),/DA owner/); assert.equal(writes,0);
 game.user.isGM=true;actor.testUserPermission=()=>false;
 await assert.rejects(selectNpcProfile(actor,"source"),/DA owner/);assert.equal(writes,0);
 actor.testUserPermission=()=>true;source.testUserPermission=()=>false;
 await assert.rejects(selectNpcProfile(actor,"source"),/unavailable/);assert.equal(writes,0);
 source.testUserPermission=()=>true;await selectNpcProfile(actor,"source");assert.equal(writes,1);
});
test("compact mitigation summaries preserve printed source, specialties and explicit None",()=>{
 assert.equal(mitigationLabel({sourceText:"Fire 2; cold —"}),"Fire 2; cold —");
 assert.equal(mitigationLabel({numeric:[{type:"Fire",value:2}],special:[{type:"Life",reference:"See card"}]}),"Fire 2; Life: See card");
 assert.equal(mitigationLabel({}),"None");
});
test("native cards expose scroll panes and retain the exact service action hooks",async()=>{
 const creature=await readFile(new URL('../static/templates/creature.hbs',import.meta.url),'utf8');
 for(const label of ["Armor DR","Evasion","Threat","Stability","Resistance","Weakness","Immunity","Recognizable detail","Wants","Knows","Boundary","Weak defense","Standard defense","Strong defense"])
  assert(creature.includes(label),label);
 for(const action of ["npcMelee","creatureAction","rollAttribute","chooseNpcProfile","updateProfile"])
  assert(creature.includes(`data-action="${action}"`),action);
 assert(!/data-tab=/.test(creature));assert(creature.includes('hol-card-fixed'));assert(creature.includes('hol-card-scroll'));
 for(const kind of ['ability','equipment']) {
 const template=await readFile(new URL(`../static/templates/${kind}.hbs`,import.meta.url),'utf8');
 assert(template.includes('hol-native-card'));assert(template.includes('hol-card-scroll'));assert(template.includes('cardEditing'));
 }
});
