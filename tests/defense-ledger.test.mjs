import test from "node:test";
import assert from "node:assert/strict";
import {
  defenseResponses,
  defenseSignature,
} from "../src/services/defense-responses.mjs";
const message = (rows) => ({ getFlag: () => rows });
const row = {
  requestId: "request",
  actorUuid: "Actor.defender",
  attempt: 1,
  status: "rolling",
};
test("invalid defense ledgers cannot silently become empty and permit another roll", () => {
  assert.deepEqual(defenseResponses(message(undefined)), []);
  assert.deepEqual(defenseResponses(message([row])), [row]);
  for (const rows of [
    {},
    [null],
    [{ ...row, status: "unknown" }],
    [{ ...row, attempt: 0 }],
    [row, row],
  ])
    assert.throws(() => defenseResponses(message(rows)), /ledger is invalid/);
});
test("public replay digest binds the complete request without copying private context", async () => {
  const request = {
    actorUuid: "Actor.defender",
    draft: { perception: { "Private fear source": "yes" }, boons: 0 },
  };
  const first = await defenseSignature(request);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, await defenseSignature(structuredClone(request)));
  request.draft.boons = 1;
  assert.notEqual(first, await defenseSignature(request));
  assert(!first.includes("Private fear source"));
});

test("fresh defense submissions receive distinct identities without repeat permission", async (t) => {
  const previous = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
  t.after(() => Object.assign(globalThis, previous));
  const { requestDefense } = await import("../src/services/defense-responses.mjs");
  let sequence = 0;
  globalThis.game = {
    settings: { get: () => "coordinator" },
    messages: { get: () => message([{ ...row, status: "rolling" }]) },
  };
  globalThis.ChatMessage = {
    applyMode: data => data,
    getSpeaker: () => ({}),
    create: async data => ({ id: `fresh-${++sequence}`, ...data }),
  };
  const basis = {
    attackMessageId: "attack", defenderTokenUuid: null,
    attribute: 0, mode: "defense", contributions: [], woundModifiers: [], benefits: [],
  };
  const first = await requestDefense({ uuid: "Actor.defender" }, basis, {});
  const second = await requestDefense({ uuid: "Actor.defender" }, basis, {});
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.flags, second.flags);
  assert.equal(second.flags["heroes-of-legend"].defenseRequest.actorUuid, "Actor.defender");
  assert.equal(Object.hasOwn(second.flags["heroes-of-legend"].defenseRequest.draft, "additionalAttempt"), false);
});
