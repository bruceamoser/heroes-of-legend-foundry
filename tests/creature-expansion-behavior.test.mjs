import test from "node:test";
import assert from "node:assert/strict";
import {
  startTurn,
  declareAction,
  continueAction,
  attackPerspective,
} from "../src/rules/actions.mjs";
import {
  conditionSummary,
  conditionEndPlan,
} from "../src/rules/conditions.mjs";
import { conditionTurn } from "../src/rules/condition-turn.mjs";
import { damageEvent } from "../src/rules/damage.mjs";
import {
  planOrdinaryMovement,
  planStanding,
} from "../src/rules/movement-plan.mjs";

const condition = (id, key, rating) => ({
  id,
  key,
  rating,
  persistence: "temporary",
  source: id,
});

test("specialty reaction and ordinary opportunity draw on the same single budget", () => {
  const turn = startTurn({ turnId: "creature-turn", speed: 6 });
  const used = declareAction(turn, {
    operationId: "cover",
    sourceId: "monster-cover-a-companion",
    category: "reaction",
    ownTurn: false,
  });
  assert.equal(used.remaining.reaction, 0);
  const opportunity = declareAction(used, {
    operationId: "opportunity",
    sourceId: "opportunity-attack",
    category: "reaction",
    ownTurn: false,
  });
  assert.equal(opportunity.operations.opportunity.trackedCost.spent, 0);
  assert.match(
    opportunity.operations.opportunity.audit.exceptions.join(" "),
    /No reaction remains/,
  );
  assert.equal(opportunity.remaining.reaction, 0);
  assert.throws(
    () =>
      declareAction(used, {
        operationId: "chain",
        sourceId: "basic-melee",
        category: "free",
        freeAttack: true,
        triggeredByFreeAttack: true,
      }),
    /cannot trigger another free attack/,
  );
  const dead = continueAction(
    used,
    { hp: 0, items: {} },
    { operationId: "cover", capable: false },
  );
  assert.equal(dead.proceed, false);
  assert.equal(dead.state.operations.cover.status, "interrupted");
  assert.equal(attackPerspective("npc"), "defender");
});

test("a commanded profile has no independent Reaction budget", () => {
  const commanded = startTurn({
    turnId: "controller-turn",
    speed: 6,
    independentReaction: false,
  });
  assert.equal(commanded.remaining.reaction, 0);
  const attempted = declareAction(commanded, {
    operationId: "copied-reaction",
    sourceId: "monster-cover-a-companion",
    category: "reaction",
    ownTurn: false,
  });
  assert.equal(attempted.operations["copied-reaction"].trackedCost.spent, 0);
  assert.match(
    attempted.operations["copied-reaction"].audit.exceptions.join(" "),
    /No reaction remains/,
  );
});

test("rating-two retaliation remains rating one after the attacker's ordinary finish", () => {
  for (const key of ["slowed", "frightened", "deafened"]) {
    const before = [condition(`${key}-retort`, key, 2)];
    const after = conditionEndPlan(before, { turnId: `attacker-${key}` });
    assert.equal(after.ready, true);
    assert.equal(conditionSummary(after.contributions)[key].rating, 1);
  }
  const stacked = [
    condition("ooze-a", "slowed", 2),
    condition("ooze-b", "slowed", 2),
  ];
  assert.equal(conditionSummary(stacked).slowed.rating, 4);
  const after = conditionEndPlan(stacked, { turnId: "stacked-attacker" });
  assert.equal(conditionSummary(after.contributions).slowed.rating, 3);
  assert.deepEqual(
    after.contributions.map((row) => row.rating),
    [1, 2],
  );
});

test("rating-one injury retaliation deals damage before ordinary decay", () => {
  for (const [key, type] of [
    ["burning", "fire"],
    ["freezing", "cold"],
    ["bleeding", "physical"],
  ]) {
    const result = conditionTurn({
      contributions: [condition(`${key}-retort`, key, 1)],
      turnId: `${key}-finish`,
      hp: 8,
      maxHp: 8,
      character: false,
    });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].condition, key);
    assert.equal(result.events[0].damage.total, 1);
    assert.equal(result.events[0].damage.breakdown?.[0].type ?? type, type);
    assert.equal(result.hp, 7);
    assert.deepEqual(result.contributions, []);
  }
});

test("Fall to Pieces uses highest Physical resistance for one mixed event and preserves the minimum", () => {
  const resistances = [
    { type: "physical", value: 2 },
    { type: "physical", value: 3 },
  ];
  const mixed = damageEvent({
    components: [
      { type: "physical", amount: 4 },
      { type: "fire", amount: 2 },
    ],
    resistances,
  });
  assert.deepEqual(
    mixed.breakdown.map((row) => row.afterResistance),
    [1, 2],
  );
  assert.equal(mixed.total, 3);
  const fullyResisted = damageEvent({
    components: [{ type: "physical", amount: 2 }],
    resistances,
  });
  assert.equal(fullyResisted.minimumApplied, true);
  assert.equal(fullyResisted.total, 1);
  assert.deepEqual(fullyResisted.woundTypes, ["physical"]);
});

test("Prone occupancy and difficult terrain retain ordinary movement constraints", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const square = (x, terrain = "normal", occupant = "none") => ({
    x,
    y: 0,
    terrain,
    occupant,
    access: "walk",
    footprintLegal: true,
    supported: true,
    routeLegal: true,
  });
  assert.equal(
    planOrdinaryMovement({
      movement: 2,
      path,
      squares: [square(0), square(1, "difficult")],
    }).spent,
    2,
  );
  assert.throws(
    () =>
      planOrdinaryMovement({
        movement: 2,
        path,
        squares: [square(0), square(1, "normal", "prone")],
      }),
    /prone occupied square cannot be an endpoint/,
  );
  assert.equal(planStanding({ movement: 2 }).spent, 2);
});
