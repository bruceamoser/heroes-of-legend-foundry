/**
 * Declarative wound-treatment plans.
 * Reservation locks the campaign-day attempt before dice are known; settlement
 * records progress without applying document, condition or survival changes.
 */
import { declareAction } from "./actions.mjs";
import { validateSurvival } from "./survival.mjs";

const SOURCE_COMMIT = "d67e046466bdd5052360b96ed91861d607091446";
const WOUND_SOURCE = Object.freeze({
  path: "design/rules/wounds.md",
  sha256: "58c42a717e00aa74310523cde3850a5af1c97ef58c8d3766933538964baf17c9",
});
const PROGRESS = Object.freeze({ weak: 1, standard: 2, strong: 3 });
const OUTCOMES = Object.freeze(Object.keys(PROGRESS));
const STATUSES = Object.freeze(["reserved", "settled"]);
const EFFECT_KINDS = Object.freeze([
  "condition",
  "forcedMovement",
  "movementPenalty",
  "rollModifier",
  "lastWords",
]);

const definitions = Object.freeze({
  "treat-bone": Object.freeze({
    id: "treat-bone",
    catalogId: "ability-treat-bone",
    capability: "Bone",
    attribute: "knowledge",
    source: Object.freeze({
      path: "design/cards/treat-bone.md",
      sha256:
        "859fb3e19a27191895ecf2d7ee31142c0ee41983e5fcac63659b295bd28c4bd1",
    }),
  }),
  "treat-elemental-injury": Object.freeze({
    id: "treat-elemental-injury",
    catalogId: "ability-treat-elemental-injury",
    capability: "Elemental",
    attribute: "knowledge",
    source: Object.freeze({
      path: "design/cards/treat-elemental-injury.md",
      sha256:
        "4f3e57aa2757f3670b2978df5eaad45ff71d1b40c585c464530f4f355b5a5ad3",
    }),
  }),
  "treat-life-injury": Object.freeze({
    id: "treat-life-injury",
    catalogId: "ability-treat-life-injury",
    capability: "Life",
    attribute: "reason",
    source: Object.freeze({
      path: "design/cards/treat-life-injury.md",
      sha256:
        "38fccd0c7578cc7d35e47101aa41d2c9d18590719296974d7772d5f9b9166bd1",
    }),
  }),
  "treat-mental-trauma": Object.freeze({
    id: "treat-mental-trauma",
    catalogId: "ability-treat-mental-trauma",
    capability: "Mental",
    attribute: "reason",
    source: Object.freeze({
      path: "design/cards/treat-mental-trauma.md",
      sha256:
        "7c19a4f92a0579a30d027aed6f7c1d230666e141eb5dc5b19174b3d4eb7be399",
    }),
  }),
  "treat-radiant-injury": Object.freeze({
    id: "treat-radiant-injury",
    catalogId: "ability-treat-radiant-injury",
    capability: "Radiant",
    attribute: "reason",
    source: Object.freeze({
      path: "design/cards/treat-radiant-injury.md",
      sha256:
        "b5af45302790861eb6e1ce49de255a17ec0181c73df0168b5ff63d72fe2035b6",
    }),
  }),
  "treat-soft-tissue": Object.freeze({
    id: "treat-soft-tissue",
    catalogId: "ability-treat-soft-tissue",
    capability: "Soft Tissue",
    attribute: "knowledge",
    source: Object.freeze({
      path: "design/cards/treat-soft-tissue.md",
      sha256:
        "c0ae7c26688a2fd4a259318b7488cc7d73485d3d7ea3bf3e0d7af3a068adf4d8",
    }),
  }),
});

export const TREATMENT_CARD_IDS = Object.freeze(Object.keys(definitions));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function identity(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw new Error(`${label} must be a stable identity.`);
  return value;
}

// Actor identifiers are opaque values in this planner. They are compared and
// stored in receipts, never interpolated into flag paths.
function actorIdentity(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`${label} must be a stable Actor identity.`);
  return value;
}

function dayIdentity(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Campaign day key must be an explicit nonempty string.");
  return value;
}

