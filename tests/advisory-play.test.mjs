import test from "node:test";
import assert from "node:assert/strict";
import { activateOwnedAbility } from "../src/services/abilities.mjs";
import { declareNpcMelee } from "../src/services/npc-attacks.mjs";
import { ABILITY_DEFINITIONS } from "../src/rules/ability-definitions.mjs";

test("owned reviewed ability entry selects its participant without requiring the selected turn", async () => {
  const actor = { documentName: "Actor", id: "hero", uuid: "Actor.hero", isOwner: true, testUserPermission: user => user.id === "owner" };
  const participant = { documentName: "Combatant", id: "hero", actorId: "hero", actor };
  const state = { current: "other", revision: 5, budgets: { hero: { remaining: { maneuver: 0 } } } };
  const combat = { uuid: "Combat.encounter", combatants: [participant], getFlag: (_, key) => key === "encounter" ? state : null };
  globalThis.game = { user: { id: "owner", isGM: false }, users: [{ id: "owner" }, { id: "gm", isGM: true }], settings: { get: () => "coordinator" }, combats: { contents: [combat] } };
  game.users ??= [];
  game.users.activeGM = {id:"coordinator-gm",isSelf:false};
  game.world = {lastPlayed:"launch"};
  game.settings = {get:(_id,key)=>key === "authorityMeta" ? {clientId:"coordinator",userId:"coordinator-gm",launch:"launch",leaseVersion:1} : key === "authorityLease" ? {clientId:"coordinator",expires:Date.now()+60000} : "coordinator"};
  globalThis.ChatMessage = { create: async data => data };
  const definition = ABILITY_DEFINITIONS["ability-defend"];
  const item = { uuid: "Actor.hero.Item.defend", actor, getFlag: (_, key) => key === "catalogId" ? definition.id : definition.source };
  const message = await activateOwnedAbility(item);
  assert.equal(message.flags["heroes-of-legend"].abilityRequest.participantId, "hero");
  assert.equal(message.flags["heroes-of-legend"].abilityRequest.revision, 5);
  assert.equal(state.budgets.hero.remaining.maneuver, 0);
  actor.isOwner = false;
  await assert.rejects(activateOwnedAbility(item), /you own/);
});

test("DA NPC attack entry uses unique roster identity rather than selected turn", async () => {
  const actor = { uuid: "Actor.creature", type: "creature" };
  const state = { current: "other", revision: 8, budgets: { creature: { remaining: { main: 0 } } } };
  const combat = { uuid: "Combat.encounter", combatants: [{ id: "creature", actor }], getFlag: () => state };
  globalThis.game = { user: { isGM: true, targets: new Set() }, settings: { get: () => "coordinator" }, combats: { contents: [combat] } };
  game.users ??= [];
  game.users.activeGM = {id:"coordinator-gm",isSelf:false};
  game.world = {lastPlayed:"launch"};
  game.settings = {get:(_id,key)=>key === "authorityMeta" ? {clientId:"coordinator",userId:"coordinator-gm",launch:"launch",leaseVersion:1} : key === "authorityLease" ? {clientId:"coordinator",expires:Date.now()+60000} : "coordinator"};
  globalThis.ChatMessage = { create: async data => data };
  const message = await declareNpcMelee(actor);
  assert.equal(message.flags["heroes-of-legend"].npcAttackRequest.participantId, "creature");
  assert.equal(state.budgets.creature.remaining.main, 0);
  game.user.isGM = false;
  await assert.rejects(declareNpcMelee(actor), /DA declares/);
});


test("potion entry retains encounter mode off turn and rejects ambiguous identity", async () => {
  const { potionCombatContext } = await import("../src/services/potions.mjs");
  const actor = { uuid: "Actor.hero" }, participant = { id: "hero", actor };
  const encounter = { current: "other", budgets: { hero: { remaining: { maneuver: 0 } } } };
  const combat = { active: true, combatants: [participant], getFlag: () => encounter };
  globalThis.game = { combats: { contents: [combat] } };
  assert.deepEqual(potionCombatContext({ actor }), { combat, combatant: participant, encounter });
  game.combats.contents.push(combat);
  assert.throws(() => potionCombatContext({ actor }), /unique participant/);
  game.combats.contents = [combat]; delete encounter.budgets.hero;
  assert.throws(() => potionCombatContext({ actor }), /budget is unavailable/);
});
