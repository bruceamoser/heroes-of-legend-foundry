import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compilePack,extractPack} from "@foundryvtt/foundryvtt-cli";
import {stableFoundryId} from "../scripts/content/item-packs.mjs";
import {validateNativeJournals} from "../scripts/validate-native-journals.mjs";
import {openLocalRule,importRuleJournals,ruleIndex,searchLocalRules,localRulePage,closeInlineRule,inlineAbilityUsesCatalog} from "../src/services/journals.mjs";
const root = new URL("../",import.meta.url);
const index = JSON.parse(await readFile(new URL("static/data/journal-index.json",root)));
const books = await Promise.all(index.books.map(async book => JSON.parse(await readFile(new URL(`content/journals/${book.pack}/${book.id}.json`,root)))));
test("two native audience books retain every pinned source as an identified page, ordered within sections",async()=>{
  await validateNativeJournals(root);
  assert.equal(books.length,2);
  const position = path => index.records.findIndex(record => record.path === path);
  assert.ok(position("design/ancestries/human.md") < position("design/ancestries/elf.md"));
  assert.ok(position("design/classes/protector.md") < position("design/classes/blade.md"));
  assert.ok(position("design/player-book/manuscript/06-playing.md") < position("design/player-book/manuscript/07-adventure.md"));
  assert.equal(index.records.length,1018);
  assert.equal(books.reduce((n,book)=>n+book.pages.filter(page=>page.flags?.["heroes-of-legend"]?.ruleSource).length,0),1018);
  for(const record of index.records){
    assert.equal(record.id,stableFoundryId(record.pack,"native-rule-book"));
    assert.equal(record.pageId,stableFoundryId(record.path,"native-rule-page"));
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
test("explicit book import preserves old and edited journals, is idempotent, and enforces audience and page searches",async()=>{
 const previous=Object.fromEntries(["game","fetch","fromUuid","JournalEntry","foundry"].map(key=>[key,globalThis[key]]));
 const legacy={id:"legacy",name:"Our edited old rules",getFlag:()=>({path:"design/rules/languages.md"})};
 const journal=[legacy],created=[];let rendered;
 const wrap=data=>({id:data._id,name:data.name,getFlag:(_id,key)=>data.flags?.["heroes-of-legend"]?.[key],testUserPermission:()=>game.user.isGM||data.ownership.default===2,toObject:()=>structuredClone(data),pages:data.pages.map(page=>({...page,id:page._id}))});
 const sources=books.map(wrap);
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>index});
  globalThis.game={user:{isGM:true},journal,packs:{get:key=>({getDocuments:async()=>sources.filter(source=>key.endsWith(source.getFlag("heroes-of-legend","ruleBook").key))})}};
  globalThis.JournalEntry={createDocuments:async(batch,options)=>{assert.equal(options.keepId,true);assert.equal(options.keepEmbeddedIds,true);for(const data of batch){created.push(data);journal.push(wrap(data));}return batch;}};
  assert.deepEqual(await importRuleJournals(),{created:2,retained:0});
  journal[1].name="Our renamed book";
  assert.deepEqual(await importRuleJournals(),{created:0,retained:2});
  assert.equal(legacy.name,"Our edited old rules");assert.equal(journal[1].name,"Our renamed book");
  const shared=index.records.find(record=>record.path==="design/rules/languages.md");
  const page=journal[1].pages.find(page=>page.id===shared.pageId);page.testUserPermission=()=>true;page.parent={sheet:{render:async options=>{rendered=options;}}};
  globalThis.foundry={applications:{sheets:{journal:{JournalEntrySheet:{VIEW_MODES:{SINGLE:1}}}}}};
  assert.equal(await openLocalRule(shared.path),page);assert.equal(rendered.pageId,shared.pageId);assert.equal(rendered.mode,1);
  game.user.isGM=false;
  assert.ok((await ruleIndex()).every(record=>record.pack==="player-rules"));
  await assert.rejects(importRuleJournals(),/Dungeon Architect/);
  await assert.rejects(localRulePage(index.records.find(record=>record.pack==="da-rules").path),/unavailable/);
  const matches=await searchLocalRules("languages","design/rules/");assert.ok(matches.has(shared.path));
  // Search must index each embedded page, not return every page in its book.
  sources[0].pages.find(page=>page.id===shared.pageId).text.content="<p>page-specific needle</p>";
  assert.deepEqual([...(await searchLocalRules("page-specific needle"))],[shared.path]);
  game.user.isGM=true;journal.length=0;
  journal.push({id:books[0]._id,getFlag:()=>undefined});await assert.rejects(importRuleJournals(),/unrelated world journal/);
  journal.length=0;JournalEntry.createDocuments=async batch=>{journal.push(...batch.map(wrap));throw Error("Concurrent import won");};
  assert.deepEqual(await importRuleJournals(),{created:0,retained:2});
 }finally{Object.assign(globalThis,previous);}
});

test("closing inline rules retains reusable sheet and creation hosts for Read → Close → Read",()=>{
 for(const type of ["character","creation"]){let cleared=0,removed=0;const panel={hidden:false};const host={hasAttribute:name=>name==="data-rule-content",replaceChildren:()=>{cleared++;},closest:selector=>{assert.ok(selector.includes(`[data-${type}-reference]`));return panel;},remove:()=>{removed++;}};
  closeInlineRule(host);assert.equal(cleared,1);assert.equal(removed,0);assert.equal(panel.hidden,true);
  panel.hidden=false;closeInlineRule(host);assert.equal(cleared,2);assert.equal(removed,0);
 }
 let removed=0;closeInlineRule({hasAttribute:()=>false,remove:()=>{removed++;}});assert.equal(removed,1);
});

test("inline ability references preserve edited or renamed world book pages instead of replacing them with catalog prose",()=>{
 const canonical={name:"A Bough for the Fallen",text:{content:"<article>Canonical full source</article>"}};
 assert.equal(inlineAbilityUsesCatalog(structuredClone(canonical),canonical),true);
 assert.equal(inlineAbilityUsesCatalog({...canonical,text:{content:canonical.text.content+"<p>Our campaign's changed ruling.</p>"}},canonical),false);
 assert.equal(inlineAbilityUsesCatalog({...canonical,name:"Our renamed ability"},canonical),false);
 assert.equal(inlineAbilityUsesCatalog(canonical,null),false);
});
