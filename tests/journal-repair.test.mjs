import test from 'node:test';
import assert from 'node:assert/strict';
import {isLegacyBlankChapter,repairRuleChapterPages} from '../src/services/journals.mjs';
const blank='<section class="hol-journal-page hol-journal-section"><h1>1 · Welcome</h1><p>Heroes of Legend · Player’s Book</p></section>';
const page=(id,content)=>({id,name:'1 · Welcome',text:{content},getFlag:()=>0});
test('only exact old chapter dividers qualify for repair; user edits and source pages survive',async()=>{
 const a=page('a',blank),b=page('b',blank+'<p>My introduction</p>');
 assert(isLegacyBlankChapter(a,'player-rules'));assert(!isLegacyBlankChapter(b,'player-rules'));assert(!isLegacyBlankChapter({...a,getFlag:()=>undefined},'player-rules'));
 const replacement='<section class="hol-journal-page hol-journal-section"><nav aria-label="Contents"><h2>Contents</h2><ul><li>Welcome</li></ul></nav></section>',writes=[];
 const source={getFlag:()=>({key:'player-rules'}),pages:new Map([['a',page('a',replacement)],['b',page('b',replacement)]])};
 globalThis.game={user:{isGM:true},users:{activeGM:{isSelf:true}},journal:[{getFlag:()=>({key:'player-rules'}),pages:[a,b],updateEmbeddedDocuments:async(type,changes)=>writes.push({type,changes})}],packs:{get:()=>({getDocuments:async()=>[source]})}};
 assert.deepEqual(await repairRuleChapterPages(),{updated:1});assert.equal(writes[0].type,'JournalEntryPage');assert.deepEqual(writes[0].changes,[{_id:'a','text.content':replacement}]);assert.equal(b.text.content,blank+'<p>My introduction</p>');
 game.user.isGM=false;assert.deepEqual(await repairRuleChapterPages(),{updated:0});
});
