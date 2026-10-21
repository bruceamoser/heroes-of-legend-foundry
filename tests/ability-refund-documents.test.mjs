import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {changeCharacterLevel,refundLearnedAbility} from '../src/rules/development.mjs';
const ID='heroes-of-legend';
async function fixture({deleteFailure=null,owner=true}={}){
 const flags={development:{level:1,dp:-2,abilities:['paid'],purchases:[{id:'paid',cost:2,level:1}],ledger:[{kind:'purchase',id:'paid',delta:-2}],revision:0}};
 const docs=[{id:'paid-item',_id:'paid-item',type:'ability',flags:{[ID]:{catalogId:'paid'}},getFlag:(_,key)=>key==='catalogId'?'paid':null}];
 docs.has=id=>docs.some(item=>item.id===id);
 let deletions=0,writes=0,failed=false;
 const actor={name:'Aria',type:'character',uuid:'Actor.hero',pack:null,isToken:false,system:{grit:{granted:2,spent:1}},items:docs,getFlag:(_,key)=>flags[key],testUserPermission:()=>owner,toObject:()=>({items:docs}),async update(changes){writes++;for(const [path,value]of Object.entries(changes)){if(path==='items')throw Error('Omitted embedded items are not deletions');const parts=path.split('.').slice(2);let target=flags;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=structuredClone(value);}return actor;},async deleteEmbeddedDocuments(type,ids){assert.equal(type,'Item');deletions++;if(deleteFailure==='before'&&!failed){failed=true;throw Error('Delete interrupted');}for(const id of ids){const index=docs.findIndex(item=>item.id===id);if(index>=0)docs.splice(index,1);}if(deleteFailure==='after'&&!failed){failed=true;throw Error('Delete confirmation interrupted');}return [];}};
 const request={actorUuid:actor.uuid,kind:'refundAbility',abilityId:'paid'},message={id:'refund1',author:{id:'owner'},getFlag:(_,key)=>key==='developmentRequest'?request:null,async update(changes){Object.assign(message,changes);}};
 const context=createContext({structuredClone,game:{messages:new Map([[message.id,message]])},fromUuid:async()=>actor,foundry:{utils:{escapeHTML:value=>value}}});
 const mocks={
  './authority.mjs':{createActionMessage(){},shouldProcessRequest(){},writeCharacterActor:(doc,changes)=>doc.update(changes),ensureAuthorityReady(){}},
  './creation.mjs':{enqueueCharacterOperation:run=>run(),isCreationAuthority:()=>true,buildCharacterItems(){},validateCreationChanges(){}},
  './catalog.mjs':{loadCatalogs:async()=>({choices:[{id:'paid',kind:'ability'}]})},
  '../rules/development.mjs':{changeCharacterLevel,refundLearnedAbility},
  '../rules/character-languages.mjs':{editCharacterLanguage(){}},
  './languages.mjs':{getCampaignLanguageConfiguration(){}},
  '../rules/advancement.mjs':{advancementPreview(){},signatureChoicePreview(){}},
 };
 const module=new SourceTextModule(await readFile(new URL('../src/services/advancement.mjs',import.meta.url),'utf8'),{context});
 await module.link(async name=>{const exports=mocks[name];assert(exports,name);return new SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});});await module.evaluate();
 return {api:module.namespace,actor,flags,docs,message,request,get deletions(){return deletions;},get writes(){return writes;}};
}
test('paid ability refund physically deletes its embedded Item and exact replay never credits DP twice',async()=>{
 const f=await fixture();await f.api.resolveDevelopmentRequest('refund1');assert.equal(f.flags.development.dp,0);assert.equal(f.docs.has('paid-item'),false);assert.equal(f.deletions,1);assert.equal(f.flags.operationReceipts.refund1.applied,true);
 await f.api.resolveDevelopmentRequest('refund1');assert.equal(f.flags.development.dp,0);assert.equal(f.deletions,1);
});
for(const timing of ['before','after'])test(`interrupted item deletion (${timing}) resumes saved refund without duplicate DP`,async()=>{
 const f=await fixture({deleteFailure:timing});await assert.rejects(f.api.resolveDevelopmentRequest('refund1'),/interrupted/);
 assert.equal(f.flags.development.dp,0);assert.equal(f.flags.operationReceipts.refund1.applied,false);
 await f.api.resolveDevelopmentRequest('refund1');assert.equal(f.flags.development.dp,0);assert.equal(f.docs.has('paid-item'),false);assert.equal(f.flags.operationReceipts.refund1.applied,true);
});
test('refund validates ownership before any credit or embedded deletion',async()=>{
 const f=await fixture({owner:false});await assert.rejects(f.api.resolveDevelopmentRequest('refund1'),/Unauthorized/);assert.equal(f.writes,0);assert.equal(f.deletions,0);assert.equal(f.flags.development.dp,-2);
});

test('owned synthetic token actors can add and remove a level without changing the base actor',async()=>{
 const f=await fixture();f.actor.isToken=true;f.request.kind='addLevel';f.request.revision=0;await f.api.resolveDevelopmentRequest('refund1');assert.equal(f.flags.development.level,2);assert.equal(f.flags.development.dp,8);
});
