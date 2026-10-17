import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_DIE_LADDER,
  inventoryCheck,
  refillInventory,
} from "../src/rules/inventory.mjs";
import { inventoryBasis } from "../src/services/inventory.mjs";

test("a retained 1 steps down the complete supply ladder, most faces do not", () => {
  assert.deepEqual(INVENTORY_DIE_LADDER, [20, 12, 10, 8, 6, 4, 0]);
  for (const [index, die] of INVENTORY_DIE_LADDER.slice(0, -1).entries()) {
    const after = INVENTORY_DIE_LADDER[index + 1];
    assert.deepEqual(inventoryCheck({ die, retained: 1 }), {
      before: die,
      retained: 1,
      after,
      exhausted: after === 0,
    });
    if (die > 4)
      assert.deepEqual(inventoryCheck({ die, retained: 2 }), {
        before: die,
        retained: 2,
        after: die,
        exhausted: false,
      });
  }
});

test("inventory checks reject exhausted/unsupported dice and invalid retained faces", () => {
  for (const die of [0, 2, 5, 14, "d4", null])
    assert.throws(() => inventoryCheck({ die, retained: 1 }), /Inventory die/);
  for (const retained of [0, -1, 1.5, NaN, "1", null])
    assert.throws(
      () => inventoryCheck({ die: 4, retained }),
      /Retained inventory face/,
    );
  assert.throws(() => inventoryCheck({ die: 4, retained: 5 }), /exceeds d4/);
});

test("inventory checks accept no action attributes, Boons, Banes or modifiers", () => {
  const base = inventoryCheck({ die: 4, retained: 1 });
  assert.deepEqual(
    inventoryCheck({
      die: 4,
      retained: 1,
      attribute: -5,
      boons: 3,
      banes: 2,
      poisoned: true,
    }),
    base,
  );
});

test("reviewed refill steps enter at d4 from out and stop at the explicit cap", () => {
  assert.deepEqual(refillInventory({ die: 0, steps: 1, maximumDie: 6 }), {
    before: 0,
    steps: 1,
    maximumDie: 6,
    after: 4,
    capReached: false,
  });
  assert.equal(refillInventory({ die: 0, steps: 2, maximumDie: 6 }).after, 6);
  assert.equal(refillInventory({ die: 4, steps: 3, maximumDie: 4 }).after, 4);
  assert.equal(
    refillInventory({ die: 0, steps: 100, maximumDie: 20 }).after,
    20,
  );
  assert.throws(
    () => refillInventory({ die: 6, steps: 1, maximumDie: 4 }),
    /exceeds/,
  );
  assert.throws(
    () => refillInventory({ die: 0, steps: 1, maximumDie: 5 }),
    /Maximum inventory die/,
  );
  for (const steps of [-1, 0.5, Infinity, "1"])
    assert.throws(
      () => refillInventory({ die: 0, steps, maximumDie: 4 }),
      /Refill steps/,
    );
});

test("inventory request snapshots are detached mutable JSON for native validation", () => {
  const source = Object.freeze({
      id: "item-fixture",
      path: "fixtures/item.md",
      sha256: "a".repeat(64),
    }),
    actor = {
      uuid: "Actor.fixture",
      getFlag: (_scope, key) =>
        key === "inventoryRevision"
          ? 4
          : key === "equipmentRevision"
            ? 7
            : null,
    },
    item = {
      actor,
      id: "item1",
      uuid: "Actor.fixture.Item.item1",
      type: "equipment",
      name: "Fixture supply",
      system: {
        catalogId: "fixture",
        inventoryDie: 6,
        quantity: 3,
      },
      getFlag: (_scope, key) => (key === "source" ? source : null),
    },
    basis = inventoryBasis(actor, item);
  assert.deepEqual(basis, {
    inventoryRevision: 4,
    equipmentRevision: 7,
    item: {
      itemId: "item1",
      itemUuid: "Actor.fixture.Item.item1",
      type: "equipment",
      name: "Fixture supply",
      catalogId: "fixture",
      inventoryDie: 6,
      quantity: 3,
      source,
    },
  });
  basis.item.inventoryDie = 4;
  basis.item.source.path = "fixtures/changed.md";
  assert.equal(item.system.inventoryDie, 6);
  assert.equal(source.path, "fixtures/item.md");
  assert.throws(
    () => inventoryBasis(actor, { ...item, actor: { uuid: "Actor.other" } }),
    /Choose an equipment item/,
  );
});
