import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {defenseSignature} from '../src/services/defense-responses.mjs';
async function fixture({edited=false,missing=false,completed=false}={}) {
 const request={actorUuid:'Actor.hero',attackMessageId:'attack',basis:{mode:'defense'},draft:{}};
 const saved={actorUuid:'Actor.hero',rollerId:'player',attackMessageId:'attack',retained:[3,3,3],attackOutcome:{resolution:'numeric'}};
 const row={requestId:'roll',actorUuid:'Actor.hero',authorId:'player',attempt:1,status:'resolved',signature:await defenseSignature(request),resultSignature:missing?undefined:await defenseSignature(saved)};
 if(edited)saved.retained=[6,6,6];
 const flags={defenseRequest:request,roll:saved};let damages=0,evaluations=0;
 const attackFlags={attackCard:{},defenseResponses:[row],operationReceipts:completed?{roll:{applied:true}}:{}};
 const attack={id:'attack',author:{isGM:true},getFlag:(_id,key)=>attackFlags[key]};
 const message={id:'roll',author:{id:'player'},rolls:[{}],getFlag:(_id,key)=>flags[key]};
 const ctx=vm.createContext({crypto,TextEncoder,Uint8Array,structuredClone,game:{messages:new Map([['roll',message],['attack',attack]])}});
 const deps={'./authority.mjs':{ensureAuthorityReady:async()=>{},isCreationAuthority:()=>true,enqueueCharacterOperation:fn=>fn(),writeAuthorityDocument:async(doc,changes)=>{for(const[key,value]of Object.entries(changes)){const target=doc===attack?attackFlags:flags;if(key.startsWith('flags.')){const parts=key.split('.').slice(2);if(parts.length===1)target[parts[0]]=value;else (target[parts[0]]??={})[parts[1]]=value;}}}},'./roll-preparation.mjs':{rollBasis:()=>{},prepareRoll:()=>{}},'./roll.mjs':{evaluatePreparedRoll:()=>{evaluations++;throw Error('must not reroll');}},'./damage.mjs':{settleDefenseDamage:async()=>{damages++;return {event:{total:3},before:10,after:7};}}};
 const mod=new vm.SourceTextModule(await readFile(new URL('../src/services/defense-responses.mjs',import.meta.url),'utf8'),{context:ctx});await mod.link(spec=>{const values=deps[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});});await mod.evaluate();return {run:()=>mod.namespace.resolveDefenseRequest('roll'),get damages(){return damages;},get evaluations(){return evaluations;}};
}
test('legacy saved defense resumes without reroll or automatic damage; completed receipt remains replay only',async()=>{for(const completed of [false,true]){const f=await fixture({completed});await f.run();assert.equal(f.evaluations,0);assert.equal(f.damages,0);}});
test('edited or legacy unbound saved defense refuses resume and damage without reroll',async()=>{for(const options of [{edited:true},{missing:true}]){const f=await fixture(options);await assert.rejects(f.run(),/unverified or changed/);assert.equal(f.evaluations,0);assert.equal(f.damages,0);}});
