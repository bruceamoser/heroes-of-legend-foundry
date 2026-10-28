import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startTurn } from "../src/rules/actions.mjs";
import { enterLastWords, survivalState } from "../src/rules/survival.mjs";
import {
  TREATMENT_CARD_IDS,
  reserveWoundTreatment,
  settleWoundTreatment,
  treatmentCardAdapter,
  woundTreatmentAdapter,
} from "../src/rules/treatment.mjs";

const inventoryCatalog = JSON.parse(
  await readFile(
    new URL("../static/data/inventory.json", import.meta.url),
    "utf8",
  ),
);
const woundCatalog = JSON.parse(
  await readFile(
    new URL("../static/data/wounds.json", import.meta.url),
    "utf8",
  ),
);

const alive = (hp = 10, maxHp = 12) => survivalState({ hp, maxHp });
const atZero = (status = "dying") =>
  survivalState({ hp: 0, maxHp: 12, status, marks: 0 });
const turn = (id) => startTurn({ turnId: id, speed: 6 });
const treatmentState = (
  woundId,
  progress = 0,
  { woundEventId = "wound-event-333", patientId = "Actor.healer" } = {},
) => ({
  schemaVersion: 1,
  woundId,
  woundEventId,
  patientId,
  scarCounted: true,
  progress,
  completed: false,
  attempts: [],
});

function request(overrides = {}) {
  const cardId = overrides.cardId ?? "treat-soft-tissue",
    woundId = overrides.woundId ?? "wound-physical-333",
    woundEventId = overrides.woundEventId ?? "wound-event-333",
    operationId = overrides.operationId ?? "treatment_one",
    healerId = overrides.healerId ?? "Actor.healer",
    target = overrides.target ?? {
      relation: "self",
      actorId: healerId,
      kind: "character",
      willing: true,
      survival: alive(),
    };
  return {
    operationId,
    dayKey: overrides.dayKey ?? "travel-day-1",
    elapsedHours: overrides.elapsedHours ?? 1,
    cardId,
    woundId,
    woundEventId,
    inventoryCatalog,
    woundCatalog,
    treatment: overrides.treatment,
    woundApplicable: overrides.woundApplicable ?? true,
    healer: overrides.healer ?? {
      actorId: healerId,
      learnedAbilityIds: [`ability-${cardId}`],
      survival: alive(),
      ownTurn: true,
      turn: turn(operationId),
      conditions: {},
    },
    target,
  };
}

function settle(reservation, overrides = {}) {
  return settleWoundTreatment({
    reservation,
    currentTreatment: overrides.currentTreatment ?? reservation.treatment,
    attribute: overrides.attribute ?? reservation.card.attribute,
    outcome: overrides.outcome ?? "standard",
  });
}

test("all six pinned cards map to their exact capability and attribute", () => {
  assert.deepEqual(TREATMENT_CARD_IDS, [
    "treat-bone",
    "treat-elemental-injury",
    "treat-life-injury",
    "treat-mental-trauma",
    "treat-radiant-injury",
    "treat-soft-tissue",
  ]);
  const expected = [
    ["treat-bone", "Bone", "knowledge", "wound-physical-235"],
    ["treat-elemental-injury", "Elemental", "knowledge", "wound-elemental-223"],
    ["treat-life-injury", "Life", "reason", "wound-life-223"],
    ["treat-mental-trauma", "Mental", "reason", "wound-mental-235"],
    ["treat-radiant-injury", "Radiant", "reason", "wound-radiant-223"],
    ["treat-soft-tissue", "Soft Tissue", "knowledge", "wound-physical-333"],
  ];
  for (const [
    index,
    [cardId, capability, attribute, woundId],
  ] of expected.entries()) {
    const card = treatmentCardAdapter(cardId, inventoryCatalog);
    assert.equal(card.capability, capability);
    assert.equal(card.attribute, attribute);
    const reservation = reserveWoundTreatment(
      request({
        operationId: `all_six_${index}`,
        dayKey: `day-${index}`,
        cardId,
        woundId,
        woundEventId: `wound-event-${index}`,
      }),
    );
    assert.equal(reservation.wound.capability, capability);
    const result = settle(reservation, { outcome: "standard" });
    assert.equal(result.receipt.progressAdded, 2);
    assert.equal(result.receipt.attribute, attribute);
    assert.equal(
      result.receipt.sources.commit,
      "295e858c1b6fee044a0261bf9f437636efeff2bf",
    );
  }
});

