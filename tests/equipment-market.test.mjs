import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {equipmentEligibility} from '../src/rules/equipment-eligibility.mjs';
async function fixture({coins=20,owner=true,failPayment=false}={}){
 const errors=[],created=[],removed=[];const actor={isOwner:owner,testUserPermission:()=>owner,items:[],getFlag:()=>({coins}),deleteEmbeddedDocuments:async(_type,ids)=>removed.push(...ids)};
 const source={id:'source',type:'equipment',name:'Ammunition Bundle',system:{catalogId:'item-ammunition-bundle'}};
 const exports={equipmentEligibility,equipmentCopyOptions:async()=>[{uuid:'Compendium.equipment.Item.source'}],loadCatalogs:async()=>({choices:[],inventory:{equipment:[{id:'item-ammunition-bundle',price:9,bulk:1,handChoices:[]}]}}),copyEquipmentToActor:async(_actor,_uuid,{quantity})=>{const item={id:'new',quantity};created.push(item);return item;},updateOwnedDocument:async(_actor,change)=>{if(failPayment)throw Error('Payment failed');coins=change['flags.heroes-of-legend.development.coins'];}};
 const context=createContext({fromUuid:async()=>source,game:{user:{}},ui:{notifications:{error:message=>errors.push(message)}},foundry:{applications:{api:{HandlebarsApplicationMixin:base=>base,ApplicationV2:class{}}}}});
 const module=new SourceTextModule(await readFile(new URL('../src/applications/equipment-market.mjs',import.meta.url),'utf8'),{context});await module.link(()=>new SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value);},{context}));await module.evaluate();
 const app=new module.namespace.EquipmentMarket(actor);app.render=async()=>{};
 const target={disabled:false,isConnected:true,closest:()=>({dataset:{uuid:'Compendium.equipment.Item.source'},querySelector:selector=>selector==='[data-market-quantity]'?{value:'2'}:null})};
 return {app,target,Market:module.namespace.EquipmentMarket,errors,created,removed,get coins(){return coins;}};
}
test('market Buy copies explicit quantity and deducts its exact catalog price',async()=>{const f=await fixture();await f.Market.buy.call(f.app,null,f.target);assert.equal(f.created[0].quantity,2);assert.equal(f.coins,2);assert.equal(f.errors.length,0);assert.equal(f.target.disabled,false);});
test('market refuses unaffordable or unauthorized purchases before granting an item',async()=>{for(const options of [{coins:10},{owner:false}]){const f=await fixture(options);await f.Market.buy.call(f.app,null,f.target);assert.equal(f.created.length,0);assert.equal(f.errors.length,1);}});
test('failed payment removes only the newly created equipment',async()=>{const f=await fixture({failPayment:true});await f.Market.buy.call(f.app,null,f.target);assert.deepEqual(f.removed,['new']);assert.equal(f.coins,20);assert.match(f.errors[0],/Payment failed/);});
