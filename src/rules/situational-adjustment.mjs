/** One player adjustment; automatic sources still cancel and cap in sourceRollPlan. */
export function situationalRollDraft(value = 0) {
  const adjustment = Number(value);
  if (!Number.isSafeInteger(adjustment) || adjustment < -3 || adjustment > 3)
    throw new Error("Choose a whole-number adjustment from −3 to +3.");
  return {
    adjustment,
    boons: Math.max(0, adjustment),
    banes: Math.max(0, -adjustment),
    boonsLabel: "Situational Boons",
    banesLabel: "Situational Banes",
  };
}

export function situationalAdjustmentLabel(value = 0) {
  const { adjustment } = situationalRollDraft(value);
  if (!adjustment) return "0 · No adjustment";
  const count = Math.abs(adjustment);
  return `${adjustment > 0 ? "+" : "−"}${count} · ${count} ${adjustment > 0 ? "Boon" : "Bane"}${count === 1 ? "" : "s"}`;
}

/** The slider shows the final net, while audit sources retain uncapped totals. */
export function effectiveRollDraft(plan, value = plan.net, overridden = false) {
  const selected = situationalRollDraft(overridden ? value : plan.net);
  const difference = overridden ? selected.adjustment - (plan.boons - plan.banes) : 0;
  return {
    ...selected,
    adjustmentOverride: overridden,
    boons: Math.max(0, difference),
    banes: Math.max(0, -difference),
    boonsLabel: "Player modifier override",
    banesLabel: "Player modifier override",
  };
}
