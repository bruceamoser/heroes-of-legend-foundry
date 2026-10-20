import test from "node:test";
import assert from "node:assert/strict";
import {manualScarRecords,requestManualScar} from "../src/services/scars.mjs";
test("manual scar metadata edits require owner and cannot remove catalog wounds or mutate mechanics",async()=>{
 const oldGame=globalThis.game,oldFoundry=globalThis.foundry;globalThis.game={user:{id:"owner"}};globalThis.foundry={utils:{randomID:()=>"ScarIdentity0001"}};
 try{const changes=[],flags={wounds:{catalog:{injury:"Applied wound",effectIds:["effect"]}},survival:{hp:7,wounds:3}};const original=structuredClone(flags);const actor={id:"character",type:"character",getFlag:(namespace,key)=>flags[key],testUserPermission:()=>true,update:async change=>{changes.push(change);}};
 const scar=await requestManualScar(actor,{kind:"add",name:" Old scar ",notes:" Local note "});assert.equal(scar.name,"Old scar");assert.equal(scar.notes,"Local note");assert.deepEqual(flags,original);assert.deepEqual(Object.keys(changes[0]),["flags.heroes-of-legend.wounds.ScarIdentity0001"]);
 flags.wounds[scar.id]={injury:scar.name,remedy:scar.notes,manualMetadata:true};assert.equal(manualScarRecords(actor)[0].manual,true);await requestManualScar(actor,{kind:"remove",id:scar.id});assert.deepEqual(Object.keys(changes[1]),["flags.heroes-of-legend.wounds.-=ScarIdentity0001"]);
 flags.wounds.ImportedScar0001={id:"manual-scar",injury:"Imported old scar",remedy:"Local note",importSource:{kind:"web-character",id:"manual-scar",roll:null},effectIds:[],recoveryValue:null};assert.ok(manualScarRecords(actor).some(record=>record.id==="ImportedScar0001"));await requestManualScar(actor,{kind:"remove",id:"ImportedScar0001"});assert.deepEqual(Object.keys(changes[2]),["flags.heroes-of-legend.wounds.-=ImportedScar0001"]);
 flags.wounds.CatalogScar00001={id:"physical-cosmetic",key:"111",injury:"Cosmetic printed scar",importSource:{kind:"web-character",id:"instance-id",roll:null},effectIds:[],recoveryValue:null};await assert.rejects(requestManualScar(actor,{kind:"remove",id:"CatalogScar00001"}),/manual scar/);
 await assert.rejects(requestManualScar(actor,{kind:"remove",id:"catalog"}),/manual scar/);await assert.rejects(requestManualScar(actor,{kind:"add",name:"  "}),/Scar name/);await assert.rejects(requestManualScar({...actor,testUserPermission:()=>false},{kind:"add",name:"Blocked"}),/owner/);assert.deepEqual(flags.wounds.catalog,original.wounds.catalog);assert.deepEqual(flags.survival,original.survival);
 }finally{globalThis.game=oldGame;globalThis.foundry=oldFoundry;}
});