test("card and wound source hashes fail closed", () => {
  const cardDrift = structuredClone(inventoryCatalog);
  cardDrift.acquisitions.find(
    (record) => record.id === "ability-treat-bone",
  ).source.sha256 = "0".repeat(64);
  assert.throws(
    () => treatmentCardAdapter("treat-bone", cardDrift),
    /source drifted/,
  );

  const woundDrift = structuredClone(woundCatalog);
  woundDrift.records.find(
    (record) => record.id === "wound-physical-235",
  ).source.sha256 = "0".repeat(64);
  assert.throws(
    () => woundTreatmentAdapter("wound-physical-235", woundDrift),
    /Wound source drifted/,
  );

  const commitDrift = structuredClone(inventoryCatalog);
  commitDrift.sourceCommit = "f".repeat(40);
  assert.throws(
    () => treatmentCardAdapter("treat-bone", commitDrift),
    /source commit drifted/,
  );
});

test("the card must match the wound capability and be learned", () => {
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          cardId: "treat-bone",
          woundId: "wound-physical-333",
        }),
      ),
    /cannot treat the Soft Tissue wound/,
  );
  const unlearned = request({ operationId: "unlearned-card" });
  unlearned.healer.learnedAbilityIds = ["ability-treat-bone"];
  assert.throws(
    () => reserveWoundTreatment(unlearned),
    /has not learned treat-soft-tissue/,
  );
});

test("a reserved or settled day cannot be reused by a second healer", () => {
  const patientId = "Actor.patient",
    target = {
      relation: "other",
      actorId: patientId,
      kind: "character",
      willing: true,
      survival: alive(),
    },
    first = reserveWoundTreatment(
      request({
        operationId: "healer-one",
        dayKey: "calendar:8",
        target,
      }),
    );
  assert.equal(first.treatment.attempts[0].status, "reserved");
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "healer-two",
          healerId: "actor-second-healer",
          dayKey: "calendar:8",
          treatment: first.treatment,
          target,
        }),
      ),
    /already has an attempt reserved or settled on that campaign day/,
  );
  const settled = settle(first, { outcome: "standard" });
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "healer-three",
          healerId: "Actor.third-healer",
          dayKey: "calendar:8",
          treatment: settled.treatment,
          target,
        }),
      ),
    /already has an attempt reserved or settled on that campaign day/,
  );
});

test("the same patient can treat two distinct injury events on one day", () => {
  const patientId = "Actor.patient-one",
    target = {
      relation: "other",
      actorId: patientId,
      kind: "character",
      willing: true,
      survival: alive(),
    },
    first = reserveWoundTreatment(
      request({
        operationId: "first-injury",
        dayKey: "calendar:8",
        healerId: "Actor.healer-one",
        woundEventId: "damage-message-one",
        target,
        treatment: treatmentState("wound-physical-333", 0, {
          woundEventId: "damage-message-one",
          patientId,
        }),
      }),
    ),
    second = reserveWoundTreatment(
      request({
        operationId: "second-injury",
        dayKey: "calendar:8",
        healerId: "Actor.healer-two",
        woundEventId: "damage-message-two",
        target,
        treatment: treatmentState("wound-physical-333", 0, {
          woundEventId: "damage-message-two",
          patientId,
        }),
      }),
    );

  assert.equal(first.woundId, "wound-physical-333");
  assert.equal(first.woundEventId, "damage-message-one");
  assert.equal(first.patientId, patientId);
  assert.equal(first.treatment.attempts.length, 1);
  assert.equal(second.woundId, "wound-physical-333");
  assert.equal(second.woundEventId, "damage-message-two");
  assert.equal(second.patientId, patientId);
  assert.equal(second.treatment.attempts.length, 1);

  const firstResult = settle(first, { outcome: "weak" }),
    secondResult = settle(second, { outcome: "standard" });
  assert.equal(firstResult.receipt.progressAfter, 1);
  assert.equal(secondResult.receipt.progressAfter, 2);
  assert.equal(firstResult.receipt.woundEventId, "damage-message-one");
  assert.equal(secondResult.receipt.woundEventId, "damage-message-two");
  assert.equal(firstResult.receipt.patientId, patientId);
  assert.equal(secondResult.receipt.patientId, patientId);
});

