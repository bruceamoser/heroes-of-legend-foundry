import test from "node:test";
import assert from "node:assert/strict";
import { movementProfile } from "../src/rules/movement-budget.mjs";
test("current attributes and all carried Bulk determine speed, excluding one worn ordinary outfit", () => {
  const items = [
    { catalogId: "item-travel-clothes", bulk: 1, quantity: 2, worn: true },
    { catalogId: "pack", bulk: 1, quantity: 1 },
    { catalogId: "gear", bulk: 1, quantity: 12 },
  ];
  assert.deepEqual(
    movementProfile({ speedBase: 6, agility: 1, brawn: 1, items }),
    { bulk: 14, capacity: 13, unencumbered: 7, encumbrance: 1, speed: 6 },
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
