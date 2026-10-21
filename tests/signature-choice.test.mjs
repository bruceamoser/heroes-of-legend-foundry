import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {advancementPreview,signatureChoicePreview} from '../src/rules/advancement.mjs';
import {DEFAULT_LANGUAGES} from '../src/rules/languages.mjs';
const source=JSON.parse(await readFile(new URL('../static/data/choices.json',import.meta.url))),choices=source.records,inventory=JSON.parse(await readFile(new URL('../static/data/inventory.json',import.meta.url))),ID='heroes-of-legend';
const state=()=>({level:7,stage:'advancement',dp:12,classId:'class-intellect',ranks:{},abilities:[],recipes:[],purchases:[],capabilities:[],compatibleRecipes:[],gritGranted:2,gritSpent:1,items:[],acquisitionReceipts:[],pendingSignatures:[3,7],languages:[],creation:{},revision:4});
const intellect=(level)=>choices.find(choice=>choice.id==='class-intellect').signatures[level][0];
test('direct signature preview resolves only the requested tier and preserves DP, pending tiers and input',()=>{
 for(const level of [3,7]){const current=state(),before=structuredClone(current),result=signatureChoicePreview(current,{level,id:intellect(level)},choices,inventory,DEFAULT_LANGUAGES);assert(result.valid);assert.deepEqual(result.state.pendingSignatures,[3,7].filter(tier=>tier!==level));assert.deepEqual(result.state.abilities,[intellect(level)]);assert.equal(result.state.dp,current.dp);assert.equal(result.state.gritSpent,1);assert.deepEqual(current,before);assert.equal(result.ledger.length,1);}
});
test('direct signature selection validates earned tier, class and acquisition choices',()=>{
 assert(!signatureChoicePreview({...state(),level:3},{level:7,id:intellect(7)},choices,inventory).valid);
 assert(signatureChoicePreview({...state(),pendingSignatures:[3]},{level:7,id:intellect(7)},choices,inventory).valid);
 assert(!signatureChoicePreview(state(),{level:3,id:'ability-signature-blade-sweeping-entry'},choices,inventory).valid);
 const current={...state(),classId:'class-blade',pendingSignatures:[3]},id='ability-signature-blade-return-stroke';
 assert(!signatureChoicePreview(current,{level:3,id},choices,inventory).valid);
 const chosen=signatureChoicePreview(current,{level:3,id,selection:{meleeHands:2}},choices,inventory);assert(chosen.valid);assert.equal(chosen.state.items[0].catalogId,'item-ordinary-melee-weapon');assert.equal(chosen.state.items[0].hands,2);
});
async function service({owner=true,revision=4,signatureId=intellect(7),interruptReceipt=false,initialState=state(),deleteFailure=null}={}){
 const saved={id:'savedPaidDraft00',revision:5,baseRevision:4,data:{purchases:[{id:'ability-conditioned-body'}],signatures:{},acquisitions:{}}};
 const wrap=data=>({...data,id:data._id,getFlag:(_,key)=>data.flags?.[ID]?.[key]});
 const flags={development:structuredClone(initialState),advancementDraft:structuredClone(saved)},docs=initialState.abilities.map((id,index)=>wrap({_id:'existing'+index,type:'ability',flags:{[ID]:{catalogId:id}}}));docs.has=id=>docs.some(item=>item.id===id);docs.get=id=>docs.find(item=>item.id===id);
 let writes=0,plans=0,interrupted=false,deletionFailed=false,deletions=0;
 const actor={type:'character',name:'Hero',uuid:'Actor.hero',system:{grit:{granted:2,spent:1}},items:docs,getFlag:(_,key)=>flags[key],testUserPermission:()=>owner,async update(changes){writes++;if(interruptReceipt&&!interrupted&&Object.keys(changes).some(path=>path.endsWith('.applied'))){interrupted=true;throw Error('Receipt confirmation interrupted');}for(const [path,value]of Object.entries(changes)){if(path==='items'){docs.splice(0,docs.length,...value.map(wrap));continue;}const parts=path.split('.').slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=structuredClone(value);}return actor;},async deleteEmbeddedDocuments(_type,ids){deletions++;if(deleteFailure==='before'&&!deletionFailed){deletionFailed=true;throw Error('Deletion interrupted before');}for(const id of ids){const index=docs.findIndex(item=>item.id===id);if(index>=0)docs.splice(index,1);}if(deleteFailure==='after'&&!deletionFailed){deletionFailed=true;throw Error('Deletion interrupted after');}return ids;}};
 const request={actorUuid:actor.uuid,kind:'chooseSignature',level:7,signatureId,selection:{},revision,sourceCommit:source.sourceCommit,languageBasis:'test'},message={id:'signatureRequest',author:{id:'owner'},getFlag:(_,key)=>key==='developmentRequest'?request:null,async update(){}};
 const context=createContext({structuredClone,game:{messages:new Map([[message.id,message]])},fromUuid:async()=>actor,foundry:{utils:{escapeHTML:value=>value}}});
 const mocks={
  './authority.mjs':{createActionMessage(){},shouldProcessRequest(){},writeCharacterActor:(document,changes)=>document.update(changes),ensureAuthorityReady(){}},
  './creation.mjs':{enqueueCharacterOperation:run=>run(),isCreationAuthority:()=>true,buildCharacterItems(_actor,ids){plans++;const items=docs.map(item=>({_id:item.id,type:item.type,flags:structuredClone(item.flags)})),createdIds=[];for(const id of ids)if(!items.some(item=>item.flags?.[ID]?.catalogId===id)){const _id='new'+items.length;items.push({_id,type:'ability',flags:{[ID]:{catalogId:id}}});createdIds.push(_id);}return {items,createdIds};},validateCreationChanges(){}},
  './catalog.mjs':{loadCatalogs:async()=>({choices,inventory,commit:source.sourceCommit})},
  '../rules/development.mjs':{changeCharacterLevel(){},refundLearnedAbility(){}},
  '../rules/character-languages.mjs':{editCharacterLanguage(){}},
  './languages.mjs':{getCampaignLanguageConfiguration:()=>({basis:'test',definitions:DEFAULT_LANGUAGES})},
  '../rules/advancement.mjs':{advancementPreview,signatureChoicePreview},
 };
 const module=new SourceTextModule(await readFile(new URL('../src/services/advancement.mjs',import.meta.url),'utf8'),{context});await module.link(name=>{const values=mocks[name];assert(values,name);return new SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});await module.evaluate();
 return{api:module.namespace,flags,saved,docs,request,get writes(){return writes},get plans(){return plans},get deletions(){return deletions}};
}
test('owner direct signature save grants only its selected ability and leaves the saved purchase draft byte-for-byte intact',async()=>{
 const f=await service();await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.flags.development.dp,12);assert.deepEqual(f.flags.development.pendingSignatures,[3]);assert.deepEqual(f.flags.development.abilities,[intellect(7)]);assert.deepEqual(f.flags.advancementDraft,f.saved);assert.equal(f.docs.length,1);assert(f.flags.operationReceipts.signatureRequest.applied);await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.docs.length,1);assert.equal(f.plans,1);
});
test('direct signature service rejects stale revision, non-owner and a different class before writing',async()=>{
 for(const options of [{owner:false},{revision:3},{signatureId:'ability-signature-blade-dance-through-steel'}]){const f=await service(options);await assert.rejects(f.api.resolveDevelopmentRequest('signatureRequest'));assert.equal(f.writes,0);assert.equal(f.docs.length,0);assert.deepEqual(f.flags.advancementDraft,f.saved);}
});
test('interrupted signature confirmation reuses the committed grant rather than duplicating it',async()=>{
 const f=await service({interruptReceipt:true});await assert.rejects(f.api.resolveDevelopmentRequest('signatureRequest'),/interrupted/);assert.equal(f.docs.length,1);assert.equal(f.flags.operationReceipts.signatureRequest.applied,false);await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.flags.operationReceipts.signatureRequest.applied,true);assert.equal(f.docs.length,1);assert.equal(f.plans,1);assert.deepEqual(f.flags.advancementDraft,f.saved);
});

