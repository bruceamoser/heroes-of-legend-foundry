const GEOMETRY_EPSILON = 0.0001;

/**
 * Choose a clear line at the nearest occupied-square distance. Collision
 * evidence only breaks ties; it never makes a farther line count as adjacent.
 */
export function nearestAccessibleLine(candidates, collisionFor) {
  if (!Array.isArray(candidates) || !candidates.length)
    throw new Error("Native adjacency needs occupied-square line candidates.");
  if (typeof collisionFor !== "function")
    throw new Error("Native adjacency needs a collision evaluator.");
  const valid = candidates.filter(
    (candidate) =>
      Number.isFinite(candidate?.spaces) && candidate.spaces >= 0,
  );
  if (!valid.length)
    throw new Error("Native square-grid distance is unavailable.");
  const nearest = Math.min(...valid.map((candidate) => candidate.spaces)),
    tied = valid.filter(
      (candidate) =>
        Math.abs(candidate.spaces - nearest) <= GEOMETRY_EPSILON,
    );
  let fallback = null;
  for (const candidate of tied) {
    const accessible = collisionFor(
      candidate.origin,
      candidate.destination,
    );
    if (accessible === true) return { ...candidate, accessible };
    fallback ??= { ...candidate, accessible };
  }
  return fallback;
}

/**
 * Convert native evidence into an explicit adjacency result. Same-level
 * elevation equality is the only vertical case this bounded helper decides.
 */
export function nativeAdjacencyGeometry({
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
  unavailableReason = null,
}) {
  if (
    typeof actorTokenUuid !== "string" ||
    typeof targetTokenUuid !== "string" ||
    actorTokenUuid === targetTokenUuid
  )
    throw new Error("Native adjacency needs two different tokens.");
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
  const unverified = (reason) => ({
    status: "unverified",
    known: false,
    adjacent: null,
    distance: null,
    spaces: null,
    reason,
    ...common,
  });
  if (unavailableReason)
    return unverified(unavailableReason);
  if (
    (actorLevel == null) !== (targetLevel == null) ||
    (actorLevel != null && actorLevel !== targetLevel)
  )
    return unverified(
      "The tokens are on different scene levels. The DA must record an adjacency ruling.",
    );
  if (
    !Number.isFinite(actorElevation) ||
    !Number.isFinite(targetElevation) ||
    Math.abs(actorElevation - targetElevation) > GEOMETRY_EPSILON
  )
    return unverified(
      "The tokens have different elevations. The DA must record an adjacency ruling.",
    );
  if (!Number.isFinite(spaces) || spaces < 0)
    return unverified(
      "Native square-grid distance cannot be evaluated. The DA must record an adjacency ruling.",
    );
  if (spaces <= 0)
    return {
      status: "not-adjacent",
      known: true,
      adjacent: false,
      distance: spaces,
      spaces,
      reason: "The tokens must occupy different squares to be adjacent.",
      ...common,
    };
  if (spaces > 1 + GEOMETRY_EPSILON)
    return {
      status: "not-adjacent",
      known: true,
      adjacent: false,
      distance: spaces,
      spaces,
      reason: "The target is beyond one adjacent square.",
      ...common,
    };
  if (accessible !== true)
    return unverified(
      "Native squares are adjacent, but the collision backend cannot confirm an open line. The DA must record an adjacency ruling.",
    );
  return {
    status: "adjacent",
    known: true,
    adjacent: true,
    distance: spaces,
    spaces,
    reason: "",
    ...common,
  };
}
