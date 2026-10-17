const PHYSICAL_DAMAGE = Object.freeze({
  weak: 2,
  standard: 3,
  strong: 5,
});

const GEOMETRY_EPSILON = 0.0001;

export function basicMeleeDamage(tier) {
  if (!Object.hasOwn(PHYSICAL_DAMAGE, tier))
    throw new Error("Basic Melee needs a rolled attack tier.");
  return PHYSICAL_DAMAGE[tier];
}

export function targetEvasionSources(evasion, tokenUuid) {
  if (!evasion) return [];
  if (typeof tokenUuid !== "string" || !tokenUuid)
    throw new Error("Target Evasion needs a target identity.");
  const sources = [];
  for (const [field, kind, label] of [
    ["boons", "boon", "Target Evasion · Boons"],
    ["banes", "bane", "Target Evasion · Banes"],
  ]) {
    const amount = evasion[field] ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error("Target Evasion must use nonnegative whole numbers.");
    if (amount)
      sources.push({
        id: `target-evasion-${field}`,
        kind,
        amount,
        label,
        automatic: true,
        sourceIds: [tokenUuid],
      });
  }
  return sources;
}

export function nativeBasicMeleeGeometry({
  actorTokenUuid,
  targetTokenUuid,
  sceneUuid,
  spaces,
  accessible,
  actorLevel = null,
  targetLevel = null,
  actorElevation = 0,
  targetElevation = 0,
  collision = null,
}) {
  if (
    typeof actorTokenUuid !== "string" ||
    typeof targetTokenUuid !== "string" ||
    actorTokenUuid === targetTokenUuid
  )
    throw new Error("Choose two different tokens for Basic Melee.");
  const common = {
    sceneUuid,
    actorTokenUuid,
    targetTokenUuid,
    actorLevel,
    targetLevel,
    actorElevation,
    targetElevation,
    collision,
  };
  if (
    (actorLevel == null) !== (targetLevel == null) ||
    (actorLevel != null && actorLevel !== targetLevel)
  )
    return {
      status: "unverified",
      adjacent: null,
      reason:
        "The tokens are on different scene levels. The DA must record an adjacency ruling.",
      spaces: null,
      ...common,
    };
  if (
    !Number.isFinite(actorElevation) ||
    !Number.isFinite(targetElevation) ||
    Math.abs(actorElevation - targetElevation) > GEOMETRY_EPSILON
  )
    return {
      status: "unverified",
      adjacent: null,
      reason:
        "The tokens have different elevations. The DA must record an adjacency ruling.",
      spaces: null,
      ...common,
    };
  if (!Number.isFinite(spaces) || spaces < 0)
    return {
      status: "unverified",
      adjacent: null,
      reason:
        "Native square-grid distance cannot be evaluated. The DA must record an adjacency ruling.",
      spaces: null,
      ...common,
    };
  if (spaces > 1 + GEOMETRY_EPSILON)
    return {
      status: "not-adjacent",
      adjacent: false,
      reason: "Basic Melee needs a target within one adjacent square.",
      spaces,
      ...common,
    };
  if (accessible !== true)
    return {
      status: "unverified",
      adjacent: null,
      reason:
        "Native squares are adjacent, but the collision backend cannot confirm an open attacker-to-target line. The DA must record an adjacency ruling.",
      spaces,
      ...common,
    };
  return {
    status: "adjacent",
    adjacent: true,
    reason: "",
    spaces,
    ...common,
  };
}

export function basicMeleeRequestMatches(current, frozen) {
  return JSON.stringify(current) === JSON.stringify(frozen);
}
