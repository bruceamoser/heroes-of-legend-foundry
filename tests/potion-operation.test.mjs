import assert from "node:assert/strict";
import test from "node:test";
import {
  linkedPotionOperationId,
  potionOperationNextPhase,
  potionSourceMatches,
} from "../src/rules/potion-operation.mjs";

const requestId = "potionRequest123",
  operation = {
    requestId,
    status: "reserved",
    supplyOperationId: linkedPotionOperationId(requestId, "supply"),
  },
  recipientReceipt = { applied: true, kind: "potion-recipient" },
  supply = (phase) => ({
    operationId: operation.supplyOperationId,
    parentId: requestId,
    phase,
  });

test("linked child identities are deterministic and distinct", () => {
  assert.equal(
    linkedPotionOperationId(requestId, "reaction"),
    "potionRequest123_reaction",
  );
  assert.equal(
    linkedPotionOperationId(requestId, "supply"),
    "potionRequest123_supply",
  );
  assert.throws(
    () => linkedPotionOperationId("bad identity", "supply"),
    /safe nonempty identity/,
  );
  assert.throws(
    () => linkedPotionOperationId(requestId, "other"),
    /Unknown linked/,
  );
});

test("catalog source copies match pinned full provenance by path and hash", () => {
  const pinned = {
    id: "item-lesser-healing-bottle",
    repository: "bruceamoser/heroes-of-legend",
    commit: "9bc9b4f",
    path: "design/equipment/lesser-healing-bottle.md",
    sha256: "a".repeat(64),
  };
  assert.equal(
    potionSourceMatches(
      { path: pinned.path, sha256: pinned.sha256 },
      pinned,
    ),
    true,
  );
  assert.equal(
    potionSourceMatches({ ...pinned, commit: "different" }, pinned),
    false,
  );
  assert.equal(
    potionSourceMatches({ ...pinned, sha256: "b".repeat(64) }, pinned),
    false,
  );
});

test("resume phases come from receipts in cross-document order", () => {
  assert.equal(potionOperationNextPhase({ operation }), "heal-recipient");
  assert.equal(
    potionOperationNextPhase({ operation, recipientReceipt }),
    "reserve-supply",
  );
  assert.equal(
    potionOperationNextPhase({
      operation,
      recipientReceipt,
      supplyOperation: supply("rolling"),
    }),
    "recover-supply",
  );
  assert.equal(
    potionOperationNextPhase({
      operation,
      recipientReceipt,
      supplyOperation: supply("rolled"),
    }),
    "settle-supply",
  );
  assert.equal(
    potionOperationNextPhase({
      operation,
      recipientReceipt,
      supplyOperation: supply("settled"),
    }),
    "settle-operation",
  );
  assert.equal(
    potionOperationNextPhase({
      operation,
      recipientReceipt,
      supplyOperation: supply("waived"),
    }),
    "settle-operation",
  );
  assert.equal(
    potionOperationNextPhase({
      operation,
      settlement: { applied: true, kind: "potion" },
    }),
    "complete",
  );
});

test("reconciliation and interruption stop ordinary continuation", () => {
  assert.equal(
    potionOperationNextPhase({
      operation: { ...operation, status: "needs-reconciliation" },
    }),
    "reconcile",
  );
  assert.equal(
    potionOperationNextPhase({
      operation: { ...operation, status: "interrupted" },
    }),
    "settle-interrupted",
  );
});

test("invalid linked or foreign receipts fail closed", () => {
  assert.throws(
    () =>
      potionOperationNextPhase({
        operation,
        recipientReceipt: { applied: true, kind: "recovery" },
      }),
    /another kind/,
  );
  assert.throws(
    () =>
      potionOperationNextPhase({
        operation,
        recipientReceipt,
        supplyOperation: { ...supply("rolling"), parentId: "someone-else" },
      }),
    /another potion operation/,
  );
  assert.throws(
    () =>
      potionOperationNextPhase({
        operation,
        recipientReceipt,
        supplyOperation: { ...supply("rolling"), operationId: "wrong" },
      }),
    /identity changed/,
  );
  assert.throws(
    () =>
      potionOperationNextPhase({
        operation,
        recipientReceipt,
        supplyOperation: supply("unknown"),
      }),
    /unknown phase/,
  );
});
