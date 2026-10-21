import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL, output='test-results/table-attacks',ID='heroes-of-legend';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Use an explicitly authorized isolated local world.');
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[],captures:[]};let gm,player,fixture;
async function join(name){
 const context=await browser.newContext({viewport:{width:1500,height:1050}});
 await context.addInitScript(()=>{localStorage.setItem('core.noCanvas','false');localStorage.setItem('core.maxFPS','10');});
 const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url+'/join');await selectTestUser(page,name);await page.locator('button[name="join"]').click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 await page.evaluate(()=>{foundry.nue.Tour.activeTour?.exit();ui.sidebar.expand();ui.sidebar.changeTab('chat','primary');});
 await page.addStyleTag({content:'#notifications {pointer-events:none}'});return page;
}
async function capture(page,selector,name){await page.locator(selector).first().screenshot({path:`${output}/${name}.png`,style:'#notifications {visibility:hidden}'});evidence.captures.push(name);}
async function activate(page,item){await page.evaluate(async({actor,item})=>{await(await import('/systems/heroes-of-legend/services/abilities.mjs')).activateOwnedAbility(game.actors.get(actor).items.get(item));},{actor:fixture.hero,item});}
async function latestRoll(page){return page.evaluate(()=>game.messages.contents.filter(message=>message.getFlag('heroes-of-legend','roll')).at(-1)?.id);}
async function clickRoll(page){await page.locator('.hol-roll-dialog [data-action="roll"]').click();await page.locator('.hol-roll-dialog').waitFor({state:'detached'});}
try{
 gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
 fixture=await gm.evaluate(async()=>{
  const ID='heroes-of-legend',f=globalThis.__holTableAttackFixture={actors:[],users:[],scenes:[],beforeMessages:game.messages.contents.map(m=>m.id),previousScene:game.scenes.active?.id??null};
  const owner=await User.create({name:`Table attack owner ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});f.users.push(owner.id);f.owner=owner.id;f.ownerName=owner.name;
  const hero=await Actor.create({name:'Table flow hero',type:'character',system:{health:{value:20,baseMax:20}},ownership:{[owner.id]:3},flags:{[ID]:{development:{level:1,dp:0,creationSummary:{speedBase:6,capacity:10},creation:{}}}}});f.actors.push(hero.id);f.hero=hero.id;await owner.update({character:hero.id});
  const adderSource=(await game.packs.get(`${ID}.creatures`).getDocuments()).find(actor=>actor.getFlag(ID,'catalogId')==='creature-adder');if(!adderSource)throw Error('Adder pack missing');
  const adderData=adderSource.toObject();delete adderData._id;adderData.name='Table flow Adder';const adder=await Actor.create(adderData);f.actors.push(adder.id);f.adder=adder.id;f.bite=adder.system.actions.entries.find(action=>action.name==='Needle bite').id;
  const abilities=await game.packs.get(`${ID}.abilities`).getDocuments();
  for(const id of ['ability-basic-ranged','ability-step-between-lanterns']){const source=abilities.find(item=>item.getFlag(ID,'catalogId')===id);if(!source)throw Error(`Missing ${id}`);const data=source.toObject();delete data._id;const created=await hero.createEmbeddedDocuments('Item',[data]);const item=created.find(item=>item.getFlag(ID,'catalogId')===id);f[id==='ability-basic-ranged'?'ranged':'step']=item.id;}
  const created=await hero.createEmbeddedDocuments('Item',[
   {name:'Table non-damage insight',type:'ability',system:{activity:{action:'main',rollMode:'attribute',attribute:'reason'},outcomes:{weak:'You notice a clue.',standard:'You learn the answer.',strong:'You learn the answer and an advantage.'}}},
   {name:'Table ranged weapon',type:'equipment',system:{catalogId:'item-ordinary-ranged-weapon',quantity:1,held:true,bulk:1}},
   {name:'Table ammunition',type:'equipment',system:{catalogId:'item-ammunition-bundle',quantity:1,inventoryDie:4,bulk:1}},
   {name:'Table food bundle',type:'equipment',system:{catalogId:'item-food-bundle',quantity:1,inventoryDie:4,bulk:1}},
  ]);
  f.nonDamage=created.find(item=>item.name==='Table non-damage insight').id;f.weapon=created.find(item=>item.name==='Table ranged weapon').id;f.ammo=created.find(item=>item.name==='Table ammunition').id;f.food=created.find(item=>item.name==='Table food bundle').id;
  const scene=await Scene.create({name:'Table attack canvas fixture',width:1200,height:800,padding:0,grid:{type:1,size:100},tokens:[{name:hero.name,actorId:hero.id,actorLink:true,x:100,y:100}]});f.scenes.push(scene.id);f.scene=scene.id;f.token=scene.tokens.contents.find(token=>token.actorId===hero.id).id;await scene.activate();await scene.view();return f;
 });
 await gm.waitForFunction(f=>canvas.ready&&canvas.scene?.id===f.scene,fixture,{timeout:60000});
 player=await join(fixture.ownerName);await player.waitForFunction(f=>canvas.ready&&canvas.scene?.id===f.scene,fixture,{timeout:60000});
 const attack=await gm.evaluate(async f=>(await(await import('/systems/heroes-of-legend/services/npc-attacks.mjs')).declareCreatureAction(game.actors.get(f.adder),f.bite)).id,fixture);
 await player.locator(`#chat [data-message-id="${attack}"] .hol-defend-button`).waitFor();await capture(player,`#chat [data-message-id="${attack}"]`,'adder-declaration');
 let defense,snapshot;
 for(let attempt=0;attempt<12;attempt++){
  await player.locator(`#chat [data-message-id="${attack}"] .hol-defend-button`).click();await clickRoll(player);defense=await latestRoll(player);
  snapshot=await player.evaluate(id=>game.messages.get(id).getFlag('heroes-of-legend','roll'),defense);if(snapshot.tier==='standard')break;
 }
 assert.equal(snapshot.tier,'standard','Bounded native rolls should produce a Standard defense');assert.equal(snapshot.attackOutcome.components[0].amount,1);assert.equal(snapshot.attackOutcome.conditions[0].key,'poisoned');
 await capture(player,`#chat [data-message-id="${defense}"]`,'adder-defense-outcome');
 await player.evaluate(f=>canvas.tokens.get(f.token).control({releaseOthers:true}),fixture);
 await player.locator(`#chat [data-message-id="${defense}"] .hol-apply-damage`).click();
 await player.waitForFunction(f=>{const actor=game.actors.get(f.hero);return actor.system.health.value===19&&actor.statuses.has('hol.poisoned');},fixture);
 const poisoned=await player.evaluate(f=>{const actor=game.actors.get(f.hero);const effect=actor.effects.find(effect=>effect.active&&effect.getFlag('heroes-of-legend','condition')?.key==='poisoned');return{id:effect.id,rating:effect.getFlag('heroes-of-legend','condition').rating};},fixture);assert.equal(poisoned.rating,1);
 await player.waitForFunction(f=>canvas.tokens.get(f.token).effects.children.filter(child=>child!==canvas.tokens.get(f.token).effects.bg).length>0,fixture);
 evidence.renderedConditionIconBefore=await player.evaluate(f=>canvas.tokens.get(f.token).effects.children.filter(child=>child!==canvas.tokens.get(f.token).effects.bg).length,fixture);
 evidence.checks.push('Native Adder Needle bite → assigned player Defend → Standard result → selected-token Apply Damage applies 1 HP damage and Poisoned 1.');
 const removal=await player.evaluate(async({f,effect})=>(await(await import('/systems/heroes-of-legend/services/conditions.mjs')).requestCondition(game.actors.get(f.hero),'remove',{effectId:effect})).id,{f:fixture,effect:poisoned.id});
 await player.waitForFunction(f=>!game.actors.get(f.hero).statuses.has('hol.poisoned'),fixture);
 assert.equal(await player.evaluate(({f,id})=>{const effect=game.actors.get(f.hero).effects.get(id);return effect.disabled&&effect.statuses.size===0&&effect.showIcon===CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;},{f:fixture,id:poisoned.id}),true);
 await player.locator(`#chat [data-message-id="${removal}"]`).waitFor();await capture(player,`#chat [data-message-id="${removal}"]`,'condition-removal');
 assert.match(await player.locator(`#chat [data-message-id="${removal}"]`).innerText(),/Table flow hero/);assert.match(await player.locator(`#chat [data-message-id="${removal}"]`).innerText(),/Poisoned 1/i);
 await player.waitForFunction(f=>canvas.tokens.get(f.token).effects.children.filter(child=>child!==canvas.tokens.get(f.token).effects.bg).length===0,fixture);
 evidence.renderedConditionIconAfter=0;
 evidence.checks.push('Condition removal names target/condition/rating and clears active actor status plus native token icon visibility.');
 await player.evaluate(async f=>game.actors.get(f.hero).toggleStatusEffect('hol.poisoned'),fixture);
 const conditionPanel=player.locator('.hol-conditions');await conditionPanel.waitFor();assert.equal(await conditionPanel.locator('[name=source]').count(),0);
 await conditionPanel.locator('[name=rating]').fill('2');await conditionPanel.locator('[data-action=add]').click();
 await player.waitForFunction(f=>game.actors.get(f.hero).effects.some(effect=>effect.active&&effect.getFlag('heroes-of-legend','condition')?.rating===2),fixture);
 await conditionPanel.locator('[data-action=remove]').click();await player.waitForFunction(f=>!game.actors.get(f.hero).statuses.has('hol.poisoned'),fixture);
 await player.evaluate(async()=>{for(const app of foundry.applications.instances.values())if(app.constructor.name==='ConditionPanel')await app.close();});
 evidence.checks.push('Native token status API opens managed HOL condition controls without a source field; add/remove uses the same condition workflow.');
 const beforeRanged=await player.evaluate(()=>game.messages.contents.filter(message=>message.getFlag('heroes-of-legend','roll')).length);
 const missing=await player.evaluate(async f=>{try{await(await import('/systems/heroes-of-legend/services/abilities.mjs')).activateOwnedAbility(game.actors.get(f.hero).items.get(f.ranged));return '';}catch(error){return error.message;}},fixture);assert.match(missing,/Assign ammunition/);assert.equal(await player.evaluate(()=>game.messages.contents.filter(message=>message.getFlag('heroes-of-legend','roll')).length),beforeRanged);
 await player.evaluate(async f=>game.actors.get(f.hero).items.get(f.weapon).setFlag('heroes-of-legend','ammunitionItemId',f.ammo),fixture);
 await activate(player,fixture.ranged);await clickRoll(player);const rangedRoll=await latestRoll(player);
 await player.waitForFunction(({f,id})=>Boolean(game.actors.get(f.hero).getFlag('heroes-of-legend','supplyActions')?.[id]),{f:fixture,id:rangedRoll});
 await player.locator('.hol-supply-chat').last().waitFor();const ammoChat=await player.locator('.hol-supply-chat').last().innerText();assert.match(ammoChat,/Table flow hero/);assert.match(ammoChat,/Table ammunition/);assert.match(ammoChat,/rolled/i);await capture(player,'.hol-supply-chat','ranged-ammunition');
 evidence.checks.push('Ranged roll without assigned ammunition is refused before dice; assigned ammunition rolls once and posts a named consumption/depletion card.');
 const food=await player.evaluate(async f=>{const actor=game.actors.get(f.hero);const result=await(await import('/systems/heroes-of-legend/services/inventory.mjs')).consumeOwnedSupply(actor,actor.items.get(f.food),{operationId:'tablefood'});return {retained:result.retained,before:result.before,after:result.after};},fixture);
 assert.equal(food.after,food.retained===1?0:4);await player.locator('.hol-supply-chat').last().waitFor();const foodChat=await player.locator('.hol-supply-chat').last().innerText();assert.match(foodChat,/Table food bundle/);assert.match(foodChat,/depleted|remaining|diminished|not depleted/i);evidence.checks.push('Direct consumable die click service posts character, item, rolled face and depletion state.');
 await activate(player,fixture.step);const step=player.locator('.hol-reference-card').last();await step.waitFor();const stepText=await step.innerText();assert.match(stepText,/Move up to 2 squares through actual dimness/);assert.doesNotMatch(stepText,/Automation:|Source:|Ability reference/);assert.equal(await step.locator('details').count(),0);await capture(player,'.hol-reference-card','no-roll-operative-text');
 await activate(player,fixture.nonDamage);await clickRoll(player);await player.getByRole('dialog').filter({hasText:'Table non-damage insight'}).waitFor();await capture(player,'.hol-native-dialog','non-damage-outcome');await player.getByRole('dialog').filter({hasText:'Table non-damage insight'}).getByRole('button',{name:'Close',exact:true}).click();
 evidence.checks.push('No-roll Step Between Lanterns posts visible operative text/full-details link; non-damage roll posts chat and opens a concise outcome dialog.');
 await player.evaluate(async f=>{const {SharedRollDialog}=await import('/systems/heroes-of-legend/dialogs/attribute-roll.mjs');await new SharedRollDialog(game.actors.get(f.hero),'fortitude',{mode:'death'}).render({force:true});},fixture);
 const death=player.locator('.hol-roll-dialog');await death.waitFor();assert.equal(await death.locator('.hol-reference-picker').count(),0);assert.equal(await death.locator('[data-action="grit"]').count(),0);assert.equal(await death.locator('.hol-death-marks button').count(),3);await capture(player,'.hol-roll-dialog','death-dialog');const beforeDeath=await player.evaluate(f=>({hp:game.actors.get(f.hero).system.health.value,survival:game.actors.get(f.hero).getFlag('heroes-of-legend','survival')??null}),fixture);await death.locator('[data-marks="2"]').click();await player.waitForFunction(f=>game.actors.get(f.hero).getFlag('heroes-of-legend','deathMarks')===2,fixture);assert.deepEqual(await player.evaluate(f=>({hp:game.actors.get(f.hero).system.health.value,survival:game.actors.get(f.hero).getFlag('heroes-of-legend','survival')??null}),fixture),beforeDeath);await player.evaluate(async()=>{for(const app of foundry.applications.instances.values())if(app.constructor.name==='SharedRollDialog')await app.close();});
 evidence.checks.push('Death dialog shows Fortitude, Boons/Banes, pool and compact marks/outcomes without ability browser or Grit/how-to block.');
 assert.deepEqual(errors,[]);evidence.passed=true;
}catch(error){const page=player??gm;if(page){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}throw error;
}finally{
 if(gm&&!fixture)fixture=await gm.evaluate(()=>globalThis.__holTableAttackFixture).catch(()=>null);
 if(player)await player.context().close();
 try{
  if(!gm)gm=await join(process.env.HOL_TEST_USER??'Gamemaster');
  if(fixture)evidence.cleanup=await gm.evaluate(async f=>{if(f.previousScene&&game.scenes.has(f.previousScene))await game.scenes.get(f.previousScene).activate();const messages=game.messages.filter(message=>!f.beforeMessages.includes(message.id));if(messages.length)await ChatMessage.deleteDocuments(messages.map(message=>message.id));for(const[type,ids]of [[Scene,f.scenes],[Actor,f.actors],[User,f.users]])if(ids.length)await type.deleteDocuments(ids);return{complete:!f.actors.some(id=>game.actors.has(id))&&!f.scenes.some(id=>game.scenes.has(id))&&!f.users.some(id=>game.users.has(id)),messages:messages.length};},fixture);
 }catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
 await writeFile(output+'/evidence.json',JSON.stringify({...evidence,errors},null,2)+'\n');await browser.close();
}
console.log('Native table attack/ability/ammunition acceptance passed.');
