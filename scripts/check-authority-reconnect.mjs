import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {chromium} from "playwright";
import {selectTestUser} from "./helpers/login.mjs";
import {writePortableCharacter} from "../src/rules/portable-character.mjs";
const ID="heroes-of-legend", url=process.env.HOL_TEST_URL;
if (!url || !["localhost","127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES!=="1" || process.env.HOL_TEST_ISOLATED_WORLD!=="1") throw Error("Use an explicitly isolated local world.");
const catalogs={choices:JSON.parse(await readFile("static/data/choices.json")).records,inventory:JSON.parse(await readFile("static/data/inventory.json")),commit:JSON.parse(await readFile("static/data/choices.json")).sourceCommit};
const draft=structuredClone(JSON.parse(await readFile("tests/fixtures/reference-heroes.json")).characters[3].draft);
draft.name="Reconnect Oren";draft.languages={home:"elven",extraSpoken:["dwarven","halfling"]};
const exported=writePortableCharacter(draft,catalogs,{ready:true});
const browser=await chromium.launch(),errors=[],contexts=[],checks=[];let gm,fixture;
async function join(name){
 const context=await browser.newContext({viewport:{width:1440,height:1050}});contexts.push(context);
 await context.addInitScript(()=>{localStorage.setItem("core.noCanvas","true");localStorage.setItem("core.maxFPS","10");});
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
 await page.goto(`${url}/join`);await selectTestUser(page,name);await page.locator("button[name=join]").evaluate(e=>e.click());
 await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;
}
async function ready(page){await page.waitForFunction(()=>{const ID="heroes-of-legend",bound=game.settings.get(ID,"creationAuthorityClient");return bound===game.socket.id&&game.settings.get(ID,"authorityMeta").clientId===bound&&game.settings.get(ID,"authorityWork").clientId===bound&&game.settings.get(ID,"authorityWork").busy===false;},null,{timeout:30000});}
try{
 gm=await join(process.env.HOL_TEST_USER??"Gamemaster");await ready(gm);
 fixture=await gm.evaluate(async()=>{
  globalThis.__holReconnectFixture={actors:[],messages:game.messages.contents.map(m=>m.id),interrupted:game.settings.get("heroes-of-legend","interruptedOperations")};
  const user=await User.create({name:`Reconnect Owner ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});
  globalThis.__holReconnectFixture.user=user.id;globalThis.__holReconnectFixture.userName=user.name;
  const actors=globalThis.__holReconnectFixture.actors;for(const name of ["Reconnect GM draft","Reconnect player draft"])actors.push((await Actor.create({name,type:"character",ownership:{[user.id]:3}})).id);
  return globalThis.__holReconnectFixture;
 });
 for(const variant of ["prior-busy","legacy-malformed"]){
  await gm.evaluate(async variant=>{
   const ID="heroes-of-legend",old="old-fixture-client",stamp="2000-01-01T00:00:00.000Z";
   await game.settings.set(ID,"authorityMeta",{clientId:old,userId:"former-gm",browserId:"former-browser",launch:stamp});
   await game.settings.set(ID,"authorityLease",variant==="prior-busy"?{clientId:old,expires:99999999999999}:{});
   await game.settings.set(ID,"creationAuthorityClient",old);
   await game.settings.set(ID,"authorityWork",variant==="prior-busy"?{clientId:old,busy:true,uncertain:true,requestId:"hol-reconnect-missing",targetUuid:"Actor.holreconnectgone"}:{clientId:"another-old-client",busy:false});
  },variant);
  await gm.reload();await gm.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await ready(gm);
  assert.equal(await gm.evaluate(()=>document.body.innerText.includes("Automation is unavailable")),false);
  checks.push(`${variant}: ordinary reload reconnected without recovery/reset`);
 }
 assert.equal(await gm.evaluate(()=>game.settings.get("heroes-of-legend","interruptedOperations")["hol-reconnect-missing"].uncertain),true);
 for(const [index,name] of [[0,"GM"],[1,"player"]]){
  const page=index?await join(fixture.userName):gm,id=fixture.actors[index];
  await page.evaluate(async id=>game.actors.get(id).sheet.render({force:true}),id);
  await page.locator('.hol-character-sheet [data-tab-pane="main"] [data-action="createHero"]').click();
  const wizard=page.locator('.hol-creation .hol-wizard');await wizard.waitFor();
  const choose=page.waitForEvent("filechooser");await wizard.locator('[data-action="importCharacter"]').click();
  await(await choose).setFiles({name:"reconnect.hol.json",mimeType:"application/json",buffer:Buffer.from(exported)});
  await page.waitForFunction(id=>game.actors.get(id).getFlag("heroes-of-legend","creationDraft")?.data.name==="Reconnect Oren",id);
  await wizard.locator('[data-action="navigate"][data-step="7"]').first().click();
  await wizard.locator('[data-action="commitCreation"]').click();
  await page.waitForFunction(id=>game.actors.get(id).getFlag("heroes-of-legend","creationReceipt")?.status==="complete",id,{timeout:45000});
  await wizard.waitFor({state:"hidden"});await page.locator('.hol-character-sheet').waitFor();
  await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(id=>game.actors.get(id).getFlag("heroes-of-legend","creationReceipt")?.status,id),"complete");
  checks.push(`${name}: import → Save → returned sheet → reload passed after stale recovery`);
  if(index){
   const before=await page.evaluate(id=>game.actors.get(id).system.health.value,id);
   const request=await page.evaluate(async id=>{
    const actor=game.actors.get(id),{requestDamage,damageBasis}=await import("/systems/heroes-of-legend/services/damage.mjs");
    return (await requestDamage(actor,damageBasis(actor),{components:[{type:"physical",amount:2}],resistances:[],weaknesses:[]})).id;
   },id);
   await page.waitForFunction(({id,request})=>game.actors.get(id).getFlag("heroes-of-legend","operationReceipts")?.[request]?.applied,{id,request},{timeout:15000});
   const after=await page.evaluate(id=>game.actors.get(id).system.health.value,id);assert(after<before);
   const correction=await page.evaluate(async ({id,hp})=>{
    const actor=game.actors.get(id),{requestRecovery}=await import("/systems/heroes-of-legend/services/recovery.mjs"),{damageBasis}=await import("/systems/heroes-of-legend/services/damage.mjs");
    return (await requestRecovery(actor,damageBasis(actor),{kind:"correct",hp,marks:0,status:"active",wounds:actor.getFlag("heroes-of-legend","survival")?.wounds??0,reason:"Undo mistaken damage"})).id;
   },{id,hp:before});
   await page.waitForFunction(({id,correction})=>game.actors.get(id).getFlag("heroes-of-legend","operationReceipts")?.[correction]?.applied,{id,correction},{timeout:15000});
   assert.equal(await page.evaluate(id=>game.actors.get(id).system.health.value,id),before);
   checks.push("Player applies owned damage and reverses it through health correction without DA approval");
  }

 }
 await ready(gm);
 fixture.combat=await gm.evaluate(async id=>{
  const combat=await Combat.create({name:"Reconnect encounter",active:false});globalThis.__holReconnectCombat=combat.id;
  await combat.createEmbeddedDocuments("Combatant",[{name:"Reconnect hero",actorId:id,flags:{"heroes-of-legend":{side:"players"}}},{name:"Reconnect opposition",actorId:id,flags:{"heroes-of-legend":{side:"opposition"}}}]);
  await combat.startCombat();return combat.id;
 },fixture.actors[0]);
 await gm.waitForFunction(id=>game.combats.get(id).getFlag("heroes-of-legend","encounter")?.opening?.faces?.length===3,fixture.combat,{timeout:30000});
 checks.push("Actual HOL encounter start completed with saved opening roll; stale request did not block unrelated combat");
 assert.deepEqual(errors,[]);
 await mkdir("test-results/authority-reconnect",{recursive:true});await writeFile("test-results/authority-reconnect/evidence.json",JSON.stringify({checks,errors},null,2));
 console.info(checks.join("\n"));console.info("Authority reconnect runtime passed");
}finally{
 if(gm&&!fixture)fixture=await gm.evaluate(()=>globalThis.__holReconnectFixture).catch(()=>null);
 if(gm&&fixture){await gm.evaluate(async f=>{
  for(const app of Object.values(ui.windows))if(app.actor&&f.actors.includes(app.actor.id))await app.close();
  const combat=game.combats.get(f.combat??globalThis.__holReconnectCombat);if(combat)await combat.delete();
  for(const id of f.actors)if(game.actors.has(id))await game.actors.get(id).delete();
  const ids=game.messages.contents.filter(m=>!f.messages.includes(m.id)).map(m=>m.id);if(ids.length)await ChatMessage.deleteDocuments(ids);
  if(game.users.has(f.user))await game.users.get(f.user).delete();
  await game.settings.set("heroes-of-legend","interruptedOperations",f.interrupted);
 },fixture).catch(error=>{console.error("Reconnect fixture cleanup failed",error);process.exitCode=1;});}
 await browser.close();
}
