import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createContext, SourceTextModule, SyntheticModule} from "node:vm";
import {importedCharacterState} from "../src/rules/native-character-state.mjs";
import {readPortableCharacter, writePortableCharacter} from "../src/rules/portable-character.mjs";
import {abilityItemSource,equipmentItemSource} from "../src/rules/item-construction.mjs";
import {DEFAULT_LANGUAGES} from "../src/rules/languages.mjs";

async function load(path, exports, globals={}) {
  exports={createActionMessage(){},shouldProcessRequest(){return true;},...exports};
  const context=createContext({structuredClone,Date,setTimeout,...globals});
  const module=new SourceTextModule(await readFile(new URL(path,import.meta.url),"utf8"),{context});
  await module.link(async()=>{const dependency=new SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context});await dependency.link(()=>{});await dependency.evaluate();return dependency});
  await module.evaluate(); return module.namespace;
}
async function wizard(valid=true, failure=null) {
  const events=[], errors=[];
  const exports={bindWizardHp(){},wizardGrit(){},wizardWounds(){},wizardDeath(){},workshopNavIcon(){},bindLearningMarket(){},learningCardView(){},creationStepErrors(){},equipmentEligibility(){},isUniversalAbility(){},additionalLanguageOptions(){},resolveBuilderDrop(){},validateBuilderPurchase(){},bindBuilderDrop(){},acquisitionWeaponName(){},bindCreationAuthority(){},loadCatalogs(){},updateOwnedDocument(){},newCreationDraft(){},creationPreview:()=>({valid}),workshopVitals(){},workshopCharacter:()=>({valid}),ATTRIBUTES:[],campaignLanguageOptions(){},getCampaignLanguageConfiguration(){},abilityReferenceStatus(){},readPortableCharacter(){},currentCreationDraft(){},MAX_CHARACTER_BYTES:262144,eligibleFirst(){},purchaseEligibility(){},classEligibility(){},recipeStudyChoices(){},
  requestCreation:async(actor,revision)=>{events.push(["request",revision]);return {id:"request"}},waitForCreation:async()=>{events.push(["completion"]);if(typeof failure==="function")await failure();else if(failure)throw new Error(failure)}};
  const {CreationWizard}=await load("../src/applications/creation.mjs",exports,{foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}},ui:{notifications:{info:()=>{},error:message=>errors.push(message)}}});
  const app={actor:{getFlag:()=>null,sheet:{render:async()=>events.push(["sheet"])}},draft:{},catalogs:{choices:[],inventory:{}},languageConfiguration:{definitions:[]},revision:2,capture(){events.push(["capture"])},requireRenderedLanguageBasis(){events.push(["basis"])},async persist(){events.push(["persist"]);this.revision++},close:async()=>events.push(["close"]),render:async()=>events.push(["render"])};
  return {app,CreationWizard,events,errors};
}
test("Save captures, validates and saves the latest draft; sheet opens only after authoritative completion",async()=>{
  const f=await wizard();await f.CreationWizard.commitCreation.call(f.app);
  assert.deepEqual(f.events,[["capture"],["basis"],["persist"],["request",3],["completion"],["close"],["sheet"]]);assert.deepEqual(f.errors,[]);
});
test("invalid Save retains the wizard and lists Review errors without sending a commit",async()=>{
  const f=await wizard(false);await f.CreationWizard.commitCreation.call(f.app);
  assert.equal(f.app.step,7);assert.deepEqual(f.events,[["capture"],["basis"],["render"]]);assert.match(f.errors[0],/Resolve the choices/);
});
test("GM processing failure remains visible and never closes the wizard or opens an unchanged sheet",async()=>{
  const f=await wizard(true,"Actor validation failed");await f.CreationWizard.commitCreation.call(f.app);
  assert.deepEqual(f.events.at(-1),["render"]);assert(!f.events.some(([event])=>event==="close"));assert.equal(f.errors[0],"Actor validation failed");assert.equal(f.app.busy,false);
});

