import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
import {selectTestUser} from "./helpers/login.mjs";
const url=process.env.HOL_TEST_URL;
if (!url || !["localhost","127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES!=="1" || process.env.HOL_TEST_ISOLATED_WORLD!=="1") throw Error("Set HOL_TEST_URL explicitly (parity world: http://localhost:30018), HOL_TEST_ALLOW_WRITES=1 and HOL_TEST_ISOLATED_WORLD=1.");
const output=resolve("test-results/native-parity"),webRoot=resolve("dist/workshop");
await mkdir(output,{recursive:true});
const mime={".html":"text/html",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".svg":"image/svg+xml",".ttf":"font/ttf",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{try{const path=resolve(webRoot,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));if(!path.startsWith(webRoot+"/"))throw Error("Invalid path");res.setHeader("Content-Type",mime[extname(path)]??"application/octet-stream");res.end(await readFile(path));}catch{res.statusCode=404;res.end("Not found");}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1050}});
await context.addInitScript(()=>{localStorage.setItem("core.noCanvas","true");localStorage.setItem("core.maxFPS","10");});
const gm=await context.newPage(),web=await context.newPage(),errors=[];
for(const page of [gm,web])page.on("pageerror",error=>errors.push(error.stack??error.message));
const evidence={viewport:{width:1440,height:1050},captures:[],checks:[]};
let cleanup,authorityIdle=false;
async function capture(page,selector,name,width){
 const target=page.locator(selector).first();await target.waitFor({state:"visible"});
 if(width)await target.evaluate((element,width)=>{element.style.width=`${width}px`;element.style.maxWidth="none";},width);
 await page.evaluate(()=>document.fonts.ready);
 const bounds=await target.boundingBox();assert.ok(bounds.width>200&&bounds.height>50);
 await target.screenshot({path:resolve(output,name+".png"),animations:"disabled"});
 evidence.captures.push({name,width:bounds.width,height:bounds.height});return bounds;
}
try{
 await gm.goto(url+"/join");await selectTestUser(gm,process.env.HOL_TEST_USER??"Gamemaster");
 await gm.locator('button[name="join"]').click();await gm.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 await gm.evaluate(()=>foundry.nue.Tour.activeTour?.exit());
 await gm.evaluate(async()=>{const {ensureAuthorityReady}=await import("/systems/heroes-of-legend/services/authority.mjs");await ensureAuthorityReady();});
 evidence.foundry=await gm.evaluate(()=>game.version);
 await gm.evaluate(async()=>{
  globalThis.__holParity={items:[],journals:[],apps:[],actors:[],users:[],messages:[],combats:[]};
  const journalIds=new Set(game.journal.map(entry=>entry.id));
  const {importRuleJournals}=await import("/systems/heroes-of-legend/services/journals.mjs");
  const legacy=await JournalEntry.create({name:"Parity fixture · edited legacy reference",pages:[{name:"Edited text",type:"text",text:{content:"<p>Keep our campaign notes intact.</p>",format:1}}],flags:{"heroes-of-legend":{ruleSource:{path:"design/rules/languages.md"}}}});
  __holParity.journals.push(legacy.id);
  try {await importRuleJournals();}
  finally {for(const entry of game.journal)if(!journalIds.has(entry.id)&&entry.id!==legacy.id)__holParity.journals.push(entry.id);}
  if(legacy.pages.contents[0].text.content!=="<p>Keep our campaign notes intact.</p>")throw Error("Legacy notes changed");
  let editedBook=game.journal.find(entry=>__holParity.journals.includes(entry.id)&&entry.getFlag("heroes-of-legend","ruleBook")?.key==="player-rules");
  if(!editedBook){const source=game.journal.find(entry=>entry.getFlag("heroes-of-legend","ruleBook")?.key==="player-rules");const data=source.toObject();delete data._id;data.name="Parity fixture · edited native book";editedBook=await JournalEntry.create(data,{keepEmbeddedIds:true});__holParity.journals.push(editedBook.id);}
  const editedPage=editedBook.pages.find(page=>page.getFlag("heroes-of-legend","ruleSource")?.path==="design/rules/languages.md");
  const editedText=editedPage.text.content+"<p>Parity fixture · our edited book notes survive repeated imports.</p>";
  await editedPage.update({"text.content":editedText});
  const again=await importRuleJournals();if(again.created!==0)throw Error("Second import created duplicates");
  if(editedPage.text.content!==editedText)throw Error("Edited native book page was overwritten");
 });
 evidence.checks.push("Explicit two-book import is idempotent and preserves edited legacy notes AND edited native book page text");
 const bookStats=await gm.evaluate(async()=>{
  const {ruleIndex,openLocalRule}=await import("/systems/heroes-of-legend/services/journals.mjs");
  const records=await ruleIndex();const stats=[];
  for(const key of ["player-rules","da-rules"]){const book=game.journal.find(entry=>entry.getFlag("heroes-of-legend","ruleBook")?.key===key);if(!book)throw Error("Missing book");const sources=book.pages.filter(page=>page.getFlag("heroes-of-legend","ruleSource"));for(const record of records.filter(record=>record.pack===key))if(!sources.some(page=>page.id===record.pageId))throw Error("Missing source page "+record.path);stats.push({key,entries:1,sourcePages:sources.length,sectionPages:book.pages.size-sources.length});}
  const page=await openLocalRule("design/rules/languages.md");globalThis.__holParity.apps.push(page.parent.sheet);await page.parent.sheet.setPosition({width:800,height:760,left:40,top:50});return stats;
 });
 evidence.books=bookStats;assert.deepEqual(bookStats.map(book=>book.sourcePages),[610,408]);
 await gm.evaluate(async()=>{const sheet=__holParity.apps.at(-1);const before=sheet.pageId;await sheet.nextPage();if(sheet.pageId===before)throw Error("Native nextPage did not navigate");await sheet.previousPage();if(sheet.pageId!==before)throw Error("Native previousPage did not restore the source page");});
 evidence.checks.push("Native next/previous navigation returns to the same stable source page");
 const nativeBook=await capture(gm,".hol-native-book","native-player-book");
 await web.goto(`http://127.0.0.1:${server.address().port}/journal.html#rule-languages`);await web.locator('.journal-page').waitFor();
 await capture(web,".tools-shell","web-rules",nativeBook.width);
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];const {openLocalRule}=await import("/systems/heroes-of-legend/services/journals.mjs");const index=await(await fetch("systems/heroes-of-legend/data/journal-index.json")).json();const page=await openLocalRule(index.records.find(record=>record.path.startsWith("design/da-book/manuscript/")).path);__holParity.apps.push(page.parent.sheet);await page.parent.sheet.setPosition({width:800,height:760,left:40,top:50});});
 await capture(gm,".hol-native-book","native-da-book");
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];const {RulesLibrary}=await import("/systems/heroes-of-legend/applications/journals.mjs");const app=new RulesLibrary();__holParity.apps.push(app);await app.render({force:true});await app.setPosition({width:800,height:760,left:40,top:50});});
 const before=await gm.evaluate(()=>[...foundry.applications.instances.values()].filter(app=>app.rendered).length);
 await gm.locator('[data-library-entry] [data-path="design/cards/a-bough-for-the-fallen.md"]').click();
 await gm.locator('[data-library-reader] .hol-journal-page').waitFor();
 assert.equal(await gm.evaluate(()=>[...foundry.applications.instances.values()].filter(app=>app.rendered).length),before,"Inline reading must not create another application window");
 await capture(gm,".hol-rules-library","native-inline-rules");evidence.checks.push("Inline rule read keeps the same application count; full book navigation is explicit");
 const inlineEdit=await gm.evaluate(async()=>{
  const book=game.journal.find(entry=>entry.getFlag("heroes-of-legend","ruleBook")?.key==="player-rules");
  if(!__holParity.journals.includes(book.id))return{skipped:true};
  const page=book.pages.find(page=>page.getFlag("heroes-of-legend","ruleSource")?.path==="design/cards/a-bough-for-the-fallen.md");
  __holParity.editedAbility={bookId:book.id,pageId:page.id,name:page.name,content:page.text.content};
  await page.update({name:"Our renamed Bough ability","text.content":page.text.content+"<p>Our edited inline ability ruling survives.</p>"});return{skipped:false};
 });
 if(!inlineEdit.skipped){
  await gm.locator('[data-library-entry] [data-path="design/cards/a-bough-for-the-fallen.md"]').click();
  await gm.getByText("Our edited inline ability ruling survives.",{exact:true}).waitFor();
  assert.ok((await gm.locator('[data-library-reader]').innerText()).includes("Our renamed Bough ability"));
  await gm.evaluate(async()=>{const saved=__holParity.editedAbility,page=game.journal.get(saved.bookId).pages.get(saved.pageId);const {importRuleJournals}=await import("/systems/heroes-of-legend/services/journals.mjs");await importRuleJournals();if(!page.text.content.includes("Our edited inline ability ruling survives."))throw Error("Edited ability page was overwritten");await page.update({name:saved.name,"text.content":saved.content});});
  evidence.checks.push("Edited/renamed native ability page remains visible in inline Read and survives repeated imports");
 }else{evidence.skipped??=[];evidence.skipped.push("Edited ability inline regression requires fixture ownership of the first world Player book; preexisting world book preserved.");}

 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 for(const [pack,id,name] of [["equipment","item-ordinary-light-armor","equipment"],["abilities","ability-a-bough-for-the-fallen","ability"]]){
  const nativeId=await gm.evaluate(async({pack,id})=>{const docs=await game.packs.get(`heroes-of-legend.${pack}`).getDocuments();const source=docs.find(item=>item.getFlag("heroes-of-legend","catalogId")===id||item.system.catalogId===id);if(!source)throw Error("Missing "+id);const data=source.toObject();delete data._id;const item=await Item.create(data);__holParity.items.push(item.id);await item.sheet.render({force:true});__holParity.apps.push(item.sheet);await item.sheet.setPosition({width:510,left:40,top:50});return item.id;},{pack,id});
  await gm.locator('.hol-approved-item-card [data-item-rules]').waitFor();
  assert.ok((await gm.locator('.hol-approved-item-card [data-item-rules]').innerText()).length>100,"Full rules must be visible");
  const native=await capture(gm,".hol-approved-item-card",`native-${name}`);
  await web.evaluate(({id})=>localStorage.setItem("hol.sheet.item.v1",JSON.stringify({id,notes:"",conditions:[],collapsed:{},quantity:1})),{id});
  await web.goto(`http://127.0.0.1:${server.address().port}/item.html`);await web.locator('.rule-card').waitFor();
  await capture(web,"#app",`web-${name}`,native.width);
  await gm.evaluate(async id=>{await game.items.get(id).sheet.close();},nativeId);
 }
 const toolActor=await gm.evaluate(async()=>{
  const {loadCatalogs}=await import("/systems/heroes-of-legend/services/catalog.mjs");const {abilityItemSource,equipmentItemSource}=await import("/systems/heroes-of-legend/rules/item-construction.mjs");const catalogs=await loadCatalogs();const recipe=catalogs.inventory.recipes.find(recipe=>recipe.id==="recipe-travel-food");const ability=catalogs.choices.find(record=>record.id===recipe.permissions[0]);const woundData=await(await fetch("systems/heroes-of-legend/data/wounds.json")).json();const wound=woundData.records.find(record=>record.table==="physical"&&record.recoveryValue===2);
  const actor=await Actor.create({name:"Borin Bridgekeeper · parity fixture",type:"character",system:{health:{value:3,baseMax:25}},flags:{"heroes-of-legend":{development:{level:1,dp:3,recipes:[recipe.id],creationSummary:{speedBase:6,capacity:10},creation:{}},creationReceipt:{status:"complete"},survival:{hp:3,maxHp:25,wounds:1,gritAvailable:2,marks:0,ownTurn:0,due:null,choice:null,status:"active"},wounds:{"parity-wound":{...wound,eventId:"parity-wound",recoveryProgress:0,effectIds:[],scar:true}}}}});__holParity.actors.push(actor.id);await actor.createEmbeddedDocuments("Item",[abilityItemSource(ability,{sourceCommit:catalogs.commit}),equipmentItemSource(catalogs.inventory.equipment.find(record=>record.id==="item-material-bundle"),{sourceCommit:catalogs.commit})]);return actor.id;
 });
 for(const [module,constructor,name]of [["recovery","RecoveryPanel","recovery"],["crafting","CraftingPanel","crafting"]]){
  await gm.evaluate(async({id,module,constructor})=>{const exports=await import(`/systems/heroes-of-legend/applications/${module}.mjs`);const app=new exports[constructor](game.actors.get(id));__holParity.apps.push(app);await app.render({force:true});await app.setPosition({width:780,left:40,top:50});},{id:toolActor,module,constructor});
  const native=await capture(gm,`.hol-${name} .hol-approved-tool`,`native-${name}`);
  await web.goto(`http://127.0.0.1:${server.address().port}/${name}.html`);await web.locator(".tool-banner").waitFor();await capture(web,".tools-content",`web-${name}`,native.width);
  if(name==="recovery"){
   await gm.locator('.hol-recovery [data-action="previewDying"]').click();await gm.locator('.hol-recovery [data-action="quick"][data-kind="stabilize"]').click();
   assert.equal(await gm.evaluate(id=>game.actors.get(id).system.health.value,toolActor),3,"Preview stabilization must never mutate recorded HP");
   await gm.locator('.hol-recovery [data-action="previewDying"]').click();
   await gm.locator('.hol-recovery [data-action="operation"][data-kind="heal"]').click();await capture(gm,".hol-recovery .hol-approved-tool","native-recovery-healing");
  }
  await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 }
 await gm.evaluate(id=>{const actor=game.actors.get(id);__holParity.messageHook=Hooks.on("createChatMessage",message=>{if(__holParity.combats.some(id=>message.getFlag("heroes-of-legend","combatRequest")?.combatUuid===`Combat.${id}`))__holParity.messages.push(message.id);for(const key of ["craftingRequest","recoveryRequest","woundRequest","woundTreatmentRequest"])if(message.getFlag("heroes-of-legend",key)?.actorUuid===actor.uuid){__holParity.messages.push(message.id);break;}});},toolActor);
 await gm.evaluate(async id=>{const {CraftingPanel}=await import("/systems/heroes-of-legend/applications/crafting.mjs");const app=new CraftingPanel(game.actors.get(id));__holParity.apps.push(app);await app.render({force:true});},toolActor);
 await gm.locator('.hol-crafting [data-action="start"]').click();
 await gm.waitForFunction(id=>game.actors.get(id).getFlag("heroes-of-legend","craftingState")?.["recipe-travel-food"]?.active,toolActor,{timeout:60000});
 await gm.locator('.hol-crafting [data-action="resolve"]').first().click();await gm.locator('.hol-crafting [name="attribute"]').selectOption("reason");await gm.locator('.hol-crafting [name="checkMaterials"]').check();await gm.locator('.hol-crafting [data-net-value="2"]').click();assert.equal(await gm.locator('.hol-crafting [data-craft-pool] [data-count]').innerText(),"5");assert.equal(await gm.locator('.hol-crafting [data-craft-pool] [data-keep]').innerText(),"Keep highest three");
 const nativeResolve=await capture(gm,".hol-crafting .hol-craft-resolve","native-crafting-resolve");
 await web.locator('[data-action="begin-craft"]').click();await web.locator('[data-action="resolve-craft"]').first().click();await web.locator('#craft-attribute').selectOption("reason");await web.locator('[data-net-step="2"]').click();await capture(web,"#reference .reference-body","web-crafting-resolve",nativeResolve.width);
 await gm.locator('.hol-crafting [data-action="attempt"]').click();
 await gm.waitForFunction(id=>game.actors.get(id).getFlag("heroes-of-legend","craftingState")?.["recipe-travel-food"]?.attempts===1,toolActor,{timeout:60000});
 const crafted=await gm.evaluate(id=>{const actor=game.actors.get(id),receipt=Object.values(actor.getFlag("heroes-of-legend","operationReceipts")).find(receipt=>receipt.kind==="crafting"&&receipt.material);return{attribute:receipt.result.attributeKey,materialBefore:receipt.material.before,materialAfter:receipt.material.after,materialCurrent:actor.items.get(receipt.material.itemId).system.inventoryDie,supplies:actor.items.filter(item=>item.type==="equipment"&&item.system.catalogId==="item-food-bundle").length,grit:actor.system.grit.spent,hp:actor.system.health.value};},toolActor);
 assert.equal(crafted.attribute,"reason");assert.equal(crafted.materialBefore,6);assert.equal(crafted.materialAfter,crafted.materialCurrent);assert.equal(crafted.supplies,1);assert.equal(crafted.grit,0);assert.equal(crafted.hp,3);evidence.crafting=crafted;
 await gm.locator(".hol-crafting .hol-tool-result").filter({hasText:/weak|standard|strong/i}).waitFor();
 await capture(gm,".hol-crafting .hol-approved-tool","native-crafting-completed");
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 await gm.evaluate(async id=>{const {RecoveryPanel}=await import("/systems/heroes-of-legend/applications/recovery.mjs");const app=new RecoveryPanel(game.actors.get(id));__holParity.apps.push(app);await app.render({force:true});},toolActor);
 await gm.locator('.hol-recovery [data-action="operation"][data-kind="heal"]').click();await gm.locator('.hol-recovery [name="amount"]').fill("6");await gm.locator('.hol-recovery [data-action="apply"]').click();
 await gm.waitForFunction(id=>game.actors.get(id).system.health.value===9,toolActor,{timeout:60000});
 assert.deepEqual(await gm.evaluate(id=>{const actor=game.actors.get(id);return{hp:actor.system.health.value,grit:actor.system.grit.spent,wounds:actor.getFlag("heroes-of-legend","survival").wounds,scar:actor.getFlag("heroes-of-legend","wounds")["parity-wound"].scar};},toolActor),{hp:9,grit:0,wounds:1,scar:true});
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 evidence.checks.push("Actual queued Begin → Resolve → Complete crafting uses chosen Reason, checks carried materials once, creates one Food Bundle; Healing records HP3→9 while preserving Grit/wounds/scar; preview stabilization never mutates recorded HP");
 const combatId=await gm.evaluate(async id=>{const combat=await Combat.create({name:"Parity fixture · encounter",active:false});__holParity.combats.push(combat.id);await combat.createEmbeddedDocuments("Combatant",[{name:"Borin Bridgekeeper",actorId:id,flags:{"heroes-of-legend":{side:"players"}}},{name:"Visible opposition",actorId:id,flags:{"heroes-of-legend":{side:"opposition"}}},{name:"Hidden opposition",actorId:id,hidden:true,flags:{"heroes-of-legend":{side:"opposition"}}}]);const {EncounterPanel}=await import("/systems/heroes-of-legend/applications/encounter.mjs");const app=new EncounterPanel(combat);__holParity.apps.push(app);await app.render({force:true});await combat.startCombat();return combat.id;},toolActor);
 await gm.waitForFunction(id=>Boolean(game.combats.get(id).getFlag("heroes-of-legend","encounter")),combatId,{timeout:60000});
 const savedOpening=await gm.evaluate(id=>{const state=game.combats.get(id).getFlag("heroes-of-legend","encounter");return {total:state.opening.total,faces:state.opening.faces};},combatId);
 assert.equal(savedOpening.faces.length,3);await gm.locator('.hol-encounter-panel [data-action="opening"]').click();assert.ok((await gm.locator("#notifications").innerText()).includes(savedOpening.faces.join(" + ")),"Opening details must show saved faces");
 const nativeCombat=await capture(gm,".hol-encounter-panel .hol-approved-tool","native-combat");
 await web.goto(`http://127.0.0.1:${server.address().port}/combat.html`);await web.locator(".combat-roster").waitFor();await capture(web,".tools-content","web-combat",nativeCombat.width);
 await gm.locator('.hol-encounter-panel [data-action="choose"]').first().click();
 await gm.waitForFunction(id=>Boolean(game.combats.get(id).getFlag("heroes-of-legend","encounter").current),combatId,{timeout:60000});
 const beforeBudget=await gm.evaluate(id=>{const state=game.combats.get(id).getFlag("heroes-of-legend","encounter");return structuredClone(state.budgets[state.current]);},combatId);
 await gm.locator('.hol-encounter-panel [data-action="convert"][data-from="main"]').click();
 await gm.waitForFunction(id=>{const state=game.combats.get(id).getFlag("heroes-of-legend","encounter");return state.budgets[state.current].remaining.main===0;},combatId,{timeout:60000});
 await gm.locator('.hol-encounter-panel [data-action="spend"][data-category="maneuver"]').click();
 await gm.waitForFunction(({id,before})=>{const state=game.combats.get(id).getFlag("heroes-of-legend","encounter");return state.budgets[state.current].remaining.maneuver===before;},{id:combatId,before:beforeBudget.remaining.maneuver},{timeout:60000});
 await capture(gm,".hol-encounter-panel .hol-approved-tool","native-combat-budget");
 const activeId=await gm.evaluate(id=>game.combats.get(id).getFlag("heroes-of-legend","encounter").current,combatId);
 await gm.locator('.hol-encounter-panel [data-action="finish"]').click();
 await gm.waitForFunction(({id,activeId})=>{const state=game.combats.get(id).getFlag("heroes-of-legend","encounter");return !state.current&&state.acted.includes(activeId);},{id:combatId,activeId},{timeout:60000});
 evidence.checks.push("Native EncounterPanel uses saved opening, real participant choice, Main→Maneuver conversion, single Maneuver spend and Finish turn; native tracker controls retained");
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 if(process.env.HOL_TEST_SKIP_INLINE_LIFECYCLE!=="1"){
 await gm.evaluate(async id=>{const app=game.actors.get(id).sheet;__holParity.apps.push(app);await app.render({force:true});},toolActor);
 await gm.locator('.hol-character [data-tab="abilities"]').click();
 const readAbility=gm.locator('.hol-character [data-tab-pane="abilities"] [data-action="openAbility"]').first();
 for(let repeat=0;repeat<2;repeat++){
  await readAbility.click();await gm.locator('.hol-character [data-rule-content] .hol-journal-page').waitFor();
  await gm.locator('.hol-character [data-rule-content]').getByRole("button",{name:"Close rules",exact:true}).click();
  assert.equal(await gm.locator('.hol-character [data-rule-content]').count(),1);assert.equal(await gm.locator('.hol-character [data-character-reference]').isHidden(),true);
 }
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 await gm.evaluate(async id=>{const {CreationWizard}=await import("/systems/heroes-of-legend/applications/creation.mjs");const app=new CreationWizard(game.actors.get(id));app.step=1;__holParity.apps.push(app);await app.render({force:true});},toolActor);
 const readAncestry=gm.locator('.hol-creation [data-action="referenceChoice"][data-id="ancestry-human"]').first();
 for(let repeat=0;repeat<2;repeat++){
  await readAncestry.click();await gm.locator('.hol-creation [data-rule-content] .hol-journal-page').waitFor();
  await gm.locator('.hol-creation [data-rule-content]').getByRole("button",{name:"Close rules",exact:true}).click();
  assert.equal(await gm.locator('.hol-creation [data-rule-content]').count(),1);assert.equal(await gm.locator('.hol-creation [data-creation-reference]').isHidden(),true);
 }
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 evidence.checks.push("Actual character ability and creation ancestry Read → Close → Read retain the persistent host and hide/show inline references correctly");
 }else {evidence.skipped??=[];evidence.skipped.push("Inline Read/Close/Read lifecycle awaits installation of the persistent-host fix.");}
 await gm.evaluate(async id=>{const {WoundPanel}=await import("/systems/heroes-of-legend/applications/wounds.mjs");const app=new WoundPanel(game.actors.get(id));__holParity.apps.push(app);await app.render({force:true});},toolActor);
 await capture(gm,".hol-wounds .hol-approved-tool","native-wounds-recorded");
 const priorWounds=await gm.evaluate(id=>game.actors.get(id).getFlag("heroes-of-legend","survival").wounds,toolActor);
 await gm.locator('.hol-wounds [data-action="record"]').click();await gm.getByRole("button",{name:"Record wound",exact:true}).click();
 await gm.waitForFunction(id=>Object.values(game.actors.get(id).getFlag("heroes-of-legend","pendingWounds")??{}).some(event=>event.status==="awaiting-roll"),toolActor,{timeout:60000});
 await gm.locator('.hol-wounds [name="damageType"]').selectOption("physical");await capture(gm,".hol-wounds .hol-approved-tool","native-wounds-roll");await gm.locator('.hol-wounds [data-action="roll"]').click();
 await gm.locator('.hol-wounds [data-action="apply"]').waitFor({timeout:60000});await capture(gm,".hol-wounds .hol-approved-tool","native-wounds-result");
 if(await gm.locator('.hol-wounds [name="fearSource"]').count())await gm.locator('.hol-wounds [name="fearSource"]').fill("Visible fixture opponent");
 await gm.locator('.hol-wounds [data-action="apply"]').click();await gm.waitForFunction(id=>Object.values(game.actors.get(id).getFlag("heroes-of-legend","pendingWounds")??{}).some(event=>event.status==="resolved"),toolActor,{timeout:60000});
 const woundBeforeTreatment=await gm.evaluate(id=>{const actor=game.actors.get(id);return {hp:actor.system.health.value,grit:actor.system.grit.spent,wounds:actor.getFlag("heroes-of-legend","survival").wounds};},toolActor);assert.equal(woundBeforeTreatment.wounds,priorWounds+1);
 const woundRow=gm.locator('.hol-wounds [data-wound-event="parity-wound"]');await woundRow.locator('[name="treatmentProgress"]').selectOption("2");await woundRow.locator('[data-action="treat"]').click();
 await gm.waitForFunction(id=>game.actors.get(id).getFlag("heroes-of-legend","wounds")["parity-wound"].recoveryProgress===2,toolActor,{timeout:60000});
 assert.deepEqual(await gm.evaluate(id=>{const actor=game.actors.get(id);if(!actor.getFlag("heroes-of-legend","wounds")["parity-wound"].scar)throw Error("Treatment removed permanent scar");return {hp:actor.system.health.value,grit:actor.system.grit.spent,wounds:actor.getFlag("heroes-of-legend","survival").wounds};},toolActor),woundBeforeTreatment);
 await capture(gm,".hol-wounds .hol-approved-tool","native-wounds-treated");evidence.checks.push("Actual WoundPanel Record→Roll→Apply increments permanent wound count once; treatment completes original canonical scar while retaining scar, accumulated count, HP and Grit");
 await gm.evaluate(async()=>{for(const app of __holParity.apps)await app.close();__holParity.apps=[];});
 const reader=await gm.evaluate(async()=>{const user=await User.create({name:`Parity reader ${foundry.utils.randomID(5)}`,role:CONST.USER_ROLES.PLAYER});__holParity.users.push(user.id);return{name:user.name,id:user.id};});
 const readerContext=await browser.newContext({viewport:{width:1440,height:1050}});
 try{
  await readerContext.addInitScript(()=>localStorage.setItem("core.noCanvas","true"));const player=await readerContext.newPage();player.on("pageerror",error=>errors.push(error.stack??error.message));await player.goto(url+"/join");await selectTestUser(player,reader.name);await player.locator('button[name="join"]').click();await player.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
  const permissions=await player.evaluate(async()=>{const {ruleIndex,openLocalRule}=await import("/systems/heroes-of-legend/services/journals.mjs");const index=await ruleIndex();if(index.some(record=>record.pack!=="player-rules"))throw Error("DA reference index leaked");const page=await openLocalRule("design/rules/languages.md");const allowed=page.testUserPermission(game.user,"OBSERVER");let denied=false;try{await openLocalRule("design/da-book/manuscript/01-becoming-the-da.md");}catch(error){denied=error.message.includes("unavailable");}const daEntries=game.journal.filter(entry=>entry.getFlag("heroes-of-legend","ruleBook")?.key==="da-rules");const worldDenied=daEntries.every(entry=>!entry.testUserPermission(game.user,"OBSERVER"));const pack=game.packs.get("heroes-of-legend.da-rules");const compendiumDenied=!pack||!pack.testUserPermission(game.user,"OBSERVER");return{playerSourcePages:index.length,allowed,denied,worldDenied,compendiumDenied};});
  assert.deepEqual(permissions,{playerSourcePages:610,allowed:true,denied:true,worldDenied:true,compendiumDenied:true});evidence.permissions=permissions;evidence.checks.push("Player client reads Player book, cannot read native DA world book or DA compendium, and receives no DA index records");
 }finally{await readerContext.close();}
 assert.deepEqual(errors,[]);evidence.checks.push("All book source identities covered; item cards show full rules; zero browser errors");
 console.info(JSON.stringify(evidence));
}finally{
 try{
  await gm.waitForFunction(()=>{const work=game.settings.get("heroes-of-legend","authorityWork"),bound=game.settings.get("heroes-of-legend","creationAuthorityClient"),meta=game.settings.get("heroes-of-legend","authorityMeta"),lease=game.settings.get("heroes-of-legend","authorityLease");return bound===game.socket.id&&meta.clientId===bound&&meta.launch===game.world.lastPlayed&&lease.clientId===bound&&work.clientId===bound&&work.busy===false&&!work.uncertain;},{},{timeout:60000});authorityIdle=true;
  cleanup=await gm.evaluate(async()=>{const state=globalThis.__holParity;if(!state)return{};for(const app of state.apps)await app.close();if(state.messageHook)Hooks.off("createChatMessage",state.messageHook);const messages=state.messages.filter(id=>game.messages.has(id));if(messages.length)await ChatMessage.deleteDocuments(messages);const items=state.items.filter(id=>game.items.has(id)),journals=state.journals.filter(id=>game.journal.has(id));if(items.length)await Item.deleteDocuments(items);if(journals.length)await JournalEntry.deleteDocuments(journals);const combats=(state.combats??[]).filter(id=>game.combats.has(id));if(combats.length)await Combat.deleteDocuments(combats);const actors=state.actors.filter(id=>game.actors.has(id));if(actors.length)await Actor.deleteDocuments(actors);const users=state.users.filter(id=>game.users.has(id));if(users.length)await User.deleteDocuments(users);if(state.items.some(id=>game.items.has(id))||state.journals.some(id=>game.journal.has(id)))throw Error("Parity fixture cleanup incomplete");delete globalThis.__holParity;return{items:items.length,journals:journals.length,actors:actors.length,users:users.length,messages:messages.length,combats:combats.length};});}
 catch(error){cleanup={preserved:true,reason:error.message,documents:await gm.evaluate(()=>{const state=globalThis.__holParity;return state?{items:state.items,journals:state.journals,actors:state.actors,combats:state.combats,users:state.users,messages:state.messages,authorityWork:game.settings.get("heroes-of-legend","authorityWork")}:null;}).catch(()=>null)};throw error;}
 finally{evidence.cleanup=cleanup;await writeFile(resolve(output,"evidence.json"),JSON.stringify(evidence,null,2)+"\n");if(authorityIdle)await browser.close();else console.error("Authority is not confirmed idle; fixture documents and browser retained for reconciliation. See evidence.json.");await new Promise(done=>server.close(done));}
}
