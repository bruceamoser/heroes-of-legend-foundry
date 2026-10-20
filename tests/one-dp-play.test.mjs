import test from "node:test";
import assert from "node:assert/strict";
import {
  startTurn,
  convertAction,
  movementRemaining,
  spendMovement,
} from "../src/rules/actions.mjs";
import { finishTurn } from "../src/rules/encounter.mjs";
import { ABILITY_DEFINITIONS as definitions } from "../src/rules/ability-definitions.mjs";
import {
  planSimpleAbility,
  contextualAbilitySources,
} from "../src/rules/one-dp-play.mjs";
const disengage = definitions["ability-disengage"];
test("Quick Exit grants one terrain-costed square per turn, never per movement conversion", () => {
  const initial = startTurn({ turnId: "turn1", speed: 4 });
  const used = planSimpleAbility(initial, {
    operationId: "exit1",
    definition: disengage,
    quickExit: true,
  });
  assert.equal(used.disengaged, true);
  assert.equal(used.speed, 4);
  assert.equal(movementRemaining(used), 5);
  assert.deepEqual(
    planSimpleAbility(used, {
      operationId: "exit1",
      definition: disengage,
      quickExit: true,
    }),
    used,
  );
  const again = planSimpleAbility(used, {
    operationId: "exit2",
    definition: disengage,
    quickExit: true,
  });
  assert.equal(movementRemaining(again), 5);
  const maneuver = convertAction(again, {
    operationId: "convertMain",
    from: "main",
    to: "maneuver",
  });
  const converted = convertAction(maneuver, {
    operationId: "convert",
    from: "maneuver",
    to: "movement",
  });
  assert.equal(movementRemaining(converted), 9);
  const moved = spendMovement(converted, { operationId: "terrain", amount: 2 });
  assert.equal(movementRemaining(moved), 7);
  assert.equal(movementRemaining(moved, { grappled: 1 }), 0);
  assert.equal(movementRemaining(moved, { unconscious: true }), 0);
  assert.equal(
    startTurn({ turnId: "turn2", speed: 4 }).bonusMovement,
    undefined,
  );
  const ended = finishTurn({
    current: "hero",
    roster: [{ id: "hero", side: "players" }],
    acted: [],
    startingSide: "players",
    round: 1,
    serial: 1,
    revision: 1,
    history: [],
    budgets: { hero: used },
  });
  assert.equal(ended.budgets.hero.bonusMovement, undefined);
  assert.equal(ended.budgets.hero.disengaged, undefined);
  assert.equal(
    movementRemaining(
      planSimpleAbility(initial, {
        operationId: "plain",
        definition: disengage,
      }),
    ),
    4,
  );
});
test("Catch That and Look Over Here use normal off-turn Reactions without ability-specific play gates", () => {
  for (const key of ["catch-that", "look-over-here"]) {
    const initial = startTurn({ turnId: "turn", speed: 4 });
    const used = planSimpleAbility(initial, {
      operationId: "react",
      definition: definitions[`ability-${key}`],
      ownTurn: false,
    });
    assert.equal(used.remaining.reaction, 0);
    assert.equal(used.remaining.main, 1);
    assert.equal(used.operations.react.status, "complete");
    const repeat = planSimpleAbility(used, {
      operationId: "repeat",
      definition: definitions[`ability-${key}`],
      ownTurn: false,
    });
    assert.equal(repeat.remaining.reaction, 0);
    assert.equal(repeat.operations.repeat.trackedCost.spent, 0);
    assert.deepEqual(
      planSimpleAbility(used, {
        operationId: "react",
        definition: definitions[`ability-${key}`],
        ownTurn: false,
      }),
      used,
    );
  }
});
test("contextual ability Boons default off and apply only to their appropriate rolls", () => {
  const guile = {
    mode: "attribute",
    attributeKey: "guile",
    partyPiece: "Actor.a.Item.party",
  };
  assert.deepEqual(contextualAbilitySources(guile), []);
  assert.equal(
    contextualAbilitySources(guile, { partyPiece: true })[0].amount,
    1,
  );
  assert.deepEqual(
    contextualAbilitySources(
      { ...guile, attributeKey: "brawn" },
      { partyPiece: true },
    ),
    [],
  );
  assert.deepEqual(
    contextualAbilitySources(
      { ...guile, partyPiece: null },
      { partyPiece: true },
    ),
    [],
  );
  assert.deepEqual(
    contextualAbilitySources({ mode: "defense" }, { lookOverHere: true }),
    [],
  );
  const defense = { mode: "defense", incoming: { title: "Attack" } };
  const source = contextualAbilitySources(defense, { lookOverHere: true });
  assert.equal(source.length, 1);
  assert.equal(source[0].amount, 1);
  assert.deepEqual(Object.keys(source[0]).sort(), [
    "amount",
    "automatic",
    "id",
    "kind",
    "label",
    "sourceIds",
  ]);
});

test("Look Over Here records one native ally target while Catch That has no target gate", async (t) => {
  const previous = {
    game: globalThis.game,
    ChatMessage: globalThis.ChatMessage,
  };
  t.after(() => Object.assign(globalThis, previous));
  const { requestAbility } = await import("../src/services/abilities.mjs");
  const actor = { uuid: "Actor.hero", testUserPermission: () => true };
  const combat = { uuid: "Combat.encounter", getFlag: () => ({ revision: 1 }) };
  globalThis.game = {
    user: { id: "owner", targets: new Set() },
    users: [{ id: "owner" }],
    settings: { get: () => "coordinator" },
  };
  game.users ??= [];
  game.users.activeGM = {id:"coordinator-gm",isSelf:false};
  game.world = {lastPlayed:"launch"};
  game.settings = {get:(_id,key)=>key === "authorityMeta" ? {clientId:"coordinator",userId:"coordinator-gm",launch:"launch",leaseVersion:1} : key === "authorityLease" ? {clientId:"coordinator",expires:Date.now()+60000} : "coordinator"};
  globalThis.ChatMessage = { create: async (data) => data };
  const item = (key) => ({
    uuid: `Actor.hero.Item.${key}`,
    actor,
    getFlag: (_, flag) =>
      flag === "catalogId"
        ? `ability-${key}`
        : definitions[`ability-${key}`].source,
  });
  await assert.rejects(
    requestAbility(item("look-over-here"), combat, "hero"),
    /Target one ally/,
  );
  game.user.targets.add({ document: { uuid: "Scene.scene.Token.ally" } });
  const request = await requestAbility(item("look-over-here"), combat, "hero");
  assert.equal(
    request.flags["heroes-of-legend"].abilityRequest.targetTokenUuid,
    "Scene.scene.Token.ally",
  );
  game.user.targets.add({ document: { uuid: "Scene.scene.Token.other" } });
  await assert.rejects(
    requestAbility(item("look-over-here"), combat, "hero"),
    /Target one ally/,
  );
  const catchRequest = await requestAbility(item("catch-that"), combat, "hero");
  assert.equal(
    catchRequest.flags["heroes-of-legend"].abilityRequest.targetTokenUuid,
    undefined,
  );
});
