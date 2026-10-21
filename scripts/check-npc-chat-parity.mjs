import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
import {selectTestUser} from "./helpers/login.mjs";
const url=process.env.HOL_TEST_URL;
if (!url || !["localhost","127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES!=="1" || process.env.HOL_TEST_ISOLATED_WORLD!=="1") throw Error("Set HOL_TEST_URL explicitly (parity world: http://localhost:30018), HOL_TEST_ALLOW_WRITES=1 and HOL_TEST_ISOLATED_WORLD=1.");
const output=resolve("test-results/npc-chat-parity"),webRoot=resolve("dist/workshop");
await mkdir(output,{recursive:true});
const mime={".html":"text/html",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".svg":"image/svg+xml",".ttf":"font/ttf",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{try{const path=resolve(webRoot,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));if(!path.startsWith(webRoot+"/"))throw Error("Invalid path");res.setHeader("Content-Type",mime[extname(path)]??"application/octet-stream");res.end(await readFile(path));}catch{res.statusCode=404;res.end("Not found");}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1050}});
await context.addInitScript(()=>{localStorage.setItem("core.noCanvas","true");localStorage.setItem("core.maxFPS","10");});
const gm=await context.newPage(),web=await context.newPage(),errors=[];
for(const page of [gm,web])page.on("pageerror",error=>errors.push(error.message));
let actors=[],messages=[],hook;
const evidence={captures:[],checks:[]};
async function capture(page,selector,name){const target=page.locator(selector).first();await target.waitFor({state:"visible"});await target.screenshot({path:resolve(output,name+".png"),style:"#notifications {visibility:hidden}"});evidence.captures.push(name);}
try {
 await gm.goto(url);await selectTestUser(gm,"Gamemaster");await gm.locator('button[name=join]').click();await gm.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await gm.evaluate(()=>foundry.nue.Tour.activeTour?.exit());
 const authority=await gm.evaluate(async()=>{const ID='heroes-of-legend',authority=await import('/systems/heroes-of-legend/services/authority.mjs');await authority.ensureAuthorityReady();const keys=['creationAuthorityClient','authorityMeta','authorityLease','authorityWork'];return {launch:game.world.lastPlayed,clientId:game.socket.id,isAuthority:authority.isCreationAuthority(),...Object.fromEntries(keys.map(key=>[key,game.settings.get(ID,key)]))};});
 assert.equal(authority.isAuthority,true);assert.equal(authority.creationAuthorityClient,authority.clientId);assert.equal(authority.authorityWork.clientId,authority.clientId);assert.equal(authority.authorityWork.busy,false);evidence.authority=authority;await writeFile(resolve(output,'authority-repaired.json'),JSON.stringify(authority,null,2));
 await gm.evaluate(()=>{globalThis.__holNPCParity={actors:[],messages:[]};__holNPCParity.hook=Hooks.on("createChatMessage",message=>__holNPCParity.messages.push(message.id));});
 for(const [kind,pack,id,name]of [["creature","creatures","creature-goblin-scrapper","Goblin Scrapper"],["npc","creatures","creature-shield-soldier","Edda Vale"],["summon","summons",null,null]]){
  const actorId=await gm.evaluate(async({kind,pack,id,name})=>{
   const documents=await game.packs.get(`heroes-of-legend.${pack}`).getDocuments();const source=id?documents.find(actor=>actor.getFlag("heroes-of-legend","catalogId")===id):documents[0];if(!source)throw Error("Missing profile "+id);
   const data=source.toObject();delete data._id;if(name)data.name=name;
   if(kind==="npc"){data.flags["heroes-of-legend"].npc={enabled:true,profileLinked:true,profileName:source.name,role:"Watch officer",location:"West gate",detail:"Rehearses orders under her breath.",want:"Keep the road safe without losing her patrol.",knowledge:"Which carts passed the gate before dawn.",boundary:"Will not abandon someone under her protection.",relationship:"Trusts the keeper of the roadside shrine."};}
   const actor=await Actor.create(data);__holNPCParity.actors.push(actor.id);await actor.sheet.render({force:true});await actor.sheet.setPosition({width:700,height:800,left:40,top:50});return actor.id;
  },{kind,pack,id,name});
  actors.push(actorId);await capture(gm,kind==="summon"?".hol-summon":".hol-creature",`native-${kind}`);
  if(kind==='npc'){
   await gm.evaluate(id=>{const actor=game.actors.get(id);actor.sheet.constructor.chooseNpcProfile.call(actor.sheet);},actorId);
   await gm.locator('.hol-native-dialog').waitFor();await capture(gm,'.hol-native-dialog','native-profile-dialog');
   const colors=await gm.locator('.hol-native-dialog .window-content').evaluate(element=>({background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color}));
   assert.equal(colors.background,'rgb(247, 243, 233)');assert.equal(colors.color,'rgb(40, 37, 28)');evidence.checks.push({nativeDialogColors:colors});
   await gm.locator('.hol-native-dialog .window-header [data-action="close"]').click();await gm.locator('.hol-native-dialog').waitFor({state:'detached'});
  }

  if(kind!=="summon"){
   await web.goto(`http://127.0.0.1:${server.address().port}/${kind}.html`,{waitUntil:"networkidle"});await web.locator(".hero-header").waitFor();await capture(web,"#app",`web-${kind}`);
   assert.equal(await gm.locator('.hol-card-defenses>div').count(),7);
   if(kind==="creature"){
    const beforeHp=await gm.evaluate(id=>game.actors.get(id).system.health.value,actorId);
    await gm.locator('.hol-creature [data-current-hp]').fill('0');await gm.locator('.hol-creature [data-current-hp]').press('Tab');
    await gm.waitForFunction(id=>game.actors.get(id).system.health.value===0&&game.actors.get(id).getFlag('heroes-of-legend','creatureDefeated')===true,actorId);
    await gm.locator('.hol-creature [data-current-hp]').fill(String(beforeHp));await gm.locator('.hol-creature [data-current-hp]').press('Tab');
    await gm.waitForFunction(({id,hp})=>game.actors.get(id).system.health.value===hp&&game.actors.get(id).getFlag('heroes-of-legend','creatureDefeated')===false,{id:actorId,hp:beforeHp});
    const beforeBlank=await gm.evaluate(()=>game.messages.size);
    await gm.locator('.hol-creature [data-current-hp]').fill('');await gm.locator('.hol-creature [data-current-hp]').press('Tab');
    await gm.waitForFunction(()=>document.querySelector('.notification.error')?.textContent.includes('whole number of HP'));
    assert.equal(await gm.evaluate(()=>game.messages.size),beforeBlank,'Blank HP does not create a request');
    assert.equal(await gm.evaluate(id=>game.actors.get(id).system.health.value,actorId),beforeHp);
    evidence.checks.push('Blank HP rejects locally without request or HP mutation');
    const registry=await gm.evaluate(()=>({actors:__holNPCParity.actors,messages:__holNPCParity.messages}));
    await gm.reload();await gm.waitForFunction(()=>globalThis.game?.ready);
    await gm.evaluate(({registry,id,hp})=>{globalThis.__holNPCParity={...registry,hook:Hooks.on('createChatMessage',message=>__holNPCParity.messages.push(message.id))};if(game.actors.get(id).system.health.value!==hp||game.actors.get(id).getFlag('heroes-of-legend','creatureDefeated')!==false)throw Error('Creature HP did not persist');game.actors.get(id).sheet.render({force:true});},{registry,id:actorId,hp:beforeHp});
    await gm.locator('.hol-creature [data-current-hp]').waitFor();
    evidence.checks.push('Creature HP auto-save zero sets defeated, restore clears it, and reload preserves HP without a Save button');
    await gm.locator('.hol-card-action-table [data-action="creatureAction"]').first().click();await gm.waitForFunction(()=>game.messages.some(message=>message.getFlag("heroes-of-legend","creatureAction")?.title==="Scrap knife"));
    await gm.evaluate(()=>{ui.sidebar.expand();ui.sidebar.changeTab("chat","primary");});
    const request=gm.locator('.hol-creature-action-card').last();await request.waitFor();await capture(gm,'.hol-creature-action-card',"native-chat-attack");assert.equal(await request.locator('.hol-defend-button').count(),1);
    await web.goto(`http://127.0.0.1:${server.address().port}/chat.html`,{waitUntil:"networkidle"});await web.locator('.hol-chat-card[data-chat-kind=request]').waitFor();await capture(web,'.hol-chat-card[data-chat-kind=request]',"web-chat-attack");
    const metrics=async(page,root)=>page.locator(root).first().evaluate(element=>Object.fromEntries([['body',element],['title',element.querySelector('.hol-chat-header h3')],['bar',element.querySelector('.hol-chat-bar')]].map(([key,node])=>[key,parseFloat(getComputedStyle(node).fontSize)])));
    const nativeSizes=await metrics(gm,'.hol-creature-action-card'),webSizes=await metrics(web,'.hol-chat-card[data-chat-kind=request]');
    for(const key of ["body","bar"])assert.ok(Math.abs(nativeSizes[key]-webSizes[key])<.1,`${key} font size native ${nativeSizes[key]} web ${webSizes[key]}`);
    assert.equal(nativeSizes.title,12,"Native chat uses the requested compact heading");
    evidence.checks.push({nativeChatFontPixels:nativeSizes,webChatFontPixels:webSizes});
    const messageId=await gm.evaluate(()=>game.messages.find(message=>message.getFlag('heroes-of-legend','creatureAction')?.title==='Scrap knife').id);
    await capture(gm,`#chat [data-message-id="${messageId}"]`,"native-whole-chat-attack");
   }
  }
  await gm.evaluate(async id=>game.actors.get(id).sheet.close(),actorId);
 }
 const resolved=await gm.evaluate(async()=>{
  const actor=await Actor.create({name:"Borin Bridgekeeper",type:"character",system:{health:{value:100,baseMax:100}},flags:{"heroes-of-legend":{development:{creationSummary:{speedBase:6,capacity:10}}}}});__holNPCParity.actors.push(actor.id);
  const {rollAttribute}=await import('/systems/heroes-of-legend/services/roll.mjs');
  const attribute=await rollAttribute(actor,'agility');
  const attack=game.messages.find(message=>message.getFlag('heroes-of-legend','creatureAction')?.title==='Scrap knife');
  if(attack?.getFlag('heroes-of-legend','attackCard')?.resolution!=='numeric')throw Error('Actual named Scrap knife declaration did not authorize fixed physical damage');
  const {rollBasis}=await import('/systems/heroes-of-legend/services/roll-preparation.mjs');
  const {requestDefense}=await import('/systems/heroes-of-legend/services/defense-responses.mjs');
  const defense=await requestDefense(actor,rollBasis(actor,'agility','defense',attack.id),{});
  return {attribute:attribute.id,defense:defense.id,actor:actor.id};
 });
 await gm.waitForFunction(id=>game.messages.get(id)?.getFlag('heroes-of-legend','defenseStatus')==='resolved',resolved.defense);
 await web.goto(`http://127.0.0.1:${server.address().port}/chat.html`,{waitUntil:'networkidle'});
 for(const mode of ['attribute','defense']){
  const root=`#chat [data-message-id="${resolved[mode]}"]`;
  const message=gm.locator(root).first();await message.locator('.hol-roll-summary').waitFor();
  assert.equal(await message.locator('.message-content > .dice-roll').count(),0,'No duplicate primary vanilla dice panel');
  await capture(gm,root,`native-whole-chat-${mode}`);
  const details=message.locator('.hol-native-roll-details');
  assert.equal(await details.locator('.dice-roll').count(),1,'Original native dice and tooltip remain available');
  await details.locator(':scope > summary').click();
  await details.locator('.dice-roll').click();
  await details.locator('.dice-tooltip').waitFor({state:'visible'});
  await capture(gm,root,`native-chat-${mode}-tooltip`);
  if(mode==='attribute')await web.locator('[data-example="benefit"]').click();
  await capture(web,`.hol-chat-card[data-chat-kind="${mode}"]`,`web-chat-${mode}`);
 }
 const replay=await gm.evaluate(async({defense,actor})=>{const message=game.messages.get(defense),hp=game.actors.get(actor).system.health.value,roll=JSON.stringify(message.getFlag('heroes-of-legend','roll'));await(await import('/systems/heroes-of-legend/services/defense-responses.mjs')).resolveDefenseRequest(defense);if(game.actors.get(actor).system.health.value!==hp||JSON.stringify(message.getFlag('heroes-of-legend','roll'))!==roll)throw Error('Named defense replay changed HP or dice');return {hp,roll,registry:{actors:__holNPCParity.actors,messages:__holNPCParity.messages}};},resolved);
 await gm.reload();await gm.waitForFunction(()=>globalThis.game?.ready);
 await gm.evaluate(async({resolved,replay})=>{globalThis.__holNPCParity={...replay.registry,hook:Hooks.on('createChatMessage',message=>__holNPCParity.messages.push(message.id))};await(await import('/systems/heroes-of-legend/services/authority.mjs')).ensureAuthorityReady();if(game.actors.get(resolved.actor).system.health.value!==replay.hp||JSON.stringify(game.messages.get(resolved.defense).getFlag('heroes-of-legend','roll'))!==replay.roll)throw Error('Named defense result failed reload');await(await import('/systems/heroes-of-legend/services/defense-responses.mjs')).resolveDefenseRequest(resolved.defense);if(game.actors.get(resolved.actor).system.health.value!==replay.hp)throw Error('Reload replay applied damage twice');},{resolved,replay});
 evidence.checks.push('Actual Goblin Scrap knife declaration → defense → fixed physical damage; same request replay and reload preserve HP/dice without reapplication');
 evidence.checks.push('Resolved attribute and automatic defense damage cards have one primary presentation; original native dice tooltips still open');
 assert.deepEqual(errors,[]);evidence.checks.push("Creature and NPC full seven defenses, native attack posting and Defend entry; summon reference opens; zero uncaught browser errors");console.info(JSON.stringify(evidence));
}finally{
 if(gm)await gm.evaluate(async()=>{const r=globalThis.__holNPCParity;if(!r)return;Hooks.off("createChatMessage",r.hook);if(r.messages.length)await ChatMessage.deleteDocuments(r.messages.filter(id=>game.messages.has(id)));if(r.actors.length)await Actor.deleteDocuments(r.actors.filter(id=>game.actors.has(id)));}).catch(error=>console.error("Cleanup",error.message));
 await gm.waitForFunction(()=>{const ID='heroes-of-legend',bound=game.settings.get(ID,'creationAuthorityClient');return bound===game.socket.id&&game.settings.get(ID,'authorityMeta').clientId===bound&&game.settings.get(ID,'authorityLease').clientId===bound&&game.settings.get(ID,'authorityWork').clientId===bound&&game.settings.get(ID,'authorityWork').busy===false;},null,{timeout:20000}).catch(error=>console.error('Coherent close',error.message));
 await writeFile(resolve(output,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");await browser.close();await new Promise(done=>server.close(done));
}
