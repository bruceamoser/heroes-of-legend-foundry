import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectedWoundRollSources,
  woundContributionPlan,
} from "../src/rules/wound-contributions.mjs";
import { prepareRoll } from "../src/services/roll-preparation.mjs";
import {
  actorWoundContributionPlan,
  nativeWoundEffects,
} from "../src/services/wound-effects.mjs";

function modifier(kind, extra = {}) {
  return {
    kind,
    woundId: "wound-physical-346",
    injury: "Leg: torn knee ligaments",
    source: { path: "design/rules/wounds.md", sha256: "a".repeat(64) },
    sourceCommit: "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
    ...extra,
  };
}

function effect(id, woundEvent, woundModifier, active = true) {
  return {
    id,
    name: `${woundModifier.injury} · ${woundModifier.kind}`,
    active,
    disabled: false,
    flags: {
      "heroes-of-legend": {
        woundEvent,
        woundModifier,
      },
    },
  };
}

const physical = effect(
  "effect-a",
  "wound-event-a",
  modifier("rollModifier", {
    polarity: "bane",
    amount: 1,
    context: "physical",
    printedContext: "physical activities",
    requiresContext: true,
  }),
);
const mental = effect(
  "effect-b",
  "wound-event-b",
  modifier("rollModifier", {
    polarity: "bane",
    amount: 2,
    context: "mental",
    printedContext: "mental activities",
    requiresContext: true,
    injury: "Severely fragmented thought",
  }),
);
const intimidate = effect(
  "effect-c",
  "wound-event-c",
  modifier("rollModifier", {
    polarity: "boon",
    amount: 1,
    context: "intimidate",
    printedContext: "intimidate",
    requiresContext: true,
    injury: "Face: jagged cheek scar",
  }),
);
const persuade = effect(
  "effect-d",
  "wound-event-c",
  modifier("rollModifier", {
    polarity: "bane",
    amount: 1,
    context: "persuade",
    printedContext: "persuade when visible scar influences interaction",
    requiresContext: true,
    injury: "Face: jagged cheek scar",
  }),
);

test("malformed and duplicate native wound contributions fail closed", () => {
  assert.throws(() => woundContributionPlan(null), /array/);
  assert.throws(
    () => woundContributionPlan([effect("x", "event", modifier("unknown"))]),
    /Unknown lasting wound modifier/,
  );
  assert.throws(
    () =>
      woundContributionPlan([
        effect(
          "x",
          "event",
          modifier("rollModifier", {
            polarity: "bane",
            amount: 1,
            context: "physical",
            printedContext: "physical activities",
            requiresContext: false,
          }),
        ),
      ]),
    /require contextual/,
  );
  assert.throws(
    () => woundContributionPlan([physical, { ...physical }]),
    /identities must be unique/,
  );
  assert.throws(
    () => woundContributionPlan([{ ...physical, active: "yes" }]),
    /active state/,
  );
  assert.throws(
    () =>
      woundContributionPlan([
        effect(
          "x",
          "event",
          modifier("rollModifier", {
            polarity: "bane",
            amount: 1,
            context: "physical",
            printedContext: "chosen attribute",
            requiresContext: true,
          }),
        ),
      ]),
    /printed wound context changed/,
  );
});

test("native extraction preserves legacy effect provenance and expiry state", () => {
  const source = {
      path: "design/rules/wounds.md",
      sha256: "b".repeat(64),
    },
    flags = {
      woundEvent: "legacy-event",
      woundModifier: {
        kind: "rollModifier",
        polarity: "bane",
        amount: 1,
        context: "physical",
        printedContext: "physical activities",
        requiresContext: true,
      },
    },
    activeEffect = {
      id: "legacy-effect",
      name: "Arm: strained shoulder · rollModifier",
      active: true,
      disabled: false,
      getFlag: (_scope, key) => structuredClone(flags[key]),
    },
    expiredEffect = {
      ...activeEffect,
      id: "expired-effect",
      active: false,
    },
    actor = {
      effects: [activeEffect, expiredEffect],
      getFlag: (_scope, key) =>
        key === "wounds"
          ? {
              "legacy-event": {
                id: "wound-physical-223",
                injury: "Arm: strained shoulder",
                source,
              },
            }
          : null,
    },
    extracted = nativeWoundEffects(actor),
    plan = actorWoundContributionPlan(actor);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[1].active, false);
  assert.equal(plan.rollModifiers.length, 1);
  assert.equal(plan.rollModifiers[0].injury, "Arm: strained shoulder");
  assert.equal(plan.rollModifiers[0].woundId, "wound-physical-223");
  assert.deepEqual(plan.rollModifiers[0].source, source);
});

