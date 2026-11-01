import test from "node:test";
import assert from "node:assert/strict";
import {partyPieceReference} from "../src/services/roll-preparation.mjs";
import {ABILITY_DEFINITIONS} from "../src/rules/ability-definitions.mjs";
test("Party Piece requires an owned positive-quantity held instrument with catalog identity",()=>{
 const ability={type:"ability",uuid:"Actor.pc.Item.party",getFlag:(_id,key)=>key==="catalogId" ? "ability-a-party-piece" : ABILITY_DEFINITIONS["ability-a-party-piece"].source};
 const instrument={type:"equipment",system:{quantity:1,held:true,catalogId:"item-musical-instrument"}};
 assert.equal(partyPieceReference({items:[ability]}),null);
 assert.equal(partyPieceReference({items:[ability,instrument]}),ability.uuid);
 for(const system of [{...instrument.system,quantity:0},{...instrument.system,held:false},{...instrument.system,catalogId:"item-ordinary-melee-weapon"}])
   assert.equal(partyPieceReference({items:[ability,{...instrument,system}]}),null);
 assert.equal(partyPieceReference({items:[ability,{...instrument,system:{quantity:1,held:true},getFlag:()=>"item-musical-instrument"}]}),ability.uuid);
});
