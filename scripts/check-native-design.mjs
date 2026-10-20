import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL, ID = "heroes-of-legend";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1") throw new Error("Use an explicitly isolated local development world.");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], clients = [];
let gm, fixture;
let cleanupError;
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); clients.push(context);
  await context.addInitScript(() => { localStorage.setItem("core.noCanvas", "true"); localStorage.setItem("core.maxFPS", "10"); });
  context.setDefaultTimeout(60000);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg=>{if(msg.type()==="error")console.error("BROWSER",msg.text());});
  console.info("JOIN",name); await page.goto(`${url}/join`,{waitUntil:"domcontentloaded"}); console.info("JOIN FORM",name,page.url()); console.info("JOIN BODY",name,(await page.locator("body").innerText()).slice(0,500)); await page.bringToFront(); await selectTestUser(page, name); await page.locator("button[name=join]").evaluate(button=>button.click());
  await page.waitForFunction(() => globalThis.game?.ready, null, { timeout: 60000 });
  await page.evaluate(() => foundry.nue.Tour.activeTour?.exit()); console.info("JOINED",name); page.setDefaultTimeout(20000); return page;
}
async function waitActor(predicate, arg) { await gm.waitForFunction(predicate, arg, {timeout:15000}); }
async function capture(page, locator, path) {
  await page.bringToFront(); await locator.waitFor({state:"visible"});
  const bounds=await locator.evaluate(async element=>{const samples=[];for(let i=0;i<3;i++){const r=element.getBoundingClientRect();samples.push({x:r.x,y:r.y,width:r.width,height:r.height});await new Promise(resolve=>setTimeout(resolve,100));}return samples;});
  for(const key of ["x","y","width","height"]) assert.ok(Math.max(...bounds.map(b=>b[key]))-Math.min(...bounds.map(b=>b[key]))<2,`Unstable ${path} ${key}`);
  const box=bounds.at(-1), viewport=page.viewportSize(); box.x=Math.max(0,box.x);box.y=Math.max(0,box.y);box.width=Math.min(box.width,viewport.width-box.x);box.height=Math.min(box.height,viewport.height-box.y);
  if(process.env.HOL_TEST_SCREENSHOTS === "1" || process.env.HOL_TEST_VISUAL_ONLY === "1") await page.screenshot({path,clip:box,animations:"disabled",timeout:30000});
}

