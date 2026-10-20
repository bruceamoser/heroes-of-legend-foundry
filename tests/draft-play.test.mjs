import test from "node:test";
import assert from "node:assert/strict";
import {currentHpInput} from "../src/rules/resource-input.mjs";
import {draftHp,draftGrit,draftWound,draftDeath} from "../src/rules/draft-play.mjs";
test("blank or whitespace HP remains unfinished input; explicit zero is accepted",()=>{
  for(const value of [""," ","\t","2.5","-1","11","NaN"])assert.throws(()=>currentHpInput(value,10));
  assert.equal(currentHpInput("0",10),0);assert.equal(currentHpInput(" 5 ",10),5);
});
test("creation HP and Grit operate on the draft, preserve wounds and clear death marks like workshop play",()=>{
  const draft={play:{hp:0,failedDeathRolls:2,gritSpent:1,wounds:[{id:"scar"}],conditions:[{id:"slow"}]}},original=structuredClone(draft);
  const hp=draftHp(draft,12,"5");assert.equal(hp.hp,5);assert.equal(hp.failedDeathRolls,0);assert.equal(hp.lastWords,false);
  const grit=draftGrit(draft,{summary:{gritGranted:2,maximumHp:12}});assert.equal(grit.hp,12);assert.equal(grit.gritSpent,2);assert.deepEqual(grit.wounds,draft.play.wounds);assert.deepEqual(grit.conditions,draft.play.conditions);assert.deepEqual(draft,original);
  assert.throws(()=>draftGrit({play:{gritSpent:2}},{summary:{gritGranted:2,maximumHp:12}}),/No Grit/);
  assert.throws(()=>draftGrit({play:{gritSpent:0,lastWords:true}},{summary:{gritGranted:2,maximumHp:12}}),/Last Words/);
});
test("draft wound results preserve rolled provenance and conditions without native document writes",()=>{
  const draft={play:{hp:7,wounds:[],conditions:[]}},result={wound:{id:"wound-a",catalogId:"wound-123",name:"An injury",roll:{faces:[1,2,3],key:"123"}},effects:[{kind:"condition",key:"slowed",rating:1,persistence:"starred"},{kind:"lastWords"}]};
  const applied=draftWound(draft,result);assert.equal(applied.wounds[0].roll.key,"123");assert.equal(applied.conditions[0].id,"wound-a-0");assert.equal(applied.hp,0);assert.equal(applied.lastWords,true);assert.equal(draft.play.wounds.length,0);
});
test("draft death rolls use shared outcomes and cannot reverse Last Words",()=>{
  const draft={attributes:{fortitude:0},play:{hp:0,failedDeathRolls:1}},preview={summary:{maximumHp:12}};
  const failed=draftDeath(draft,preview,[1,1,1]);assert.equal(failed.play.failedDeathRolls,3);assert.equal(failed.play.lastWords,true);assert.throws(()=>draftGrit({play:failed.play},{summary:{gritGranted:2,maximumHp:12}}),/Last Words/);
  assert.throws(()=>draftGrit({play:{hp:0,failedDeathRolls:3}},{summary:{gritGranted:2,maximumHp:12}}),/Last Words/);
  const terminal=draftDeath({...draft,play:{hp:0,failedDeathRolls:3}},preview,[6,6,6]);assert.equal(terminal.play.hp,0);
  const recovered=draftDeath(draft,preview,[6,6,6]);assert.equal(recovered.play.hp,1);assert.equal(recovered.play.failedDeathRolls,0);
  const last=draftDeath({...draft,play:{hp:0,lastWords:true,failedDeathRolls:3}},preview,[6,6,6]);assert.equal(last.play.hp,0);assert.match(last.outcome,/cannot reverse/);
});
