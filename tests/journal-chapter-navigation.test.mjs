import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chapterContentsHTML} from '../scripts/content/journal-sections.mjs';
const ID='heroes-of-legend';
const uuid=(book,page)=>`Compendium.heroes-of-legend.${book}.JournalEntry.abcdef1234567890.JournalEntryPage.${page}`;
test('chapter overview lists its exact source pages as native links without repeating its title',()=>{
 const pages=[{name:'Welcome to Heroes of Legend',uuid:uuid('player-rules','abcdef1234567891')},{name:'Equipment & Recipes',uuid:uuid('player-rules','abcdef1234567892')}];
 const html=chapterContentsHTML('1 · Welcome',pages);
 assert.match(html,/<h2>Contents<\/h2>/);assert.equal((html.match(/@UUID\[/g)??[]).length,2);
 for(const page of pages)assert(html.includes(`@UUID[${page.uuid}]`));
 assert.match(html,/Equipment &amp; Recipes/);assert.doesNotMatch(html,/<h1>|<p>Heroes of Legend/);
 assert.throws(()=>chapterContentsHTML('Empty',[]),/needs source pages/);
 assert.throws(()=>chapterContentsHTML('External',[{name:'Unknown',uuid:'https://example.com'}]),/native rules page/);
});
test('every generated rules section is a nonempty contents page linking every source page in that section',async()=>{
 const index=JSON.parse(await readFile(new URL('../static/data/journal-index.json',import.meta.url)));
 for(const book of index.books){
  const document=JSON.parse(await readFile(new URL(`../content/journals/${book.pack}/${book.id}.json`,import.meta.url)));
  const sections=document.pages.filter(page=>page.flags?.[ID]?.ruleSection!==undefined);
  assert.equal(sections.length,book.sectionPages);
  for(const section of sections){
   const records=index.records.filter(record=>record.pack===book.pack&&record.sectionOrder===section.flags[ID].ruleSection);
   assert(records.length,section.name);
   const links=[...section.text.content.matchAll(/@UUID\[([^\]]+)\]/g)].map(match=>match[1]);
   assert.deepEqual(links,records.map(record=>record.uuid),`${book.pack}: ${section.name}`);
   assert.match(section.text.content,/<nav /);assert.doesNotMatch(section.text.content,/<h1>/);
   for(const link of links){const pageId=link.split('.').at(-1);assert(document.pages.some(page=>page._id===pageId&&page.flags?.[ID]?.ruleSource),`Missing link destination ${link}`);}
  }
 }
});
