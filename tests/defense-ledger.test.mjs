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

// Current defense execution is covered by explicit-rolls.test.mjs: no GM,
// authority setting, browser lock, encounter, or target mutation is involved.
