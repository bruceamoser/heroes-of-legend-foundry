import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createContext,SourceTextModule,SyntheticModule} from "node:vm";
import {ABILITY_RULE_PATHS,abilityRuleFingerprint,abilityRuleValue,planAbilityRuleUpdate} from "../src/rules/ability-rule-update.mjs";
const old = JSON.parse(await readFile(new URL("./fixtures/ability-rule-update-v271.json",import.meta.url)));
const bases = JSON.parse(await readFile(new URL("../static/data/ability-update-bases.json",import.meta.url)));
const ID="heroes-of-legend", catalogId=old.flags[ID].catalogId;
const baseline=bases.abilities[catalogId];
function currentSource() {
  const next=structuredClone(old);
  next.system.description="<p>Pay 3 HP. Choose one or two allies. Restore the printed amount.</p>";
  next.system.outcomes={weak:"One ally: restore 6 HP. Two allies: restore 4 HP each.",standard:"One ally: restore 11 HP. Two allies: restore 7 HP each.",strong:"One ally: restore 16 HP. Two allies: restore 10 HP each."};
  next.flags[ID].sourceCommit="a".repeat(40);
  return next;
}
test("v2.7.1 fingerprint manifest matches the independent original generated Item exactly",async()=>{
  assert.equal(bases.systemCommit,"0d8f062d81d2e818bfa39bae7eeab03ec756ff86");
  assert.equal(Object.keys(bases.abilities).length,40);
  for(const path of ABILITY_RULE_PATHS) assert.equal(baseline.fields[path],await abilityRuleFingerprint(abilityRuleValue(old,path)),path);
  assert.notEqual(await abilityRuleFingerprint(old.system.description+" "),baseline.fields["system.description"]);
});
test("exact old published fields update without touching grants, identity, notes, effects or resources",async()=>{
  const item=structuredClone(old);item.flags[ID].itemNotes="Keep these notes";item.flags[ID].creationGrant="earned-slot";item.system.customResource=7;
  const before=structuredClone(item),current=currentSource();
  const plan=await planAbilityRuleUpdate({item,current,baseline});
  assert.equal(plan.preserved.length,0);
  assert.deepEqual(plan.updated.sort(),["system.description","system.outcomes.weak","system.outcomes.standard","system.outcomes.strong",`flags.${ID}.sourceCommit`].sort());
  assert.deepEqual(item,before,"Planning is read-only");
  assert(!Object.keys(plan.changes).some(path=>/notes|grant|resource|_id|name|effects|health/i.test(path)));
});
test("exact verified native description updates while even one added character stays local",async()=>{
  const native=structuredClone(old);
  native.system.description=native.system.description.replaceAll("&#39;", "'");
  assert.equal(await abilityRuleFingerprint(native.system.description),baseline.nativeFields["system.description"]);
  const clean=await planAbilityRuleUpdate({item:native,current:currentSource(),baseline});
  assert(clean.updated.includes("system.description"));
  native.system.description+=" ";
  const edited=await planAbilityRuleUpdate({item:native,current:currentSource(),baseline});
  assert(edited.preserved.some(entry=>entry.path==="system.description"));
  assert.equal(edited.changes["system.description"],undefined);
});
test("each customized field is preserved while other exact published fields can update",async()=>{
  const item=structuredClone(old);item.system.outcomes.weak="My local healing rule";item.system.description+="<p>Local ruling.</p>";
  const plan=await planAbilityRuleUpdate({item,current:currentSource(),baseline});
  assert.deepEqual(plan.preserved.map(entry=>entry.path).sort(),["system.description","system.outcomes.weak"]);
  assert.equal(plan.changes["system.outcomes.weak"],undefined);
  assert.equal(plan.changes["system.outcomes.standard"],currentSource().system.outcomes.standard);
  assert.equal(plan.changes["system.description"],undefined);
});
test("unknown source editions are preserved and mismatched catalog identities fail closed",async()=>{
  const item=structuredClone(old);item.flags[ID].source.sha256="unknown";
  const plan=await planAbilityRuleUpdate({item,current:currentSource(),baseline});assert.equal(plan.updated.length,0);assert(plan.preserved.length);
  const current=currentSource();current.flags[ID].catalogId="other";
  await assert.rejects(planAbilityRuleUpdate({item:old,current,baseline}),/identity/);
});
async function serviceFixture() {
  let data=structuredClone(old),owner=true,writes=0;
  const item={id:"owned",uuid:"Actor.hero.Item.owned",type:"ability",testUserPermission:()=>owner,getFlag:(_scope,key)=>data.flags[ID][key],toObject:()=>structuredClone(data)};
  const context=createContext({structuredClone,TextEncoder,crypto,game:{user:{}},fetch:async()=>({ok:true,json:async()=>bases})});
  const module=new SourceTextModule(await readFile(new URL("../src/services/ability-rule-update.mjs",import.meta.url),"utf8"),{context});
  const exports={abilityItemSource:()=>currentSource(),abilityRuleFingerprint,planAbilityRuleUpdate,loadCatalogs:async()=>({choices:[{kind:"ability",id:catalogId}],commit:"a".repeat(40)}),updateOwnedDocument:async(document,changes)=>{assert(owner);writes++;for(const [path,value]of Object.entries(changes)){let obj=data;const parts=path.split('.');for(const part of parts.slice(0,-1))obj=obj[part]??={};obj[parts.at(-1)]=value;}}};
  await module.link(async()=>{const dep=new SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value)},{context});await dep.link(()=>{});await dep.evaluate();return dep;});await module.evaluate();
  return {api:module.namespace,item,get data(){return data;},get writes(){return writes;},setOwner:value=>owner=value};
}
test("owner preview makes no writes and explicit apply writes only reviewed fields",async()=>{
  const f=await serviceFixture();assert.equal(await f.api.abilityRuleUpdateAvailable(f.item),true);
  const preview=await f.api.previewAbilityRuleUpdate(f.item);assert.equal(f.writes,0);
  f.data.flags[ID].itemNotes="preserved";
  await assert.rejects(f.api.applyAbilityRuleUpdate(f.item,preview),/changed/);assert.equal(f.writes,0);
  const fresh=await f.api.previewAbilityRuleUpdate(f.item);await f.api.applyAbilityRuleUpdate(f.item,fresh);assert.equal(f.writes,1);assert.equal(f.data.flags[ID].itemNotes,"preserved");assert.equal(f.data.system.outcomes.weak,currentSource().system.outcomes.weak);
});
test("ownership loss and changed identity reject at apply without modifying the Item",async()=>{
  const f=await serviceFixture(),preview=await f.api.previewAbilityRuleUpdate(f.item);f.setOwner(false);
  await assert.rejects(f.api.applyAbilityRuleUpdate(f.item,preview),/own/);assert.equal(f.writes,0);assert.equal(await f.api.abilityRuleUpdateAvailable(f.item),false);
  f.setOwner(true);f.data.flags[ID].catalogId="other";
  await assert.rejects(f.api.applyAbilityRuleUpdate(f.item,preview),/identity/);assert.equal(f.writes,0);
});
async function sheetFixture(confirmed) {
  const calls=[];
  const source=await readFile(new URL("../src/sheets/ability.mjs",import.meta.url),"utf8");
  const exports={};
  for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(',').map(name=>name.trim()).filter(Boolean))exports[name]=()=>{};
  exports.previewAbilityRuleUpdate=async()=>({updated:["system.description"],comparisons:[{path:"system.description",before:"<p>Old</p>",after:"<p>New</p>"}],preserved:[{path:"system.outcomes.weak"}]});
  exports.applyAbilityRuleUpdate=async()=>calls.push("apply");
  const foundry={utils:{escapeHTML:value=>String(value).replaceAll('<','&lt;')},applications:{api:{HandlebarsApplicationMixin:base=>base,DialogV2:{confirm:async options=>{calls.push(options);return confirmed;}}},sheets:{ItemSheetV2:class{}},ux:{TextEditor:{implementation:{enrichHTML:async text=>text}}}}};
  const context=createContext({foundry,ui:{notifications:{error:message=>calls.push(message)}}});
  const module=new SourceTextModule(source,{context});await module.link(async()=>{const dependency=new SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value)},{context});await dependency.link(()=>{});await dependency.evaluate();return dependency;});await module.evaluate();
  const sheet={item:{name:"Triage",isOwner:true},render:async()=>calls.push("render")};
  return {calls,sheet,update:()=>module.namespace.AbilitySheet.updateRules.call(sheet)};
}
test("actual sheet preview shows current/new text and preserved fields; Cancel never writes",async()=>{
  const f=await sheetFixture(false);await f.update();assert.equal(f.calls.length,1);
  assert.match(f.calls[0].content,/<h3>Current<\/h3><p>Old<\/p>/);
  assert.match(f.calls[0].content,/<h3>Updated<\/h3><p>New<\/p>/);
  assert.match(f.calls[0].content,/Local changes preserved.*Weak result/);
  assert.equal(f.sheet._ruleUpdateBusy,false);
});
test("actual sheet requires positive confirmation and refuses updates during unsaved editing",async()=>{
  const f=await sheetFixture(true);await f.update();assert.deepEqual(f.calls.slice(1),["apply","render"]);
  const editing=await sheetFixture(true);editing.sheet._cardEditing=true;await editing.update();assert.equal(editing.calls.length,1);assert.match(editing.calls[0],/Finish editing/);
});
