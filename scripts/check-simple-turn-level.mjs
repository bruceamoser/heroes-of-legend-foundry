import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL,output='test-results/simple-turn-level';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Use an explicitly authorized isolated local world.');
const choices=JSON.parse(await readFile('static/data/choices.json')),paid=choices.records.find(choice=>choice.kind==='ability'&&choice.cost===2&&choice.minimumLevel===1&&choice.purchasePolicy==='once'&&!choice.universal&&!choice.classId);
assert(paid,'A normal paid ability fixture is required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[],captures:[]};let gm,player,fixture;
async function join(name){const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addInitScript(()=>localStorage.setItem('core.noCanvas','true'));const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/join');await selectTestUser(page,name);await page.locator('button[name=join]').click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;}
async function openPanel(page){await page.evaluate(async f=>{await(await import('/systems/heroes-of-legend/applications/encounter.mjs')).openEncounterPanel(game.combats.get(f.combat));},fixture);await page.locator('.hol-encounter-panel').waitFor();}
async function current(page,id){await page.waitForFunction(({combat,id})=>game.combats.get(combat).getFlag('heroes-of-legend','encounter')?.current===id,{combat:fixture.combat,id},{timeout:30000});}
try{
 gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
 fixture=await gm.evaluate(async({paid,commit})=>{
  const ID='heroes-of-legend',f=globalThis.__holSimpleTurnFixture={actors:[],users:[],combats:[],messagesBefore:game.messages.contents.map(m=>m.id)};
  const user=await User.create({name:`Simple turns owner ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});f.users.push(user.id);f.owner=user.id;f.ownerName=user.name;
  const state={level:2,stage:'advancement',dp:8,classId:'class-intellect',ranks:{},abilities:[paid.id],recipes:[],purchases:[{id:paid.id,cost:2,level:1}],capabilities:[],compatibleRecipes:[],safePlace:false,gritGranted:2,gritSpent:1,items:[],acquisitionReceipts:[],pendingSignatures:[],languages:[],creation:{},creationSummary:{speedBase:6,capacity:10},ledger:[{kind:'purchase',id:paid.id,delta:-2}],revision:0};
  const actor=await Actor.create({name:'Simple turns hero',type:'character',ownership:{[user.id]:3},flags:{[ID]:{development:state}}});f.actors.push(actor.id);f.actor=actor.id;f.paid=paid.id;await user.update({character:actor.id});
  const {abilityItemSource}=await import('/systems/heroes-of-legend/rules/item-construction.mjs');
  await actor.createEmbeddedDocuments('Item',[abilityItemSource(paid,{sourceCommit:commit,grantKind:'advancement'})]);
  const npc=await Actor.create({name:'Simple turns opposition',type:'creature'});f.actors.push(npc.id);f.npc=npc.id;
  const combat=await Combat.create({name:'Simple turn selection fixture',active:false});f.combats.push(combat.id);f.combat=combat.id;
  const participants=await combat.createEmbeddedDocuments('Combatant',[{name:actor.name,actorId:actor.id,flags:{[ID]:{side:'players'}}},{name:npc.name,actorId:npc.id,flags:{[ID]:{side:'opposition'}}}]);
  f.heroParticipant=participants.find(p=>p.actorId===actor.id).id;f.npcParticipant=participants.find(p=>p.actorId===npc.id).id;return f;
 },{paid,commit:choices.sourceCommit});
 player=await join(fixture.ownerName);await openPanel(player);await openPanel(gm);
 assert.equal(await player.locator('.hol-encounter-panel [data-action=start]').count(),0);
 await player.locator(`.hol-encounter-panel [data-action=choose][data-id="${fixture.heroParticipant}"]`).click();await current(player,fixture.heroParticipant);await current(gm,fixture.heroParticipant);
 assert.equal(await player.locator('.hol-encounter-panel [data-action=choose]').count(),0);assert.equal(await gm.locator('.hol-encounter-panel [data-action=choose]').count(),0);
 await player.locator('.hol-encounter-panel [data-action=finish]').click();await current(player,null);
 assert.equal(await player.locator(`.hol-encounter-panel [data-action=choose][data-id="${fixture.heroParticipant}"]`).count(),0);
 await gm.locator(`.hol-encounter-panel [data-action=choose][data-id="${fixture.npcParticipant}"]`).click();await current(gm,fixture.npcParticipant);await gm.locator('.hol-encounter-panel [data-action=finish]').click();await current(player,null);
 await player.locator(`.hol-encounter-panel [data-action=choose][data-id="${fixture.heroParticipant}"]`).click();await current(player,fixture.heroParticipant);await player.locator('.hol-encounter-panel [data-action=finish]').click();await current(gm,null);
 await gm.evaluate(async f=>game.combats.get(f.combat).combatants.get(f.npcParticipant).update({defeated:true}),fixture);
 await gm.locator(`.hol-encounter-panel [data-action=choose][data-id="${fixture.npcParticipant}"]`).click();await current(gm,fixture.npcParticipant);await gm.locator('.hol-encounter-panel [data-action=finish]').click();await current(player,null);
 assert.equal(await player.locator('.hol-encounter-panel [data-action=reset],.hol-encounter-panel [data-action=spend]').count(),0);
 await player.locator('.hol-encounter-panel').screenshot({path:output+'/simple-turn-selection.png'});evidence.captures.push('simple-turn-selection.png');
 evidence.checks.push('First actual Choose initializes without Start; all Choose buttons unavailable during current turn; Finish marks acted, next round permits the actor again; no action counters.');
 await player.evaluate(async f=>{for(const app of foundry.applications.instances.values())if(app.combat)await app.close();const {AdvancementWizard}=await import('/systems/heroes-of-legend/applications/advancement.mjs');await new AdvancementWizard(game.actors.get(f.actor)).render({force:true});},fixture);
 const wizard=player.locator('.hol-advancement');await wizard.waitFor();assert.equal(await wizard.locator('[name=safePlace],[data-action=safePlace]').count(),0);
 const initial=await player.evaluate(f=>{const actor=game.actors.get(f.actor);return{grit:actor.toObject().system.grit,abilities:actor.items.filter(i=>i.type==='ability').map(i=>i.id)};},fixture);
 await wizard.locator('[data-action=award]').click();await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').level===3,fixture,{timeout:30000});
 assert.equal(await player.evaluate(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').dp,fixture),19);
 await wizard.locator('[data-action=removeLevel]').click();await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').level===2,fixture,{timeout:30000});
 await wizard.locator('[data-action=removeLevel]').click();await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').level===1,fixture,{timeout:30000});
 assert.equal(await player.evaluate(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').dp,fixture),-2);
 await wizard.getByText('Overspent by 2 DP.',{exact:false}).waitFor();
 const beforeRefund=await player.evaluate(f=>{const actor=game.actors.get(f.actor);return{grit:actor.toObject().system.grit,abilities:actor.items.filter(i=>i.type==='ability').map(i=>i.id)};},fixture);assert.deepEqual(beforeRefund,initial);
 await wizard.screenshot({path:output+'/negative-dp-validation.png'});evidence.captures.push('negative-dp-validation.png');
 await wizard.locator(`[data-action=refundAbility][data-id="${fixture.paid}"]`).click();await player.waitForFunction(f=>game.actors.get(f.actor).getFlag('heroes-of-legend','development').dp===0,fixture,{timeout:30000});
 assert.equal(await wizard.locator('[data-action=removeLevel]').count(),0);
 await player.reload();await player.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 const final=await player.evaluate(f=>{const actor=game.actors.get(f.actor),state=actor.getFlag('heroes-of-legend','development');return{level:state.level,dp:state.dp,paidOwned:actor.items.some(i=>i.getFlag('heroes-of-legend','catalogId')===f.paid),uses:actor.getFlag('heroes-of-legend','actionUses')??null};},fixture);
 assert.deepEqual(final,{level:1,dp:0,paidOwned:false,uses:null});evidence.final=final;
 evidence.checks.push('Actual owner Add level and Remove level change only canonical level/DP, allow negative DP with visible validation, explicit paid ability refund repairs debt, all persist after reload.');assert.deepEqual(errors,[]);evidence.passed=true;
}catch(error){const page=player??gm;if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;
}finally{
 if(gm&&!fixture)fixture=await gm.evaluate(()=>globalThis.__holSimpleTurnFixture).catch(()=>null);
 if(player)await player.context().close();
 try{if(!gm)gm=await join(process.env.HOL_TEST_USER??'Gamemaster');if(fixture)evidence.cleanup=await gm.evaluate(async f=>{const messages=game.messages.filter(m=>!f.messagesBefore.includes(m.id));if(messages.length)await ChatMessage.deleteDocuments(messages.map(m=>m.id));if(f.combats.length)await Combat.deleteDocuments(f.combats);if(f.actors.length)await Actor.deleteDocuments(f.actors);if(f.users.length)await User.deleteDocuments(f.users);return{complete:!f.actors.some(id=>game.actors.has(id))&&!f.combats.some(id=>game.combats.has(id))&&!f.users.some(id=>game.users.has(id))};},fixture);}catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
 await writeFile(output+'/evidence.json',JSON.stringify({...evidence,errors},null,2)+'\n');await browser.close();
}
console.log('Native simple turn and level correction acceptance passed.');