test("actual workshop JSON preserves play inventory, languages, resources, identity mapping and crafting inputs",async()=>{
  const source=JSON.parse(await readFile(new URL("../static/data/choices.json",import.meta.url)));
  const inventory=JSON.parse(await readFile(new URL("../static/data/inventory.json",import.meta.url)));
  const fixtures=JSON.parse(await readFile(new URL("./fixtures/reference-heroes.json",import.meta.url)));
  const catalogs={choices:source.records,inventory,commit:source.sourceCommit};
  const languages=[...DEFAULT_LANGUAGES,...fixtures.campaignLanguages];
  const draft=structuredClone(fixtures.characters[0].draft);
  draft.profile={story:"An exported story",pronouns:"they"};
  draft.play={hp:2,gritSpent:1,favorites:{abilities:[draft.signatureId],items:["inventory-food"]},inventory:{added:[{id:"item-food-bundle",quantity:3,instanceId:"inventory-food"}],removed:[]},languages:{added:[{id:"language-trade-sign",name:"Trade Sign",form:"signed",written:false}],removed:[]}};
  draft.loadout={"inventory-food":{carried:false,held:false,worn:false}};
  const restored=readPortableCharacter(writePortableCharacter(draft,catalogs,{ready:true,languages}),catalogs,languages);
  assert.equal(restored.preview.valid,true);
  const food=restored.preview.inventory.items.find(item=>item.instanceId==="inventory-food");
  assert.equal(food.quantity,3);assert.equal(food.carried,false);
  assert(restored.preview.play.languages.some(language=>language.name==="Trade Sign"));
  const items=restored.preview.inventory.items.map((item,index)=>({_id:`native-${index}`,type:"equipment",flags:{"heroes-of-legend":{acquisitionInstance:item.instanceId}}}));
  items.push({_id:"signature",type:"ability",flags:{"heroes-of-legend":{catalogId:draft.signatureId}}});
  const changes=importedCharacterState(restored.draft,restored.preview,items);
  assert.equal(changes["flags.heroes-of-legend.survival"].hp,2);
  assert.equal(changes["flags.heroes-of-legend.profile"].story,"An exported story");
  assert.deepEqual(changes["flags.heroes-of-legend.characterSheet"].favorites,["signature",items.find(item=>item.flags["heroes-of-legend"].acquisitionInstance==="inventory-food")._id]);
});

async function receiptService(flags={},failure=null) {
  const exports={registerAuthority(){},ensureAuthorityReady(){},writeCharacterActor(){},isCreationAuthority(){},bindCreationAuthority(){},enqueueCharacterOperation(){},loadCatalogs(){},getCampaignLanguageConfiguration(){},workshopCharacter(){},nativePlayEffects(){},importedCharacterState(){},abilityItemSource(){},equipmentItemSource(){}};
  const api=await load("../src/services/creation.mjs",exports,{game:{messages:{get:()=>({getFlag:()=>failure})}}});
  return {api,actor:{getFlag:()=>flags.receipt},flags};
}
test("a dispatched request is not completion; waiter follows the exact Actor receipt and revision",async()=>{
  const f=await receiptService();let finished=false;
  const pending=f.api.waitForCreation(f.actor,"expected",4,{timeout:100,interval:1}).then(()=>finished=true);
  f.flags.receipt={requestId:"other",revision:4,status:"complete"};
  await new Promise(resolve=>setTimeout(resolve,3));assert.equal(finished,false);
  f.flags.receipt={requestId:"expected",revision:4,status:"pending-verification"};
  await new Promise(resolve=>setTimeout(resolve,3));assert.equal(finished,false);
  f.flags.receipt.status="complete";await pending;assert.equal(finished,true);
});
test("authoritative error and offline completion timeout reject with actionable feedback",async()=>{
  const failed=await receiptService({},"The draft changed");
  await assert.rejects(failed.api.waitForCreation(failed.actor,"request",1,{timeout:5,interval:1}),/draft changed/);
  const offline=await receiptService();
  await assert.rejects(offline.api.waitForCreation(offline.actor,"request",1,{timeout:3,interval:1}),/not completed.*draft is saved/);
});

test("blur autosave does not swallow the immediately following Continue click",async()=>{
  const f=await wizard();let release;const held=new Promise(resolve=>release=resolve);let first=true;
  f.app.act=f.CreationWizard.prototype.act;
  f.app.persist=async()=>{f.events.push(["persist"]);if(first){first=false;await held;}};
  const save=f.app.act(async()=>{});
  const navigate=f.app.act(async()=>{f.app.step=1;f.events.push(["navigate"])});
  assert.equal(f.app.step,undefined);release();await Promise.all([save,navigate]);
  assert.equal(f.app.step,1);assert.equal(f.app.busy,false);
  assert.deepEqual(f.events.filter(([event])=>event==="navigate"),[["navigate"]]);
});


