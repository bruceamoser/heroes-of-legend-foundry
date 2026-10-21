import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createContext, SourceTextModule, SyntheticModule} from "node:vm";
import {isMeleeWeaponEquipment} from "../src/rules/equipment-identity.mjs";

async function fixture() {
  const writes = [], errors = [], uses = [], potions = [], supplies = [];
  const actor = {isOwner:true, system:{biography:"Before",memorizedMessage:"Before"}, items:[], getFlag:()=>null};
  const fields = {"system.biography":{value:"After"},"system.memorizedMessage":{value:"A remembered message"}};
  const exports = {copyEquipmentToActor(){}, equipmentCopyOptions(){}, builderDropChoice(){}, loadCatalogs(){}, postAbilityReference(){}, WoundPanel:class{},RecoveryPanel:class{},DamagePanel:class{},EquipmentPanel:class{},ConditionPanel:class{},AdvancementWizard:class{},CreationWizard:class{},SharedRollDialog:class{},promptAttributeRoll(){},ATTRIBUTES:[],addHotbarShortcut(){},openItemShortcut(){},
    updateOwnedDocument:async (document,data,options)=>writes.push({document,data,options}),
    isHealingPotionItem:(item)=>item.system.catalogId==="potion",openPotionPreparation:async (...args)=>potions.push(args),
    consumeOwnedSupply:async (...args)=>supplies.push(args),
    isMeleeWeaponEquipment,activateOwnedAbility:async(item)=>{uses.push(item);return {draft:{weaponItemUuid:""},render(){uses.push(this.draft.weaponItemUuid);return this;}}},
  };
  const context=createContext({ui:{notifications:{error:(message)=>errors.push(message)}},foundry:{applications:{api:{HandlebarsApplicationMixin:(base)=>base},sheets:{ActorSheetV2:class{}}}},game:{user:{}}});
  async function dependency(){const module=new SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context});await module.link(()=>{});await module.evaluate();return module;}
  const module=new SourceTextModule(await readFile(new URL("../src/sheets/character.mjs",import.meta.url),"utf8"),{context,importModuleDynamically:dependency});
  await module.link(dependency);await module.evaluate();
  const sheet=new module.namespace.CharacterSheet();sheet.actor=actor;
  sheet.element={querySelector:(selector)=>{const match=selector.match(/name="([^"]+)"/);return match?fields[match[1]]:null;},querySelectorAll:()=>[]};
  return {sheet,actor,fields,writes,errors,uses,potions,supplies,Sheet:module.namespace.CharacterSheet};
}

test("Story blur save and navigation flush preserve only authored text",async()=>{
  const f=await fixture();await f.sheet.saveStory();
  assert.equal(f.writes.length,1);assert.deepEqual(Object.keys(f.writes[0].data),["system.biography","system.memorizedMessage"]);
  assert.equal(f.writes[0].options.render,false);
  await f.Sheet.switchTab.call(f.sheet,null,{dataset:{tab:"inventory"}});
  assert.equal(f.writes.at(-1).data["flags.heroes-of-legend.characterSheet.tab"],"inventory");
  assert.equal(f.errors.length,0);
});
test("overlong Message by Heart keeps the current view and authored draft",async()=>{
  const f=await fixture();f.fields["system.memorizedMessage"].value=Array(51).fill("word").join(" ");
  await f.Sheet.switchTab.call(f.sheet,null,{dataset:{tab:"inventory"}});
  assert.equal(f.writes.length,0);assert.match(f.errors[0],/50 words/);
  assert.equal(f.fields["system.memorizedMessage"].value.split(" ").length,51);
});
test("observer navigation changes local pane and accessible current tab without a document write",async()=>{
  const f=await fixture();f.actor.isOwner=false;
  const panes=[{dataset:{tabPane:"main"}},{dataset:{tabPane:"inventory"}}];
  const buttons=["main","inventory"].map((tab)=>({dataset:{tab},attributes:{"aria-current":"page"},setAttribute(key,value){this.attributes[key]=value},removeAttribute(key){delete this.attributes[key]}}));
  f.sheet.element.querySelectorAll=(selector)=>selector==="[data-tab-pane]"?panes:buttons;
  await f.Sheet.switchTab.call(f.sheet,null,{dataset:{tab:"inventory"}});
  assert.equal(f.sheet.observerTab,"inventory");assert.equal(panes[0].hidden,true);assert.equal(panes[1].hidden,false);
  assert.equal(buttons[0].attributes["aria-current"],undefined);assert.equal(buttons[1].attributes["aria-current"],"page");assert.equal(f.writes.length,0);
});
test("favorite melee Use selects the exact embedded weapon through owned Basic Melee",async()=>{
  const f=await fixture();const weapon={id:"weapon",uuid:"Actor.hero.Item.weapon",type:"equipment",system:{catalogId:"item-ordinary-melee-weapon"}};
  const ability={type:"ability",getFlag:()=>"ability-basic-melee"};f.actor.items=[weapon,ability];f.actor.items.get=(id)=>f.actor.items.find((item)=>item.id===id);
  await f.Sheet.useItem.call(f.sheet,null,{dataset:{},closest:()=>({dataset:{itemId:"weapon"}})});
  assert.equal(f.uses[0],ability);assert.equal(f.uses[1],weapon.uuid);assert.equal(f.errors.length,0);
});
test("favorite potion Use retains its exact bottle identity",async()=>{
  const f=await fixture();const bottle={id:"bottle",uuid:"Actor.hero.Item.bottle",type:"equipment",system:{catalogId:"potion"}};f.actor.items.get=()=>bottle;
  await f.Sheet.useItem.call(f.sheet,null,{dataset:{},closest:()=>({dataset:{itemId:"bottle"}})});
  assert.equal(f.potions[0][0],bottle);assert.equal(f.potions[0][1].bottleItemUuid,bottle.uuid);assert.equal(f.uses.length,0);
});
test("favorite consumable die checks its exact source supply without opening potion preparation",async()=>{
  const f=await fixture();const bottle={id:"bottle",uuid:"Actor.hero.Item.bottle",type:"equipment",system:{catalogId:"potion"}},ability={id:"action",type:"ability"};
  f.actor.items.get=id=>id==="bottle"?bottle:ability;
  await f.Sheet.useItem.call(f.sheet,null,{dataset:{useItemId:"bottle",supplyUse:"true"},closest:()=>({dataset:{itemId:"action"}})});
  assert.equal(f.supplies[0][0],f.actor);assert.equal(f.supplies[0][1],bottle);assert.equal(f.potions.length,0);assert.equal(f.uses.length,0);
});