test("multiple days accumulate progress and completion preserves Bleeding and scar", () => {
  const first = reserveWoundTreatment(
    request({ operationId: "day-one", dayKey: "campaign-day-1" }),
  );
  const firstSettlement = settle(first, { outcome: "standard" });
  assert.equal(firstSettlement.receipt.progressAfter, 2);
  assert.equal(firstSettlement.receipt.completed, false);

  const second = reserveWoundTreatment(
    request({
      operationId: "day-two",
      dayKey: "campaign-day-2",
      treatment: firstSettlement.treatment,
    }),
  );
  const secondSettlement = settle(second, { outcome: "weak" });
  assert.equal(secondSettlement.receipt.progressBefore, 2);
  assert.equal(secondSettlement.receipt.progressAdded, 1);
  assert.equal(secondSettlement.receipt.progressAfter, 3);
  assert.equal(secondSettlement.receipt.completed, true);
  assert.deepEqual(
    secondSettlement.receipt.effectsRemoved.map((effect) => [
      effect.kind,
      effect.context,
    ]),
    [["rollModifier", "physical"]],
  );
  assert.deepEqual(
    secondSettlement.receipt.effectsPreserved.map((effect) => [
      effect.kind,
      effect.key,
      effect.persistence,
    ]),
    [["condition", "bleeding", "temporary"]],
  );
  assert.equal(secondSettlement.treatment.scarCounted, true);
  assert.deepEqual(secondSettlement.receipt.invariants, {
    hpChange: 0,
    scarPreserved: true,
    woundCountPreserved: true,
    lostPartsRestored: false,
    equipmentRestored: false,
    temporaryOrImmediateEffectsEnded: false,
  });
});

test("completion removes both paired social modifiers", () => {
  const reservation = reserveWoundTreatment(
    request({
      operationId: "social-scar",
      cardId: "treat-soft-tissue",
      woundId: "wound-physical-133",
    }),
  );
  const result = settle(reservation, { outcome: "strong" });
  assert.equal(result.receipt.completed, true);
  assert.deepEqual(
    result.receipt.effectsRemoved.map((effect) => [
      effect.polarity,
      effect.context,
    ]),
    [
      ["boon", "intimidate"],
      ["bane", "persuade"],
    ],
  );
  assert.deepEqual(result.receipt.effectsPreserved, []);
});

test("a starred sensory cure removes both sensory conditions but keeps temporary Dazed", () => {
  const woundId = "wound-mental-566";
  const reservation = reserveWoundTreatment(
    request({
      operationId: "sensory-treatment",
      cardId: "treat-mental-trauma",
      woundId,
      treatment: treatmentState(woundId, 7),
    }),
  );
  const result = settle(reservation, { outcome: "strong" });
  assert.equal(result.receipt.completed, true);
  assert.deepEqual(
    result.receipt.effectsRemoved.map((effect) => effect.key),
    ["blinded", "deafened"],
  );
  assert.deepEqual(
    result.receipt.effectsPreserved.map((effect) => [
      effect.key,
      effect.persistence,
    ]),
    [["dazed", "temporary"]],
  );
});

test("missing, cosmetic and no-RV wounds cannot reserve ordinary treatment", () => {
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({ operationId: "missing", woundId: "wound-physical-999" }),
      ),
    /Unknown wound record/,
  );
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({ operationId: "cosmetic", woundId: "wound-physical-111" }),
      ),
    /no ordinary treatment track/,
  );
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "lost-sight",
          cardId: "treat-radiant-injury",
          woundId: "wound-radiant-566",
        }),
      ),
    /no ordinary treatment track/,
  );
});

test("elapsed time above one hour grants one printed-hour attempt", () => {
  for (const elapsedHours of [0, 0.5, NaN, Infinity, -Infinity, "1"])
    assert.throws(
      () =>
        reserveWoundTreatment(
          request({
            operationId: `bad-time-${String(elapsedHours).replace(".", "_")}`,
            elapsedHours,
          }),
        ),
      /at least one elapsed hour/,
    );
  const oddDay = "the-day-after-the-flood";
  const reservation = reserveWoundTreatment(
    request({
      operationId: "caller-day",
      dayKey: oddDay,
      elapsedHours: 1.5,
    }),
  );
  assert.equal(reservation.dayKey, oddDay);
  assert.equal(reservation.elapsedHours, 1.5);
  assert.equal(reservation.durationHours, 1);
  assert.equal(reservation.treatment.attempts.length, 1);
  assert.equal(reservation.treatment.attempts[0].elapsedHours, 1.5);
  assert.equal(reservation.treatment.attempts[0].durationHours, 1);

  const result = settle(reservation, { outcome: "standard" });
  assert.equal(result.receipt.elapsedHours, 1.5);
  assert.equal(result.receipt.durationHours, 1);
  assert.equal(result.receipt.progressAdded, 2);
  assert.equal(result.treatment.attempts.length, 1);
});

