import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {chromium} from "playwright";
import {selectTestUser} from "./helpers/login.mjs";
const url=process.env.HOL_TEST_URL, ID="heroes-of-legend", output="test-results/current-potion";
if(!url || !["localhost","127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES!=="1" || process.env.HOL_TEST_ISOLATED_WORLD!=="1") throw Error("Use an explicitly authorized isolated local world.");
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[]};
let page,fixture;
try{
 const context=await browser.newContext({viewport:{width:1400,height:1000}});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message));
 await page.goto(url+"/join");await selectTestUser(page,process.env.HOL_TEST_USER??"Gamemaster");await page.locator('button[name="join"]').click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());
 fixture=await page.evaluate(async()=>{
  const ID="heroes-of-legend",f=globalThis.__holCurrentPotion={actors:[],beforeMessages:game.messages.contents.map(message=>message.id)};
  const actor=await Actor.create({name:"Current potion source fixture",type:"character",system:{health:{value:3,baseMax:20}},flags:{[ID]:{development:{creationSummary:{speedBase:5}}}}});f.actors.push(actor.id);f.actor=actor.id;
  const source=(await game.packs.get(`${ID}.equipment`).getDocuments()).find(item=>item.getFlag(ID,"catalogId")==="item-lesser-healing-bottle"||item.system.catalogId==="item-lesser-healing-bottle");
  if(!source)throw Error("Exact source bottle is unavailable.");
  const data=source.toObject();delete data._id;
  const bottle=(await actor.createEmbeddedDocuments("Item",[data])).find(item=>item.system.catalogId==="item-lesser-healing-bottle");f.bottle=bottle.id;f.source=source.uuid;
  canvas.tokens?.setTargets([]);
  await(await import("/systems/heroes-of-legend/applications/potions.mjs")).openPotionPreparation(bottle);
  return f;
 });
 const preparation=page.locator(".hol-potion-preparation");await preparation.waitFor();
 await preparation.getByRole("button",{name:"Use potion",exact:true}).waitFor({state:"visible"});
 await page.waitForFunction(()=>!document.querySelector('.hol-potion-preparation [data-action="submit"]')?.disabled);
 await preparation.screenshot({path:output+"/self-source-bottle.png"});
 await preparation.getByRole("button",{name:"Use potion",exact:true}).click();
 await page.waitForFunction(f=>game.actors.get(f.actor).system.health.value===9,fixture);
 await page.waitForFunction(f=>Object.values(game.actors.get(f.actor).getFlag("heroes-of-legend","potionReceipts")??{}).some(receipt=>receipt.supply),fixture);
 await page.waitForFunction(f=>{
   const actor=game.actors.get(f.actor),request=game.messages.contents.find(message=>message.getFlag("heroes-of-legend","potionRequest")?.giverActorUuid===actor.uuid);
   return request && actor.getFlag("heroes-of-legend","operationReceipts")?.[request.id]?.applied;
 },fixture);
 const before=await page.evaluate(f=>{
  const actor=game.actors.get(f.actor),request=game.messages.contents.find(message=>message.getFlag("heroes-of-legend","potionRequest")?.giverActorUuid===actor.uuid);
  if(!request)throw Error("Potion request missing.");
  return {request:request.id,hp:actor.system.health.value,supply:actor.items.get(f.bottle).system.inventoryDie,receipts:actor.getFlag("heroes-of-legend","potionReceipts"),operations:actor.getFlag("heroes-of-legend","operationReceipts")};
 },fixture);
 assert.equal(before.hp,9);assert([0,4].includes(before.supply));
 evidence.checks.push("Exact source lesser bottle opens native preparation; explicit self use heals 3→9 HP and records one post-healing d4 supply check.");
 const sameExecutorReplay=await page.evaluate(async request=>(await import("/systems/heroes-of-legend/services/potions.mjs")).resolvePotionRequest(request),before.request);
 assert.equal(sameExecutorReplay.replay,true);
 evidence.checks.push("Same-executor request replay returns the completed receipt.");
 await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 const replay=await page.evaluate(async request=>(await import("/systems/heroes-of-legend/services/potions.mjs")).resolvePotionRequest(request),before.request);
 assert.equal(replay.status,"not-authority");
 const after=await page.evaluate(f=>{
  const actor=game.actors.get(f.actor);return{request:f.request,hp:actor.system.health.value,supply:actor.items.get(f.bottle).system.inventoryDie,receipts:actor.getFlag("heroes-of-legend","potionReceipts"),operations:actor.getFlag("heroes-of-legend","operationReceipts")};
 },{...fixture,request:before.request});
 assert.deepEqual(after,before);
 evidence.checks.push("Reload fences the prior executor request (not-authority); HP, inventory die and stored potion/action receipts remain unchanged with no duplicate healing or supply roll.");
 evidence.runtime=await page.evaluate(()=>({systemVersion:game.system.version,foundry:game.version}));
 evidence.passed=true;
}finally{
 if(page){
  if(!fixture)fixture=await page.evaluate(()=>globalThis.__holCurrentPotion).catch(()=>null);
  try{
   if(fixture)evidence.cleanup=await page.evaluate(async f=>{
    for(const app of foundry.applications.instances.values())if(app.document?.id===f.actor||app.constructor.name==="PotionPreparation")await app.close();
    const messages=game.messages.contents.filter(message=>!f.beforeMessages.includes(message.id));if(messages.length)await ChatMessage.deleteDocuments(messages.map(message=>message.id));
    if(f.actors.length)await Actor.deleteDocuments(f.actors);
    return{complete:!f.actors.some(id=>game.actors.has(id)),actors:f.actors.length,messages:messages.length};
   },fixture);
  }catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
 }
 await browser.close();
 if(errors.length||!evidence.cleanup?.complete||evidence.cleanupError)evidence.passed=false;
 await writeFile(output+"/evidence.json",JSON.stringify({...evidence,errors},null,2)+"\n");
}
assert.deepEqual(errors,[]);assert.equal(evidence.cleanup?.complete,true);assert.equal(evidence.passed,true);
console.info("PASS current source-bottle self-use and reload/replay, with exact cleanup and zero browser errors.");
