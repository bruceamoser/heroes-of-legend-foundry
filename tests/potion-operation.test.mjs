import assert from "node:assert/strict";
import test from "node:test";
import {
  linkedPotionOperationId,
  normalizePotionGeometry,
  potionGeometryRulingAuthorized,
  potionOperationNextPhase,
  potionSourceMatches,
  validatePotionEncounterReceipts,
  verifyPotionSupplyItems,
} from "../src/rules/potion-operation.mjs";
import {
  continueAction,
  declareAction,
  startTurn,
} from "../src/rules/actions.mjs";

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

test("action turnId comes from the enclosing budget, not the operation receipt", () => {
  const requestId = "potion-budget",
    reactionId = linkedPotionOperationId(requestId, "reaction"),
    giverBefore = startTurn({ turnId: "turn-giver", speed: 5 }),
    recipientBefore = startTurn({ turnId: "turn-recipient", speed: 5 }),
    declared = declareAction(giverBefore, {
      operationId: requestId,
      sourceId: "use-a-healing-potion",
      category: "maneuver",
    }),
    continued = continueAction(
      declared,
      { hp: 8, items: {} },
      { operationId: requestId, capable: true },
    ),
    giverAfter = continued.state,
    recipientAfter = declareAction(recipientBefore, {
      operationId: reactionId,
      sourceId: "use-a-healing-potion",
      category: "reaction",
      ownTurn: false,
    }),
    giverReceipt = giverAfter.operations[requestId],
    reactionReceipt = recipientAfter.operations[reactionId],
    operation = {
      requestId,
      reactionOperationId: reactionId,
      reactionCommitted: false,
      encounterRevisionAfter: 2,
      giver: {
        participantId: "giver",
        turnId: giverBefore.turnId,
        actionReceipt: giverReceipt,
      },
      recipient: {
        participantId: "recipient",
        turnId: recipientBefore.turnId,
        reactionReceipt: null,
      },
      budgets: {
        before: {
          giver: giverBefore,
          recipient: recipientBefore,
        },
        after: {
          giver: giverAfter,
          recipient: recipientAfter,
        },
      },
      plan: {
        giverTurn: giverAfter,
        recipientTurn: recipientAfter,
        costs: { recipient: { reaction: 1 } },
      },
    };
  assert.equal(operation.giver.turnId, giverBefore.turnId);
  assert.equal(Object.hasOwn(giverReceipt, "turnId"), false);
  assert.equal(Object.hasOwn(reactionReceipt, "turnId"), false);
  assert.doesNotThrow(() =>
    validatePotionEncounterReceipts(operation, {
      revision: 2,
      budgets: {
        giver: giverAfter,
        recipient: recipientBefore,
      },
    }),
  );

  const committed = structuredClone(operation);
  committed.reactionCommitted = true;
  committed.encounterRevisionAfter = 3;
  committed.recipient.reactionReceipt = reactionReceipt;
  assert.doesNotThrow(() =>
    validatePotionEncounterReceipts(committed, {
      revision: 3,
      budgets: {
        giver: giverAfter,
        recipient: recipientAfter,
      },
    }),
  );
  assert.throws(
    () =>
      validatePotionEncounterReceipts(
        {
          ...operation,
          giver: {
            ...operation.giver,
            actionReceipt: { ...giverReceipt, turnId: "invented" },
          },
        },
        {
          revision: 2,
          budgets: {
            giver: giverAfter,
            recipient: recipientBefore,
          },
        },
      ),
    /giver action receipt changed/,
  );
});

test("DA geometry rulings are attributed to their actual proposing GM", () => {
  const gm = { id: "gm-1", isGM: true },
    player = { id: "player-1", isGM: false },
    ruling = normalizePotionGeometry(
      {
        mode: "da-ruling",
        reason: "Large-footprint wall corner is adjacent.",
      },
      gm,
    );
  assert.deepEqual(ruling, {
    mode: "da-ruling",
    userId: gm.id,
    reason: "Large-footprint wall corner is adjacent.",
  });
  assert.equal(potionGeometryRulingAuthorized(ruling, gm), true);
  assert.equal(potionGeometryRulingAuthorized(ruling, player), false);
  assert.throws(
    () =>
      normalizePotionGeometry(
        { mode: "da-ruling", reason: "Player ruling" },
        player,
      ),
    /actual DA/,
  );
});

test("potion supply integrity accepts depletion and rejects unrelated Item changes", () => {
  const before = [
    {
      _id: "bottle", type: "equipment", name: "Bottle",
      system: { inventoryDie: 4, quantity: 1 }, flags: {},
    },
    {
      _id: "sword", type: "equipment", name: "Sword",
      system: { quantity: 1 }, flags: {},
    },
  ];
  const after = structuredClone(before);
  after[0].system.inventoryDie = 0;
  assert.doesNotThrow(() => verifyPotionSupplyItems(after, before, "bottle", 0));
  assert.doesNotThrow(() => verifyPotionSupplyItems(before, before, "bottle", 4));
  assert.throws(() => verifyPotionSupplyItems(before, before, "bottle", 0), /unrelated embedded Item/);
  after[1].system.quantity = 2;
  assert.throws(() => verifyPotionSupplyItems(after, before, "bottle", 0), /unrelated embedded Item/);
});
