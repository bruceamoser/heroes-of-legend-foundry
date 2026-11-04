import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compilePack,extractPack} from "@foundryvtt/foundryvtt-cli";
import {stableFoundryId} from "../scripts/content/item-packs.mjs";
import {validateNativeJournals} from "../scripts/validate-native-journals.mjs";
import {openLocalRule,ruleIndex,searchLocalRules,localRulePage,closeInlineRule} from "../src/services/journals.mjs";
const root = new URL("../",import.meta.url);
const index = JSON.parse(await readFile(new URL("static/data/journal-index.json",root)));
const books = await Promise.all(index.books.map(async book => JSON.parse(await readFile(new URL(`content/journals/${book.pack}/${book.id}.json`,root)))));
test("two native audience books retain every pinned source as an identified page, ordered within sections",async()=>{
  await validateNativeJournals(root);
  assert.equal(books.length,2);
  const position = path => index.records.findIndex(record => record.path === path);
  assert.ok(position("design/ancestries/human.md") < position("design/ancestries/wood-elf.md"));
  assert.ok(position("design/classes/protector.md") < position("design/classes/blade.md"));
  assert.ok(position("design/player-book/manuscript/06-playing.md") < position("design/player-book/manuscript/07-adventure.md"));
  assert.equal(index.records.length,1065);
  assert.equal(books.reduce((n,book)=>n+book.pages.filter(page=>page.flags?.["heroes-of-legend"]?.ruleSource).length,0),1065);
  for(const record of index.records){
    assert.equal(record.id,stableFoundryId(record.pack,"native-rule-book"));
    assert.equal(record.pageId,stableFoundryId(({"design/ancestries/wood-elf.md":"design/ancestries/elf.md","design/ancestries/hill-dwarf.md":"design/ancestries/dwarf.md"}[record.path]??record.path),"native-rule-page"));
    const book=books.find(book=>book._id===record.id),page=book.pages.find(page=>page._id===record.pageId);
    assert.equal(page.flags["heroes-of-legend"].ruleSource.path,record.path);
    assert.equal(page.flags["heroes-of-legend"].ruleSource.commit,index.sourceCommit);
    assert.equal(page.title.level,2);
    assert.ok(record.uuid.endsWith(`.${book._id}.JournalEntryPage.${page._id}`));
    assert.ok(!/<script|onerror=|href="https:\/\/github/i.test(page.text.content));
  }
  for(const book of books){
    assert.ok(book.pages.every((page,i)=>i===0||page.sort>book.pages[i-1].sort));
    assert.equal(book.pages[0].title.level,1);
    assert.equal(book.ownership.default,book.flags["heroes-of-legend"].ruleBook.key==="player-rules"?2:0);
  }
});
test("official pack roundtrip retains two books and all embedded section/source pages",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"hol-native-books-"));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const book of index.books){
  await compilePack(fileURLToPath(new URL(`content/journals/${book.pack}/`,root)),join(directory,book.pack));
  await extractPack(join(directory,book.pack),join(directory,`${book.pack}-unpacked`));
  const files=(await readdir(join(directory,`${book.pack}-unpacked`))).filter(name=>name.endsWith(".json"));
  assert.equal(files.length,1);
  const actual=JSON.parse(await readFile(join(directory,`${book.pack}-unpacked`,files[0])));
  assert.deepEqual(actual,books.find(entry=>entry._id===book.id));
 }
});
test("the library opens and searches the installed books with audience permissions",async()=>{
 const previous=Object.fromEntries(["game","fetch","fromUuid","foundry"].map(key=>[key,globalThis[key]]));
 const shared=index.records.find(record=>record.path==="design/rules/languages.md");
 const archivedPage={id:shared.pageId,text:{content:"<p>Old world rule text</p>"},testUserPermission:()=>true};
 const oldBook={pages:[archivedPage],getFlag:()=>({key:"player-rules"}),testUserPermission:()=>true};
 const sources=books.map(book=>({
  key:book.flags["heroes-of-legend"].ruleBook.key,
  testUserPermission:()=>game.user.isGM||book.ownership.default===2,
  pages:book.pages.map(page=>({...structuredClone(page),id:page._id})),
 }));
 let rendered;
 const page=sources[0].pages.find(page=>page.id===shared.pageId);
 page.testUserPermission=()=>true;
 page.parent={sheet:{render:async options=>{rendered=options;}}};
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>index});
  globalThis.game={user:{isGM:true},journal:[oldBook],packs:{get:key=>({getDocuments:async()=>sources.filter(source=>key.endsWith(source.key))})}};
  globalThis.fromUuid=async uuid=>{assert.equal(uuid,shared.uuid);return page;};
  globalThis.foundry={applications:{sheets:{journal:{JournalEntrySheet:{VIEW_MODES:{SINGLE:1}}}}}};
  assert.equal(await localRulePage(shared.path),page);
  assert.equal(await openLocalRule(shared.path),page);
  assert.equal(rendered.pageId,shared.pageId);
  assert.equal(rendered.mode,1);
  assert.equal(archivedPage.text.content,"<p>Old world rule text</p>");
  game.user.isGM=false;
  assert.ok((await ruleIndex()).every(record=>record.pack==="player-rules"));
  await assert.rejects(localRulePage(index.records.find(record=>record.pack==="da-rules").path),/unavailable/);
  assert.ok((await searchLocalRules("languages","design/rules/")).has(shared.path));
  assert.equal((await searchLocalRules("Old world rule text")).size,0);
  page.text.content="<p>page-specific needle</p>";
  assert.deepEqual([...(await searchLocalRules("page-specific needle"))],[shared.path]);
  page.testUserPermission=()=>false;
  await assert.rejects(localRulePage(shared.path),/cannot read/);
 }finally{Object.assign(globalThis,previous);}
});

test("closing inline rules retains reusable sheet and creation hosts for Read → Close → Read",()=>{
 for(const type of ["character","creation"]){let cleared=0,removed=0;const panel={hidden:false};const host={hasAttribute:name=>name==="data-rule-content",replaceChildren:()=>{cleared++;},closest:selector=>{assert.ok(selector.includes(`[data-${type}-reference]`));return panel;},remove:()=>{removed++;}};
  closeInlineRule(host);assert.equal(cleared,1);assert.equal(removed,0);assert.equal(panel.hidden,true);
  panel.hidden=false;closeInlineRule(host);assert.equal(cleared,2);assert.equal(removed,0);
 }
 let removed=0;closeInlineRule({hasAttribute:()=>false,remove:()=>{removed++;}});assert.equal(removed,1);
});

test("shared vision and ancestry procedures stay linked inside the player book with renamed ancestry page IDs retained", () => {
  const player = books.find(book => book.flags["heroes-of-legend"].ruleBook.key === "player-rules");
  for (const path of ["design/rules/vision.md", "design/rules/ancestry-procedures.md"]) {
    const record = index.records.find(record => record.path === path);
    assert.equal(record.pack, "player-rules");
    assert(player.pages.some(page => page.text.content.includes(`@UUID[${record.uuid}]`)));
  }
  for (const [current, old] of [["wood-elf","elf"],["hill-dwarf","dwarf"]]) {
    const record = index.records.find(record => record.path === `design/ancestries/${current}.md`);
    assert.equal(record.pageId, stableFoundryId(`design/ancestries/${old}.md`, "native-rule-page"));
  }
});
