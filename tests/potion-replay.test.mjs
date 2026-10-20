import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { inventoryCheck } from "../src/rules/inventory.mjs";
import { resolvePotionRequest as resolveActualRequest } from "../src/services/potions.mjs";

test("settled potion replay uses durable receipts after chat deletion without repeating mutations", async () => {
  const requestId = "potionReplay", request = { combatUuid: "Combat.replay" };
  const operation = {
    schemaVersion: 2, requestId, combatId: "replay", combatUuid: request.combatUuid,
    authorId: "giver-owner", status: "complete", requestSnapshot: request,
    requestSignature: JSON.stringify(request), encounterRevisionAfter: 2,
    reactionCommitted: false, reactionOperationId: `${requestId}_reaction`,
    supplyOperationId: `${requestId}_supply`,
    giver: { actorUuid: "Actor.giver", participantId: "giver", turnId: "turn", actionReceipt: {} },
    recipient: { actorUuid: "Actor.recipient", participantId: "recipient", turnId: "turn", reactionReceipt: null, basis: { hp: 3 } },
    plan: { recipientSurvival: { hp: 9 } },
  };
  const result = inventoryCheck({ die: 4, retained: 1 });
  const recovery = { authorId: "gm", reason: "" };
  const child = {
    operationId: operation.supplyOperationId, parentId: requestId, phase: "settled",
    target: { inventoryDie: 4 }, retainedFace: 1, result, nativeRoll: null, recovery,
  };
  const recipientReceipt = {
    applied: true, kind: "potion-recipient", parentId: requestId,
    request: operation.requestSignature, actorUuid: operation.recipient.actorUuid,
    before: operation.recipient.basis, after: operation.plan.recipientSurvival,
  };
  const supplyReceipt = {
    applied: true, kind: "potion-supply", parentId: requestId,
    operationId: operation.supplyOperationId, actorUuid: operation.giver.actorUuid,
    request: operation.requestSignature, result, nativeRoll: null, recovery,
  };
  const settlement = {
    applied: true, kind: "potion", status: "complete", authorId: operation.authorId,
    request: operation.requestSignature, recipientActorUuid: operation.recipient.actorUuid,
    giverActorUuid: operation.giver.actorUuid,
  };
  const documents = new Map();
  const combat = {
    id: "replay", uuid: request.combatUuid, documentName: "Combat",
    getFlag(_namespace, key) {
      return ({ potionOperations: { [requestId]: operation }, operationReceipts: { [requestId]: settlement }, pendingPotion: null })[key];
    },
  };
  const recipient = { getFlag: (_namespace, key) => key === "potionReceipts" ? { [requestId]: { recipient: recipientReceipt } } : null };
  const giver = { getFlag: (_namespace, key) => ({
    potionReceipts: { [requestId]: { supply: supplyReceipt } },
    potionSupplyOperations: { [child.operationId]: child },
  })[key] };
  documents.set(combat.uuid, combat);
  documents.set(operation.giver.actorUuid, giver);
  documents.set(operation.recipient.actorUuid, recipient);
  let mutations = 0, queued = 0;
  const before = JSON.stringify({ operation, recipientReceipt, supplyReceipt, child, settlement });
  const context = createContext({
    structuredClone,
    game: { messages: new Map(), combats: [combat] },
    fromUuid: async (uuid) => documents.get(uuid),
  });
  const url = new URL("../src/services/potions.mjs", import.meta.url);
  const module = new SourceTextModule(await readFile(url, "utf8"), { context, identifier: url.href });
  await module.link(async (specifier) => {
    // Replace only the coordinator boundary; execute the actual service and rules.
    const exports = specifier === "./authority.mjs" ? {
      ensureAuthorityReady: async () => {},
      enqueueCharacterOperation: async (run, options) => {
        queued++;
        assert.equal(options.targetUuid, combat.uuid);
        return run();
      },
      isCreationAuthority: () => true,
      writeAuthorityDocument: () => { mutations++; throw new Error("Replay attempted a mutation"); },
    } : await import(new URL(specifier, url));
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  for (let replay = 0; replay < 2; replay++) {
    const actual = await module.namespace.resolvePotionRequest(requestId);
    assert.equal(actual.status, "complete");
    assert.equal(actual.replay, true);
  }
  assert.equal(queued, 2);
  assert.equal(mutations, 0);
  assert.equal(JSON.stringify({ operation, recipientReceipt, supplyReceipt, child, settlement }), before);
  recipientReceipt.after = { hp: 10 };
  await assert.rejects(module.namespace.resolvePotionRequest(requestId), /recipient receipt changed/);
});

test("even a no-op potion replay requires the actual selected GM coordinator", async () => {
  const original = globalThis.game;
  globalThis.game = {
    user: { isGM: false },
    settings: { get: () => ({}) },
    messages: new Map(), combats: [],
  };
  try {
    assert.deepEqual(await resolveActualRequest("potionReplay", "Combat.replay"), { status: "not-authority" });
  } finally {
    if (original === undefined) delete globalThis.game;
    else globalThis.game = original;
  }
});
