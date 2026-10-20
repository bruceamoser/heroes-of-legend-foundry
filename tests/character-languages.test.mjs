import test from "node:test";
import assert from "node:assert/strict";
import {editCharacterLanguage} from "../src/rules/character-languages.mjs";
test("manual language choices retain ownership of written and signed permissions without changing creation grants",()=>{
 const state={languages:[{id:"common",name:"Common"}],creation:{languages:{home:"dwarven"}},gritSpent:2};
 const next=editCharacterLanguage(state,{language:{id:"trade-sign",name:"Trade Sign",form:"signed",written:false}});
 assert.deepEqual(next.languages[1].permissions,{understand:true,express:true,speak:false,sign:true,read:false,write:false});
 assert.deepEqual(state.languages,[{id:"common",name:"Common"}]);assert.equal(next.gritSpent,2);assert.deepEqual(next.creation,state.creation);
 assert.equal(editCharacterLanguage(next,{removeId:"common"}).languages.length,1);
 assert.throws(()=>editCharacterLanguage(next,{language:{id:"duplicate",name:"trade sign",form:"spoken",written:true}}),/already/);
});
