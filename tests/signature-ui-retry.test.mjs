import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
test('signature Save retries its existing request after interrupted confirmation instead of creating a new grant',async()=>{
 const source=await readFile(new URL('../src/applications/advancement.mjs',import.meta.url),'utf8'),mocks={};for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(',').map(name=>name.trim()).filter(Boolean))mocks[name]=()=>{};
 const events=[],errors=[];let attempts=0;
 Object.assign(mocks,{requestDevelopment:async()=>{events.push('request');return{id:'same-request'};},resolveDevelopmentRequest:async id=>events.push('retry:'+id),waitForDevelopmentOperation:async()=>{if(!attempts++)throw Error('Confirmation interrupted');events.push('confirmed');}});
 const context=createContext({structuredClone,JSON,foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:base=>base}}},ui:{notifications:{error:message=>errors.push(message)}}});const module=new SourceTextModule(source,{context});await module.link(()=>new SyntheticModule(Object.keys(mocks),function(){for(const [key,value]of Object.entries(mocks))this.setExport(key,value);},{context}));await module.evaluate();
 const app={actor:{sheet:{render:async()=>events.push('sheet')}},signatureLevel:7,draft:{signatures:{7:'selected'},acquisitions:{}},baseRevision:4,catalogs:{commit:'book'},languageBasis:'languages',capture(){},close:async()=>events.push('close'),element:{inert:false}};
 await module.namespace.AdvancementWizard.commitSignature.call(app);assert.equal(events.filter(e=>e==='request').length,1);assert.equal(app.element.inert,false);assert.equal(app.committing,false);assert.equal(errors[0],'Confirmation interrupted');
 await module.namespace.AdvancementWizard.commitSignature.call(app);assert.deepEqual(events,['request','retry:same-request','confirmed','close','sheet']);assert.equal(app.element.inert,false);
});

test('actual sheet signature buttons route tiers 1, 3 and 7 into the focused chooser',async()=>{
 const source=await readFile(new URL('../src/sheets/character.mjs',import.meta.url),'utf8'),mocks={};for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g))for(const name of match[1].split(',').map(name=>name.trim()).filter(Boolean))mocks[name]=()=>{};
 const calls=[];mocks.AdvancementWizard=class{constructor(actor,options){calls.push({actor,options});}async render(options){calls.at(-1).render=options;}};
 const context=createContext({foundry:{applications:{api:{HandlebarsApplicationMixin:base=>base},sheets:{ActorSheetV2:class{}}}}});const module=new SourceTextModule(source,{context});await module.link(()=>new SyntheticModule(Object.keys(mocks),function(){for(const [key,value]of Object.entries(mocks))this.setExport(key,value);},{context}));await module.evaluate();
 const actor={isOwner:true};for(const level of [1,3,7])await module.namespace.CharacterSheet.chooseClassSignature.call({actor},null,{dataset:{level:String(level)}});
 assert.equal(calls.length,3);for(const [index,level]of [1,3,7].entries()){assert.equal(calls[index].actor,actor);assert.equal(calls[index].options.signatureLevel,level);assert.equal(calls[index].render.force,true);}
 for(const level of ['0','2','8','invalid'])await module.namespace.CharacterSheet.chooseClassSignature.call({actor},null,{dataset:{level}});await module.namespace.CharacterSheet.chooseClassSignature.call({actor:{isOwner:false}},null,{dataset:{level:'1'}});assert.equal(calls.length,3);
});