function elapsedTime(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1)
    throw new Error(
      "A wound-treatment attempt requires at least one elapsed hour.",
    );
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a nonnegative whole number.`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

function sameSnapshot(left, right) {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left).sort(),
    rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameSnapshot(left[key], right[key]),
    )
  );
}

function assertCatalogCommit(catalog, label) {
  if (catalog?.sourceCommit !== SOURCE_COMMIT)
    throw new Error(`${label} source commit drifted.`);
}

function sourceMatches(actual, expected) {
  return actual?.path === expected.path && actual?.sha256 === expected.sha256;
}

/** Validate a treatment card against the pinned acquisition catalog. */
export function treatmentCardAdapter(cardId, catalog) {
  const definition = definitions[cardId];
  if (!definition) throw new Error(`Unknown treatment card: ${cardId}`);
  assertCatalogCommit(catalog, "Treatment card");
  const acquisition = catalog.acquisitions?.find(
    (record) => record.id === definition.catalogId,
  );
  if (!acquisition || !sourceMatches(acquisition.source, definition.source))
    throw new Error(`Treatment card source drifted: ${cardId}`);
  return deepFreeze(
    structuredClone({
      ...definition,
      action: "main",
      durationHours: 1,
      repository: "bruceamoser/heroes-of-legend",
      commit: SOURCE_COMMIT,
    }),
  );
}

/** Validate one typed wound record against the pinned wound source. */
export function woundTreatmentAdapter(woundId, catalog) {
  assertCatalogCommit(catalog, "Wound");
  const record = catalog.records?.find((candidate) => candidate.id === woundId);
  if (!record) throw new Error(`Unknown wound record: ${woundId}`);
  if (!sourceMatches(record.source, WOUND_SOURCE))
    throw new Error(`Wound source drifted: ${woundId}`);
  if (!Array.isArray(record.effects) || !Array.isArray(catalog.records))
    throw new Error("Wound catalog is incomplete.");
  for (const effect of record.effects)
    if (!EFFECT_KINDS.includes(effect?.kind))
      throw new Error(`Unreviewed wound effect: ${effect?.kind}`);
  if (
    record.capability !== null &&
    !Object.values(definitions).some(
      (definition) => definition.capability === record.capability,
    )
  )
    throw new Error(`Unknown wound capability: ${record.capability}`);
  if (
    (record.capability === null) !== (record.recoveryValue === null) ||
    (record.recoveryValue !== null &&
      (!Number.isSafeInteger(record.recoveryValue) || record.recoveryValue < 1))
  )
    throw new Error(`Invalid wound treatment track: ${woundId}`);
  return deepFreeze(structuredClone(record));
}

function validateTreatment(
  treatment,
  woundId,
  woundEventId,
  patientId,
  recoveryValue,
) {
  if (!treatment || typeof treatment !== "object")
    throw new Error("A wound treatment snapshot is required.");
  if (
    treatment.schemaVersion !== 1 ||
    treatment.woundId !== woundId ||
    treatment.woundEventId !== woundEventId ||
    treatment.patientId !== patientId
  )
    throw new Error(
      "The treatment snapshot belongs to another wound, injury event, or patient.",
    );
  actorIdentity(treatment.patientId, "Treatment patient identity");
  if (treatment.scarCounted !== true)
    throw new Error("A wound's permanent scar must already be counted.");
  integer(treatment.progress, "Treatment progress");
  boolean(treatment.completed, "Treatment completion");
  if (!Array.isArray(treatment.attempts))
    throw new Error("Treatment attempts must be a list.");
  if (
    (recoveryValue !== null && treatment.progress >= recoveryValue) !==
    treatment.completed
  )
    throw new Error("Treatment progress and completion disagree.");
  const operationIds = new Set(),
    days = new Set();
  for (const attempt of treatment.attempts) {
    identity(attempt?.operationId, "Attempt operation identity");
    identity(attempt?.woundEventId, "Attempt wound event identity");
    actorIdentity(attempt?.patientId, "Attempt patient identity");
    actorIdentity(attempt?.healerId, "Attempt healer identity");
    if (
      attempt?.woundId !== woundId ||
      attempt?.woundEventId !== woundEventId ||
      attempt?.patientId !== patientId
    )
      throw new Error(
        "A treatment attempt belongs to another wound, injury event, or patient.",
      );
    dayIdentity(attempt?.dayKey);
    if (!STATUSES.includes(attempt?.status))
      throw new Error("Unknown treatment attempt status.");
    if (operationIds.has(attempt.operationId))
      throw new Error("Duplicate treatment operation in the attempt ledger.");
    if (days.has(attempt.dayKey))
      throw new Error("A wound has more than one attempt for a campaign day.");
    operationIds.add(attempt.operationId);
    days.add(attempt.dayKey);
  }
  return treatment;
}

function newTreatment(woundId, woundEventId, patientId) {
  return {
    schemaVersion: 1,
    woundId,
    woundEventId,
    patientId,
    scarCounted: true,
    progress: 0,
    completed: false,
    attempts: [],
  };
}

function validateHealer(healer, operationId, card) {
  actorIdentity(healer?.actorId, "Healer identity");
  validateSurvival(healer.survival);
  if (healer.survival.status !== "active")
    throw new Error("The healer must be alive and able to take a Main Action.");
  if (
    !Array.isArray(healer.learnedAbilityIds) ||
    healer.learnedAbilityIds.some((id) => typeof id !== "string")
  )
    throw new Error("Healer learned abilities must be a list of identities.");
  if (!healer.learnedAbilityIds.includes(card.catalogId))
    throw new Error(`The healer has not learned ${card.id}.`);
  boolean(healer.ownTurn, "Healer own-turn status");
  if (
    healer.turn?.operations &&
    Object.hasOwn(healer.turn.operations, operationId)
  )
    throw new Error(
      "Treatment operation ID was already recorded; use its exact receipt or reconcile the reservation.",
    );
}

function validateTarget(target, healer) {
  if (!target || typeof target !== "object")
    throw new Error("An explicit treatment target is required.");
  if (!["self", "other"].includes(target.relation))
    throw new Error("Treatment target relation must be self or other.");
  actorIdentity(target.actorId, "Patient identity");
  boolean(target.willing, "Patient willingness");
  if (!target.willing)
    throw new Error("The patient must explicitly be willing.");
  if (target.relation === "self" && target.actorId !== healer.actorId)
    throw new Error("A self treatment target must be the healer.");
  if (target.relation === "other" && target.actorId === healer.actorId)
    throw new Error("An other treatment target must be a distinct Actor.");
  const kind = target.kind ?? "character";
  if (!["character", "creature"].includes(kind))
    throw new Error(`Patient kind cannot receive ordinary treatment: ${kind}`);
  validateSurvival(target.survival);
  if (
    target.relation === "self" &&
    !sameSnapshot(target.survival, healer.survival)
  )
    throw new Error(
      "Self treatment requires one coherent healer and patient survival snapshot.",
    );
  if (["lastWords", "dead"].includes(target.survival.status))
    throw new Error("Last Words and dead patients cannot receive treatment.");
  return kind;
}

function findAttempt(treatment, operationId) {
  return treatment?.attempts?.find(
    (attempt) => attempt.operationId === operationId,
  );
}

/**
 * Reserve the one daily attempt and spend the Main Action before rolling.
 * The caller supplies the campaign day key and elapsed world time; no
 * wall-clock calendar boundary is inferred. The printed one-hour duration is
 * recorded separately from the elapsed-time qualification.
 */
export function reserveWoundTreatment({
  operationId,
  dayKey,
  elapsedHours,
  cardId,
  woundId,
  woundEventId,
  inventoryCatalog,
  woundCatalog,
  treatment: suppliedTreatment = null,
  healer,
  target,
  woundApplicable,
}) {
  identity(operationId, "Treatment operation identity");
  dayIdentity(dayKey);
  elapsedTime(elapsedHours);
  identity(woundEventId, "Wound event identity");
  if (woundApplicable !== true)
    throw new Error(
      "Wound anatomy and applicability require an explicit caller decision.",
    );
  const card = treatmentCardAdapter(cardId, inventoryCatalog),
    wound = woundTreatmentAdapter(woundId, woundCatalog);
  if (wound.recoveryValue === null)
    throw new Error("This wound has no ordinary treatment track.");
  if (wound.capability !== card.capability)
    throw new Error(
      `${card.id} cannot treat the ${wound.capability} wound ${wound.id}.`,
    );
  validateHealer(healer, operationId, card);
  const patientKind = validateTarget(target, healer);
  const treatment =
    suppliedTreatment ?? newTreatment(woundId, woundEventId, target.actorId);
  validateTreatment(
    treatment,
    woundId,
    woundEventId,
    target.actorId,
    wound.recoveryValue,
  );
  if (treatment.completed)
    throw new Error("Ordinary treatment is already complete for this wound.");
  if (findAttempt(treatment, operationId))
    throw new Error(
      "Treatment operation ID already belongs to an attempt; settle or reconcile it instead of reserving another.",
    );
  if (treatment.attempts.some((attempt) => attempt.dayKey === dayKey))
    throw new Error(
      "This wound already has an attempt reserved or settled on that campaign day.",
    );

  const healerTurn = declareAction(healer.turn, {
    operationId,
    sourceId: card.catalogId,
    category: "main",
    conditions: healer.conditions ?? {},
    ownTurn: healer.ownTurn,
  });
  const attempt = {
      operationId,
      dayKey,
      healerId: healer.actorId,
      patientId: target.actorId,
      patientKind,
      woundId: wound.id,
      woundEventId,
      cardId: card.id,
      capability: card.capability,
      durationHours: card.durationHours,
      elapsedHours,
      status: "reserved",
      woundSource: structuredClone(wound.source),
    },
    nextTreatment = {
      ...structuredClone(treatment),
      attempts: [...structuredClone(treatment.attempts), attempt],
    };

  return deepFreeze({
    status: "reserved",
    sourceCommit: SOURCE_COMMIT,
    operationId,
    dayKey,
    woundId: wound.id,
    woundEventId,
    patientId: target.actorId,
    healerId: healer.actorId,
    durationHours: card.durationHours,
    elapsedHours,
    healerTurn: structuredClone(healerTurn),
    card: structuredClone(card),
    wound: structuredClone(wound),
    treatment: nextTreatment,
    action: {
      category: "main",
      status: "committed",
      hpChange: 0,
      itemChange: 0,
    },
    settlement: {
      status: "awaiting-known-outcome",
      attribute: card.attribute,
      outcomes: [...OUTCOMES],
    },
  });
}

function treatedEffect(effect) {
  if (effect.kind === "condition") return effect.persistence === "starred";
  return effect.kind === "movementPenalty" || effect.kind === "rollModifier";
}

function settlementSignature({ outcome, attribute, elapsedHours }) {
  return JSON.stringify({ outcome, attribute, elapsedHours });
}

function assertAttemptMatchesReservation(attempt, reservation) {
  if (
    attempt.operationId !== reservation.operationId ||
    attempt.dayKey !== reservation.dayKey ||
    attempt.healerId !== reservation.healerId ||
    attempt.patientId !== reservation.patientId ||
    attempt.woundId !== reservation.woundId ||
    attempt.woundEventId !== reservation.woundEventId ||
    attempt.cardId !== reservation.card.id ||
    attempt.capability !== reservation.wound.capability ||
    attempt.durationHours !== reservation.durationHours ||
    attempt.elapsedHours !== reservation.elapsedHours ||
    attempt.woundSource?.sha256 !== WOUND_SOURCE.sha256
  )
    throw new Error("The reserved treatment attempt changed.");
}

/**
 * Settle a reserved attempt after its exact attribute outcome is known.
 * An exact replay returns the stored receipt without adding progress again.
 */
export function settleWoundTreatment({
  reservation,
  currentTreatment,
  attribute,
  outcome,
}) {
  if (!reservation || reservation.status !== "reserved")
    throw new Error("A reserved wound-treatment attempt is required.");
  if (!OUTCOMES.includes(outcome))
    throw new Error("A known Weak, Standard or Strong outcome is required.");
  if (attribute !== reservation.card.attribute)
    throw new Error(
      `${reservation.card.id} requires a ${reservation.card.attribute} outcome.`,
    );
  elapsedTime(reservation.elapsedHours);
  identity(reservation.woundEventId, "Reserved wound event identity");
  actorIdentity(reservation.patientId, "Reserved patient identity");
  actorIdentity(reservation.healerId, "Reserved healer identity");
  if (reservation.durationHours !== 1 || reservation.card.durationHours !== 1)
    throw new Error("The printed treatment duration changed.");
  const definition = definitions[reservation.card.id];
  if (
    !definition ||
    reservation.card.capability !== definition.capability ||
    reservation.card.attribute !== definition.attribute ||
    !sourceMatches(reservation.card.source, definition.source) ||
    !sourceMatches(reservation.wound.source, WOUND_SOURCE)
  )
    throw new Error("A reserved treatment source changed.");
  validateTreatment(
    currentTreatment,
    reservation.wound.id,
    reservation.woundEventId,
    reservation.patientId,
    reservation.wound.recoveryValue,
  );
  const reservedAttempt = findAttempt(
      reservation.treatment,
      reservation.operationId,
    ),
    attempt = findAttempt(currentTreatment, reservation.operationId);
  if (!reservedAttempt)
    throw new Error("The reserved treatment attempt is missing.");
  assertAttemptMatchesReservation(reservedAttempt, reservation);
  if (!attempt) throw new Error("The reserved treatment attempt is missing.");
  assertAttemptMatchesReservation(attempt, reservation);
  const signature = settlementSignature({
    outcome,
    attribute,
    elapsedHours: reservation.elapsedHours,
  });
  if (attempt.status === "settled") {
    if (
      attempt.settlementSignature !== signature ||
      !attempt.receipt ||
      attempt.receipt.operationId !== reservation.operationId ||
      attempt.receipt.woundId !== reservation.woundId ||
      attempt.receipt.woundEventId !== reservation.woundEventId ||
      attempt.receipt.patientId !== reservation.patientId ||
      attempt.receipt.durationHours !== reservation.durationHours ||
      attempt.receipt.elapsedHours !== reservation.elapsedHours
    )
      throw new Error(
        "The treatment attempt is settled; only its exact receipt can be replayed.",
      );
    return deepFreeze({
      status: "settled",
      replay: true,
      receipt: structuredClone(attempt.receipt),
      treatment: structuredClone(currentTreatment),
    });
  }
  if (!sameSnapshot(currentTreatment, reservation.treatment))
    throw new Error("The wound treatment snapshot is stale.");

  const progressBefore = currentTreatment.progress,
    progressAdded = PROGRESS[outcome],
    progressAfter = progressBefore + progressAdded,
    completed = progressAfter >= reservation.wound.recoveryValue,
    effectsRemoved = completed
      ? reservation.wound.effects.filter(treatedEffect)
      : [],
    effectsPreserved = reservation.wound.effects.filter(
      (effect) => !effectsRemoved.includes(effect),
    ),
    receipt = {
      schemaVersion: 1,
      operationId: reservation.operationId,
      dayKey: reservation.dayKey,
      woundId: reservation.woundId,
      woundEventId: reservation.woundEventId,
      patientId: reservation.patientId,
      durationHours: reservation.durationHours,
      elapsedHours: reservation.elapsedHours,
      cardId: reservation.card.id,
      capability: reservation.card.capability,
      attribute,
      outcome,
      progressBefore,
      progressAdded,
      progressAfter,
      recoveryValue: reservation.wound.recoveryValue,
      completed,
      effectsRemoved: structuredClone(effectsRemoved),
      effectsPreserved: structuredClone(effectsPreserved),
      invariants: {
        hpChange: 0,
        scarPreserved: true,
        woundCountPreserved: true,
        lostPartsRestored: false,
        equipmentRestored: false,
        temporaryOrImmediateEffectsEnded: false,
      },
      sources: {
        commit: SOURCE_COMMIT,
        card: structuredClone(reservation.card.source),
        wound: structuredClone(reservation.wound.source),
      },
    },
    nextTreatment = {
      ...structuredClone(currentTreatment),
      progress: progressAfter,
      completed,
      attempts: currentTreatment.attempts.map((entry) =>
        entry.operationId === reservation.operationId
          ? {
              ...structuredClone(entry),
              status: "settled",
              settlementSignature: signature,
              receipt: structuredClone(receipt),
            }
          : structuredClone(entry),
      ),
    };

  return deepFreeze({
    status: "settled",
    replay: false,
    receipt,
    treatment: nextTreatment,
  });
}
