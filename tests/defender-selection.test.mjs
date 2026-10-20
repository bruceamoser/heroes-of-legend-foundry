import test from "node:test";
import assert from "node:assert/strict";
import { selectedDefender } from "../src/services/defender-selection.mjs";
const actor = { id: "hero", uuid: "Actor.hero" };
const token = { uuid: "Scene.s.Token.t", actor };
test("GM Defend uses the selected token, ignoring assigned character", () => {
  assert.deepEqual(selectedDefender({isGM:true,controlled:[{document:token}],character:{id:"other"}}),{actor,tokenUuid:token.uuid});
  assert.throws(()=>selectedDefender({isGM:true,character:actor}),/Select one token/);
  assert.throws(()=>selectedDefender({isGM:true,controlled:[token,token]}),/Select one token/);
  assert.throws(()=>selectedDefender({isGM:true,controlled:[{uuid:"empty"}]}),/has no Actor/);
});
test("player Defend always uses assigned character, ignoring controlled tokens", () => {
  assert.deepEqual(selectedDefender({character:actor,controlled:[{actor:{id:"other"}}],tokens:[token]}),{actor,tokenUuid:token.uuid});
  assert.deepEqual(selectedDefender({character:actor}),{actor,tokenUuid:null});
  assert.deepEqual(selectedDefender({character:actor,tokens:[token,{...token,uuid:"other"}]}),{actor,tokenUuid:null});
  assert.throws(()=>selectedDefender({controlled:[token]}),/No character is assigned/);
});

test("unlinked token with assigned Actor ID cannot redirect player defense",()=>{
 const synthetic={id:actor.id,uuid:"Scene.s.Token.unlinked.Actor.hero"};
 const unlinked={uuid:"Scene.s.Token.unlinked",actor:synthetic};
 assert.deepEqual(selectedDefender({character:actor,tokens:[unlinked],controlled:[unlinked]}),{actor,tokenUuid:null});
 assert.deepEqual(selectedDefender({isGM:true,character:actor,controlled:[unlinked]}),{actor:synthetic,tokenUuid:unlinked.uuid});
});
