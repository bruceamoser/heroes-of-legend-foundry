import test from "node:test";
import assert from "node:assert/strict";
import { activateOwnedAbility } from "../src/services/abilities.mjs";
import { declareNpcMelee } from "../src/services/npc-attacks.mjs";
import { ABILITY_DEFINITIONS } from "../src/rules/ability-definitions.mjs";

test("ability activation refuses a non-owner before consulting encounters or catalogs", async () => {
  globalThis.game = {user:{isGM:false}};
  await assert.rejects(activateOwnedAbility({actor:{isOwner:false}}), /you own/);
});

test("NPC declaration posts immediately without encounter or action tracking", async () => {
  const writes=[];
  const actor={id:"creature",uuid:"Actor.creature",type:"creature",name:"Creature",img:"test.webp",
    system:{threat:{boons:0,banes:1},basicMelee:{weak:5,standard:3,strong:2}},getFlag:()=>null,
    testUserPermission:()=>true,update:async changes=>writes.push(changes)};
  globalThis.game={user:{id:"gm",isGM:true,targets:new Set()}};
  globalThis.ChatMessage={getSpeaker:()=>({}),create:async data=>({id:"declaration",...data})};
  globalThis.foundry={applications:{handlebars:{renderTemplate:async()=>"attack card"}}};
  const message=await declareNpcMelee(actor);
  assert.equal(message.flags["heroes-of-legend"].attackCard.damage.standard,3);
  assert.equal(message.flags["heroes-of-legend"].npcAttackRequest,undefined);
  assert.equal(writes.length,0);
  game.user.isGM=false;
  await assert.rejects(declareNpcMelee(actor),/DA declares/);
});

test("potion entry remains usable regardless of encounter membership", async () => {
  const { potionCombatContext } = await import("../src/services/potions.mjs");
  const actor = { uuid: "Actor.hero" }, participant = { id: "hero", actor };
  const encounter = { current: "other", budgets: { hero: { remaining: { maneuver: 0 } } } };
  const combat = { active: true, combatants: [participant], getFlag: () => encounter };
  globalThis.game = { combats: { contents: [combat] } };
  assert.deepEqual(potionCombatContext({ actor }), { combat:null, combatant:null, encounter:null });
  game.combats.contents.push(combat);
  assert.deepEqual(potionCombatContext({ actor }), {combat:null,combatant:null,encounter:null});
  game.combats.contents = [combat]; delete encounter.budgets.hero;
  assert.deepEqual(potionCombatContext({ actor }), {combat:null,combatant:null,encounter:null});
});