test("native item grant plan retains separate exported stack identities, quantities, supply and loadout",async()=>{
  const source=JSON.parse(await readFile(new URL("../static/data/choices.json",import.meta.url)));
  const inventory=JSON.parse(await readFile(new URL("../static/data/inventory.json",import.meta.url)));
  let serial=0;
  const exports={registerAuthority(){},ensureAuthorityReady(){},writeCharacterActor(){},isCreationAuthority(){},bindCreationAuthority(){},enqueueCharacterOperation(){},loadCatalogs(){},getCampaignLanguageConfiguration(){},workshopCharacter(){},nativePlayEffects(){},importedCharacterState(){},abilityItemSource,equipmentItemSource};
  const api=await load("../src/services/creation.mjs",exports,{foundry:{utils:{randomID:()=>String(++serial).padStart(16,"0")}}});
  const actor={items:[],toObject:()=>({items:[]})};
  const plan=api.buildCharacterItems(actor,[],[
    {instanceId:"inventory-one",catalogId:"item-food-bundle",quantity:3,inventoryDie:4,carried:false,worn:false,held:false,source:"play"},
    {instanceId:"inventory-two",catalogId:"item-food-bundle",quantity:1,inventoryDie:6,carried:true,worn:false,held:false,source:"play"},
  ],{choices:source.records,inventory,commit:source.sourceCommit,grantKind:"creation"});
  assert.equal(plan.items.length,2);
  assert.deepEqual(Array.from(plan.items,item=>[item.system.quantity,item.system.inventoryDie,item.system.carried]),[[3,4,false],[1,6,true]]);
  assert.notEqual(plan.instanceIds["inventory-one"],plan.instanceIds["inventory-two"]);
  assert.equal(plan.items[0].flags["heroes-of-legend"].acquisitionInstance,"inventory-one");
});

test("an exported held item with unspecified grip is preserved; hand automation still requires an explicit grip",async()=>{
  const {EquipmentData}=await load("../src/models/equipment.mjs",{StrictNumberField:class{}},{foundry:{data:{fields:{HTMLField:class{},StringField:class{},BooleanField:class{}}},abstract:{TypeDataModel:class{}}}});
  assert.doesNotThrow(()=>EquipmentData.validateJoint({held:true,worn:false,carried:true,hands:0,inventoryDie:0}));
  const {handLayout}=await import("../src/rules/hands.mjs");
  assert.throws(()=>handLayout([{id:"held-unset",held:true,hands:0,quantity:1}]),/held item must occupy/);
  assert.equal(handLayout([{id:"held-set",held:true,hands:1,quantity:1}]).free,1);
});

test("a real level-3 portable plan commits all progression, signatures, remaining DP and live HP",async()=>{
  const {workshopCharacter}=await import("../src/rules/workshop-character.mjs");
  const source=JSON.parse(await readFile(new URL("../static/data/choices.json",import.meta.url)));
  const inventory=JSON.parse(await readFile(new URL("../static/data/inventory.json",import.meta.url)));
  const heroes=JSON.parse(await readFile(new URL("./fixtures/reference-heroes.json",import.meta.url)));
  const catalogs={choices:source.records,inventory,commit:source.sourceCommit};
  const draft=structuredClone(heroes.characters[0].draft);
  draft.languages={home:"dwarven",extraSpoken:[]};
  const signature=source.records.find(record=>record.id===draft.classId).signatures[3][0];
  draft.progression={level:3,levels:{2:{purchases:[{id:"ability-conditioned-body"}],signatures:{},acquisitions:{}},3:{purchases:[],signatures:{3:signature},acquisitions:{}}}};
  draft.play={hp:5,gritSpent:1};
  const portable=readPortableCharacter(writePortableCharacter(draft,catalogs,{ready:true}),catalogs);
  assert.equal(portable.preview.valid,true,JSON.stringify(portable.preview.errors));
  let serial=0,written;
  const saved={revision:1,data:portable.draft,sourceCommit:source.sourceCommit,languageBasis:"test"};
  const actor={documentName:"Actor",type:"character",uuid:"Actor.test",items:Object.assign(new Map(),{find(){return undefined}}),effects:new Map(),getFlag:(scope,key)=>key==="creationDraft"?saved:null,testUserPermission:()=>true,toObject:()=>({items:[],effects:[]}),validate(){},async update(){}};
  const message={id:"request",author:{},getFlag:()=>({actorUuid:actor.uuid,revision:1}),async update(){}};
  const exports={registerAuthority(){},ensureAuthorityReady(){},writeCharacterActor:async(a,changes)=>{written=changes;for(const item of changes.items)a.items.set(item._id,item)},isCreationAuthority:()=>true,bindCreationAuthority(){},enqueueCharacterOperation:fn=>fn(),loadCatalogs:async()=>catalogs,getCampaignLanguageConfiguration:()=>({basis:"test",definitions:DEFAULT_LANGUAGES}),workshopCharacter,nativePlayEffects:()=>({effects:[],wounds:{}}),importedCharacterState,abilityItemSource,equipmentItemSource};
  const api=await load("../src/services/creation.mjs",exports,{game:{messages:{get:()=>message}},fromUuid:async()=>actor,Item:class{validate(){}},foundry:{utils:{randomID:()=>String(++serial).padStart(16,"0"),expandObject:value=>value}}});
  assert.equal((await api.resolveCreationRequest("request")).status,"complete");
  const state=written["flags.heroes-of-legend.development"];
  assert.equal(state.level,3);assert.equal(state.safePlace,false,"Web planning does not approve a native safe place");assert.equal(state.dp,portable.preview.state.dp);assert(state.abilities.includes(signature));
  assert(state.abilities.includes("ability-conditioned-body"));assert.deepEqual(JSON.parse(JSON.stringify(state.ranks)),portable.preview.state.ranks);
  assert.equal(written["system.health.baseMax"],portable.preview.summary.maximumHp);assert.equal(written["system.health.value"],5);assert.equal(written["system.grit.spent"],1);
  assert(state.ledger.some(entry=>entry.kind==="award"&&entry.level===3));
  assert(written.items.some(item=>item.flags["heroes-of-legend"].catalogId===signature));
});