async function checkPortrait(page, actorId, selector, imagePath, reload = false) {
  await page.evaluate(({id,path})=>{
    const Original=CONFIG.ux.FilePicker;
    globalThis.__holPortraitProbe={Original,calls:[],path};
    CONFIG.ux.FilePicker=class extends Original {
      constructor(options){super(options);this.holProbeOptions=options;}
      async browse(){const p=globalThis.__holPortraitProbe;p.calls.push({type:this.holProbeOptions.type,actorUuid:this.holProbeOptions.document.uuid,current:this.holProbeOptions.current});this.holProbeOptions.callback(p.path);return this;}
    };
  },{id:actorId,path:imagePath});
  try {
    const sheet=page.locator(selector);
    const before=await page.evaluate(id=>game.actors.get(id).img,actorId);
    await sheet.locator('[data-portrait-image][data-action="editImage"]').click();
    await page.waitForFunction(()=>globalThis.__holPortraitProbe.calls.length===1);
    const invocation=await page.evaluate(()=>globalThis.__holPortraitProbe.calls[0]);
    assert.equal(invocation.type,"image");assert.equal(invocation.actorUuid,`Actor.${actorId}`);assert.equal(invocation.current,before);
    assert.equal(await page.evaluate(id=>game.actors.get(id).img,actorId),before,"Picker selection is explicitly saved");
    await sheet.locator('[data-action="savePortrait"]').click();
    await page.waitForFunction(({id,path})=>game.actors.get(id).img===path,{id:actorId,path:imagePath});
  } finally {
    await page.evaluate(()=>{if(globalThis.__holPortraitProbe){CONFIG.ux.FilePicker=globalThis.__holPortraitProbe.Original;delete globalThis.__holPortraitProbe;}});
  }
  if(reload){await page.reload();await page.waitForFunction(()=>globalThis.game?.ready);}
  else await page.evaluate(async id=>game.actors.get(id).sheet.close(),actorId);
  await page.evaluate(async id=>game.actors.get(id).sheet.render({force:true}),actorId);
  assert.equal(await page.locator(selector).locator('[data-portrait-image]').getAttribute("src"),imagePath);
}
try {
  await mkdir("test-results/native-design", { recursive: true });
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  await gm.evaluate(async()=>{
    const ID="heroes-of-legend";
    if(game.settings.get(ID,"creationAuthorityClient")!==game.socket.id){
      const work=game.settings.get(ID,"authorityWork");if(work.busy||work.uncertain)throw new Error("Isolated coordinator has unresolved work.");
      await game.settings.set(ID,"creationAuthorityClient","");await game.settings.set(ID,"authorityMeta",{});await game.settings.set(ID,"authorityWork",{});
      const {bindCreationAuthority}=await import("/systems/heroes-of-legend/services/authority.mjs");await bindCreationAuthority();
    }
  });
  fixture = await gm.evaluate(async () => {
    const ID = "heroes-of-legend";
    const registry = globalThis.__holDesign = { actors: [], users: [], messages: [], journals: [] };
    registry.hook = Hooks.on("createChatMessage", message => registry.messages.push(message.id));
    registry.journalHook = Hooks.on("createJournalEntry", entry => registry.journals.push(entry.id));
    const owner = await User.create({ name: `Design owner ${foundry.utils.randomID(5)}`, role: CONST.USER_ROLES.PLAYER }); registry.users.push(owner.id);
    const observer = await User.create({ name: `Design reader ${foundry.utils.randomID(5)}`, role: CONST.USER_ROLES.PLAYER }); registry.users.push(observer.id);
    const {loadCatalogs} = await import("/systems/heroes-of-legend/services/catalog.mjs");
    const {abilityItemSource,equipmentItemSource} = await import("/systems/heroes-of-legend/rules/item-construction.mjs");
    const catalogs = await loadCatalogs(), recipe = catalogs.inventory.recipes.find(r => r.id === "recipe-twisted-cord");
    const actor = await Actor.create({name:"Oren · native design",type:"character",system:{health:{value:4,baseMax:15}}, ownership:{[owner.id]:3,[observer.id]:2},flags:{[ID]:{development:{level:1,dp:3,recipes:[recipe.id],creationSummary:{speedBase:6,capacity:10},creation:{}},creationReceipt:{status:"complete"}}}}); registry.actors.push(actor.id);
    const ability = catalogs.choices.find(r=>r.id===recipe.permissions[0]);
    const equipment = catalogs.inventory.equipment.find(r=>r.inventoryDie && !r.specialOrder);
    const items = await actor.createEmbeddedDocuments("Item",[abilityItemSource(ability,{sourceCommit:catalogs.commit}),equipmentItemSource(equipment,{sourceCommit:catalogs.commit,quantity:1,inventoryDie:0})]);
    if (items.some(item => !item.img.startsWith(`systems/${ID}/assets/`) || item.img.includes("item-bag"))) throw new Error("Catalog Items retained generic artwork");
    const artProbes = await actor.createEmbeddedDocuments("Item", [
      {name:"Default artwork probe",type:"equipment",system:{catalogId:"item-water-flask"}},
      {name:"Chosen artwork probe",type:"equipment",img:`systems/${ID}/assets/icons/mask.svg`,system:{catalogId:"item-water-flask"}}
    ]);
    const defaultItem = artProbes.find(item => item.name === "Default artwork probe"), customItem = artProbes.find(item => item.name === "Chosen artwork probe");
    if (defaultItem.img !== `systems/${ID}/assets/icons/flask.svg` || customItem.img !== `systems/${ID}/assets/icons/mask.svg`) throw new Error("Native Item creation did not preserve default/custom artwork policy");
    await actor.deleteEmbeddedDocuments("Item", [defaultItem.id,customItem.id]);
    const supply = items.find(item=>item.type==="equipment");
    const creatureProfiles=await game.packs.get(`${ID}.creatures`).getDocuments();const source = (creatureProfiles.find(profile=>profile.name==="Shield Soldier")??creatureProfiles[0]).toObject();delete source._id;source.name="Edda · native design";source.flags[ID].npc={enabled:true,detail:"A gold clasp",want:"Keep the crossing open"};
    const npc = await Actor.create(source);registry.actors.push(npc.id);
    void actor.sheet.render({force:true});
    return {actor:actor.id,npc:npc.id,supply:supply.id,ability:items.find(i=>i.type==="ability").id,owner:owner.id,ownerName:owner.name,observer:observer.id,observerName:observer.name,recipe:recipe.id,craftAbility:ability.id};
  });
  console.info("Fixtures",JSON.stringify(fixture));
  const sheet = gm.locator(".hol-character").filter({has:gm.locator(".hol-character-sheet")});
  if(process.env.HOL_TEST_VISUAL_ONLY === "1") {
    await capture(gm,sheet,"test-results/native-design/character.png");
    await gm.evaluate(async id=>game.actors.get(id).sheet.close(),fixture.actor);
    for(const [key,path] of [["npc","npc"],["supply","item"],["ability","ability"]]) {
      await gm.evaluate(async ({f,key})=>{const doc=key==="npc"?game.actors.get(f.npc):game.actors.get(f.actor).items.get(f[key]);await doc.sheet.render({force:true});}, {f:fixture,key});
      await capture(gm,gm.locator(key==="npc"?".hol-creature":key==="supply"?".hol-equipment":".hol-ability"),`test-results/native-design/${path}.png`);
      await gm.evaluate(async ({f,key})=>(key==="npc"?game.actors.get(f.npc):game.actors.get(f.actor).items.get(f[key])).sheet.close(),{f:fixture,key});
    }
    for(const [module,name,selector] of [["crafting","CraftingPanel",".hol-crafting"],["recovery","RecoveryPanel",".hol-recovery"],["journals","RulesLibrary",".hol-rules-library"]]) {
      await gm.evaluate(async ({id,module,name})=>{const exports=await import(`/systems/heroes-of-legend/applications/${module}.mjs`);globalThis.__holVisualApp=new exports[name](module==="journals"?{}:game.actors.get(id));await globalThis.__holVisualApp.render({force:true});},{id:fixture.actor,module,name});
      await capture(gm,gm.locator(selector),`test-results/native-design/${module}.png`);
      await gm.evaluate(async()=>{await globalThis.__holVisualApp.close();delete globalThis.__holVisualApp;});
    }
    console.info("PASS native visual surfaces");
  } else {
  await sheet.locator('[data-tab="inventory"]').click();
  await sheet.locator(`[data-quantity="${fixture.supply}"]`).fill("0"); await sheet.locator(`[data-quantity="${fixture.supply}"]`).dispatchEvent("change");
  await waitActor(id=>game.actors.get(id).items.find(i=>i.type==="equipment").system.quantity===0,fixture.actor);
  await sheet.locator('[data-tab-pane="inventory"] [data-action="resupply"]').first().click();
  await waitActor(id=>game.actors.get(id).items.find(i=>i.type==="equipment").system.inventoryDie===4,fixture.actor);
  await sheet.locator('[data-tab-pane="inventory"] [data-action="favorite"]').first().click();
  await sheet.locator('[data-tab="main"]').click();
  await sheet.locator('[data-disclosure="favorites"] li').filter({hasText:"Use"}).waitFor();
  await capture(gm,sheet,"test-results/native-design/character.png");
  await gm.evaluate(async id=>{await game.actors.get(id).sheet.close();await game.actors.get(id).sheet.render({force:true});},fixture.actor);
  assert.equal(await sheet.locator('[data-disclosure="favorites"] li').count(),1);
  const owner = await join(fixture.ownerName);
  await owner.evaluate(async id=>game.actors.get(id).sheet.render({force:true}),fixture.actor);
  const characterPortrait=await gm.evaluate(id=>game.actors.get(id).img,fixture.npc);
  await checkPortrait(owner,fixture.actor,".hol-character",characterPortrait,true);
  await owner.locator('.hol-character [data-action="spendGrit"]').click();
  await owner.getByRole("button",{name:"Yes",exact:true}).click();
  await waitActor(id=>game.actors.get(id).system.health.value===15 && game.actors.get(id).system.grit.spent===1,fixture.actor);
  await owner.locator('.hol-character [data-tab="crafting"]').click();
  await owner.locator('.hol-character [data-action="crafting"]').click();
  await owner.locator('.hol-crafting [data-action="start"]').click();
  await waitActor(({id,recipe})=>game.actors.get(id).getFlag("heroes-of-legend","craftingState")?.[recipe]?.active,{id:fixture.actor,recipe:fixture.recipe});
  await owner.locator('.hol-crafting [data-action="attempt"]').click();
  await waitActor(({id,recipe})=>game.actors.get(id).getFlag("heroes-of-legend","craftingState")?.[recipe]?.progress>0,{id:fixture.actor,recipe:fixture.recipe});
  await capture(owner,owner.locator(".hol-crafting"),"test-results/native-design/crafting.png");
  await owner.evaluate(async id=>{const {WoundPanel}=await import("/systems/heroes-of-legend/applications/wounds.mjs");await new WoundPanel(game.actors.get(id)).render({force:true});},fixture.actor);
  await owner.locator('.hol-wounds [data-action="record"]').click();
  await owner.getByRole("button",{name:"Record wound",exact:true}).click();
  await waitActor(id=>Object.values(game.actors.get(id).getFlag("heroes-of-legend","pendingWounds")??{}).some(w=>w.manual),fixture.actor);
  const eventId=await gm.evaluate(async id=>{
    const actor=game.actors.get(id),event=Object.values(actor.getFlag("heroes-of-legend","pendingWounds")).find(w=>w.manual);
    const {woundCatalog}=await import("/systems/heroes-of-legend/services/wounds.mjs");const {woundRoll}=await import("/systems/heroes-of-legend/rules/wounds.mjs");
    await actor.setFlag("heroes-of-legend",`pendingWounds.${event.eventId}`,{...event,status:"rolled",damageType:"physical",faces:[3,3,3],result:woundRoll(event.priorWounds,[3,3,3]),catalogCommit:(await woundCatalog()).sourceCommit});return event.eventId;
  },fixture.actor);
  await owner.locator('.hol-wounds [data-action="apply"]').click();
  await waitActor(({id,eventId})=>Boolean(game.actors.get(id).getFlag("heroes-of-legend","wounds")?.[eventId]),{id:fixture.actor,eventId});
  await owner.locator(`.hol-wounds [data-wound-event="${eventId}"] [name="treatmentProgress"]`).selectOption("3");
  await owner.locator(`.hol-wounds [data-wound-event="${eventId}"] [data-action="treat"]`).click();
  await waitActor(({id,eventId})=>game.actors.get(id).getFlag("heroes-of-legend","wounds")?.[eventId]?.recoveryProgress===3,{id:fixture.actor,eventId});
  assert.equal(await gm.evaluate(id=>game.actors.get(id).system.health.value,fixture.actor),15);
  await owner.evaluate(async id=>{const {ConditionPanel}=await import("/systems/heroes-of-legend/applications/conditions.mjs");await new ConditionPanel(game.actors.get(id)).render({force:true});},fixture.actor);
  await owner.locator('.hol-conditions [data-action="applyTick"][data-key="bleeding"]').click();
  await waitActor(id=>game.actors.get(id).system.health.value===14,fixture.actor);
  assert.equal(await gm.evaluate(id=>game.actors.get(id).getFlag("heroes-of-legend","survival").wounds,fixture.actor),1);
  console.info("PASS owner Grit, crafting, manual wound, exact-threshold treatment and condition tick");

  const observer=await join(fixture.observerName);
  await observer.evaluate(async id=>game.actors.get(id).sheet.render({force:true}),fixture.actor);
  await observer.locator('.hol-character [data-tab="inventory"]').click();
  assert.equal(await observer.locator('.hol-character [data-action="editImage"], .hol-character [data-action="savePortrait"]').count(),0);
  assert.equal(await observer.locator('.hol-character [data-portrait-image]').getAttribute("data-action"),"viewPortrait");
  assert.equal(await observer.locator('.hol-character [data-action="resupply"]').count(),0);
  await observer.evaluate(async id=>{const {requestResupply}=await import("/systems/heroes-of-legend/services/resupply.mjs");const actor=game.actors.get(id);try{await requestResupply(actor,actor.items.find(i=>i.type==="equipment"));throw new Error("permission bypass");}catch(e){if(!e.message.includes("owner"))throw e;}},fixture.actor);
  await gm.bringToFront();
  await gm.evaluate(async id=>{await game.actors.get(id).sheet.render({force:true});},fixture.npc);
  const npc=gm.locator('.hol-creature');await npc.locator('.hol-card-defenses').waitFor();
  assert.equal(await npc.locator('.hol-card-defenses>div').count(),7);
  await checkPortrait(gm,fixture.npc,".hol-creature","systems/heroes-of-legend/assets/icons/mask.svg");
  await capture(gm,npc,"test-results/native-design/npc.png");
  await gm.evaluate(async ({id,item})=>game.actors.get(id).items.get(item).sheet.render({force:true}),{id:fixture.actor,item:fixture.supply});
  await capture(gm,gm.locator(".hol-equipment"),"test-results/native-design/item.png");
  const journals=await gm.evaluate(async()=>{
    const {importRuleJournals}=await import("/systems/heroes-of-legend/services/journals.mjs");
    const first=await importRuleJournals();
    const entry=game.journal.find(e=>e.getFlag("heroes-of-legend","ruleSource")?.path==="design/rules/languages.md");
    await entry.update({name:"Our renamed local rules"});
    const again=await importRuleJournals();return {first,again,id:entry.id,name:entry.name,total:(await (await import("/systems/heroes-of-legend/services/journals.mjs")).ruleIndex()).length};
  });
  assert.equal(journals.first.created+journals.first.retained,journals.total);assert.equal(journals.again.created,0);assert.equal(journals.name,"Our renamed local rules");
  await owner.evaluate(async()=>{const {openLocalRule,ruleIndex}=await import("/systems/heroes-of-legend/services/journals.mjs");if((await ruleIndex()).some(r=>r.pack==="da-rules"))throw new Error("DA index leaked");await openLocalRule("design/rules/languages.md");});
  await owner.bringToFront();
  await capture(owner,owner.locator(".journal-entry"),"test-results/native-design/journal.png");
  await gm.bringToFront();
  await gm.evaluate(async id=>{await game.actors.get(id).sheet.close();await game.actors.get(id).sheet.render({force:true,position:{width:390,height:760,left:10,top:10}});},fixture.actor);
  await capture(gm,sheet,"test-results/native-design/character-narrow.png");
  assert.deepEqual(errors,[]);
  console.info(JSON.stringify({passed:true,foundry:await gm.evaluate(()=>game.version),journals:journals.first,pageErrors:errors}));
  }
} catch(error) { console.error("RUNFAIL",error); if(gm)console.error("STATE",JSON.stringify(await gm.evaluate(()=>({messages:(globalThis.__holDesign?.messages??[]).map(id=>({id,content:game.messages.get(id)?.content})),authority:game.settings.get("heroes-of-legend","authorityWork"),notifications:document.querySelector("#notifications")?.innerText})).catch(()=>({})))); if(process.env.HOL_TEST_SCREENSHOTS === "1") for(const [i,context] of clients.entries())for(const page of context.pages())await page.screenshot({path:`test-results/native-design/failure-${i}.png`,timeout:5000}).catch(()=>{}); throw error;
} finally {
  for(const context of clients.slice(1)) await context.close().catch(error=>{cleanupError=error;});
  if(gm) await gm.evaluate(async()=>{
    const r=globalThis.__holDesign;if(!r)return;
    Hooks.off("createChatMessage",r.hook);Hooks.off("createJournalEntry",r.journalHook);
    for(const app of Object.values(ui.windows))if(app.options?.classes?.includes("heroes-of-legend"))await app.close();
    const counts={};
    for(const [type,collection,ids] of [[ChatMessage,game.messages,r.messages],[JournalEntry,game.journal,r.journals],[Actor,game.actors,r.actors],[User,game.users,r.users]]){
      const existing=ids.filter(id=>collection.has(id));if(existing.length)await type.deleteDocuments(existing);counts[type.name]=existing.length;
      if(ids.some(id=>collection.has(id)))throw new Error(`Fixture ${type.name} cleanup incomplete`);
    }
    await game.settings.set("heroes-of-legend","creationAuthorityClient","");await game.settings.set("heroes-of-legend","authorityMeta",{});await game.settings.set("heroes-of-legend","authorityWork",{});
    delete globalThis.__holDesign;return counts;
  }).then(counts=>console.info("CLEANUP",JSON.stringify(counts))).catch(error=>{cleanupError=error;console.error("Cleanup failed",error);});
  await browser.close();
  if(cleanupError)throw cleanupError;
}
