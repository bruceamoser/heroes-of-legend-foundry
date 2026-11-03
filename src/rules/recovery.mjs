/** Persistent accounting for The Debt Comes Due; dawn is a table-declared event. */
export function normalizeRecovery(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Recovery accounting must be an object.");
  const unavailableHp = value.unavailableHp ?? 0;
  const debtUsed = value.debtUsed ?? false;
  if (![0, 1].includes(unavailableHp) || typeof debtUsed !== "boolean" ||
      (unavailableHp > 0 && !debtUsed))
    throw new Error("Invalid unavailable HP or daily Debt use.");
  return { unavailableHp, debtUsed };
}

export function recoveryMaximum(maxHp, recovery) {
  if (!Number.isSafeInteger(maxHp) || maxHp < 1)
    throw new Error("Maximum HP must be a positive whole number.");
  return Math.max(0, maxHp - normalizeRecovery(recovery).unavailableHp);
}

/** An HP payment bypasses resistance, never causes a wound, and leaves at least 1 HP. */
export function payDebt({ hp, maxHp, recovery, traitIds = [] }) {
  const current = normalizeRecovery(recovery);
  if (!traitIds.includes("trait-oath-bound-the-debt-comes-due"))
    throw new Error("The Debt Comes Due requires its ancestry trait.");
  if (current.debtUsed) throw new Error("The Debt Comes Due has already been used today.");
  recoveryMaximum(maxHp, current);
  if (!Number.isSafeInteger(hp) || hp < 2 || hp > maxHp)
    throw new Error("Paying 1 HP must leave at least 1 HP.");
  return { hp: hp - 1, recovery: { unavailableHp: 1, debtUsed: true } };
}

/** Unlock recovery and refresh the daily use without restoring any HP. */
export function nextDawn({ hp, recovery }) {
  normalizeRecovery(recovery);
  if (!Number.isSafeInteger(hp) || hp < 0)
    throw new Error("Current HP must be a nonnegative whole number.");
  return { hp, recovery: { unavailableHp: 0, debtUsed: false } };
}