test("disabled effects stop contributing while separate wounds retain separate sources", () => {
  const disabled = {
      ...effect(
        "effect-e",
        "wound-event-e",
        modifier("movementPenalty", { amount: 2 }),
        false,
      ),
    },
    secondMovement = effect(
      "effect-f",
      "wound-event-f",
      modifier("movementPenalty", { amount: 3 }),
    ),
    secondPhysical = {
      ...physical,
      id: "effect-g",
      flags: structuredClone(physical.flags),
    };
  secondPhysical.flags["heroes-of-legend"].woundEvent = "wound-event-g";
  const plan = woundContributionPlan([
    disabled,
    physical,
    secondPhysical,
    secondMovement,
  ]);
  assert.equal(plan.rollModifiers.length, 2);
  assert.notEqual(plan.rollModifiers[0].label, plan.rollModifiers[1].label);
  assert.notEqual(
    plan.rollModifiers[0].woundEventId,
    plan.rollModifiers[1].woundEventId,
  );
  assert.equal(plan.movement.penalty, 3);
  assert.equal(plan.movement.sources.length, 1);
});

test("physical, mental and social contexts require explicit independent rulings", () => {
  const plan = woundContributionPlan([physical, mental, intimidate, persuade]),
    applicability = Object.fromEntries(
      plan.rollModifiers.map((modifier) => [modifier.effectId, "applies"]),
    ),
    basis = {
      mode: "attribute",
      attribute: 0,
      contributions: [],
      benefits: [],
      incoming: null,
      woundModifiers: plan.rollModifiers,
    };
  assert.deepEqual(
    plan.rollModifiers.map((modifier) => modifier.printedContext),
    [
      "physical activities",
      "mental activities",
      "intimidate",
      "persuade when visible scar influences interaction",
    ],
  );
  assert.throws(
    () => prepareRoll(basis, { woundApplicability: {}, perception: {} }),
    /Choose whether each wound modifier applies/,
  );
  const rolled = prepareRoll(basis, {
    woundApplicability: applicability,
    perception: {},
  });
  assert.equal(rolled.boons, 1);
  assert.equal(rolled.banes, 4);
  assert.equal(new Set(rolled.sources.map((source) => source.label)).size, 4);
  const persuadeOnly = prepareRoll(basis, {
    woundApplicability: {
      ...applicability,
      "effect-c": "does-not-apply",
    },
    perception: {},
  });
  assert.equal(persuadeOnly.boons, 0);
  assert.equal(persuadeOnly.banes, 4);
});

test("death rolls ignore action/social wounds and a changed source set rejects stale choices", () => {
  const plan = woundContributionPlan([physical, intimidate, persuade]),
    oldChoices = Object.fromEntries(
      plan.rollModifiers.map((modifier) => [modifier.effectId, "applies"]),
    ),
    death = prepareRoll(
      {
        mode: "death",
        attribute: 0,
        contributions: [],
        benefits: [],
        incoming: null,
        woundModifiers: plan.rollModifiers,
      },
      { woundApplicability: {}, perception: {} },
    );
  assert.equal(death.boons, 0);
  assert.equal(death.banes, 0);
  const current = woundContributionPlan([
    { ...physical, active: false },
    intimidate,
  ]);
  assert.throws(
    () => selectedWoundRollSources(current.rollModifiers, oldChoices),
    /sources changed/,
  );
});
