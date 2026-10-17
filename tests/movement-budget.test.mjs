import test from "node:test";
import assert from "node:assert/strict";
import {
  movementBreakdown,
  movementProfile,
} from "../src/rules/movement-budget.mjs";
test("current attributes and all carried Bulk determine speed, excluding one worn ordinary outfit", () => {
  const items = [
    { catalogId: "item-travel-clothes", bulk: 1, quantity: 2, worn: true },
    { catalogId: "pack", bulk: 1, quantity: 1 },
    { catalogId: "gear", bulk: 1, quantity: 12 },
  ];
  assert.deepEqual(
    movementProfile({ speedBase: 6, agility: 1, brawn: 1, items }),
    {
      source: "actor-movement",
      speedBase: 6,
      agility: 1,
      bulk: 14,
      capacity: 13,
      unencumbered: 7,
      encumbrance: 1,
      speedBeforeWounds: 6,
      woundPenalty: 0,
      woundSources: [],
      speed: 6,
    },
  );
  assert.equal(
    movementProfile({ speedBase: 6, agility: -2, brawn: -2, items }).speed,
    0,
  );
  assert.equal(
    movementProfile({ speedBase: 6, agility: 1, brawn: 1, items: [] }).speed,
    7,
  );
});
test("lasting wounds reduce current Speed after encumbrance and floor independently to zero", () => {
  const sources = [
    { effectId: "wound-a", label: "Wound: injured knee · movement", amount: 1 },
    { effectId: "wound-b", label: "Wound: torn knee · movement", amount: 2 },
  ];
  const profile = movementProfile({
    speedBase: 5,
    agility: 0,
    brawn: 0,
    items: [{ bulk: 11, quantity: 1 }],
    woundPenalty: 4,
    woundSources: sources,
  });
  assert.equal(profile.encumbrance, 1);
  assert.equal(profile.speedBeforeWounds, 4);
  assert.equal(profile.woundPenalty, 4);
  assert.equal(profile.speed, 0);
  assert.deepEqual(profile.woundSources, sources);
  assert.match(
    movementBreakdown(profile),
    /encumbrance 1 − wounds 4.*injured knee.*torn knee/,
  );
  assert.throws(
    () =>
      movementProfile({
        speedBase: 6,
        agility: 0,
        brawn: 0,
        woundPenalty: -1,
      }),
    /nonnegative/,
  );
});
test("an explicit DA Speed override remains a reviewable final ruling", () => {
  assert.equal(
    movementBreakdown({
      source: "da-speed-override",
      speed: 4,
      reason: "Printed custom profile",
    }),
    "Speed 4 · DA override: Printed custom profile",
  );
});
test("missing movement identity and malformed equipment do not become a guessed speed", () => {
  assert.throws(() => movementProfile({ agility: 0, brawn: 0 }), /speedBase/);
  assert.throws(
    () =>
      movementProfile({
        speedBase: 6,
        agility: 0,
        brawn: 0,
        items: [{ bulk: 1, quantity: -1 }],
      }),
    /Bulk/,
  );
  assert.throws(
    () =>
      movementProfile({
        speedBase: Number.MAX_SAFE_INTEGER,
        agility: 2,
        brawn: 0,
      }),
    /overflow/,
  );
});