test('switching a free signature retires only its old Item and preserves paid extras, DP and purchase draft',async()=>{
 const old=intellect(7),next=choices.find(choice=>choice.id==='class-intellect').signatures[7][1],paid=choices.find(choice=>choice.id==='class-intellect').signatures[7][2];
 const initial={...state(),abilities:[old,paid],signatureChoices:{7:old},purchases:[{id:paid,cost:8}],ledger:[{kind:'signature-grant',level:7,id:old,delta:0},{kind:'purchase',level:7,id:paid,delta:-8}]};
 const f=await service({initialState:initial,signatureId:next});await f.api.resolveDevelopmentRequest('signatureRequest');assert(!f.docs.some(item=>item.getFlag(ID,'catalogId')===old));assert(f.docs.some(item=>item.getFlag(ID,'catalogId')===paid));assert(f.docs.some(item=>item.getFlag(ID,'catalogId')===next));assert.equal(f.docs.length,2);assert.equal(f.flags.development.dp,initial.dp);assert.deepEqual(f.flags.advancementDraft,f.saved);assert.equal(f.flags.development.signatureChoices[7],next);assert.equal(f.deletions,1);await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.deletions,1);assert.equal(f.plans,1);
});
test('interrupted signature replacement deletion resumes its durable receipt without duplicate grants',async()=>{
 for(const timing of ['before','after']){const old=intellect(7),next=choices.find(choice=>choice.id==='class-intellect').signatures[7][1],initial={...state(),abilities:[old],signatureChoices:{7:old},ledger:[{kind:'signature-grant',level:7,id:old,delta:0}]};const f=await service({initialState:initial,signatureId:next,deleteFailure:timing});await assert.rejects(f.api.resolveDevelopmentRequest('signatureRequest'),/Deletion interrupted/);assert.equal(f.flags.operationReceipts.signatureRequest.applied,false);await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.flags.operationReceipts.signatureRequest.applied,true);assert.equal(f.docs.length,1);assert.equal(f.docs[0].getFlag(ID,'catalogId'),next);assert.equal(f.plans,1);assert.deepEqual(f.flags.advancementDraft,f.saved);}
});
test('choosing an already-paid alternative reuses its Item without refund or removal of paid ownership',async()=>{
 const old=intellect(7),paid=choices.find(choice=>choice.id==='class-intellect').signatures[7][1],initial={...state(),abilities:[old,paid],signatureChoices:{7:old},purchases:[{id:paid,cost:8}],ledger:[{kind:'signature-grant',level:7,id:old,delta:0},{kind:'purchase',level:7,id:paid,delta:-8}]};const f=await service({initialState:initial,signatureId:paid});await f.api.resolveDevelopmentRequest('signatureRequest');assert.equal(f.docs.length,1);assert.equal(f.docs[0].id,'existing1');assert.equal(f.flags.development.dp,initial.dp);assert.deepEqual(f.flags.development.purchases,initial.purchases);assert.deepEqual(f.flags.advancementDraft,f.saved);
});
