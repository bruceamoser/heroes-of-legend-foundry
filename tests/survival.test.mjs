import { test } from "node:test";
import assert from "node:assert/strict";
import {
  survivalState,
  sufferDamage,
  stabilize,
  receiveHealing,
  safeBreath,
  startSurvivalTurn,
  chooseSurvival,
  resolveSurvival,
  enterLastWords,
  endSurvivalTurn,
} from "../src/rules/survival.mjs";
const alive = () => survivalState({ hp: 12, maxHp: 12, gritAvailable: 2 });
const dying = () => startSurvivalTurn(sufferDamage(alive(), 12).state, 1);
test("one wound on each entry to Dying; repeated damage adds one mark per event", () => {
  let s = alive();
  const original = structuredClone(s);
  assert.equal(sufferDamage(s, 0).wound, false);
  s = sufferDamage(s, 12).state;
  assert.deepEqual(original, alive());
  assert.equal(s.wounds, 1);
  assert.equal(s.marks, 0);
  let hit = sufferDamage(s, 100);
  assert.equal(hit.wound, false);
  assert.equal(hit.state.marks, 1);
  hit = sufferDamage(stabilize(hit.state), 1);
  assert.equal(hit.wound, true);
  assert.equal(hit.state.wounds, 2);
  assert.equal(hit.state.marks, 1);
  s = sufferDamage(sufferDamage(hit.state, 1).state, 1).state;
  assert.equal(s.status, "lastWords");
  assert.equal(s.wounds, 2);
  assert.equal(sufferDamage(s, 999).state.lastWordsEnds, s.lastWordsEnds);
});
test("Grit and death roll are locked before resolution, repeat resolution does not spend again", () => {
  let s = chooseSurvival(dying(), "grit");
  assert.throws(() => chooseSurvival(s, "roll"), /locked/);
  s = resolveSurvival(s);
  assert.equal(s.hp, 12);
  assert.equal(s.gritAvailable, 1);
  assert.equal(s.wounds, 1);
  assert.deepEqual(resolveSurvival(s), s);
  assert.throws(
    () => chooseSurvival({ ...dying(), gritAvailable: 0 }, "grit"),
    /No Grit/,
  );
  assert.throws(
    () => resolveSurvival(dying(), { retained: [6, 6, 6], fortitude: 2 }),
    /Lock/,
  );
  assert.throws(
    () => startSurvivalTurn(chooseSurvival(dying(), "roll"), 2),
    /Resolve/,
  );
});
test("death outcomes use retained naturals and Fortitude with precise consequences", () => {
  const cases = [
    [[1, 1, 1], 2, "dying", 2, 0],
    [[1, 2, 3], 0, "dying", 1, 0],
    [[3, 3, 3], 0, "dying", 0, 0],
    [[5, 5, 5], 0, "stable", 0, 0],
    [[6, 6, 6], -2, "active", 0, 1],
  ];
  for (const [retained, fortitude, status, marks, hp] of cases) {
    const result = resolveSurvival(chooseSurvival(dying(), "roll"), {
      retained,
      fortitude,
    });
    assert.deepEqual(
      { status: result.status, marks: result.marks, hp: result.hp },
      { status, marks, hp },
    );
  }
  const marked = sufferDamage(dying(), 1).state;
  assert.equal(
    resolveSurvival(chooseSurvival(marked, "roll"), {
      retained: [1, 1, 1],
      fortitude: 0,
    }).status,
    "lastWords",
  );
});
test("healing and safe breath preserve wounds and spent Grit; no ordinary Last Words reversal", () => {
  const s = sufferDamage(dying(), 1).state;
  const healed = receiveHealing(s, 2);
  assert.equal(healed.hp, 2);
  assert.equal(healed.marks, 0);
  assert.equal(healed.wounds, 1);
  assert.equal(receiveHealing(s, 0).status, "dying");
  assert.throws(() => safeBreath(s), /Resolve Dying/);
  assert.equal(safeBreath(stabilize(s)).hp, 12);
  const spent = resolveSurvival(chooseSurvival(dying(), "grit"));
  assert.equal(safeBreath(spent).gritAvailable, 1);
  const last = enterLastWords(s);
  for (const f of [
    () => receiveHealing(last, 100),
    () => stabilize(last),
    () => safeBreath(last),
  ])
    assert.throws(f);
});
test("Last Words lasts through the second following own turn, never the entry turn", () => {
  let s = enterLastWords({ ...dying(), ownTurn: 4, due: 4 });
  assert.equal(endSurvivalTurn(s, 4).status, "lastWords");
  s = startSurvivalTurn(s, 5);
  assert.equal(endSurvivalTurn(s, 5).status, "lastWords");
  s = startSurvivalTurn(s, 6);
  s = endSurvivalTurn(s, 6);
  assert.equal(s.status, "dead");
  assert.equal(enterLastWords(s).status, "dead");
  assert.throws(() => endSurvivalTurn(dying(), 1), /Resolve Dying/);
});

test("entering Dying during a turn waits for the next start", () => {
  const entered = sufferDamage(startSurvivalTurn(alive(), 1), 12).state;
  assert.equal(endSurvivalTurn(entered, 1).status, "dying");
  assert.throws(() => chooseSurvival(entered, "grit"), /start of your turn/);
  const due = startSurvivalTurn(entered, 2);
  assert.throws(() => endSurvivalTurn(due, 2), /Resolve Dying/);
  assert.equal(resolveSurvival(chooseSurvival(due, "grit")).hp, 12);
});
