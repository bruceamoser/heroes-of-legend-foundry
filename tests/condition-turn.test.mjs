import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionTurn } from "../src/rules/condition-turn.mjs";
import {
  survivalState,
  startSurvivalTurn,
  chooseSurvival,
  resolveSurvival,
  enterLastWords,
} from "../src/rules/survival.mjs";
const c = (id, key, rating, persistence = "temporary") => ({
  id,
  key,
  rating,
  persistence,
  source: id,
});
const base = { turnId: "turn1", hp: 12, maxHp: 12, gritAvailable: 2 };
test("condition ticks precede aggregate decay, preserve starred rating, and honor typed resistance", () => {
  const result = conditionTurn({
    ...base,
    contributions: [c("a", "burning", 2), c("b", "burning", 1, "starred")],
    policy: { resistances: [{ type: "fire", value: 2 }] },
  });
  assert.equal(result.hp, 11);
  assert.equal(result.events[0].damage.total, 1);
  assert.deepEqual(
    result.contributions.map((c) => c.rating),
    [1, 1],
  );
});
test("separate ordered ticks create one wound then death marks and wake sleep", () => {
  const result = conditionTurn({
    ...base,
    hp: 2,
    contributions: [
      c("b", "bleeding", 2),
      c("f", "freezing", 2),
      c("s", "asleep", 3),
    ],
    policy: {
      order: ["bleeding", "freezing"],
      resistances: [{ type: "physical", value: 3 }],
    },
  });
  assert.equal(result.hp, 0);
  assert.equal(result.wounds.length, 1);
  assert.equal(result.survival.marks, 1);
  assert.deepEqual(result.wounds[0].types, ["physical"]);
  assert.equal(
    result.contributions.some((c) => c.key === "asleep"),
    false,
  );
});
test("ambiguous multi-tick order and overlapping durations need DA choices", () => {
  assert.throws(
    () =>
      conditionTurn({
        ...base,
        contributions: [c("a", "burning", 1), c("b", "freezing", 1)],
      }),
    /order/,
  );
  assert.throws(
    () =>
      conditionTurn({
        ...base,
        contributions: [c("a", "blinded", 1), c("b", "blinded", 2)],
      }),
    /duration/,
  );
});
test("a due death choice prevents end effects; Last Words deadline follows the tick phase", () => {
  const survival = startSurvivalTurn(survivalState({ ...base, hp: 0 }), 1);
  assert.throws(
    () =>
      conditionTurn({
        ...base,
        hp: 0,
        survival,
        contributions: [c("a", "bleeding", 1)],
      }),
    /Dying/,
  );
  let last = enterLastWords(resolveSurvival(chooseSurvival(survival, "grit")));
  last = startSurvivalTurn(last, 2);
  last = startSurvivalTurn(last, 3);
  const result = conditionTurn({
    ...base,
    hp: 0,
    survival: last,
    contributions: [c("a", "bleeding", 1)],
  });
  assert.equal(result.survival.status, "dead");
  assert.equal(result.wounds.length, 0);
});
