import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL,out='test-results/signature-choice';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Explicit isolated local world required.');
const catalog=JSON.parse(await readFile('static/data/choices.json'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[],evidence={checks:[]};let gm,player,f;
async function join(name){
 const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addInitScript(()=>localStorage.setItem('core.noCanvas','true'));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/join');await selectTestUser(page,name);await page.locator('button[name=join]').click();await page.waitForFunction(()=>game.ready);await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());return page;
}
async function capture(locator,name){await locator.page().mouse.move(1300,1000);for(let n=0;n<4;n++)try{return await locator.screenshot({path:out+'/'+name+'.png',animations:'disabled'});}catch(e){if(n===3||!/not attached|detached/.test(e.message))throw e;}}
async function state(id){return player.evaluate(id=>structuredClone(game.actors.get(id).getFlag('heroes-of-legend','development')),id);}
async function openSheet(id){
 await player.evaluate(async id=>{for(const app of foundry.applications.instances.values())if(['CharacterSheet','AdvancementWizard'].includes(app.constructor.name))await app.close();await game.actors.get(id).sheet.render({force:true});},id);
 const sheet=player.locator('.hol-character-sheet');await sheet.locator('[data-action=switchTab][data-tab=development]').click();return sheet;
}
async function choose(id,tier,choiceId,name,{read=false}={}){
 const before=await state(id),sheet=player.locator('.hol-character-sheet');
 await sheet.locator(`[data-action=chooseClassSignature][data-level="${tier}"]`).click();
 const chooser=player.locator('.hol-signature-choice');await chooser.waitFor();
 assert.equal(await chooser.locator(`[data-action=chooseSignature][data-level="${tier}"]`).count(),3);
 assert.equal(await chooser.locator(`[data-action=chooseSignature]:not([data-level="${tier}"])`).count(),0);
 assert.equal(await chooser.getByRole('button',{name:'Learn abilities',exact:true}).count(),0);
 if(read){await chooser.getByRole('button',{name:'Read',exact:true}).first().click();await player.waitForFunction(()=>document.querySelector('.hol-signature-choice [data-rule-content]')?.textContent.trim().length>0);await chooser.locator('[data-action=closeReference]').click();}
 await capture(chooser,name+'-choices');
 await chooser.locator(`[data-action=chooseSignature][data-id="${choiceId}"]`).click();await chooser.locator('[data-action=commit]').click();await chooser.waitFor({state:'hidden'});
 await player.waitForFunction(({id,choiceId})=>game.actors.get(id).items.some(i=>i.getFlag('heroes-of-legend','catalogId')===choiceId),{id,choiceId});
 assert.equal(await player.locator('.hol-character-sheet [data-tab-pane=development]').isVisible(),true);
 const after=await state(id);assert.equal(after.dp,before.dp);assert(after.abilities.includes(choiceId));
 assert.equal(await player.evaluate(({id,choiceId})=>game.actors.get(id).items.filter(i=>i.getFlag('heroes-of-legend','catalogId')===choiceId).length,{id,choiceId}),1);
 return after;
}
try{
 gm=await join('Gamemaster');
 f=await gm.evaluate(async catalog=>{
  const ID='heroes-of-legend',f=globalThis.__holSignature={actors:[],users:[],messages:game.messages.contents.map(m=>m.id),signatures:{}};
  const user=await User.create({name:'Signature owner '+foundry.utils.randomID(5),role:1});f.users.push(user.id);f.name=user.name;
  const inventory=await(await fetch('/systems/heroes-of-legend/data/inventory.json')).json();
  const {abilityItemSource,equipmentItemSource}=await import('/systems/heroes-of-legend/rules/item-construction.mjs'),{getCampaignLanguageConfiguration}=await import('/systems/heroes-of-legend/services/languages.mjs');
  const paid=catalog.records.find(r=>r.kind==='ability'&&r.cost===2&&r.minimumLevel===1&&r.purchasePolicy==='once'&&!r.universal&&!r.classId);f.paid=paid.id;
  for(const [key,classId,level] of [['normal','class-intellect',2],['legacy','class-shadow',7],['ambiguous','class-shadow',7]]){
   const cls=catalog.records.find(r=>r.id===classId),initial=cls.signatures[1][0];f.signatures[key]=cls.signatures;
   const state={level,stage:'advancement',dp:8,classId,ranks:{},abilities:[initial],recipes:[],purchases:[],capabilities:[],compatibleRecipes:[],gritGranted:2,gritSpent:0,items:[],acquisitionReceipts:[],languages:[],creation:{signatureId:initial},creationSummary:{speedBase:6,capacity:10},ledger:[],revision:0};
   if(key==='normal')state.pendingSignatures=[];if(key==='ambiguous')state.abilities.push(...cls.signatures[3].slice(0,2));
   if(key==='legacy'){const extra=cls.signatures[3][2];state.abilities.push(extra);state.purchases.push({id:extra,cost:4,level:3});state.ledger.push({kind:'purchase',id:extra,level:3,delta:-4,balance:8});f.paidExtra=extra;const adapter=inventory.acquisitions.find(a=>a.id===extra);state.acquisitionReceipts.push({abilityId:extra,sourceHash:adapter.source.sha256,selection:{},grants:[{catalogId:'item-lock-tools',disposition:'granted'}],recipes:[]});}
   const actor=await Actor.create({name:key==='normal'?'Real level progression':key==='legacy'?'Legacy level 7 Shadow':'Unrecorded legacy signatures',type:'character',ownership:{[user.id]:3},flags:{[ID]:{development:state,creationReceipt:{status:'complete'},characterSheet:{tab:'development'}}}});f.actors.push(actor.id);f[key]=actor.id;
   await actor.createEmbeddedDocuments('Item',state.abilities.map(id=>abilityItemSource(catalog.records.find(r=>r.id===id),{sourceCommit:catalog.sourceCommit,grantKind:id===initial?'creation':'advancement'})));
   if(key==='legacy'){const [gear]=await actor.createEmbeddedDocuments('Item',[equipmentItemSource(inventory.equipment.find(r=>r.id==='item-lock-tools'),{sourceCommit:catalog.sourceCommit,carried:true})]);await gear.update({name:'My well-worn lock tools'});f.gear={id:gear.id,name:gear.name,system:gear.system.toObject()};}
   const saved={id:foundry.utils.randomID(),revision:1,baseRevision:0,sourceCommit:catalog.sourceCommit,languageBasis:getCampaignLanguageConfiguration().basis,data:{purchases:[{id:paid.id}],signatures:{},acquisitions:{}}};await actor.setFlag(ID,'advancementDraft',saved);f[key+'Draft']=saved;
  }await user.update({character:f.normal});return f;
 },catalog);
 player=await join(f.name);
 let sheet=await openSheet(f.normal);
 for(const tier of [3,7]){
  let current=await state(f.normal);
  while(current.level<tier){const next=current.level+1;await sheet.locator('[data-action=addLevel]').click();await player.waitForFunction(({id,next})=>game.actors.get(id).getFlag('heroes-of-legend','development').level===next,{id:f.normal,next});current=await state(f.normal);}
  assert(current.pendingSignatures.includes(tier),'Actual Add level must mark the newly earned signature.');
  await choose(f.normal,tier,f.signatures.normal[tier][0],'real-level-'+tier,{read:true});sheet=player.locator('.hol-character-sheet');
 }
 assert.equal((await state(f.normal)).dp,73);assert.equal((await state(f.normal)).gritGranted,2);
 assert.deepEqual(await player.evaluate(id=>game.actors.get(id).getFlag('heroes-of-legend','advancementDraft'),f.normal),f.normalDraft);
 evidence.checks.push('Actual player Add level from 2 through 3 and 7 unlocks matching choices; free signatures save without changing DP/Grit or saved purchase draft.');
 const first=f.signatures.normal[3][0],replacement=f.signatures.normal[3][1];await choose(f.normal,3,replacement,'switch-level-3');
 assert(!(await state(f.normal)).abilities.includes(first));assert.equal(await player.evaluate(({id,first})=>game.actors.get(id).items.some(i=>i.getFlag('heroes-of-legend','catalogId')===first),{id:f.normal,first}),false);
 await choose(f.normal,3,first,'switch-back-level-3');assert(!(await state(f.normal)).abilities.includes(replacement));
 await choose(f.normal,1,f.signatures.normal[1][1],'switch-level-1');assert.equal((await state(f.normal)).creation.signatureId,f.signatures.normal[1][1]);
 evidence.checks.push('Player changes level 3 and level 1 signatures, can switch back, and old free Items are removed without duplicate grants.');
 await openSheet(f.legacy);assert.equal((await state(f.legacy)).pendingSignatures,undefined);
 await choose(f.legacy,3,f.signatures.legacy[3][0],'legacy-shadow-3',{read:true});
 await choose(f.legacy,7,f.signatures.legacy[7][0],'legacy-shadow-7');
 await choose(f.legacy,3,f.paidExtra,'switch-to-paid');
 assert.equal((await state(f.legacy)).purchases.find(p=>p.id===f.paidExtra).cost,4);
 await choose(f.legacy,3,f.signatures.legacy[3][0],'switch-from-paid');
 const legacy=await state(f.legacy);assert(legacy.abilities.includes(f.paidExtra));assert.equal(legacy.dp,8);assert(!legacy.abilities.includes(f.paid));
 assert.deepEqual(await player.evaluate(id=>game.actors.get(id).getFlag('heroes-of-legend','advancementDraft'),f.legacy),f.legacyDraft);assert.deepEqual(await player.evaluate(f=>{const gear=game.actors.get(f.legacy).items.get(f.gear.id);return{id:gear.id,name:gear.name,system:gear.system.toObject()};},f),f.gear);
 evidence.checks.push('Existing level 7 Shadow without pending markers can choose 3/7; switching to/from a paid extra preserves its Item, cost, DP and saved draft.');
 await openSheet(f.ambiguous);const previous=f.signatures.ambiguous[3][0];await player.locator('.hol-character-sheet [data-action=chooseClassSignature][data-level="3"]').click();let repair=player.locator('.hol-signature-choice');await repair.locator('[name=signaturePreviousId]').selectOption(previous);await capture(repair,'legacy-current-select');await repair.locator(`[data-action=chooseSignature][data-id="${previous}"]`).click();await repair.locator('[data-action=commit]').click();await repair.waitFor({state:'hidden'});assert((await state(f.ambiguous)).abilities.includes(f.signatures.ambiguous[3][1]));await choose(f.ambiguous,3,f.signatures.ambiguous[3][2],'legacy-current-identification');assert(!(await state(f.ambiguous)).abilities.includes(previous));assert((await state(f.ambiguous)).abilities.includes(f.signatures.ambiguous[3][1]));evidence.checks.push('Ambiguous legacy ownership can be identified explicitly before switching; other owned choices remain intact.');
 await player.reload();await player.waitForFunction(()=>game.ready);await openSheet(f.normal);
 assert((await state(f.normal)).abilities.includes(first));await capture(player.locator('.hol-character-sheet'),'saved-after-reload');assert.deepEqual(errors,[]);evidence.passed=true;
}catch(e){await(player??gm)?.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{
 if(gm){f??=await gm.evaluate(()=>globalThis.__holSignature).catch(()=>null);if(f)try{evidence.cleanup=await gm.evaluate(async f=>{await ChatMessage.deleteDocuments(game.messages.filter(m=>!f.messages.includes(m.id)).map(m=>m.id));await Actor.deleteDocuments(f.actors);await User.deleteDocuments(f.users);return{complete:f.actors.every(id=>!game.actors.has(id))&&f.users.every(id=>!game.users.has(id))};},f);}catch(e){evidence.cleanupError=e.message;process.exitCode=1;}}
 await writeFile(out+'/evidence.json',JSON.stringify({...evidence,errors},null,2));await browser.close();
}
console.log('Native earned signature choices and switching passed.');
