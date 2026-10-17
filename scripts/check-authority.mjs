import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url=process.env.HOL_TEST_URL;
if(!url||!["localhost","127.0.0.1"].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=="1")throw new Error('Select a disposable local world and enable writes');
const browser=await chromium.launch();const pages=[];const errors=[];let f;let cleanup;
async function join(name){const context=await browser.newContext({viewport:{width:1600,height:1000}});context.setDefaultTimeout(30000);await context.addInitScript(()=>localStorage.setItem('core.noCanvas','true'));const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.locator('input[name=username]').fill(name);await p.locator('button[name=join]').click();await p.waitForFunction(()=>game.ready);pages.push(p);console.info(`Joined ${name}`);return p;}
try{
 const gm=await join(process.env.HOL_TEST_USER??'Gamemaster');cleanup=gm;
 f=await gm.evaluate(async()=>{const suffix=foundry.utils.randomID(5);const gm2=await User.create({name:`HOL GM ${suffix}`,role:4});const player=await User.create({name:`HOL Owner ${suffix}`,role:1});const outsider=await User.create({name:`HOL Other ${suffix}`,role:1});const source=await Actor.create({name:'Authority source',type:'character',ownership:{[player.id]:3}});const targets=await Actor.createDocuments([{name:'Authority A',type:'character'},{name:'Authority B',type:'character'}]);const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');await api.selectAuthorityClient();return{gm2:gm2.id,gm2name:gm2.name,player:player.id,playername:player.name,outsider:outsider.id,othername:outsider.name,source:source.id,targets:targets.map(a=>a.id),plans:[],requests:[]};});
 const second=await join(f.gm2name);const player=await join(f.playername);const other=await join(f.othername);
 async function plan(page){const id=await page.evaluate(async f=>{const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');const p=await api.prepareProbePlan(game.actors.get(f.source),f.targets.map(id=>game.actors.get(id)),game.users.get(f.player));return p.id;},f);f.plans.push(id);return id;}
 async function request(page,id){const rid=await page.evaluate(async id=>{const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');return(await api.requestProbe(id)).id;},id);f.requests.push(rid);return rid;}
 async function resolve(page,id,options={}){return page.evaluate(async({id,options})=>{const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');return api.resolveProbe(id,options);},{id,options});}
 async function counts(page){return page.evaluate(f=>f.targets.map(id=>game.actors.get(id).getFlag('heroes-of-legend','probeCount')??0),f);}
 const first=await plan(gm);const privacy = await player.evaluate(async id=>{const pack=game.packs.get('world.hol-authority-prototype');let readable=false;try {readable=!!(await pack?.getDocument(id))?.getFlag('heroes-of-legend','probePlan');}catch{}return{visible:pack?.visible,readable};},first);assert.equal(privacy.visible,false);console.info('Native pack visibility/confidentiality probe:',JSON.stringify(privacy));
 const bad=await request(other,first);await assert.rejects(resolve(gm,bad),/Unauthorized requester/);
 const good=await request(player,first);
 assert.equal((await resolve(second,good)).status,'not-authority');
 const duplicate=await Promise.all([resolve(gm,good),resolve(gm,good)]);assert(duplicate.every(r=>r.status==='complete'));assert.deepEqual(await counts(gm),[1,1]);
 const retry=await request(player,first);assert.equal((await resolve(gm,retry)).replay,true);assert.deepEqual(await counts(gm),[1,1]);
 const partial=await plan(gm);const partialRequest=await request(player,partial);assert.equal((await resolve(gm,partialRequest,{pauseAfter:1})).status,'paused-after-target');assert.deepEqual(await counts(gm),[2,1]);
 await gm.context().close();cleanup=second;
 assert.equal((await resolve(second,partialRequest)).status,'not-authority');
 // Known-quiescent recovery after the old client has closed, never automatic lease takeover.
 await second.evaluate(async()=>{const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');await api.selectAuthorityClient();});
 assert.equal((await resolve(second,partialRequest)).status,'complete');assert.deepEqual(await counts(second),[2,2]);
 await second.reload();await second.waitForFunction(()=>game.ready);assert.equal((await resolve(second,partialRequest)).status,'not-authority');
 await second.evaluate(async()=>{const api=await import('/systems/heroes-of-legend/prototypes/authority.mjs');await api.selectAuthorityClient();});assert.equal((await resolve(second,partialRequest)).replay,true);
 const stale=await plan(second);const staleRequest=await request(player,stale);await second.evaluate(async id=>game.actors.get(id).setFlag('heroes-of-legend','probeCount',10),f.targets[0]);await assert.rejects(resolve(second,staleRequest),/Stale target state/);assert.deepEqual(await counts(second),[10,2]);
 assert.deepEqual(errors,[]);console.info('PASS: 2 GMs + 2 players, hidden-UI plans (native confidentiality limitation recorded), actual-author denial, duplicate requests, one configured client, partial-receipt recovery, disconnect/reload fail-closed, stale-state rejection; zero page errors.');
}finally{
 if(cleanup&&f)await cleanup.evaluate(async f=>{for(const id of f.requests)await game.messages.get(id)?.delete();const pack=game.packs.get('world.hol-authority-prototype');for(const id of f.plans){const doc=await pack?.getDocument(id);await doc?.delete();}for(const id of [f.source,...f.targets])await game.actors.get(id)?.delete();await game.settings.set('heroes-of-legend','prototypeAuthorityClient','');for(const id of [f.player,f.outsider])await game.users.get(id)?.delete();},f).catch(e=>console.error('Cleanup',e.message));
 if(f){const original=await join(process.env.HOL_TEST_USER??'Gamemaster');await original.evaluate(async id=>game.users.get(id)?.delete(),f.gm2).catch(()=>{});}
 await browser.close();
}
