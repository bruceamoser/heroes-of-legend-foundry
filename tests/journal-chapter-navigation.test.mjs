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
test('chapter overview repeats exactly three authored paragraphs, without headings or unrelated content',()=>{
 const paragraphs=['<p>First authored paragraph.</p>','<p>Second <strong>authored</strong> paragraph.</p>','<p>Third authored paragraph.</p>'];
 const introductionHTML='<h1>Duplicate chapter title</h1>'+paragraphs.join('')+'<p>Fourth paragraph stays on its source page.</p><ul><li>Other content</li></ul>';
 const html=chapterContentsHTML('Welcome',[{name:'Welcome to Heroes of Legend',uuid:uuid('player-rules','abcdef1234567891')}],{introductionHTML});
 assert(html.includes(`<div class="hol-journal-introduction">${paragraphs.join('')}</div>`));
 assert.doesNotMatch(html,/Duplicate chapter|Fourth paragraph|Other content|<h1>/);
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
   const navigation=section.text.content.match(/<nav [\s\S]*?<\/nav>/)?.[0] ?? '';
   const links=[...navigation.matchAll(/@UUID\[([^\]]+)\]/g)].map(match=>match[1]);
   assert.deepEqual(links,records.map(record=>record.uuid),`${book.pack}: ${section.name}`);
   assert.match(section.text.content,/<nav /);assert.doesNotMatch(section.text.content,/<h1>/);
   const first=document.pages.find(page=>page._id===records[0].pageId);
   const chapterFirst=/\/manuscript\/(?:\d+-|\d+[a-z]-|appendix-)/.test(records[0].path);
   const expectedIntroduction=chapterFirst?(first.text.content.match(/<p\b[^>]*>[\s\S]*?<\/p>/g)??[]).slice(0,3).join(''):'';
   const actualIntroduction=section.text.content.match(/<div class="hol-journal-introduction">([\s\S]*?)<\/div>/)?.[1]??'';
   assert.equal(actualIntroduction,expectedIntroduction,`${book.pack}: ${section.name} authored introduction`);
   if(book.pack==='player-rules'&&section.flags[ID].ruleSection===0){assert.equal((actualIntroduction.match(/<p\b/g)??[]).length,3);assert.match(actualIntroduction,/Heroes of Legend/);}

   for(const link of links){const pageId=link.split('.').at(-1);assert(document.pages.some(page=>page._id===pageId&&page.flags?.[ID]?.ruleSource),`Missing link destination ${link}`);}
  }
 }
});