test("wrong attribute or unknown outcome cannot settle a reserved attempt", () => {
  const reservation = reserveWoundTreatment(
    request({ operationId: "wrong-attribute" }),
  );
  assert.throws(
    () => settle(reservation, { attribute: "reason" }),
    /requires a knowledge outcome/,
  );
  assert.throws(
    () => settle(reservation, { outcome: "critical" }),
    /known Weak, Standard or Strong outcome/,
  );
  assert.equal(reservation.treatment.attempts[0].status, "reserved");
});

test("settlement replay returns the exact receipt without adding progress", () => {
  const reservation = reserveWoundTreatment(
    request({ operationId: "replay-treatment" }),
  );
  const first = settle(reservation, { outcome: "standard" });
  const replay = settleWoundTreatment({
    reservation,
    currentTreatment: first.treatment,
    attribute: reservation.card.attribute,
    outcome: "standard",
  });
  assert.equal(first.replay, false);
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.treatment, first.treatment);
  assert.throws(
    () =>
      settleWoundTreatment({
        reservation,
        currentTreatment: first.treatment,
        attribute: reservation.card.attribute,
        outcome: "strong",
      }),
    /only its exact receipt can be replayed/,
  );
});

test("settlement rejects a stale wound snapshot", () => {
  const reservation = reserveWoundTreatment(
    request({ operationId: "stale-treatment" }),
  );
  const stale = structuredClone(reservation.treatment);
  stale.progress = 1;
  assert.throws(
    () => settle(reservation, { currentTreatment: stale }),
    /snapshot is stale/,
  );
});

test("treatment history cannot move between injury events or patients", () => {
  const patientId = "Actor.patient-one",
    otherPatientId = "Actor.patient-two",
    target = {
      relation: "other",
      actorId: patientId,
      kind: "character",
      willing: true,
      survival: alive(),
    },
    base = reserveWoundTreatment(
      request({
        operationId: "event-a-treatment",
        healerId: "Actor.healer",
        woundEventId: "damage-event-a",
        target,
        treatment: treatmentState("wound-physical-333", 0, {
          woundEventId: "damage-event-a",
          patientId,
        }),
      }),
    );

  const crossEvent = structuredClone(base.treatment);
  crossEvent.woundEventId = "damage-event-b";
  assert.throws(
    () => settle(base, { currentTreatment: crossEvent }),
    /another wound, injury event, or patient/,
  );

  const crossPatient = structuredClone(base.treatment);
  crossPatient.patientId = otherPatientId;
  assert.throws(
    () => settle(base, { currentTreatment: crossPatient }),
    /another wound, injury event, or patient/,
  );

  const settled = settle(base, { outcome: "standard" });
  assert.throws(
    () =>
      settleWoundTreatment({
        reservation: base,
        currentTreatment: crossEvent,
        attribute: base.card.attribute,
        outcome: "standard",
      }),
    /another wound, injury event, or patient/,
  );
  assert.throws(
    () =>
      settleWoundTreatment({
        reservation: base,
        currentTreatment: crossPatient,
        attribute: base.card.attribute,
        outcome: "standard",
      }),
    /another wound, injury event, or patient/,
  );

  const secondEvent = reserveWoundTreatment(
    request({
      operationId: "event-b-treatment",
      healerId: "Actor.healer",
      woundEventId: "damage-event-b",
      target,
      treatment: treatmentState("wound-physical-333", 0, {
        woundEventId: "damage-event-b",
        patientId,
      }),
    }),
  );
  assert.throws(
    () =>
      settle(secondEvent, {
        currentTreatment: settled.treatment,
      }),
    /another wound, injury event, or patient/,
  );

  const changedReservation = structuredClone(base);
  changedReservation.woundEventId = "damage-event-b";
  assert.throws(
    () =>
      settleWoundTreatment({
        reservation: changedReservation,
        currentTreatment: settled.treatment,
        attribute: base.card.attribute,
        outcome: "standard",
      }),
    /reserved treatment attempt changed|another wound/,
  );
});

