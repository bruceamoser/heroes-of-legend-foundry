import test from "node:test";
import assert from "node:assert/strict";
import {
  startEncounter,
  chooseParticipant,
  finishTurn,
  availableParticipants,
  changeRoster,
} from "../src/rules/encounter.mjs";
const roster = [
  { id: "a", side: "players" },
  { id: "b", side: "players" },
  { id: "x", side: "opposition" },
];
test("opening 12 threshold, side choice, uneven sides and fixed first side each round", () => {
  assert.equal(startEncounter(roster, [3, 4, 4]).startingSide, "opposition");
  let s = startEncounter(roster, [4, 4, 4]);
  assert.equal(s.startingSide, "players");
  s = chooseParticipant(s, "b");
  assert.throws(() => chooseParticipant(s, "a"), /Finish/);
  s = finishTurn(s);
  assert.equal(s.nextSide, "opposition");
  assert.throws(() => chooseParticipant(s, "b"), /unacted/);
  s = finishTurn(chooseParticipant(s, "x"));
  assert.equal(s.nextSide, "players");
  assert.deepEqual(
    availableParticipants(s).map((p) => p.id),
    ["a"],
  );
  s = finishTurn(chooseParticipant(s, "a"));
  assert.equal(s.round, 2);
  assert.equal(s.nextSide, "players");
  assert.equal(s.serial, 3);
  assert.equal(s.history.length, 6);
  assert.deepEqual(s.acted, []);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});
test("roster changes preserve acted history and require explicit current/next-round decisions", () => {
  let s = finishTurn(chooseParticipant(startEncounter(roster, [4, 4, 4]), "a"));
  s = changeRoster(s, { id: "a", mode: "withdraw" });
  s = changeRoster(s, {
    id: "a",
    side: "players",
    mode: "join-now",
    reason: "Returning",
  });
  assert(s.acted.includes("a"));
  s = changeRoster(s, {
    id: "c",
    side: "players",
    mode: "join-next-round",
    reason: "Arrives next round",
  });
  assert(!availableParticipants(s, "players").some((p) => p.id === "c"));
  s = chooseParticipant(s, "x");
  assert.throws(
    () => changeRoster(s, { id: "x", mode: "withdraw", reason: "Removed" }),
    /Finish/,
  );
  s = finishTurn(s);
  s = finishTurn(chooseParticipant(s, "b"));
  assert.equal(s.round, 2);
  assert(availableParticipants(s).some((p) => p.id === "c"));
});
test("empty-side encounters and withdrawing the final unacted participant do not stall", () => {
  let s = startEncounter([{ id: "a", side: "players" }], [1, 1, 1]);
  assert.equal(s.nextSide, "players");
  s = finishTurn(chooseParticipant(s, "a"));
  assert.equal(s.round, 2);
  s = changeRoster(s, { id: "a", mode: "withdraw", reason: "Encounter ends" });
  assert.equal(s.nextSide, null);
  assert.throws(() => startEncounter(roster, [6, 6, 7]), /d6/);
  assert.throws(
    () => startEncounter([roster[0], roster[0]], [1, 1, 1]),
    /unique/,
  );
});
