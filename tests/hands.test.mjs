import { test } from "node:test";
import assert from "node:assert/strict";
import { handLayout } from "../src/rules/hands.mjs";
test("held stack uses one unit, shield and weapon occupy two hands", () => {
  const items = [
    { id: "sword", hands: 1, held: true, quantity: 10 },
    { id: "shield", hands: 1, held: true },
  ];
  assert.deepEqual(handLayout(items), { capacity: 2, occupied: 2, free: 0 });
  assert.throws(
    () => handLayout([...items, { id: "bow", hands: 2, held: true }]),
    /needs 4 hands/,
  );
  assert.deepEqual(handLayout([{ id: "bow", hands: 2, held: true }]), {
    capacity: 2,
    occupied: 2,
    free: 0,
  });
  assert.equal(handLayout([{ id: "bow", hands: 2, held: false }]).free, 2);
  assert.equal(handLayout([], 0).free, 0);
});
test("malformed layouts are rejected rather than silently repaired", () => {
  for (const items of [
    [{ id: "a", hands: 0, held: true }],
    [{ id: "a", hands: 1, held: 1 }],
    [{ id: "a", hands: 3, held: false }],
    [
      { id: "a", hands: 1, held: true },
      { id: "a", hands: 1, held: true },
    ],
  ])
    assert.throws(() => handLayout(items));
  for (const capacity of [-1, 1.5, NaN])
    assert.throws(() => handLayout([], capacity));
});
