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
    user: { isGM: false },
    users: { activeGM: { id: "gm" } },
    world: { lastPlayed: "launch" },
    settings: { get: (_id, key) => key === "authorityMeta" ? {clientId:"coordinator",userId:"gm",launch:"launch",leaseVersion:1} : key === "authorityLease" ? {clientId:"coordinator",expires:Date.now()+60000} : "coordinator" },
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

test("defense reports missing GM or stale automation before posting a waiting message", async (t) => {
  const previous = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
  t.after(() => Object.assign(globalThis, previous));
  const { requestDefense } = await import("../src/services/defense-responses.mjs");
  let writes = 0;
  globalThis.ChatMessage = { create: async () => { writes++; } };
  globalThis.game = { user: {isGM:false}, users: {activeGM:null}, world:{lastPlayed:"now"}, settings:{get:()=>"stale"} };
  await assert.rejects(requestDefense({}, {}, {}), /GM must be connected/);
  game.users.activeGM = {id:"gm"};
  await assert.rejects(requestDefense({}, {}, {}), /automation session is not ready/);
  assert.equal(writes,0);
});

test("unsupported browser capabilities reject a defense without creating a request", async(t)=>{
 const previous={game:globalThis.game,ChatMessage:globalThis.ChatMessage};
 const secureDescriptor=Object.getOwnPropertyDescriptor(globalThis,"isSecureContext");
 t.after(()=>{Object.assign(globalThis,previous);if(secureDescriptor)Object.defineProperty(globalThis,"isSecureContext",secureDescriptor);else delete globalThis.isSecureContext;});
 globalThis.game={user:{isGM:false}};let writes=0;globalThis.ChatMessage={create:async()=>{writes++;}};
 Object.defineProperty(globalThis,"isSecureContext",{configurable:true,value:false});
 const {requestDefense}=await import("../src/services/defense-responses.mjs");
 await assert.rejects(requestDefense({}, {}, {}),/HTTPS or localhost.*secure browser context/);assert.equal(writes,0);
});