test("Foundry Actor UUIDs with dots remain valid patient identities", () => {
  const patientId = "Actor.patient.with-dots",
    reservation = reserveWoundTreatment(
      request({
        operationId: "dotted-actor",
        healerId: "Actor.healer.with-dots",
        target: {
          relation: "other",
          actorId: patientId,
          kind: "character",
          willing: true,
          survival: alive(),
        },
      }),
    );
  assert.equal(reservation.patientId, patientId);
  assert.equal(reservation.healerId, "Actor.healer.with-dots");
  assert.equal(
    settle(reservation, { outcome: "weak" }).receipt.patientId,
    patientId,
  );
});

test("settlement rejects changed reserved source provenance", () => {
  const reservation = reserveWoundTreatment(
    request({ operationId: "source-settlement" }),
  );
  const changed = structuredClone(reservation);
  changed.card.source.sha256 = "0".repeat(64);
  assert.throws(
    () =>
      settleWoundTreatment({
        reservation: changed,
        currentTreatment: reservation.treatment,
        attribute: reservation.card.attribute,
        outcome: "standard",
      }),
    /reserved treatment source changed/,
  );
});

test("zero HP is not treated as dead, but Last Words, dead and summons are rejected", () => {
  const dying = reserveWoundTreatment(
    request({
      operationId: "dying-patient",
      healerId: "healer",
      target: {
        relation: "other",
        actorId: "dying-patient",
        kind: "creature",
        willing: true,
        survival: atZero("dying"),
      },
    }),
  );
  assert.equal(dying.status, "reserved");
  assert.equal(
    settle(dying, { outcome: "weak" }).receipt.invariants.hpChange,
    0,
  );

  const stable = request({
    operationId: "stable-patient",
    healerId: "healer",
    target: {
      relation: "other",
      actorId: "stable-patient",
      kind: "character",
      willing: true,
      survival: atZero("stable"),
    },
  });
  assert.equal(reserveWoundTreatment(stable).status, "reserved");

  for (const [operationId, status] of [
    ["last-words-patient", enterLastWords(atZero("dying"))],
    ["dead-patient", { ...atZero("dying"), status: "dead" }],
  ])
    assert.throws(
      () =>
        reserveWoundTreatment(
          request({
            operationId,
            healerId: "healer",
            target: {
              relation: "other",
              actorId: `${operationId}-target`,
              kind: "character",
              willing: true,
              survival: status,
            },
          }),
        ),
      /Last Words and dead patients/,
    );

  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "summon-patient",
          target: {
            relation: "other",
            actorId: "summon",
            kind: "summon",
            willing: true,
            survival: alive(),
          },
        }),
      ),
    /Patient kind cannot receive ordinary treatment/,
  );
});

test("willpower, self identity and wound applicability are explicit caller choices", () => {
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "unwilling",
          target: {
            relation: "other",
            actorId: "patient",
            kind: "character",
            willing: false,
            survival: alive(),
          },
        }),
      ),
    /explicitly be willing/,
  );
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "forged-self",
          target: {
            relation: "self",
            actorId: "someone-else",
            kind: "character",
            willing: true,
            survival: alive(),
          },
        }),
      ),
    /self treatment target must be the healer/,
  );
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "split-self",
          target: {
            relation: "self",
            actorId: "Actor.healer",
            kind: "character",
            willing: true,
            survival: alive(9),
          },
        }),
      ),
    /coherent healer and patient survival snapshot/,
  );
  assert.throws(
    () =>
      reserveWoundTreatment(
        request({ operationId: "inapplicable", woundApplicable: false }),
      ),
    /explicit caller decision/,
  );
});

test("operation IDs and outputs are immutable and do not mutate inputs", () => {
  const input = request({ operationId: "immutable-plan" }),
    snapshot = structuredClone(input),
    reservation = reserveWoundTreatment(input);
  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(reservation), true);
  assert.equal(Object.isFrozen(reservation.treatment), true);
  assert.equal(Object.isFrozen(reservation.treatment.attempts[0]), true);

  assert.throws(
    () =>
      reserveWoundTreatment(
        request({
          operationId: "immutable-plan",
          treatment: reservation.treatment,
        }),
      ),
    /already belongs to an attempt/,
  );

  const settled = settle(reservation, { outcome: "weak" });
  assert.equal(Object.isFrozen(settled), true);
  assert.equal(Object.isFrozen(settled.receipt), true);
});
