/** Pure replay guidance for a cross-document potion operation. */
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const id = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw new TypeError(`${label} must be a safe nonempty identity.`);
  return value;
};

/** Linked IDs are deterministic; callers never choose a different child later. */
export function linkedPotionOperationId(parentId, suffix) {
  id(parentId, "Parent operation identity");
  if (!["reaction", "supply"].includes(suffix))
    throw new TypeError("Unknown linked potion operation.");
  const linked = `${parentId}_${suffix}`;
  if (linked.length > 80)
    throw new RangeError("Linked potion operation identity is too long.");
  return linked;
}

/** Catalog copies may retain only path/hash; optional full provenance must agree when present. */
export function potionSourceMatches(actual, expected) {
  if (
    actual?.path !== expected?.path ||
    actual?.sha256 !== expected?.sha256
  )
    return false;
  return ["id", "repository", "commit"].every(
    (key) =>
      actual?.[key] === undefined ||
      expected?.[key] === undefined ||
      actual[key] === expected[key],
  );
}

/** Explanatory prose never grants authority and is optional for an explicit choice. */
export function potionNote(value = "") {
  if (typeof value !== "string") throw new TypeError("A potion note must be text.");
  return value.trim();
}

/** Bind an explicit DA geometry ruling to the actual proposing user. */
export function normalizePotionGeometry(geometry, user) {
  if (
    !geometry ||
    typeof geometry !== "object" ||
    !["native", "da-ruling"].includes(geometry.mode)
  )
    throw new Error("The potion geometry choice is invalid.");
  if (geometry.mode === "native") return { mode: "native" };
  if (
    !user?.isGM ||
    typeof user.id !== "string" ||
    !user.id
  )
    throw new Error(
      "Only the actual DA can record an attributed potion geometry ruling.",
    );
  return {
    mode: "da-ruling",
    userId: user.id,
    reason: potionNote(geometry.reason),
  };
}

export function potionGeometryRulingAuthorized(ruling, sourceAuthor) {
  return Boolean(
    ruling?.mode === "da-ruling" &&
      sourceAuthor?.isGM === true &&
      typeof ruling.userId === "string" &&
      ruling.userId === sourceAuthor.id &&
      (ruling.reason === undefined || typeof ruling.reason === "string"),
  );
}

/**
 * Verify that the durable potion operation still owns the enclosing turn
 * budgets and the real action receipts produced from those budgets.
 */
export function validatePotionEncounterReceipts(operation, encounter) {
  const giverBudget =
      encounter?.budgets?.[operation?.giver?.participantId],
    recipientBudget =
      encounter?.budgets?.[operation?.recipient?.participantId],
    plan = operation?.plan;
  if (
    !giverBudget ||
    !recipientBudget ||
    !plan?.giverTurn ||
    !plan?.recipientTurn ||
    operation.giver.turnId !== giverBudget.turnId ||
    operation.recipient.turnId !== recipientBudget.turnId ||
    operation.giver.turnId !== operation.budgets?.before?.giver?.turnId ||
    operation.recipient.turnId !==
      operation.budgets?.before?.recipient?.turnId
  )
    throw new Error(
      "The potion operation no longer belongs to the enclosing turn budgets.",
    );
  if (
    operation.encounterRevisionAfter != null &&
    encounter.revision !== operation.encounterRevisionAfter
  )
    throw new Error(
      "The potion encounter changed after its action receipts were committed.",
    );
  if (!same(giverBudget, plan.giverTurn))
    throw new Error(
      "The giver Maneuver receipt no longer matches the enclosing turn budget.",
    );
  const giverReceipt =
      giverBudget.operations?.[operation.requestId],
    plannedGiverReceipt =
      plan.giverTurn.operations?.[operation.requestId];
  if (
    !giverReceipt ||
    !plannedGiverReceipt ||
    !same(giverReceipt, plannedGiverReceipt) ||
    !same(giverReceipt, operation.giver.actionReceipt)
  )
    throw new Error(
      "The giver action receipt changed or belongs to another operation.",
    );
  const reactionRequired = plan.costs?.recipient?.reaction === 1,
    expectedRecipient =
      reactionRequired && !operation.reactionCommitted
        ? operation.budgets?.before?.recipient
        : plan.recipientTurn;
  if (!same(recipientBudget, expectedRecipient))
    throw new Error(
      "The recipient Reaction receipt no longer matches the potion phase.",
    );
  if (reactionRequired && operation.reactionCommitted) {
    const reactionReceipt =
        recipientBudget.operations?.[operation.reactionOperationId],
      plannedReactionReceipt =
        plan.recipientTurn.operations?.[operation.reactionOperationId];
    if (
      !reactionReceipt ||
      !plannedReactionReceipt ||
      !same(reactionReceipt, plannedReactionReceipt) ||
      !same(reactionReceipt, operation.recipient.reactionReceipt)
    )
      throw new Error(
        "The recipient Reaction receipt changed or belongs to another operation.",
      );
  } else if (
    reactionRequired &&
    (operation.recipient.reactionReceipt != null ||
      recipientBudget.operations?.[operation.reactionOperationId])
  ) {
    throw new Error(
      "A recipient Reaction receipt exists before the potion reached that phase.",
    );
  }
  return true;
}

