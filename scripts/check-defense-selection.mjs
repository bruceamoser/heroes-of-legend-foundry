import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL,ID='heroes-of-legend';
if(!url||!["localhost","127.0.0.1"].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw new Error('Use an isolated authorized world');
const browser=await chromium.launch();let gm,player,fixture;const errors=[];
async function join(name){const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.addInitScript(()=>{localStorage.setItem('core.maxFPS','10');});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await selectTestUser(page,name);await page.locator('button[name=join]').click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;}
try {
 await mkdir('test-results/defense-parity',{recursive:true});gm=await join('Gamemaster');
 fixture=await gm.evaluate(async()=>{
  const ID='heroes-of-legend',r=globalThis.__holSelection={actors:[],messages:[],users:[],scenes:[]};
  r.hook=Hooks.on('createChatMessage',m=>r.messages.push(m.id));
  const user=await User.create({name:`Defense visual ${foundry.utils.randomID(4)}`,role:1});r.users.push(user.id);
  const actors=[];for(const name of ['Borin Bridgekeeper','Other selected hero']){const a=await Actor.create({name,type:'character',system:{health:{value:100,baseMax:100}},ownership:{[user.id]:3},flags:{[ID]:{development:{creationSummary:{speedBase:6,capacity:10}}}}});r.actors.push(a.id);actors.push(a);}
  const {loadCatalogs}=await import('/systems/heroes-of-legend/services/catalog.mjs');
  const {abilityItemSource}=await import('/systems/heroes-of-legend/rules/item-construction.mjs');
  const catalogs=await loadCatalogs();
  const ids=['ability-wear-light-armor','ability-hook-and-drive','ability-braced-harness','ability-take-them-alive','ability-conditioned-body','ability-catch-a-falling-friend'];
  const records=ids.map(id=>catalogs.choices.find(r=>r.id===id)).filter(Boolean);
  await actors[0].createEmbeddedDocuments('Item',records.map(record=>abilityItemSource(record,{sourceCommit:catalogs.commit})));
  await user.update({character:actors[0].id});
  const scene=await Scene.create({name:'Defense selection fixture',width:1500,height:1000,padding:0,grid:{type:1,size:100},tokens:actors.map((a,i)=>({name:a.name,actorId:a.id,actorLink:true,x:100+200*i,y:100}))});r.scenes.push(scene.id);await scene.activate();await scene.view();
  const attack=await ChatMessage.create({content:'<section class="hol-attack-card">Incoming attack</section>',flags:{[ID]:{attackCard:{id:'test',title:'Scrap knife',attackerName:'Goblin scrapper',attributeKey:'agility',perspective:'defender',threat:{boons:0,banes:0},damage:{weak:5,standard:3,strong:0},suggestedDefenderTokenUuids:[scene.tokens.contents[1].uuid]}}}});
  return {actors:r.actors,user:user.id,userName:user.name,scene:scene.id,token:scene.tokens.contents[0].id,otherToken:scene.tokens.contents[1].id,attack:attack.id};
 });
 await gm.waitForFunction(f=>canvas.ready&&canvas.scene?.id===f.scene,fixture,{timeout:60000});
 await gm.evaluate(async f=>{canvas.tokens.get(f.token).control({releaseOthers:true});await(await import('/systems/heroes-of-legend/dialogs/defender-choice.mjs')).chooseDefender(f.attack);},fixture);
 const dialog=gm.locator('.hol-roll-dialog');await dialog.locator('[data-roll-count]').waitFor();assert.match(await dialog.innerText(),/Borin Bridgekeeper/);await dialog.screenshot({path:'test-results/defense-parity/native-gm.png',style:'#notifications {visibility:hidden}'});await dialog.getByRole('button',{name:'Roll',exact:true}).click();await dialog.waitFor({state:'detached',timeout:20000});
 await gm.waitForFunction(f=>game.messages.some(m=>m.getFlag('heroes-of-legend','defenseDamage')?.rollMessageId&&m.getFlag('heroes-of-legend','roll')?.actorUuid===`Actor.${f.actors[0]}`),fixture);
 const resultId=await gm.evaluate(f=>game.messages.find(m=>m.getFlag('heroes-of-legend','defenseDamage')?.rollMessageId&&m.getFlag('heroes-of-legend','roll')?.actorUuid===`Actor.${f.actors[0]}`).id,fixture);
 await gm.evaluate(()=>{ui.sidebar.expand();ui.sidebar.changeTab('chat','primary');});
 const wholeMessage=gm.locator(`#chat [data-message-id="${resultId}"]`).first();
 await wholeMessage.locator('.hol-roll-summary').waitFor();
 assert.equal(await wholeMessage.locator('.message-content > .dice-roll').count(),0,'No duplicate primary native dice panel');
 await wholeMessage.screenshot({path:'test-results/defense-parity/native-full-result.png',style:'#notifications {visibility:hidden}'});
 const nativeDetails=wholeMessage.locator('.hol-native-roll-details');
 if(await nativeDetails.count()){
  await nativeDetails.locator(':scope > summary').click();
  await wholeMessage.screenshot({path:'test-results/defense-parity/native-result-details.png',style:'#notifications {visibility:hidden}'});
 }

 player=await join(fixture.userName);await player.waitForFunction(f=>canvas.ready&&canvas.scene?.id===f.scene,fixture,{timeout:60000});
 await player.evaluate(async f=>{canvas.tokens.get(f.otherToken).control({releaseOthers:true});await(await import('/systems/heroes-of-legend/dialogs/defender-choice.mjs')).chooseDefender(f.attack);},fixture);
 const pd=player.locator('.hol-roll-dialog');await pd.locator('[data-roll-count]').waitFor();assert.match(await pd.innerText(),/Borin Bridgekeeper/);await pd.screenshot({path:'test-results/defense-parity/native-player.png',style:'#notifications {visibility:hidden}'});await pd.getByRole('button',{name:'Roll',exact:true}).click();await pd.waitFor({state:'detached'});
 await gm.evaluate(async f=>{canvas.tokens.releaseAll();try{await(await import('/systems/heroes-of-legend/dialogs/defender-choice.mjs')).chooseDefender(f.attack);throw new Error('missing selection accepted');}catch(e){if(!e.message.includes('Select one token'))throw e;}},fixture);
 await gm.evaluate(async f=>game.users.get(f.user).update({character:null}),fixture);await player.waitForFunction(()=>!game.user.character);
 await player.evaluate(async f=>{try{await(await import('/systems/heroes-of-legend/dialogs/defender-choice.mjs')).chooseDefender(f.attack);throw new Error('missing assignment accepted');}catch(e){if(!e.message.includes('No character is assigned'))throw e;}},fixture);
 assert.deepEqual(errors,[]);console.info('PASS actual canvas GM selected token, player assigned Actor despite different selection, missing selection/assignment messages; screenshots captured.');
}catch(error){if(gm)console.error('SELECTION STATE',await gm.evaluate(()=>({notifications:document.querySelector('#notifications')?.innerText,authority:game.settings.get('heroes-of-legend','authorityMeta'),work:game.settings.get('heroes-of-legend','authorityWork'),socket:game.socket.id})));throw error;}finally{
 if(player)await player.context().close();
 if(gm)await gm.evaluate(async()=>{const r=globalThis.__holSelection;if(!r)return;Hooks.off('createChatMessage',r.hook);for(const [cls,ids]of [[ChatMessage,r.messages],[Scene,r.scenes],[Actor,r.actors],[User,r.users]])if(ids.length)await cls.deleteDocuments(ids);}).catch(e=>console.error('Cleanup:',e.message));await browser.close();
}
