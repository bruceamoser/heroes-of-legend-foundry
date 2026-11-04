import {readFile,writeFile,mkdir,readdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve,dirname,join} from "node:path";
import {pathToFileURL} from "node:url";
import {extractPack} from "@foundryvtt/foundryvtt-cli";
import {chromium} from "playwright";
import {parseChoices} from "./content/choices.mjs";
import {auditRuleRendering} from "./audit-rule-rendering.mjs";
import {selectTestUser} from "./helpers/login.mjs";

// Read-only public destination audit. Browser writes are confined to its own
// disposable localStorage. No Actor/Scene/User/ChatMessage is created or saved.
const root=resolve(new URL("../",import.meta.url).pathname),out=resolve(root,"test-results/decision-audit");
const temp=process.env.HOL_PUBLISHED_AUDIT_CACHE??"/tmp/hol-decision-audit-public";
const book=process.env.HOL_BOOK_REPOSITORY??"/home/bmoser/repos/heroes-of-legend";
const pin=process.env.HOL_AUDIT_BOOK_COMMIT??"f3fb98ca03b046335fcc730c1b05689bebf091b4",release=process.env.HOL_AUDIT_RELEASE??"v2.7.1";
const web=process.env.HOL_AUDIT_SITE??"https://bruceamoser.github.io/heroes-of-legend-foundry/";
const hash=data=>createHash("sha256").update(data).digest("hex");
const json=path=>readFile(path,"utf8").then(JSON.parse);
const git=(...args)=>execFileSync("git",["-C",root,...args],{maxBuffer:128*1024*1024});
const source=path=>execFileSync("git",["-C",book,"show",`${pin}:${path}`],{maxBuffer:32*1024*1024});
const tagRead=path=>git("show",`${release}:${path}`);
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).filter(key=>key!=="_key").sort().map(key=>[key,canonical(value[key])]));return value;}
const evidence={startedAt:new Date().toISOString(),bookCommit:pin,release,web,downloads:[],checks:[],failures:[],limitations:[
  "Artifact parity and pinned-source fidelity do not validate Bruce's decisions. The separate decision ledger and PDF audit remain necessary.",
  "Source-lock matches can propagate obsolete copied source prose. Historical character pages and Blow the Horn are inspected separately below.",
  "No complete runtime playtest of every adapter, conditional trait, action timing or manual procedure was performed.",
  "PDF inspection is delegated to the primary audit; this script does not claim PDF conformance."]};