/**
 * Determine the next durable phase from receipts, not a cached status.
 * A supply child in `rolling` may have evaluated dice before it could save
 * them, so ordinary retry must stop for an explicit DA retained-face recovery.
 */
export function potionOperationNextPhase({
  operation,
  recipientReceipt = null,
  supplyOperation = null,
  settlement = null,
} = {}) {
  if (!operation || typeof operation !== "object")
    throw new Error("The potion operation is unavailable.");
  if (settlement?.applied) {
    if (settlement.kind !== "potion")
      throw new Error("The potion settlement receipt belongs to another kind.");
    return "complete";
  }
  if (operation.status === "needs-reconciliation") return "reconcile";
  if (operation.status === "interrupted") return "settle-interrupted";
  if (!recipientReceipt?.applied) return "heal-recipient";
  if (recipientReceipt.kind !== "potion-recipient")
    throw new Error("The potion recipient receipt belongs to another kind.");
  if (!supplyOperation) return "reserve-supply";
  if (supplyOperation.parentId !== operation.requestId)
    throw new Error("The supply child belongs to another potion operation.");
  if (
    supplyOperation.operationId !== operation.supplyOperationId ||
    operation.supplyOperationId !==
      linkedPotionOperationId(operation.requestId, "supply")
  )
    throw new Error("The linked supply operation identity changed.");
  if (supplyOperation.phase === "rolling") return "recover-supply";
  if (supplyOperation.phase === "rolled") return "settle-supply";
  if (
    supplyOperation.phase === "settled" ||
    supplyOperation.phase === "waived"
  )
    return "settle-operation";
  throw new Error("The potion supply operation has an unknown phase.");
}

function supplyItemFingerprint(data, targetId, expectedDie = null) {
  const system = structuredClone(data.system ?? {});
  if (data._id === targetId && expectedDie != null)
    system.inventoryDie = expectedDie;
  return {
    id: data._id,
    type: data.type,
    name: data.name,
    system,
    flags: structuredClone(data.flags ?? {}),
  };
}

/** Verify the exact supply die change while preserving all other embedded Item data. */
export function verifyPotionSupplyItems(
  items,
  beforeItems,
  targetId,
  expectedDie,
) {
  const fingerprint = (data) =>
    supplyItemFingerprint(data, targetId, expectedDie);
  if (
    !Array.isArray(items) ||
    items.length !== beforeItems.length ||
    !same(
      items
        .map((data) => supplyItemFingerprint(data, targetId))
        .sort((left, right) => left.id.localeCompare(right.id)),
      beforeItems
        .map(fingerprint)
        .sort((left, right) => left.id.localeCompare(right.id)),
    )
  )
    throw new Error(
      "The potion supply update changed an unrelated embedded Item; reconcile it without retrying.",
    );
}
