import { test } from "node:test";
import assert from "node:assert/strict";
import {
  damageEvent,
  DAMAGE_TYPE,
  DAMAGE_TYPES,
  DAMAGE_TYPE_LABELS,
  canonicalDamageType,
  healingPlan,
  upfrontHpCost,
} from "../src/rules/damage.mjs";
const c = (type, amount) => ({ type, amount });
const s = (type, value) => ({ type, value });
test("same-type aggregation applies highest weakness once then highest resistance, both capped", () => {
  const result = damageEvent({
    components: [c("fire", 2), c("fire", 1), c("physical", 4)],
    weaknesses: [s("fire", 2), s("fire", 1), s("cold", 3)],
    resistances: [
      s("fire", 1),
      s("fire", 2),
      s("physical", 8),
      s("physical", 2),
    ],
  });
  assert.equal(result.total, 4);
  assert.deepEqual(result.breakdown[0], {
    type: "fire",
    original: 3,
    weakness: 2,
    beforeResistance: 5,
    resistance: 2,
    afterResistance: 3,
  });
  assert.deepEqual(result.woundTypes, ["fire"]);
  assert.equal(
    damageEvent({
      components: [c("fire", 3)],
      weaknesses: [s("fire", 9)],
      resistances: [s("fire", 2)],
    }).total,
    4,
  );
});
test("minimum damage is once per whole event and keeps original wound choices", () => {
  const r = damageEvent({
    components: [c("physical", 2), c("fire", 1)],
    resistances: [s("physical", 3), s("fire", 3)],
  });
  assert.equal(r.total, 1);
  assert.equal(r.subtotal, 0);
  assert(r.minimumApplied);
  assert.deepEqual(r.woundTypes, ["physical", "fire"]);
  assert.deepEqual(r.woundTables, ["physical", "elemental"]);
  assert.equal(
    damageEvent({ components: [c("fire", 0)], weaknesses: [s("fire", 3)] })
      .total,
    0,
  );
  assert.deepEqual(damageEvent({ components: [] }).woundTypes, []);
});
test("post-resistance ties preserve player choice and distinct elemental types", () => {
  const r = damageEvent({
    components: [c("physical", 4), c("fire", 2), c("cold", 2)],
    resistances: [s("physical", 2)],
  });
  assert.deepEqual(r.woundTypes, ["physical", "fire", "cold"]);
  assert.deepEqual(r.woundTables, ["physical", "elemental"]);
});
test("single-type boundary grid agrees with weakness-before-resistance and whole-event minimum", () => {
  for (let amount = 1; amount <= 12; amount++)
    for (let weak = 0; weak <= 5; weak++)
      for (let resist = 0; resist <= 5; resist++)
        assert.equal(
          damageEvent({
            components: [c("life", amount)],
            weaknesses: [s("life", weak)],
            resistances: [s("life", resist)],
          }).total,
          Math.max(1, amount + Math.min(3, weak) - Math.min(3, resist)),
        );
});
test("healing caps to missing HP, uses only highest capped Life resistance and never heals a summon", () => {
  assert.deepEqual(
    healingPlan({ amount: 3, current: 9, max: 12, lifeResistances: [3, 2] }),
    { allowed: true, missing: 3, resistance: 3, restored: 1, after: 10 },
  );
  assert.equal(healingPlan({ amount: 8, current: 11, max: 12 }).restored, 1);
  assert.equal(healingPlan({ amount: 8, current: 12, max: 12 }).restored, 0);
  assert.equal(healingPlan({ amount: 0, current: 1, max: 12 }).restored, 0);
  assert.equal(
    healingPlan({ amount: 8, current: 1, max: 12, recipientKind: "summon" })
      .allowed,
    false,
  );
  assert.equal(
    healingPlan({ amount: 8, current: 1, max: 12, healingHarmed: true }).reason,
    "use-printed-life-attack-outcome",
  );
});
test("HP costs leave payer above zero and invalid arithmetic never silently clamps", () => {
  for (const cost of [1, 3, 7]) {
    assert.equal(upfrontHpCost(cost, cost).allowed, false);
    assert.equal(upfrontHpCost(cost + 1, cost).after, 1);
  }
  for (const amount of [-1, 1.5, NaN, Infinity, "3"])
    assert.throws(() => damageEvent({ components: [c("fire", amount)] }));
  assert.throws(() => damageEvent({ components: [c("mana", 3)] }));
  assert.throws(() => healingPlan({ amount: 3, current: 13, max: 12 }));
  assert.throws(() =>
    damageEvent({
      components: [c("fire", Number.MAX_SAFE_INTEGER)],
      weaknesses: [s("fire", 1)],
    }),
  );
});

test("damage enums have distinct display labels and a strict external normalizer", () => {
  assert.equal(DAMAGE_TYPE.PHYSICAL, "physical");
  assert.equal(DAMAGE_TYPE_LABELS[DAMAGE_TYPE.PHYSICAL], "Physical");
  for (const type of DAMAGE_TYPES)
    assert.equal(canonicalDamageType(DAMAGE_TYPE_LABELS[type]), type);
  assert.equal(canonicalDamageType(" PHYSICAL "), DAMAGE_TYPE.PHYSICAL);
  for (const type of ["venom", "physical or fire", null])
    assert.throws(() => canonicalDamageType(type), /Unknown damage type/);
});