await mkdir(out,{recursive:true});await mkdir(temp,{recursive:true});
async function download(url,path){let response;for(let attempt=0;attempt<3;attempt++){response=await fetch(url,{headers:{"User-Agent":"HOL-published-decision-audit","Cache-Control":"no-cache"}});if(response.ok)break;}if(!response.ok)throw Error(`${response.status} ${url}`);const bytes=Buffer.from(await response.arrayBuffer());await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);evidence.downloads.push({url,resolvedUrl:response.url.split(/[?#]/)[0],bytes:bytes.length,sha256:hash(bytes)});return bytes;}
function check(name,pass,details={}){const entry={name,pass,...details};evidence.checks.push(entry);if(!pass)evidence.failures.push(entry);}
async function files(path){const rows=await readdir(path,{withFileTypes:true});return (await Promise.all(rows.map(row=>row.isDirectory()?files(join(path,row.name)):[join(path,row.name)]))).flat();}

try{
 const latest=JSON.parse(await download("https://api.github.com/repos/bruceamoser/heroes-of-legend-foundry/releases/latest",join(temp,"latest.json")));
 evidence.latest={tag:latest.tag_name,publishedAt:latest.published_at,url:latest.html_url};check("public latest release",latest.tag_name===release);
 for(const name of ["system.json","SHA256SUMS","heroes-of-legend.zip"]){const asset=latest.assets.find(asset=>asset.name===name);const bytes=await download(asset.browser_download_url,join(temp,name));check(`GitHub asset digest ${name}`,!asset.digest||asset.digest===`sha256:${hash(bytes)}`);}
 const latestManifest=await download("https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json",join(temp,"latest-system.json"));
 check("latest manifest matches version-specific manifest",latestManifest.equals(await readFile(join(temp,"system.json"))));
 execFileSync("unzip",["-oq",join(temp,"heroes-of-legend.zip"),"-d",join(temp,"package")]);
 const published=join(temp,"package"),manifest=await json(join(published,"system.json"));evidence.systemVersion=manifest.version;
 const paths=git("ls-tree","-r","--name-only",release,"web","src/rules").toString().trim().split("\n");
 const assets=new Map(paths.filter(path=>/\.(mjs|css|html|json)$/.test(path)).map(path=>[path.startsWith("web/")?path.slice(4):path.replace(/^src\//,""),path]));
 for(const name of ["choices","inventory","wounds","creatures"])assets.set(`data/${name}.json`,`static/data/${name}.json`);
 // Examples/party are derived from fixtures by the published Workshop builder.
 const fixtures=JSON.parse(tagRead("tests/fixtures/reference-heroes.json"));
 const queue=[...assets.entries()];let cursor=0;
 await Promise.all(Array.from({length:8},async()=>{while(cursor<queue.length){const [path,repoPath]=queue[cursor++];const bytes=await download(new URL(path,web).href,join(temp,"workshop",path));check(`Workshop text asset ${path}`,bytes.equals(tagRead(repoPath)),{repoPath});}}));
 for(const [path,expected]of [["data/example.json",fixtures.characters[0].draft],["data/party.json",fixtures.characters.map(character=>({id:character.id,draft:character.draft}))]]){const bytes=await download(new URL(path,web).href,join(temp,"workshop",path));check(`Workshop derived ${path}`,same(JSON.parse(bytes),expected));}
 const nativeText=[];for(const path of (await files(published)).filter(path=>/\.(mjs|css|html|hbs|json)$/.test(path)&&!path.includes("/packs/"))){const relative=path.slice(published.length+1),repoPath=relative.endsWith(".mjs")?`src/${relative}`:`static/${relative}`;try{check(`Foundry text asset ${relative}`,(await readFile(path)).equals(tagRead(repoPath)));nativeText.push(relative);}catch(error){check(`Foundry text asset ${relative}`,false,{error:error.message});}}
 const lock=JSON.parse(tagRead("content/source-lock.json"));check("book source pin",lock.commit===pin);
 const sourceBytes=new Map();for(const record of lock.records){const bytes=source(record.path);sourceBytes.set(record.path,bytes);check(`book source ${record.path}`,hash(bytes)===record.sha256);}
 const choiceData=await json(join(temp,"workshop/data/choices.json")),inventory=await json(join(temp,"workshop/data/inventory.json"));
 const regenerated=parseChoices(lock.records.filter(record=>/^design\/(cards|classes|origins|disciplines|ancestries)\//.test(record.path)).map(record=>({...record,text:sourceBytes.get(record.path).toString()})));
 check("all choice records regenerate from pinned sources",same(choiceData.records,regenerated),{records:choiceData.records.length});
 const refs=await json(join(temp,"workshop/data/references.json")),journals=await json(join(temp,"workshop/data/journals.json"));
 for(const [kind,records]of [["raw reference",Object.entries(refs.records).map(([id,record])=>({id,...record}))],["web journal",journals.records]])for(const record of records)check(`${kind} ${record.id}`,sourceBytes.has(record.source.path)&&hash(record.markdown)===hash(sourceBytes.get(record.source.path)),{path:record.source.path});
 const creatureCatalog=await json(join(temp,"workshop/data/creatures.json")),summonCatalog=await json(join(published,"data/summons.json"));
 const allRecords=[...choiceData.records,...inventory.equipment,...inventory.recipes,...(await json(join(temp,"workshop/data/wounds.json"))).records,...creatureCatalog.creatures,...creatureCatalog.monsterAbilities,...creatureCatalog.summonLinks,...summonCatalog.records];
 for(const record of allRecords){const sourceRecord=record.source;check(`catalog source ${record.id}`,Boolean(sourceRecord&&sourceBytes.has(sourceRecord.path)&&hash(sourceBytes.get(sourceRecord.path))===sourceRecord.sha256));}
 const decoded={};
 for(const pack of manifest.packs){const destination=join(temp,"decoded",pack.name);await extractPack(join(published,pack.path),destination,{clean:true,documentType:pack.type});const docs=[];for(const path of(await files(destination)).filter(path=>path.endsWith(".json"))){const doc=await json(path);if(doc._id)docs.push(doc);}decoded[pack.name]=docs;
  const prefix=["player-rules","da-rules"].includes(pack.name)?`content/journals/${pack.name}`:pack.name==="wounds"?"content/tables/wounds":`content/packs/${pack.name}`;
  const expectedPaths=git("ls-tree","-r","--name-only",release,prefix).toString().trim().split("\n").filter(path=>path.endsWith(".json"));
  const expected=new Map(expectedPaths.map(path=>{const doc=JSON.parse(tagRead(path));return[doc._id,doc];}));
  check(`decoded pack coverage ${pack.name}`,docs.length===expected.size,{actual:docs.length,expected:expected.size});
  for(const doc of docs)check(`decoded pack document ${pack.name}/${doc._id}`,expected.has(doc._id)&&same(doc,expected.get(doc._id)),{name:doc.name});
 }
 const nativePages=decoded["player-rules"].flatMap(book=>book.pages??[]).concat(decoded["da-rules"].flatMap(book=>book.pages??[]));
 for(const page of nativePages.filter(page=>page.flags?.["heroes-of-legend"]?.ruleSource)){const s=page.flags["heroes-of-legend"].ruleSource;check(`native journal source ${s.path}`,sourceBytes.has(s.path)&&s.sha256===hash(sourceBytes.get(s.path)));}
 const definitions=await import(pathToFileURL(join(published,"rules/ability-definitions.mjs")));const rollRules=await import(pathToFileURL(join(published,"rules/ability-roll.mjs")));const timing=await import(pathToFileURL(join(published,"rules/workshop-character.mjs")));
 evidence.abilityCoverage=choiceData.records.filter(record=>record.kind==="ability").map(record=>({id:record.id,name:record.name,declaredAutomation:record.automation,handler:definitions.ABILITY_DEFINITIONS[record.id]?.handler??null,printedRollAttribute:rollRules.printedAbilityRoll(record).attribute,timing:timing.actionTiming(record)}));
 evidence.focusCards={};for(const id of ["ability-keep-pressure","ability-press-and-bind","ability-signature-leader-hold-your-nerve"]){const record=choiceData.records.find(record=>record.id===id);evidence.focusCards[id]={record,nativePack:decoded.abilities.find(doc=>doc.flags?.["heroes-of-legend"]?.catalogId===id),source:sourceBytes.get(record.source.path).toString()};}
 const plain=html=>String(html??"").replace(/<[^>]+>/g," ").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
 evidence.renderedPrefaceOmissions=choiceData.records.flatMap(record=>(record.reference?.rules?.body??[]).filter(block=>block.text&&block.outcomes).map(block=>({id:record.id,name:record.name,source:record.source,text:block.text,
   nativeItemMissing:!plain(decoded.abilities.find(doc=>doc.flags?.["heroes-of-legend"]?.catalogId===record.id)?.system.description).includes(plain(block.text)),
   affectedRenderers:["web/workshop.mjs showReference","web/sheets.mjs item card","web/rules-view.mjs recordMarkup","src/rules/item-construction.mjs rulesBodyHtml"]})));
 evidence.webItemListOmissions=choiceData.records.flatMap(record=>(record.reference?.rules?.body??[]).filter(block=>block.items).map(block=>({id:record.id,name:record.name,source:record.source,items:block.items,
   nativeItemRetainsList:record.kind==="ability"?block.items.every(text=>plain(decoded.abilities.find(doc=>doc.flags?.["heroes-of-legend"]?.catalogId===record.id)?.system.description).includes(plain(text))):null,
   affectedRenderers:record.kind==="ability"?["web/sheets.mjs item card","web/rules-view.mjs recordMarkup"]:["web/rules-view.mjs recordMarkup (generic helper; public ancestry route not established)"]})));
 const {recordMarkup}=await import(pathToFileURL(join(temp,"workshop/rules-view.mjs")));
 for(const row of evidence.renderedPrefaceOmissions){const record=choiceData.records.find(record=>record.id===row.id);
  check(`rendered conformance: native item retains outcome preface ${row.id}`,!row.nativeItemMissing,{category:"rendered-conformance",expectedText:row.text,source:row.source});
  check(`rendered conformance: web recordMarkup retains outcome preface ${row.id}`,plain(recordMarkup(record)).includes(plain(row.text)),{category:"rendered-conformance",expectedText:row.text,source:row.source});
 }
 for(const row of evidence.webItemListOmissions){const record=choiceData.records.find(record=>record.id===row.id);
  check(`rendered conformance: web recordMarkup retains rule list ${row.id}`,row.items.every(text=>plain(recordMarkup(record)).includes(plain(text))),{category:"rendered-conformance",expectedText:row.items,source:row.source});
 }
 await writeFile(join(temp,"selected-source-lock.json"),JSON.stringify(lock));
 const actualWeb=await import(pathToFileURL(join(temp,"workshop/rules-view.mjs")));
 const actualNative=await import(pathToFileURL(join(published,"rules/rule-reference-view.mjs")));
 const fullRendering=await auditRuleRendering({root,book,lockPath:join(temp,"selected-source-lock.json"),catalogPath:join(temp,"workshop/data/choices.json"),nativeDirectory:join(temp,"decoded/abilities"),output:join(out,"published-rule-rendering.json"),renderers:{...actualWeb,...actualNative}});
 evidence.fullRendering=fullRendering.summary;
 check("all authored ability/trait rules survive published rendering",!fullRendering.failures.length,{category:"rendered-conformance",summary:fullRendering.summary});
 evidence.characterReach={nativeRawPages:nativePages.filter(page=>page.flags?.["heroes-of-legend"]?.ruleSource?.path.startsWith("design/characters/")).map(page=>({name:page.name,source:page.flags["heroes-of-legend"].ruleSource,sha256:hash(page.text.content)})),webRawReferences:Object.entries(refs.records).filter(([,record])=>record.source.path.startsWith("design/characters/")).map(([id])=>id),webJournals:journals.records.filter(record=>record.source.path.startsWith("design/characters/")).map(record=>record.id),webExampleHasSourceProse:Boolean(fixtures.characters[0].draft.description),partyCount:fixtures.characters.length};
 evidence.counts={workshopTextAssets:assets.size+2,foundryTextAssets:nativeText.length,lockedSources:lock.records.length,choices:choiceData.records.length,abilityRecords:evidence.abilityCoverage.length,equipment:inventory.equipment.length,recipes:inventory.recipes.length,monsterAbilities:creatureCatalog.monsterAbilities.length,summonLinks:creatureCatalog.summonLinks.length,summons:summonCatalog.records.length,rawReferences:Object.keys(refs.records).length,webJournals:journals.records.length,catalogRecords:allRecords.length,decodedPacks:Object.fromEntries(Object.entries(decoded).map(([name,docs])=>[name,docs.length])),nativeSourcePages:nativePages.filter(page=>page.flags?.["heroes-of-legend"]?.ruleSource).length};

 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on("pageerror",error=>errors.push(error.message));await page.goto(web);await page.getByRole("heading",{name:fixtures.characters[0].draft.name,exact:true}).waitFor();
  const draft=structuredClone(fixtures.characters[0].draft);draft.purchases[1]=[{id:"discipline-medicine",rank:1},{id:"ability-keep-pressure"},{id:"ability-press-and-bind"}];
  await page.evaluate(({draft,pin})=>localStorage.setItem("hol.workshop.v1",JSON.stringify({character:{format:"heroes-of-legend-character",schemaVersion:3,sourceCommit:pin,draft},mode:"sheet",tab:"Main",isExample:false})),{draft,pin});await page.reload();
  evidence.liveUI={};for(const [id,label,group]of [["ability-keep-pressure","Keep Pressure","Reaction"],["ability-press-and-bind","Press and Bind","Maneuver"]]){const button=page.locator(`[data-action="reference"][data-id="${id}"]`).first();await button.waitFor();const groupText=await button.evaluate(element=>element.closest(".action-group")?.innerText??element.closest("section")?.innerText??"");check(`live Workshop ${label} timing group`,groupText.includes(group));await button.click();const dialog=page.locator("#reference");const text=await dialog.innerText();evidence.liveUI[id]={group:groupText,detail:text};await dialog.screenshot({path:join(out,`${id}-live.png`)});await dialog.getByRole("button",{name:"Close",exact:true}).click();}
  await page.screenshot({path:join(out,"medicine-actions-live.png"),fullPage:true});
  await page.evaluate(()=>localStorage.setItem("hol.sheet.item.v1",JSON.stringify({id:"ability-signature-leader-hold-your-nerve",notes:"",conditions:[],collapsed:{}})));await page.goto(new URL("item.html",web).href);await page.getByText("Blow the Horn",{exact:true}).first().waitFor();evidence.liveUI.blowTheHorn=await page.locator("#app").innerText();await page.screenshot({path:join(out,"blow-the-horn-live.png"),fullPage:true});evidence.liveUI.browserErrors=errors;
  evidence.liveUI.omittedRuleBlocks=[];
  for(const id of ["ability-make-something-useful","ability-signature-blade-cut-and-turn","ability-signature-leader-orderly-withdrawal"]){const record=choiceData.records.find(record=>record.id===id);await page.evaluate(id=>localStorage.setItem("hol.sheet.item.v1",JSON.stringify({id,notes:"",conditions:[],collapsed:{}})),id);await page.reload();await page.getByText(record.name,{exact:true}).first().waitFor();evidence.liveUI.omittedRuleBlocks.push({id,name:record.name,text:await page.locator("#app").innerText()});await page.screenshot({path:join(out,`${id}-live.png`),fullPage:true});}
  if(process.env.HOL_AUDIT_NATIVE_URL){const native=await browser.newPage();await native.addInitScript(()=>localStorage.setItem("core.noCanvas","true"));await native.goto(process.env.HOL_AUDIT_NATIVE_URL);await selectTestUser(native,process.env.HOL_TEST_USER??"Gamemaster");await native.locator("button[name=join]").click();await native.waitForFunction(()=>globalThis.game?.ready);evidence.nativeHalfling=await native.evaluate(async ({draft,pin})=>{const {buildPortableActorSource}=await import("/systems/heroes-of-legend/services/portable-actor-import.mjs");const {loadCatalogs}=await import("/systems/heroes-of-legend/services/catalog.mjs");const {getCampaignLanguageConfiguration}=await import("/systems/heroes-of-legend/services/languages.mjs");const data=buildPortableActorSource({format:"heroes-of-legend-character",schemaVersion:3,sourceCommit:pin,draft},await loadCatalogs(),getCampaignLanguageConfiguration());const actor=new Actor(data);return {documentWrites:false,persistedId:actor.id??null,type:actor.type,width:actor.prototypeToken.width,height:actor.prototypeToken.height,system:game.system.version,foundry:game.version,configuredTokenDefault:CONFIG.Token.documentClass.name};},{draft:fixtures.characters.find(character=>character.id==="pip-copperwink").draft,pin});}
 }finally{await browser.close();}
}catch(error){evidence.error=error.stack;}
evidence.finishedAt=new Date().toISOString();await writeFile(join(out,"published-conformance.json"),JSON.stringify(evidence,null,2)+"\n");
await writeFile(join(out,"published-record-checks.json"),JSON.stringify(evidence.checks,null,2)+"\n");
console.log(JSON.stringify({counts:evidence.counts,failures:evidence.failures.length,error:evidence.error,latest:evidence.latest,nativeHalfling:evidence.nativeHalfling},null,2));
if(evidence.error||evidence.failures.length)process.exitCode=1;
