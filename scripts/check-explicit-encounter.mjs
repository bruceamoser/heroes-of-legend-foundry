import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL,output='test-results/explicit-encounter';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Use an explicitly authorized isolated local world.');
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[],captures:[]};let gm,player,fixture;
async function join(name){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('core.noCanvas','true');localStorage.setItem('core.maxFPS','10');});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}/join`);await selectTestUser(page,name);await page.locator('button[name="join"]').click();
 await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;
}
async function receipt(page,request){await page.waitForFunction(({actor,request})=>game.actors.get(actor).getFlag('heroes-of-legend','operationReceipts')?.[request]?.applied,{actor:fixture.actor,request},{timeout:30000});}
async function snapshot(page){return page.evaluate(f=>{const a=game.actors.get(f.actor);return {hp:a.system.health.value,effects:a.toObject().effects,survival:a.getFlag('heroes-of-legend','survival')??null};},fixture);}
async function openPanel(page){await page.evaluate(async id=>{await(await import('/systems/heroes-of-legend/applications/encounter.mjs')).openEncounterPanel(game.combats.get(id));},fixture.combat);await page.locator('.hol-encounter-panel').waitFor();}
try{
 gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
 fixture=await gm.evaluate(async()=>{
  const ID='heroes-of-legend',f=globalThis.__holExplicitEncounterFixture={actors:[],combats:[],users:[],messagesBefore:game.messages.contents.map(m=>m.id)};
  const owner=await User.create({name:`Explicit encounter owner ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});f.users.push(owner.id);f.owner=owner.id;f.ownerName=owner.name;
  const actor=await Actor.create({name:'Explicit encounter hero',type:'character',system:{health:{value:12,baseMax:20}},ownership:{[owner.id]:3},flags:{[ID]:{development:{level:1,dp:0,creationSummary:{speedBase:6,capacity:10},creation:{}}}}});f.actors.push(actor.id);f.actor=actor.id;
  await owner.update({character:actor.id});
  const [supply]=await actor.createEmbeddedDocuments('Item',[{name:'Explicit food bundle',type:'equipment',system:{catalogId:'item-food-bundle',quantity:1,inventoryDie:4}}]);f.supply=supply.id;
  const combat=await Combat.create({name:'Explicit shared encounter',active:false});f.combats.push(combat.id);f.combat=combat.id;
  const [participant]=await combat.createEmbeddedDocuments('Combatant',[{name:actor.name,actorId:actor.id,flags:{[ID]:{side:'players'}}}]);f.participant=participant.id;
  return f;
 });
 player=await join(fixture.ownerName);
 await player.waitForFunction(()=>{const relay=game.settings.get('heroes-of-legend','actionRelay');return game.users.activeGM&&relay.userId===game.users.activeGM.id&&Boolean(relay.clientId);},null,{timeout:30000});
 assert.equal(await player.evaluate(()=>game.settings.menus.has('heroes-of-legend.authorityPanel')),false);
 const condition=await player.evaluate(async f=>(await(await import('/systems/heroes-of-legend/services/conditions.mjs')).requestCondition(game.actors.get(f.actor),'add',{key:'burning',rating:2,persistence:'temporary',source:'Explicit encounter fixture'})).id,fixture);
 await receipt(player,condition);
 assert.equal(await player.evaluate(id=>game.messages.get(id).getFlag('heroes-of-legend','actionExecution').shared,condition),false);
 evidence.checks.push('Player adds owned Burning directly; automation management menu is absent.');
 const initial=await snapshot(player);
 await openPanel(player);await player.locator('.hol-encounter-panel [data-action="start"]').click();
 await player.waitForFunction(f=>Boolean(game.combats.get(f.combat).getFlag('heroes-of-legend','encounter')),fixture,{timeout:30000});
 const start=await player.evaluate(f=>{const message=game.messages.contents.filter(m=>m.getFlag('heroes-of-legend','combatRequest')?.combatUuid===`Combat.${f.combat}`).at(-1);return {execution:message.getFlag('heroes-of-legend','actionExecution'),receipt:game.combats.get(f.combat).getFlag('heroes-of-legend','operationReceipts')[message.id]};},fixture);
 assert.equal(start.execution.shared,true);assert.equal(start.receipt.applied,true);assert.notEqual(start.execution.executorUserId,fixture.owner);evidence.start=start;
 await player.locator(`.hol-encounter-panel [data-action="choose"][data-id="${fixture.participant}"]`).click();
 await player.waitForFunction(f=>game.combats.get(f.combat).getFlag('heroes-of-legend','encounter').current===f.participant,fixture,{timeout:30000});
 assert.deepEqual(await snapshot(player),initial);
 await player.locator('.hol-encounter-panel [data-action="spend"][data-category="main"]').click();
 await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','actionUses')?.main===1,fixture);
 await openPanel(gm);
 await gm.locator('.hol-encounter-panel [data-category="main"] strong').filter({hasText:'1'}).waitFor();
 assert.equal(await player.locator('.hol-encounter-panel [data-category="main"] strong').textContent(),'1');
 await player.locator('.hol-encounter-panel [data-action="reset"]').click();
 await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','actionUses')?.main===0,fixture);
 await gm.locator('.hol-encounter-panel [data-category="main"] strong').filter({hasText:'0'}).waitFor();
 await player.locator('.hol-encounter-panel').screenshot({path:`${output}/player-shared-encounter.png`,style:'#notifications {visibility:hidden}'});evidence.captures.push('player-shared-encounter.png');
 await player.locator('.hol-encounter-panel [data-action="finish"]').click();
 await player.waitForFunction(f=>game.combats.get(f.combat).getFlag('heroes-of-legend','encounter').current===null&&game.combats.get(f.combat).getFlag('heroes-of-legend','encounter').round===2,fixture,{timeout:30000});
 assert.deepEqual(await snapshot(player),initial);
 evidence.checks.push('Actual player Start → Choose → Finish buttons use shared GM relay; Burning, HP and survival remain unchanged.');
 evidence.checks.push('Player encounter Main use and Reset update one Actor counter, reflected in both GM/player panels.');
 await gm.context().close();gm=null;await player.waitForFunction(()=>!game.users.activeGM,null,{timeout:30000});
 const recovery=await player.evaluate(async f=>{const actor=game.actors.get(f.actor),{damageBasis}=await import('/systems/heroes-of-legend/services/damage.mjs'),{requestRecovery}=await import('/systems/heroes-of-legend/services/recovery.mjs');return(await requestRecovery(actor,damageBasis(actor),{kind:'heal',amount:2,lifeResistance:0})).id;},fixture);
 await receipt(player,recovery);assert.equal((await snapshot(player)).hp,initial.hp+2);
 const refill=await player.evaluate(async f=>{const actor=game.actors.get(f.actor);return(await(await import('/systems/heroes-of-legend/services/resupply.mjs')).requestResupply(actor,actor.items.get(f.supply),1)).id;},fixture);
 await receipt(player,refill);assert.equal(await player.evaluate(f=>game.actors.get(f.actor).items.get(f.supply).system.inventoryDie,fixture),6);
 const remove=await player.evaluate(async f=>{const actor=game.actors.get(f.actor),effect=actor.effects.find(e=>e.getFlag('heroes-of-legend','condition')?.key==='burning');return(await(await import('/systems/heroes-of-legend/services/conditions.mjs')).requestCondition(actor,'remove',{effectId:effect.id})).id;},fixture);
 await receipt(player,remove);assert.equal(await player.evaluate(f=>game.actors.get(f.actor).effects.filter(e=>e.active&&e.getFlag('heroes-of-legend','condition')?.key==='burning').length,fixture),0);
 evidence.checks.push('With GM disconnected, player heals, refills supply and removes Burning through owned service requests without coordinator.');
 await player.reload();await player.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 assert.equal((await snapshot(player)).hp,initial.hp+2);assert.equal(await player.evaluate(f=>game.actors.get(f.actor).items.get(f.supply).system.inventoryDie,fixture),6);
 assert.deepEqual(errors,[]);evidence.passed=true;
}catch(error){
 const page=player??gm;if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;
}finally{
 if(gm&&!fixture)fixture=await gm.evaluate(()=>globalThis.__holExplicitEncounterFixture).catch(()=>null);
 if(player)await player.context().close();
 try{
  if(!gm)gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
  if(fixture)evidence.cleanup=await gm.evaluate(async f=>{
   for(const app of foundry.applications.instances.values())if(f.actors.includes(app.actor?.id)||f.combats.includes(app.combat?.id))await app.close();
   for(const id of f.combats)if(game.combats.has(id))await game.combats.get(id).delete();
   const messages=game.messages.filter(m=>!f.messagesBefore.includes(m.id));if(messages.length)await ChatMessage.deleteDocuments(messages.map(m=>m.id));
   for(const id of f.actors)if(game.actors.has(id))await game.actors.get(id).delete();
   for(const id of f.users)if(game.users.has(id))await game.users.get(id).delete();
   if(f.combats.some(id=>game.combats.has(id))||f.actors.some(id=>game.actors.has(id))||f.users.some(id=>game.users.has(id)))throw Error('Fixture cleanup incomplete');
   return {complete:true,combats:f.combats.length,actors:f.actors.length,users:f.users.length,messages:messages.length};
  },fixture);
 }catch(error){evidence.cleanupError=error.message;process.exitCode=1;console.error('Explicit encounter cleanup failed:',error);}
 await writeFile(`${output}/evidence.json`,JSON.stringify({...evidence,errors},null,2)+'\n');await browser.close();
}
console.log('Native explicit encounter acceptance passed.');
