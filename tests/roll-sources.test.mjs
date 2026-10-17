import test from "node:test";
import assert from "node:assert/strict";
import { sourceRollPlan } from "../src/rules/roll-sources.mjs";
const source = (id, kind, amount) => ({ id, kind, amount, label: id });
test("source attribution survives cancellation and caps only net dice", () => {
  const sources = [
    source("defend", "boon", 1),
    source("help", "boon", 7),
    source("poison", "bane", 3),
  ];
  const plan = sourceRollPlan(-2, sources);
  assert.equal(plan.boons, 8);
  assert.equal(plan.banes, 3);
  assert.equal(plan.canceled, 3);
  assert.equal(plan.formula, "6d6kh3 + (-2)");
  assert.deepEqual(plan.sources, sources);
  plan.sources[0].amount = 99;
  assert.equal(sources[0].amount, 1);
  assert.equal(
    sourceRollPlan(2, [source("fear", "bane", 7)]).formula,
    "6d6kl3 + (2)",
  );
});
test("malformed, duplicate and overflowing sources cannot become a roll", () => {
  for (const sources of [
    null,
    [source("x", "boon", -1)],
    [source("x", "unknown", 1)],
    [source("x", "bane", 1), source("x", "boon", 1)],
    [{ ...source("x", "boon", 1), label: " " }],
    [source("x", "boon", Number.MAX_SAFE_INTEGER), source("y", "boon", 1)],
  ])
    assert.throws(() => sourceRollPlan(0, sources));
});
