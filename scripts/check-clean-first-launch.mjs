import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1')throw Error('Explicit isolated localhost world required.');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),errors=[];let state;
try{
 const context=await browser.newContext({viewport:{width:1500,height:1050}});await context.addInitScript(()=>{localStorage.setItem('core.noCanvas','false');localStorage.setItem('core.maxFPS','10')});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));await page.goto(url+'/join');await selectTestUser(page,'Gamemaster');await page.locator('button[name=join]').click();await page.waitForFunction(()=>globalThis.game?.ready&&game.canvas.initialized,null,{timeout:60000});
 // Core's empty-world welcome tour creates/views its scene, waits one second,
 // then pans. Observe that first-launch work with the canvas enabled.
 await page.waitForTimeout(5000);
 state=await page.evaluate(async()=>({world:game.world.id,systemVersion:game.system.version,foundry:game.version,canvasInitialized:canvas.initialized,canvasScene:canvas.scene?.id,actors:game.actors.size,items:game.items.size,sourceCommit:(await(await fetch('/systems/heroes-of-legend/data/choices.json')).json()).sourceCommit}));
 assert(state.world.startsWith('hol-release-clean-'));assert.equal(state.systemVersion,'2.6.0');assert.equal(state.canvasInitialized,true);assert(state.canvasScene);assert.equal(state.actors,0);assert.equal(state.items,0);await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());
}finally{await browser.close();}
assert.deepEqual(errors,[]);await mkdir('test-results',{recursive:true});await writeFile('test-results/clean-first-launch.json',JSON.stringify({passed:true,...state,browserErrors:errors},null,2)+'\n');console.log('PASS fresh empty-world first launch with canvas enabled, zero Actors/Items and zero browser errors through teardown.');
