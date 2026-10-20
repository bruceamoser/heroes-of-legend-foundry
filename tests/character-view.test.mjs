import test from "node:test";
import assert from "node:assert/strict";
import { characterSheetView } from "../src/sheets/character-view.mjs";
const ability = (id, action = "main") => ({id, name: id, system: {activity: {action}}});
const equipment = (id, quantity = 1) => ({id, name: id, system: {catalogId: "supply", quantity, bulk: 2, inventoryDie: 0, held: true, worn: false}});
test("basic visibility follows current gear and explicit preferences; edit reveals hidden choices and all discipline ranks", () => {
  const basic = {...ability("melee"),catalogId:"ability-basic-melee"};
  const learned = {...ability("learned"),catalogId:"ability-known"};
  const choices = [{id:"ability-basic-melee",universal:true},{id:"ability-known",requirements:[{kind:"discipline",id:"discipline-life",rank:2},{kind:"discipline",id:"discipline-wilderness",rank:1}]}];
  const input = {abilities:[basic,learned],choices};
  assert.deepEqual(characterSheetView(input).actionGroups[0].entries.map(row=>row.id),["learned"]);
  const shown = characterSheetView({...input,sheetState:{basicActions:{"ability-basic-melee":true}}});
  assert.equal(shown.actionGroups[0].entries.length,2);
  const edit = characterSheetView({...input,sheetState:{edit:true}});
  assert.equal(edit.actionGroups[0].entries.length,2);
  assert.equal(edit.abilityRows[0].shown,false);
  assert.deepEqual(edit.abilityRows[1].requirements.map(requirement=>[requirement.rank,requirement.ranked]),[[2,true],[1,false]]);
  const armed = characterSheetView({...input,equipment:[{...equipment("weapon"),system:{catalogId:"item-ordinary-melee-weapon",quantity:1,bulk:1}}]});
  assert.equal(armed.actionGroups[0].entries.length,2);
});
test("native character favorites use live embedded identities and retain exhausted supplies", () => {
  const input = {abilities: [ability("a"), ability("b", "reaction"), {...ability("handle"),catalogId:"ability-handle-an-item"}], choices:[{id:"ability-handle-an-item",name:"Handle an Item",universal:true}], equipment: [equipment("e", 0)], sheetState: {favorites: ["deleted", "e", "b"]}, inventory: {equipment: [{id:"supply", inventoryDie:4}]}};
  const original = structuredClone(input);
  const view = characterSheetView(input);
  assert.deepEqual(view.favorites.map((r) => r.id), ["b", "handle"]);
  assert.equal(view.favorites[1].useItemId,"e");
  assert.equal(view.favorites[1].canUse,false,"An exhausted supply remains visible without a use action");
  assert.equal(view.equipmentRows[0].hasSupply, true);
  assert.equal(view.equipmentRows[0].supplyLabel, "Empty");
  assert.equal(view.bulk, 0);
  assert.deepEqual(input, original, "render projection does not mutate native state");
});
test("conditional native crafting tab falls back when saved recipe is unavailable", () => {
  const view = characterSheetView({development: {recipes:["unknown"]}, sheetState:{tab:"crafting"}});
  assert.equal(view.activeTab,"main");
  assert.equal(view.tabs.some((t)=>t.id==="crafting"),false);
  const known = characterSheetView({development:{recipes:["r"]}, inventory:{recipes:[{id:"r",name:"Recipe"}]}, sheetState:{tab:"crafting"}});
  assert.equal(known.activeTab,"crafting");
  assert.equal(known.recipes[0].name,"Recipe");
});
test("native identity and action grouping reflect committed state without rebuilding resources", () => {
  const view = characterSheetView({development:{level:7,dp:3,classId:"class",creation:{ancestryId:"ancestry",culture:{id:"culture"},background:{id:"background"}}}, choices:[{id:"class",name:"Class"},{id:"ancestry",name:"Ancestry"},{id:"culture",name:"Culture"},{id:"background",name:"Background"}], abilities:[ability("reaction","reaction"),ability("passive","passive")], survival:{marks:2,status:"dying"}});
  assert.equal(view.identity,"Ancestry · Culture · Background · Class");
  assert.equal(view.level,7);assert.equal(view.dp,3);
  assert.deepEqual(view.marks.map((m)=>m.filled),[true,true,false]);
  assert.deepEqual(view.actionGroups.find((g)=>g.key==="reaction").entries.map((r)=>r.id),["reaction"]);
});
test("workshop presentation pairs sorted disciplines, combines language form and retains signed advancement awards and grants",()=>{
 const view=characterSheetView({development:{level:3,ranks:{z:2,a:1,b:3},languages:[{id:"common",name:"Common",form:"spoken",permissions:{read:true,write:true}},{id:"sign",form:"signed",permissions:{}}],ledger:[{kind:"pool",stage:0,delta:13},{kind:"award",level:2,delta:10},{kind:"purchase",level:2,id:"a",delta:-2},{kind:"signature-grant",level:3,id:"b",delta:0}]},choices:[{id:"z",name:"Zoology"},{id:"a",name:"Athletics"},{id:"b",name:"Brew"}]});
 assert.deepEqual(view.rankPairs.map(pair=>[pair.left.name,pair.right?.name]),[["Athletics","Brew"],["Zoology",undefined]]);
 assert.deepEqual(view.languages.map(language=>language.formLabel),["Spoken & written","Signed"]);
 assert.deepEqual(view.purchases.map(entry=>[entry.name,entry.cost]),[["Level award","+10"],["Athletics",-2],["Brew",0]]);
 assert.equal(view.ledger.length,1);
});
test("inventory sources retain portable acquisition provenance independently of held arrangement",()=>{
 const item={id:"native",name:"Tools",getFlag:()=>"grant:ability-tools:item-tools",system:{catalogId:"item-tools",quantity:1,bulk:1,held:true,hands:1}};
 const view=characterSheetView({equipment:[item],choices:[{id:"ability-tools",name:"Trail Workshop"}],development:{items:[{instanceId:"grant:ability-tools:item-tools",source:"ability-tools"}]}});
 assert.equal(view.equipmentRows[0].sourceLabel,"Trail Workshop");assert.equal(view.equipmentRows[0].arrangement,"Held");
});
