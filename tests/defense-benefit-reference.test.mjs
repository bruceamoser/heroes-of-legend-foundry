import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
test('explicit Defend creates its removable benefit and posts its reference without weapon locals',async()=>{
 const created=[],posted=[],ID='heroes-of-legend';
 const actor={testUserPermission:()=>true,effects:[],async createEmbeddedDocuments(type,data){created.push({type,data});}};
 const item={actor,name:'Defend',img:'defend.webp',getFlag:(_,key)=>key==='catalogId'?'ability-defend':null};
 const context=createContext({game:{user:{id:'owner'}}});
 async function synthetic(exports){const dependency=new SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value)},{context});await dependency.link(()=>{});await dependency.evaluate();return dependency;}
 const source=await readFile(new URL('../src/services/abilities.mjs',import.meta.url),'utf8');
 const imports=new Map();for(const [,names,path]of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)){imports.set(path,{...imports.get(path),...Object.fromEntries(names.split(',').map(s=>s.trim()).filter(Boolean).map(name=>[name,()=>{}]))});}
 const module=new SourceTextModule(source,{context,importModuleDynamically:async path=>{assert.equal(path,'./reference-play.mjs');return synthetic({postAbilityReference:async(...args)=>{posted.push(args);return {id:'message'};}})}});
 await module.link(path=>synthetic(imports.get(path)));await module.evaluate();
 const message=await module.namespace.activateDefenseBenefit(item);
 assert.equal(message.id,'message');assert.equal(created.length,1);assert.equal(created[0].type,'ActiveEffect');assert.equal(created[0].data[0].flags[ID].benefit.key,'defend');assert.equal(posted.length,1);assert.equal(posted[0].length,1);assert.equal(posted[0][0],item);
});
