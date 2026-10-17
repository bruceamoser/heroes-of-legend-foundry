import test from "node:test";
import assert from "node:assert/strict";
import {
  conditionSummary,
  conditionActionRestrictions,
  conditionRollSources,
  conditionEndPlan,
  reduceTemporary,
  removeConditionSource,
} from "../src/rules/conditions.mjs";
const c = (id, key, rating, persistence = "temporary", extra = {}) => ({
  id,
  key,
  rating,
  persistence,
  source: id,
  order: 0,
  ...extra,
});
test("severity combines sources but decay removes one temporary point after full damage", () => {
  const input = [
    c("old", "burning", 2, "temporary", { order: 1 }),
    c("new", "burning", 3, "temporary", { order: 2 }),
    c("wound", "burning", 1, "starred"),
  ];
  const plan = conditionEndPlan(input, {
    turnId: "t1",
    resistances: [{ type: "fire", value: 3 }],
  });
  assert.equal(plan.events[0].rating, 6);
  assert.equal(plan.events[0].damage.total, 3);
  assert.equal(conditionSummary(plan.contributions).burning.rating, 5);
  assert.equal(plan.contributions.find((c) => c.id === "old").rating, 1);
  assert.equal(plan.contributions.find((c) => c.id === "wound").rating, 1);
  assert.deepEqual(
    conditionEndPlan(input, {
      turnId: "t1",
      resistances: [{ type: "fire", value: 3 }],
    }),
    plan,
  );
  assert.equal(conditionSummary(input).burning.rating, 6);
  const reduced = reduceTemporary(input, "burning", 10);
  assert.deepEqual(reduced, [input[2]]);
  assert.equal(removeConditionSource(input, "wound").length, 2);
});
test("condition events stay distinct, apply weakness/resistance correctly, and Bleeding bypasses defenses", () => {
  const plan = conditionEndPlan(
    [
      c("fire", "burning", 1),
      c("ice", "freezing", 2),
      c("blood", "bleeding", 3),
    ],
    {
      turnId: "t2",
      resistances: [
        { type: "fire", value: 3 },
        { type: "cold", value: 3 },
        { type: "physical", value: 3 },
      ],
      weaknesses: [{ type: "fire", value: 2 }],
    },
  );
  assert.deepEqual(
    plan.events.map((e) => e.damage.total),
    [1, 1, 3],
  );
  assert.equal(plan.events[0].damage.breakdown[0].beforeResistance, 3);
  assert(plan.events[2].bypassResistance);
  assert.equal(new Set(plan.events.map((e) => e.id)).size, 3);
  assert(!plan.contributions.some((c) => c.id === "fire"));
});
test("binary and duration-only states do not increase helpless severity and never decay stars or maintained holds", () => {
  const input = [
    c("sleep", "asleep", 3),
    c("para", "paralyzed", 4, "starred"),
    c("blind", "blinded", 2),
    c("grapple", "grappled", 2, "maintained"),
    c("prone1", "prone", 1, "binary"),
    c("prone2", "prone", 1, "binary"),
  ];
  assert.equal(conditionSummary(input).prone.rating, 1);
  assert.equal(conditionSummary(input).paralyzed.severity, 1);
  const plan = conditionEndPlan(input, { turnId: "t1" });
  assert.equal(plan.contributions.find((c) => c.id === "sleep").rating, 2);
  assert.equal(plan.contributions.find((c) => c.id === "para").rating, 4);
  assert.equal(plan.contributions.find((c) => c.id === "grapple").rating, 2);
  assert.equal(conditionActionRestrictions(input).paralyzed, 1);
  const mods = conditionRollSources(input, { mode: "defense" });
  assert.equal(mods.find((m) => m.id === "condition-helpless").amount, 3);
  assert.equal(
    mods.find((m) => m.id === "condition-defender-grappled").amount,
    2,
  );
  assert(!mods.some((m) => m.id.includes("prone")));
});
test("roll sources distinguish perception, actual target grapple, death and inventory dice", () => {
  const input = [
    c("poison", "poisoned", 2),
    c("fearA", "frightened", 1, "temporary", { source: "Actor.A" }),
    c("fearB", "frightened", 3, "starred", { source: "Actor.B" }),
    c("daze", "dazed", 3),
  ];
  const mods = conditionRollSources(input, {
    mode: "attack",
    perceivedSources: ["Actor.A"],
    targetContributions: [c("hold", "grappled", 2, "maintained")],
  });
  assert.deepEqual(
    mods.map((m) => [m.kind, m.amount]),
    [
      ["bane", 2],
      ["bane", 1],
      ["boon", 2],
    ],
  );
  assert.equal(mods[1].sourceIds[0], "fearA");
  assert.deepEqual(conditionRollSources(input, { mode: "inventory" }), []);
  assert.deepEqual(
    conditionRollSources(input, {
      mode: "death",
      perceivedSources: ["Actor.A"],
    }).map((m) => m.id),
    ["condition-poisoned"],
  );
});
test("ambiguous overlapping duration sources require an explicit DA policy before applying an end plan", () => {
  const input = [c("blindA", "blinded", 2), c("blindB", "blinded", 3)];
  const pending = conditionEndPlan(input, { turnId: "t1" });
  assert.equal(pending.ready, false);
  assert.equal(pending.pendingChoices[0].key, "blinded");
  const independent = conditionEndPlan(input, {
    turnId: "t1",
    durationPolicies: { blinded: "independent" },
  });
  assert(independent.ready);
  assert.deepEqual(
    independent.contributions.map((c) => c.rating),
    [1, 2],
  );
  const combined = conditionEndPlan(input, {
    turnId: "t1",
    durationPolicies: { blinded: "combined" },
  });
  assert(combined.ready);
  assert.deepEqual(
    combined.contributions.map((c) => c.rating),
    [1, 3],
  );
});
test("invalid contribution data cannot silently become a condition or duplicate a source instance", () => {
  assert.throws(() => conditionSummary([c("x", "unknown", 1)]), /Unknown/);
  assert.throws(
    () => conditionSummary([c("x", "burning", 1), c("x", "burning", 1)]),
    /unique/,
  );
  assert.throws(
    () => conditionSummary([c("x", "prone", 2, "binary")]),
    /binary/,
  );
  assert.throws(() => conditionSummary([c("x", "grappled", 1)]), /persistence/);
  assert.throws(() => conditionSummary([c("x", "poisoned", 0)]), /zero/);
  assert.throws(
    () =>
      conditionSummary([
        c("x", "poisoned", Number.MAX_SAFE_INTEGER),
        c("y", "poisoned", 1),
      ]),
    /integer/,
  );
  assert.throws(
    () => conditionSummary([c("x", "burning", 1, "temporary", { source: "" })]),
    /source/,
  );
});

test("explicit source reduction can preserve another source and unknown fear perception is not silently ignored", () => {
  const input = [
    c("a", "frightened", 2, "temporary", { source: "Actor.A" }),
    c("b", "frightened", 3, "temporary", { source: "Actor.B" }),
  ];
  assert.throws(
    () => conditionRollSources(input, { mode: "attribute" }),
    /Confirm/,
  );
  const reduced = reduceTemporary(input, "frightened", 1, ["b"]);
  assert.deepEqual(
    reduced.map((c) => c.rating),
    [2, 2],
  );
  assert.throws(
    () => reduceTemporary(input, "frightened", 1, ["missing"]),
    /existing/,
  );
  const planned = conditionEndPlan(input, {
    turnId: "t1",
    decayPriority: { frightened: ["b"] },
  });
  assert.deepEqual(
    planned.contributions.map((c) => c.rating),
    [2, 2],
  );
});