test("milestone and safe-place completion waits follow their own receipts, errors and no-op results",async()=>{
  let receipt,result,failure;
  const exports={editCharacterLanguage(){},getCampaignLanguageConfiguration(){},writeCharacterActor(){},ensureAuthorityReady(){},enqueueCharacterOperation(){},isCreationAuthority(){},buildCharacterItems(){},validateCreationChanges(){},loadCatalogs(){},awardMilestones(){},advancementPreview(){}};
  const api=await load("../src/services/advancement.mjs",exports,{game:{messages:{get:()=>({getFlag:(scope,key)=>key==="developmentFailure"?failure:result})}}});
  const actor={getFlag:()=>receipt};let finished=false;
  const pending=api.waitForDevelopmentOperation(actor,"award",{timeout:100,interval:1}).then(()=>finished=true);
  receipt={other:{applied:true}};await new Promise(resolve=>setTimeout(resolve,3));assert.equal(finished,false);
  receipt.award={applied:true};await pending;assert.equal(finished,true);
  receipt={};result={complete:true,status:"unchanged"};assert.equal((await api.waitForDevelopmentOperation(actor,"safe")).status,"unchanged");
  result=null;failure="A GM must approve this milestone";await assert.rejects(api.waitForDevelopmentOperation(actor,"award"),/GM must approve/);
  failure=null;await assert.rejects(api.waitForDevelopmentOperation(actor,"award",{timeout:2,interval:1}),/not completed/);
});

test("custom native ability Read enriches local description inline with item permissions and owner secrets",async()=>{
  const source=await readFile(new URL("../src/sheets/character.mjs",import.meta.url),"utf8");
  const exports={};for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(",").map(name=>name.trim()).filter(Boolean))exports[name]=class{};
  let enriched,focused=0;
  const foundry={utils:{escapeHTML:value=>value.replaceAll("<","&lt;").replaceAll(">","&gt;")},applications:{api:{HandlebarsApplicationMixin:base=>base},sheets:{ActorSheetV2:class{}},ux:{TextEditor:{implementation:{enrichHTML:async(description,options)=>{enriched={description,options};return "<p>Sanitized local description</p>"}}}}}};
  const {CharacterSheet}=await load("../src/sheets/character.mjs",exports,{foundry,game:{user:{id:"owner"}}});
  const content={innerHTML:""},panel={hidden:true,querySelector:selector=>selector==="[data-rule-content]"?content:{focus:()=>focused++}};
  let allowed=true;const item={name:"<Custom>",system:{description:"<p>Local description</p>"},isOwner:true,getFlag:()=>null,testUserPermission:(user,level)=>{assert.equal(level,"OBSERVER");return allowed}};
  const app={actor:{items:{get:()=>item}},element:{querySelector:()=>panel}};
  const target={closest:()=>({dataset:{itemId:"custom"}})};
  await CharacterSheet.openAbility.call(app,null,target);
  assert.equal(panel.hidden,false);assert(content.innerHTML.includes("&lt;Custom&gt;"));assert(content.innerHTML.includes("Sanitized local description"));assert.equal(enriched.options.relativeTo,item);assert.equal(enriched.options.secrets,true);assert.equal(focused,1);
  allowed=false;enriched=null;await CharacterSheet.openAbility.call(app,null,target);assert.equal(enriched,null);
});

