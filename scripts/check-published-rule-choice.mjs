import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Use an explicitly isolated disposable Foundry world.');
const old=JSON.parse(execFileSync('git',['show','0d8f062d81d2e818bfa39bae7eeab03ec756ff86:content/journals/player-rules/895ef20bc4923b2e.json'],{encoding:'utf8',maxBuffer:30*1024*1024}));
const oldPage=old.pages.find(page=>page.flags?.['heroes-of-legend']?.ruleSource?.path==='design/rules/languages.md');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
let state;
await mkdir('test-results/published-rule-choice',{recursive:true});
try{
 await page.goto(url);await selectTestUser(page,'Gamemaster');await page.locator('button[name=join]').click();await page.waitForFunction(()=>game?.ready);
 state=await page.evaluate(async({oldPage,commit})=>{
  const ID='heroes-of-legend',path='design/rules/languages.md';let fixture;
  if(!game.journal.some(book=>book.getFlag(ID,'ruleBook')?.key==='player-rules')){
   delete oldPage._key;
   fixture=await JournalEntry.create({name:'HOL263 published choice fixture',flags:{[ID]:{ruleBook:{key:'player-rules',commit,schema:2}}},pages:[oldPage]},{keepEmbeddedIds:true});
  }
  globalThis.__hol263PublishedChoice={fixtureId:fixture?.id};
  const {RulesLibrary}=await import('/systems/heroes-of-legend/applications/journals.mjs');
  const library=new RulesLibrary();library.rulePath=path;await library.render({force:true});__hol263PublishedChoice.library=library;
  const {localRulePage}=await import('/systems/heroes-of-legend/services/journals.mjs');const local=await localRulePage(path);return{fixtureId:fixture?.id,uuid:local.uuid,before:local.toObject()};
 },{oldPage,commit:old.flags['heroes-of-legend'].ruleBook.commit});
 const reader=page.locator('.hol-rules-library [data-library-reader]');await reader.getByRole('button',{name:'Read current published rules',exact:true}).waitFor();
 await reader.screenshot({path:'test-results/published-rule-choice/world-copy.png'});
 await reader.getByRole('button',{name:'Read current published rules',exact:true}).click();await reader.getByText('Current published rules',{exact:true}).waitFor();
 const text=(await reader.innerText()).replace(/\s+/g,' ');assert.match(text,/learn one language native to it and gain one trait/);assert(!text.includes('grants two additional ordinary spoken languages'));
 await reader.screenshot({path:'test-results/published-rule-choice/current-published.png'});
 assert.deepEqual(await page.evaluate(async uuid=>(await fromUuid(uuid)).toObject(),state.uuid),state.before);
 await reader.getByRole('button',{name:'Read world copy',exact:true}).click();await reader.getByText('Saved world book copy',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(async uuid=>(await fromUuid(uuid)).toObject(),state.uuid),state.before);
 assert.deepEqual(errors,[]);console.log('PASS native explicit current published language rules, return to saved world copy, no journal changes.');
}finally{
 await page.evaluate(async()=>{const state=globalThis.__hol263PublishedChoice;if(!state)return;await state.library?.close();if(state.fixtureId)await game.journal.get(state.fixtureId)?.delete();});await browser.close();
}
