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
  globalThis.ChatMessage = { create: async data => data };
  const message = await declareNpcMelee(actor);
  assert.equal(message.flags["heroes-of-legend"].npcAttackRequest.participantId, "creature");
  assert.equal(state.budgets.creature.remaining.main, 0);
  game.user.isGM = false;
  await assert.rejects(declareNpcMelee(actor), /DA declares/);
});