test("pending native Save makes controls inert and ignores later edits and duplicate Save without stranded promises",async()=>{
  let release;const held=new Promise(resolve=>release=resolve),f=await wizard(true,()=>held);
  f.app.element={inert:false,setAttribute(){},removeAttribute(){}};
  const committing=f.CreationWizard.commitCreation.call(f.app);
  while(!f.events.some(([event])=>event==="completion"))await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(f.app.element.inert,true);assert.equal(f.app.committing,true);
  let edited=false;await f.CreationWizard.prototype.act.call(f.app,async()=>{edited=true});
  await f.CreationWizard.commitCreation.call(f.app);
  assert.equal(edited,false);assert.equal(f.app.pendingActions,undefined);assert.equal(f.events.filter(([event])=>event==="request").length,1);
  release();await committing;assert.equal(f.app.element.inert,false);assert.equal(f.app.committing,false);
});

test("advancement Save blocks overlapping edits/commit and restores controls after a failed backend receipt",async()=>{
  const source=await readFile(new URL("../src/applications/advancement.mjs",import.meta.url),"utf8"),exports={};
  for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(",").map(name=>name.trim()).filter(Boolean))exports[name]=class{};
  let release,requests=0,error;const held=new Promise(resolve=>release=resolve);
  Object.assign(exports,{requestDevelopment:async()=>{requests++;return{id:"request"}},waitForDevelopment:async()=>{await held;throw new Error("Receipt failed")}});
  const {AdvancementWizard}=await load("../src/applications/advancement.mjs",exports,{foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}},ui:{notifications:{error:message=>error=message}}});
  const app={actor:{},draftId:"draft",revision:1,element:{inert:false,setAttribute(){},removeAttribute(){}},capture(){},async persist(){}};
  const committing=AdvancementWizard.commit.call(app);while(!requests)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(app.element.inert,true);let edited=false;await AdvancementWizard.prototype.act.call(app,async()=>edited=true);await AdvancementWizard.commit.call(app);assert.equal(requests,1);assert.equal(edited,false);
  release();await committing;assert.equal(error,"Receipt failed");assert.equal(app.element.inert,false);assert.equal(app.committing,false);assert.equal(app.pendingActions,undefined);
});

test("Save waits for a queued advancement purchase before deciding an apparently empty draft is unchanged",async()=>{
  const source=await readFile(new URL("../src/applications/advancement.mjs",import.meta.url),"utf8"),exports={};
  for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(",").map(name=>name.trim()).filter(Boolean))exports[name]=class{};
  const events=[];Object.assign(exports,{currentDevelopment:()=>({pendingSignatures:[]}),requestDevelopment:async()=>{events.push("request");return{id:"request"}},waitForDevelopment:async()=>events.push("receipt")});
  const {AdvancementWizard}=await load("../src/applications/advancement.mjs",exports,{foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}},ui:{notifications:{error:message=>{throw new Error(message)}}}});
  const app={busy:true,preview:{valid:true},draft:{purchases:[]},actor:{sheet:{render:async()=>events.push("sheet")}},draftId:"draft",revision:1,capture(){events.push("capture")},async persist(){events.push("persist")},async close(){events.push("close")},async act(fn){if(this.busy)await new Promise(resolve=>(this.idleWaiters??=[]).push(resolve));await fn();await this.persist()}};
  const saving=AdvancementWizard.commit.call(app);await new Promise(resolve=>setTimeout(resolve,1));assert.deepEqual(events,[]);
  app.draft.purchases.push({id:"ability-conditioned-body"});app.busy=false;for(const resolve of app.idleWaiters.splice(0))resolve();await saving;
  assert.equal(events.filter(event=>event==="request").length,1);assert(events.indexOf("receipt")<events.indexOf("close"));assert.equal(events.at(-1),"sheet");
});
