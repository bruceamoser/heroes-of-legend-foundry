/**
 * Apply one source per benefit key. Defend and Shield Block stack because they
 * have distinct keys, while repeated effects with the same key do not multiply.
 * Shield Block is conditional on the incoming attack and the exact shield used.
 */
export function defenseBenefitSources(
  entries,
  { incomingAttack = false, heldShieldUuids = [] } = {},
) {
  if (!Array.isArray(entries)) throw new Error("Invalid defense benefits.");
  const held = new Set(heldShieldUuids),
    keys = new Set(),
    sources = [];
  // Older worlds can contain more than one same-key effect. Select the
  // strongest eligible shield benefit, never their sum or their array order.
  const shield = entries
    .filter(
      (entry) =>
        entry?.key === "shield-block" &&
        incomingAttack &&
        typeof entry.shieldItemUuid === "string" &&
        held.has(entry.shieldItemUuid),
    )
    .sort(
      (a, b) =>
        Number(b.sourceId === "ability-high-guard") -
        Number(a.sourceId === "ability-high-guard"),
    )[0];
  for (const entry of entries) {
    if (!entry || keys.has(entry.key)) continue;
    if (entry.key === "defend") {
      keys.add(entry.key);
      sources.push({
        id: "benefit-defend",
        kind: "boon",
        amount: 1,
        label: "Defend maneuver",
        sourceIds: [entry.effectUuid],
        automatic: true,
      });
    } else if (entry === shield) {
      keys.add(entry.key);
      sources.push({
        id: "benefit-shield-block",
        kind: "boon",
        amount: entry.sourceId === "ability-high-guard" ? 2 : 1,
        label:
          entry.sourceId === "ability-high-guard"
            ? "High Guard"
            : "Shield Block",
        sourceIds: [entry.effectUuid],
        automatic: true,
      });
    }
  }
  return sources;
}

/** A repeated same-key benefit refreshes the single retained effect in place. */
export function upsertBenefitEffect(effects, data) {
  if (!Array.isArray(effects) || !data?._id)
    throw new Error("Invalid benefit effect snapshot.");
  const next = effects.map((effect) => structuredClone(effect)),
    index = next.findIndex((effect) => effect._id === data._id);
  if (index === -1) next.push(structuredClone(data));
  else next[index] = structuredClone(data);
  return next;
}

/** High Guard always pays its Reaction; ordinary Shield Block cannot lower it. */
export function shieldBenefitReuse(
  handler,
  existingSourceId = null,
  existingShieldHeld = true,
) {
  return {
    free: Boolean(existingSourceId && handler !== "high-guard-v1"),
    preserve:
      handler === "shield-block-v1" &&
      existingSourceId === "ability-high-guard" &&
      existingShieldHeld,
  };
}
