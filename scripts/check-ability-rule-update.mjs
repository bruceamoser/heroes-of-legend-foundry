import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {chromium} from "playwright";
import {selectTestUser} from "./helpers/login.mjs";
const url=process.env.HOL_TEST_URL,ID="heroes-of-legend";
if(!url||!["localhost","127.0.0.1"].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=="1"||process.env.HOL_TEST_ISOLATED_WORLD!=="1")throw new Error("Use an explicitly authorized isolated local Foundry world.");
const old=JSON.parse(await readFile(new URL("../tests/fixtures/ability-rule-update-v271.json",import.meta.url)));
const fixtureId=`ability-rule-update-263-${Date.now()}`,output=process.env.HOL_TEST_ABILITY_UPDATE_OUTPUT??"test-results/ability-rule-update";
const evidence={fixtureId,startedAt:new Date().toISOString(),cases:[],browserErrors:[],cleanup:[]};
let browser,page,player,fixture,failure;
await mkdir(output,{recursive:true});
async function join(name){const context=await browser.newContext({viewport:{width:1500,height:1100}});await context.addInitScript(()=>localStorage.setItem("core.noCanvas","true"));const p=await context.newPage();p.on("pageerror",error=>evidence.browserErrors.push(error.message));await p.goto(url);await selectTestUser(p,name);await p.locator("button[name=join]").click();await p.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await p.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return p;}
async function openSheet(itemId){await page.evaluate(async({actorId,itemId})=>{const item=game.actors.get(actorId).items.get(itemId);await item.sheet.render({force:true});globalThis.__hol263AbilityUpdate.sheet=item.sheet;},{actorId:fixture.actor,itemId});await page.locator(".hol-ability").getByRole("button",{name:"Update rules",exact:true}).waitFor();}
async function clickUpdate(){await page.locator(".hol-ability").getByRole("button",{name:"Update rules",exact:true}).click();const dialog=page.getByRole("dialog").filter({has:page.getByRole("button",{name:"Apply corrections",exact:true})});await dialog.waitFor();return dialog;}
async function snapshot(){return page.evaluate(actorId=>{const actor=game.actors.get(actorId);return{actor:actor.toObject(),items:actor.items.map(item=>item.toObject())};},fixture.actor);}
try{
 browser=await chromium.launch();page=await join(process.env.HOL_TEST_USER??"Gamemaster");
 fixture=await page.evaluate(async({old,fixtureId,ID})=>{
  const state=globalThis.__hol263AbilityUpdate={actor:null,user:null,sheet:null};
  const {loadCatalogs}=await import("/systems/heroes-of-legend/services/catalog.mjs");
  const catalogs=await loadCatalogs();
  const actor=await Actor.create({name:fixtureId,type:"character",system:{health:{baseMax:20,value:7},grit:{granted:3,spent:1}},flags:{[ID]:{testFixture:fixtureId,development:{creationSummary:{speedBase:6,capacity:10}}}}});state.actor=actor.id;
  const sources=["published","customized"].map(kind=>{const source=structuredClone(old);delete source._key;source._id=foundry.utils.randomID();source.name=`Triage ${kind}`;source.flags[ID].itemNotes=`Keep ${kind} notes`;source.flags[ID].creationGrant="keep-earned-slot";source.flags[ID].acquisitionInstance=`keep-${kind}`;if(kind==="customized"){source.system.description+="<p>Local campaign healing note.</p>";source.system.outcomes.weak="My custom Weak result";}return source;});
  const items=await actor.createEmbeddedDocuments("Item",sources,{keepId:true});
  const user=await User.create({name:`${fixtureId} observer`,role:1});state.user=user.id;
  return{actor:actor.id,published:items.find(item=>item.id===sources[0]._id).id,customized:items.find(item=>item.id===sources[1]._id).id,user:user.id,userName:user.name,system:game.system.version,foundry:game.version,commit:catalogs.commit};
 },{old,fixtureId,ID});
 evidence.installed={system:fixture.system,foundry:fixture.foundry,commit:fixture.commit};
 const before=await snapshot();
 await openSheet(fixture.published);
 let dialog=await clickUpdate();
 await dialog.getByText("Rules text",{exact:true}).click();
 assert.match(await dialog.innerText(),/Current/);assert.match(await dialog.innerText(),/Updated/);
 assert.match(await dialog.innerText(),/pay 3 HP before rolling/i);
 await dialog.screenshot({path:`${output}/published-preview.png`});
 await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await dialog.waitFor({state:"detached"});
 assert.deepEqual(await snapshot(),before,"Cancel must leave Actor and Items unchanged.");
 evidence.cases.push("Exact v2.7.1 Triage preview displays Current/Updated rules, including the missing HP cost; Cancel changes no document.");
 dialog=await clickUpdate();await dialog.getByRole("button",{name:"Apply corrections",exact:true}).click();await dialog.waitFor({state:"detached"});
 await page.waitForFunction(({actorId,itemId,ID})=>game.actors.get(actorId).items.get(itemId).system.outcomes.weak.includes("restore 6 HP"),{actorId:fixture.actor,itemId:fixture.published,ID});
 const published=await page.evaluate(({actorId,itemId})=>game.actors.get(actorId).items.get(itemId).toObject(),{actorId:fixture.actor,itemId:fixture.published});
 assert.deepEqual(published.system.outcomes,{weak:"One ally: restore 6 HP. Two allies: restore 4 HP each.",standard:"One ally: restore 11 HP. Two allies: restore 7 HP each.",strong:"One ally: restore 16 HP. Two allies: restore 10 HP each."});
 assert.match(published.system.description,/pay 3 HP before rolling/i);assert.match(published.system.description,/must leave you above 0 HP/i);assert.match(published.system.description,/Requires a free hand/);
 const original=before.items.find(item=>item._id===fixture.published);
 for(const key of ["_id","name","effects"])assert.deepEqual(published[key],original[key]);
 for(const key of ["itemNotes","creationGrant","acquisitionInstance"])assert.deepEqual(published.flags[ID][key],original.flags[ID][key]);
 await page.locator(".hol-ability").screenshot({path:`${output}/published-corrected.png`});
 evidence.cases.push("Confirmed correction restores both Triage healing profiles and complete HP cost; Item identity, notes, grants and effects remain intact.");
 await page.evaluate(()=>__hol263AbilityUpdate.sheet.close());await openSheet(fixture.customized);
 dialog=await clickUpdate();assert.match(await dialog.innerText(),/Local changes preserved/);assert.match(await dialog.innerText(),/Rules text/);assert.match(await dialog.innerText(),/Weak result/);
 await dialog.screenshot({path:`${output}/customized-preview.png`});
 await dialog.getByRole("button",{name:"Apply corrections",exact:true}).click();await dialog.waitFor({state:"detached"});
 await page.waitForFunction(({actorId,itemId})=>game.actors.get(actorId).items.get(itemId).system.outcomes.standard.includes("restore 11 HP"),{actorId:fixture.actor,itemId:fixture.customized});
 const after=await snapshot(),custom=after.items.find(item=>item._id===fixture.customized),originalCustom=before.items.find(item=>item._id===fixture.customized);
 assert.equal(custom.system.description,originalCustom.system.description);assert.equal(custom.system.outcomes.weak,"My custom Weak result");
 assert.equal(custom.system.outcomes.standard,"One ally: restore 11 HP. Two allies: restore 7 HP each.");
 assert.deepEqual(after.actor.system,before.actor.system,"Updating Item rules must preserve Actor resources and state.");
 for(const key of ["_id","name","effects"])assert.deepEqual(custom[key],originalCustom[key]);
 for(const key of ["itemNotes","creationGrant","acquisitionInstance"])assert.deepEqual(custom.flags[ID][key],originalCustom.flags[ID][key]);
 evidence.cases.push("Customized description and Weak outcome are listed and retained; untouched Standard/Strong fields update while Actor HP/Grit and all other state remain intact.");
 player=await join(fixture.userName);
 const denied=await player.evaluate(async({actorId,itemId})=>{const item=game.actors.get(actorId)?.items.get(itemId);const api=await import("/systems/heroes-of-legend/services/ability-rule-update.mjs");let error,applyError;try{await api.previewAbilityRuleUpdate(item);}catch(e){error=e.message;}try{await api.applyAbilityRuleUpdate(item,{});}catch(e){applyError=e.message;}return{available:await api.abilityRuleUpdateAvailable(item),error,applyError};},{actorId:fixture.actor,itemId:fixture.published});
 assert.equal(denied.available,false);assert.match(denied.error,/own/);assert.match(denied.applyError,/own/);assert.deepEqual(await snapshot(),after);
 evidence.cases.push("A separate nonowner player client cannot preview/apply the correction and sees no available update action.");
 assert.deepEqual(evidence.browserErrors,[]);
}catch(error){failure=error;evidence.failure=error.stack;if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});}
finally{
 await player?.context().close();
 if(page){try{evidence.cleanup=await page.evaluate(async({fixtureId,ID})=>{const result=[],state=globalThis.__hol263AbilityUpdate;await state?.sheet?.close();for(const actor of game.actors.filter(actor=>actor.getFlag(ID,"testFixture")===fixtureId)){try{await actor.delete();result.push({kind:"Actor",id:actor.id,deleted:true});}catch(error){result.push({kind:"Actor",id:actor.id,deleted:false,error:error.message});}}if(state?.user){try{await game.users.get(state.user)?.delete();result.push({kind:"User",id:state.user,deleted:true});}catch(error){result.push({kind:"User",id:state.user,deleted:false,error:error.message});}}return result;},{fixtureId,ID});if(evidence.cleanup.some(result=>!result.deleted))failure??=new Error("Ability update fixture cleanup failed.");}catch(error){evidence.cleanupFailure=error.stack;failure??=error;}}
 await browser?.close();evidence.finishedAt=new Date().toISOString();await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));
}
if(failure)throw failure;
console.log("PASS native Ability Update rules preview/cancel/apply, exact Triage values/cost, custom preservation, nonowner denial and fixture cleanup.");
