import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
import {writePortableCharacter} from '../src/rules/portable-character.mjs';
const url=process.env.HOL_TEST_URL, output='test-results/explicit-actions';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Use an explicitly authorized isolated local world.');
const catalogs={choices:JSON.parse(await readFile('static/data/choices.json')).records,inventory:JSON.parse(await readFile('static/data/inventory.json')),commit:JSON.parse(await readFile('static/data/choices.json')).sourceCommit};
const draft=structuredClone(JSON.parse(await readFile('tests/fixtures/reference-heroes.json')).characters[3].draft);
draft.name='Explicit Actions Oren';draft.languages={home:'elven',extraSpoken:['dwarven','halfling']};
const exported=writePortableCharacter(draft,catalogs,{ready:true});
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[],captures:[]};let gm,player,fixture;
async function join(name){
 const context=await browser.newContext({viewport:{width:1500,height:1050}});
 await context.addInitScript(noCanvas=>{localStorage.setItem('core.noCanvas',String(noCanvas));localStorage.setItem('core.maxFPS','10');},name!==(process.env.HOL_TEST_USER??'Gamemaster'));
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url+'/join');await selectTestUser(page,name);await page.locator('button[name="join"]').click();
 await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;
}
async function capture(page,selector,name){await page.locator(selector).first().screenshot({path:`${output}/${name}.png`,style:'#notifications {visibility:hidden}'});evidence.captures.push(name);}
async function abilityRoll(page){
 await page.evaluate(async f=>{const actor=game.actors.get(f.hero);await(await import('/systems/heroes-of-legend/services/abilities.mjs')).activateOwnedAbility(actor.items.get(f.ability));},fixture);
 const dialog=page.locator('.hol-roll-dialog');await dialog.getByRole('button',{name:'Roll',exact:true}).click();await dialog.waitFor({state:'detached'});
 return page.evaluate(f=>game.messages.contents.filter(message=>message.getFlag('heroes-of-legend','roll')?.ability?.itemUuid===`Actor.${f.hero}.Item.${f.ability}`).at(-1)?.id,fixture);
}
try{
 gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
 fixture=await gm.evaluate(async()=>{
  const ID='heroes-of-legend',r=globalThis.__holExplicitFixture={actors:[],users:[],scenes:[],beforeMessages:game.messages.contents.map(m=>m.id),previousScene:game.scenes.active?.id??null};
  const user=await User.create({name:`Explicit owner ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});r.users.push(user.id);r.user=user.id;r.userName=user.name;
  for(const name of ['Explicit hero','Explicit second target','Explicit creation draft']){
   const actor=await Actor.create({name,type:'character',system:{health:{value:20,baseMax:20}},ownership:{[user.id]:3},flags:{[ID]:{development:{level:1,dp:0,creationSummary:{speedBase:6,capacity:10},creation:{}}}}});r.actors.push(actor.id);
  }
  [r.hero,r.other,r.draft]=r.actors;await user.update({character:r.hero});
  const [ability]=await game.actors.get(r.hero).createEmbeddedDocuments('Item',[{name:'Explicit test strike',type:'ability',system:{activity:{action:'main',rollMode:'attribute',attribute:'brawn'},outcomes:{weak:'5 physical damage.',standard:'5 physical damage.',strong:'5 physical damage.'}}}]);r.ability=ability.id;
  const npc=await Actor.create({name:'Explicit NPC attack',type:'creature',system:{health:{value:20,baseMax:20},basicMelee:{weak:3,standard:3,strong:3}}});r.actors.push(npc.id);r.npc=npc.id;
  const scene=await Scene.create({name:'Explicit action canvas fixture',width:1600,height:1000,padding:0,grid:{type:1,size:100},tokens:[
   {name:'Hero linked one',actorId:r.hero,actorLink:true,x:100,y:100},
   {name:'Hero linked two',actorId:r.hero,actorLink:true,x:250,y:100},
   {name:'Other linked',actorId:r.other,actorLink:true,x:400,y:100},
   {name:'Other unlinked',actorId:r.other,actorLink:false,x:550,y:100},
  ]});r.scenes.push(scene.id);r.scene=scene.id;r.tokens=scene.tokens.contents.map(t=>t.id);
  await scene.activate();await scene.view();return r;
 });
 await gm.waitForFunction(f=>canvas.ready&&canvas.scene?.id===f.scene,fixture,{timeout:60000});
 const initialHp=await gm.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture);
 const abilityMessage=await abilityRoll(gm);assert(abilityMessage,'Ability produced a native roll message');
 assert.equal(await gm.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture),initialHp);
 await gm.evaluate(()=>{ui.sidebar.expand();ui.sidebar.changeTab('chat','primary');canvas.tokens.releaseAll();});
 const card=gm.locator(`#chat [data-message-id="${abilityMessage}"]`).first();await card.locator('.hol-apply-damage').waitFor();
 await card.locator('.hol-apply-damage').click();await gm.waitForFunction(()=>document.querySelector('#notifications')?.textContent.includes('Select one or more tokens'));
 assert.equal(await gm.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture),initialHp);
 await gm.evaluate(f=>{for(const id of f.tokens)canvas.tokens.get(id).control({releaseOthers:false});},fixture);
 await card.locator('.hol-apply-damage').click();
 await gm.waitForFunction(f=>f.tokens.every(id=>canvas.tokens.get(id).actor.system.health.value===15),fixture);
 const applied=await gm.evaluate(f=>({hero:game.actors.get(f.hero).system.health.value,other:game.actors.get(f.other).system.health.value,unlinked:canvas.tokens.get(f.tokens[3]).actor.system.health.value,receipts:Object.keys(game.actors.get(f.hero).getFlag('heroes-of-legend','explicitDamage')??{}).length}),fixture);
 assert.deepEqual(applied,{hero:15,other:15,unlinked:15,receipts:1});evidence.selectedDamage=applied;
 await capture(gm,`#chat [data-message-id="${abilityMessage}"]`,'ability-apply-damage');
 await capture(gm,'.hol-damage-chat','selected-damage-result');
 evidence.checks.push('Actual ability dialog/roll leaves HP unchanged; actual Apply Damage button rejects no selection and applies once per linked Actor plus each unlinked token.');
 const attack=await gm.evaluate(async f=>(await(await import('/systems/heroes-of-legend/services/npc-attacks.mjs')).declareNpcMelee(game.actors.get(f.npc))).id,fixture);
 await gm.evaluate(f=>{canvas.tokens.releaseAll();canvas.tokens.get(f.tokens[0]).control({releaseOthers:true});},fixture);
 await gm.locator(`#chat [data-message-id="${attack}"] .hol-defend-button`).click();
 await gm.locator('.hol-roll-dialog').getByRole('button',{name:'Roll',exact:true}).click();await gm.locator('.hol-roll-dialog').waitFor({state:'detached'});
 const defense=await gm.evaluate(id=>game.messages.contents.filter(m=>m.getFlag('heroes-of-legend','roll')?.attackMessageId===id).at(-1)?.id,attack);assert(defense);
 assert.equal(await gm.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture),15);
 await capture(gm,`#chat [data-message-id="${defense}"]`,'defense-no-automatic-damage');
 evidence.checks.push('Actual NPC declaration → Defend button → configured roll works without encounter and does not apply damage.');
 await gm.context().close();gm=null;
 player=await join(fixture.userName);await player.waitForFunction(()=>!game.users.activeGM,null,{timeout:30000});
 await player.evaluate(async f=>game.actors.get(f.hero).sheet.render({force:true}),fixture);
 const sheet=player.locator('.hol-character-sheet');await sheet.locator('[data-current-hp]').fill('19');await sheet.locator('[data-current-hp]').press('Tab');
 await player.waitForFunction(f=>game.actors.get(f.hero).system.health.value===19,fixture);
 const playerRoll=await abilityRoll(player);assert(playerRoll);
 assert.equal(await player.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture),19);
 await player.waitForFunction(f=>game.actors.get(f.hero).getFlag('heroes-of-legend','actionUses')?.main===2,fixture);
 await capture(player,'.hol-character-sheet','player-sheet-action-counters');
 await sheet.locator('[data-action="resetActions"]').click();await player.waitForFunction(f=>game.actors.get(f.hero).getFlag('heroes-of-legend','actionUses')?.main===0,fixture);
 evidence.checks.push('Player with no connected GM edits HP on sheet, rolls configured ability, records spent Main counter and resets counters through actual sheet button.');
 await player.evaluate(async f=>{const {WoundPanel}=await import('/systems/heroes-of-legend/applications/wounds.mjs');await new WoundPanel(game.actors.get(f.hero)).render({force:true});},fixture);
 await player.locator('.hol-wounds [data-action="record"]').click();await player.locator('.hol-roll-dialog [name="damageType"]').selectOption('physical');await player.locator('.hol-roll-dialog [name="fearSource"]').fill('Test hazard');await player.locator('.hol-roll-dialog button[data-action="roll"]').click();
 await player.waitForFunction(f=>Object.keys(game.actors.get(f.hero).getFlag('heroes-of-legend','wounds')??{}).length===1,fixture);
 evidence.wounds=await player.evaluate(async f=>{
  const actor=game.actors.get(f.hero),first=Object.keys(actor.getFlag('heroes-of-legend','wounds'))[0],{rollCharacterWound,removeCharacterWound}=await import('/systems/heroes-of-legend/services/wound-roll.mjs');
  const second=await rollCharacterWound(actor,'fire',{fearSource:'Test hazard'});const before=structuredClone(actor.getFlag('heroes-of-legend','wounds')[second.eventId]);
  await(await import('/systems/heroes-of-legend/services/documents.mjs')).setOwnedHp(actor,17);
  await removeCharacterWound(actor,first);
  if(actor.getFlag('heroes-of-legend','wounds')[first]||JSON.stringify(actor.getFlag('heroes-of-legend','wounds')[second.eventId])!==JSON.stringify(before)||actor.system.health.value!==17)throw Error('Removing earlier wound changed later state');
  return {removed:first,retained:second.eventId,hp:actor.system.health.value};
 },fixture);
 evidence.checks.push('Player Add Wound dialog rolls/applies without GM; removing an earlier wound preserves a later wound and corrected HP.');
 await player.evaluate(async f=>{for(const app of foundry.applications.instances.values())if(app.actor)await app.close();await game.actors.get(f.draft).sheet.render({force:true});},fixture);
 await player.locator('.hol-character-sheet [data-tab-pane="main"] [data-action="createHero"]').click();
 const wizard=player.locator('.hol-creation .hol-wizard');await wizard.waitFor();
 const [choose]=await Promise.all([player.waitForEvent('filechooser'),wizard.locator('[data-action="importCharacter"]').click()]);await choose.setFiles({name:'explicit.hol.json',mimeType:'application/json',buffer:Buffer.from(exported)});
 await player.waitForFunction(f=>game.actors.get(f.draft).getFlag('heroes-of-legend','creationDraft')?.data.name==='Explicit Actions Oren',fixture);
 await wizard.locator('[data-action="navigate"][data-step="7"]').first().click();await wizard.locator('[data-action="commitCreation"]').click();
 await player.waitForFunction(f=>game.actors.get(f.draft).getFlag('heroes-of-legend','creationReceipt')?.status==='complete',fixture,{timeout:45000});await wizard.waitFor({state:'hidden'});
 await player.reload();await player.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 assert.equal(await player.evaluate(f=>game.actors.get(f.draft).getFlag('heroes-of-legend','creationReceipt')?.status,fixture),'complete');
 assert.equal(await player.evaluate(f=>game.actors.get(f.hero).system.health.value,fixture),17);
 evidence.checks.push('Player with no GM imports web character → Save → returned sheet → reload; creation and corrected HP persist.');
 assert.deepEqual(errors,[]);evidence.passed=true;
} catch(error) {
 const page=player??gm;
 if(page){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}
 throw error;
} finally {
 if(gm&&!fixture)fixture=await gm.evaluate(()=>globalThis.__holExplicitFixture).catch(()=>null);
 if(player)await player.context().close();
 try {
  if(!gm)gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
  if(fixture)evidence.cleanup=await gm.evaluate(async f=>{
   if(f.previousScene&&game.scenes.has(f.previousScene))await game.scenes.get(f.previousScene).activate();
   const messages=game.messages.filter(m=>!f.beforeMessages.includes(m.id));if(messages.length)await ChatMessage.deleteDocuments(messages.map(m=>m.id));
   for(const [type,ids]of [[Scene,f.scenes],[Actor,f.actors],[User,f.users]])if(ids.length)await type.deleteDocuments(ids);
   if(f.actors.some(id=>game.actors.has(id))||f.scenes.some(id=>game.scenes.has(id))||f.users.some(id=>game.users.has(id)))throw Error('Fixture documents remain');
   return {messages:messages.length,actors:f.actors.length,scenes:f.scenes.length,users:f.users.length,complete:true};
  },fixture);
 } catch(error) {evidence.cleanupError=error.message;process.exitCode=1;console.error('Explicit action cleanup failed:',error);}
 await writeFile(output+'/evidence.json',JSON.stringify({...evidence,errors},null,2)+'\n');await browser.close();
}
console.log('Native explicit actions acceptance passed.');
