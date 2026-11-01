import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {selectTestUser} from './helpers/login.mjs';
const url=process.env.HOL_TEST_URL,mode=process.argv[2],out='test-results/abilities-upgrade';
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||process.env.HOL_TEST_ALLOW_WRITES!=='1'||process.env.HOL_TEST_ISOLATED_WORLD!=='1'||!['baseline','verify'].includes(mode))throw Error('Explicit isolated local world and baseline/verify mode required.');
await mkdir(out,{recursive:true});const browser=await chromium.launch();const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/join');await selectTestUser(page,'Gamemaster');await page.locator('button[name=join]').click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});await page.evaluate(()=>foundry.nue.Tour.activeTour?.exit());
 if(mode==='baseline'){
  const prior=JSON.parse(await readFile(out+'/baseline.json','utf8').catch(()=> 'null'));
  const data=await page.evaluate(async prior=>{
   if(prior?.actorId){const old=game.actors.get(prior.actorId);if(old?.getFlag('heroes-of-legend','releaseUpgradeFixture')==='abilities-2.6')await old.delete();}
   const actor=await Actor.create({name:'Ability release upgrade preservation',type:'character',system:{health:{value:7,baseMax:20},grit:{granted:2,spent:1},biography:'Player-authored biography retained across the ability release.'},flags:{'heroes-of-legend':{releaseUpgradeFixture:'abilities-2.6',development:{creationSummary:{speedBase:5,unencumberedSpeed:5,capacity:10},gritGranted:2,gritSpent:1}}}});
   try{
    const index=await game.packs.get('heroes-of-legend.abilities').getIndex();const id=index.find(i=>i.name==='Basic Melee')?._id;if(!id)throw Error('Baseline Basic Melee missing');const data=(await game.packs.get('heroes-of-legend.abilities').getDocument(id)).toObject();delete data._id;delete data.folder;data.name='My edited attack reference';data.system.description='<p>Player-authored rules note: retain this text.</p>';const [item]=await actor.createEmbeddedDocuments('Item',[data]);
    return {version:game.system.version,world:game.world.id,actorId:actor.id,actorUuid:actor.uuid,itemId:item.id,itemUuid:item.uuid,name:actor.name,img:actor.img,health:foundry.utils.deepClone(actor.system.health),gritSpent:actor.system.grit.spent,biography:actor.system.biography,itemName:item.name,itemDescription:item.system.description,itemSource:item.getFlag('heroes-of-legend','source'),itemSourceCommit:item.getFlag('heroes-of-legend','sourceCommit')};
   }catch(error){await actor.delete();throw error;}
  },prior);assert.equal(data.version,'2.5.1');await writeFile(out+'/baseline.json',JSON.stringify(data,null,2)+'\n');console.log('Baseline fixture persisted',data.actorUuid,'HP7/spentGrit1/editedItem.');
 }else{
  const before=JSON.parse(await readFile(out+'/baseline.json','utf8'));const after=await page.evaluate(async b=>{const a=game.actors.get(b.actorId);if(!a)throw Error('Preservation Actor missing');const i=a.items.get(b.itemId);if(!i)throw Error('Preservation Item missing');return {version:game.system.version,world:game.world.id,actorId:a.id,actorUuid:a.uuid,itemId:i.id,itemUuid:i.uuid,name:a.name,img:a.img,health:foundry.utils.deepClone(a.system.health),gritSpent:a.system.grit.spent,biography:a.system.biography,itemName:i.name,itemDescription:i.system.description,itemSource:i.getFlag('heroes-of-legend','source'),itemSourceCommit:i.getFlag('heroes-of-legend','sourceCommit')};},before);assert.equal(after.version,'2.6.0');assert.deepEqual({...after,version:before.version},before);assert.deepEqual(errors,[]);await writeFile(out+'/evidence.json',JSON.stringify({before,after,preserved:true,pageErrors:errors},null,2)+'\n');await page.evaluate(async id=>{const a=game.actors.get(id);if(a?.getFlag('heroes-of-legend','releaseUpgradeFixture')!=='abilities-2.6')throw Error('Cleanup identity changed');await a.delete();},before.actorId);assert.equal(await page.evaluate(id=>game.actors.has(id),before.actorId),false);console.log('PASS upgraded Actor UUID, owned Item UUID/text/source, HP and spent Grit preserved; fixture cleanup verified.');
 }
}finally{await browser.close();}
