/** Pure replay guidance for a cross-document potion operation. */
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
    throw new Error("The recipe recipient receipt belongs to another kind.");
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
