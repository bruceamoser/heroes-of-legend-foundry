import {
  nativeAdjacencyGeometry,
  nearestAccessibleLine,
} from "../rules/native-adjacency.mjs";

function tokenSource(token) {
  // V14 movement fields on the prepared document can be mid-animation.
  // Adjacency decisions use the persisted source position instead.
  return token?._source ?? token;
}

function tokenLevel(token) {
  const level = tokenSource(token)?.level ?? token?.level;
  return level?.id ?? level?._id ?? level ?? null;
}

function tokenElevation(token) {
  return Number(tokenSource(token)?.elevation ?? token?.elevation ?? 0);
}

function occupiedSquareCenters(token) {
  const source = tokenSource(token),
    offsets = token.getOccupiedGridSpaceOffsets?.({
      x: source.x,
      y: source.y,
      elevation: source.elevation,
      width: source.width,
      height: source.height,
      depth: source.depth,
      shape: source.shape,
      level: source.level,
    });
  if (!Array.isArray(offsets) || !offsets.length)
    throw new Error("Native occupied squares are unavailable.");
  const centers = offsets.map((offset) => {
    const center = canvas.grid.getCenterPoint({
      i: offset.i,
      j: offset.j,
    });
    if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y))
      throw new Error("Native occupied-square centers are unavailable.");
    return {
      x: center.x,
      y: center.y,
      elevation: tokenElevation(token),
    };
  });
  if (!centers.length)
    throw new Error("Native occupied squares are unavailable.");
  return centers;
}

function collisionAccessible(origin, destination) {
  const backend = CONFIG.Canvas.polygonBackends?.move;
  if (typeof backend?.testCollision !== "function") return null;
  try {
    return (
      backend.testCollision(origin, destination, {
        type: "move",
        mode: "any",
      }) === false
    );
  } catch {
    return null;
  }
}

function nearestTokenLine(actorToken, targetToken) {
  const origins = occupiedSquareCenters(actorToken),
    destinations = occupiedSquareCenters(targetToken),
    candidates = [];
  for (const origin of origins)
    for (const destination of destinations) {
      const measurement = canvas.grid.measurePath([origin, destination]),
        spaces = measurement?.spaces;
      if (Number.isFinite(spaces) && spaces >= 0)
        candidates.push({ spaces, origin, destination });
    }
  return nearestAccessibleLine(candidates, collisionAccessible);
}

function resultFor(
  actorToken,
  targetToken,
  {
    spaces = null,
    accessible = null,
    unavailableReason = null,
  } = {},
) {
  return nativeAdjacencyGeometry({
    actorTokenUuid: actorToken.uuid,
    targetTokenUuid: targetToken.uuid,
    sceneUuid: actorToken.parent?.uuid ?? null,
    spaces,
    accessible,
    actorLevel: tokenLevel(actorToken),
    targetLevel: tokenLevel(targetToken),
    actorElevation: tokenElevation(actorToken),
    targetElevation: tokenElevation(targetToken),
    collision:
      accessible === true
        ? "clear"
        : accessible === false
          ? "blocked"
          : "unverified",
    unavailableReason,
  });
}

/**
 * Measure adjacent native token geometry using occupied grid squares.
 * Non-square grids, missing offsets or an inactive matching Canvas are
 * deliberately unavailable instead of falling back to pixel distance.
 */
export function nativeTokenAdjacency(actorToken, targetToken) {
  if (
    actorToken?.documentName !== "Token" ||
    targetToken?.documentName !== "Token"
  )
    throw new Error("Native adjacency needs exact Actor and target tokens.");
  if (
    actorToken.parent?.uuid !== targetToken.parent?.uuid ||
    !actorToken.parent
  )
    return resultFor(actorToken, targetToken, {
      unavailableReason:
        "The tokens are not on the same Scene. The DA must record an adjacency ruling.",
    });
  if (
    !canvas?.ready ||
    canvas.scene?.uuid !== actorToken.parent.uuid ||
    typeof canvas.grid?.measurePath !== "function"
  )
    return resultFor(actorToken, targetToken, {
      unavailableReason:
        "Native adjacency is unavailable on the active Canvas. The DA must record an adjacency ruling.",
    });
  const squareGrid =
      canvas.grid?.isSquare === true ||
      actorToken.parent.grid?.type === CONST.GRID_TYPES.SQUARE,
    actorLevel = tokenLevel(actorToken),
    targetLevel = tokenLevel(targetToken),
    activeLevel = canvas.level?.id ?? null,
    actorElevation = tokenElevation(actorToken),
    targetElevation = tokenElevation(targetToken);
  if (!squareGrid)
    return resultFor(actorToken, targetToken, {
      unavailableReason:
        "Native adjacency requires a square grid. The DA must record an adjacency ruling.",
    });
  if (
    (actorLevel == null) !== (targetLevel == null) ||
    (actorLevel != null && actorLevel !== targetLevel)
  )
    return resultFor(actorToken, targetToken);
  if (activeLevel && actorLevel && activeLevel !== actorLevel)
    return resultFor(actorToken, targetToken, {
      unavailableReason:
        "The active Canvas level does not match the acting token. The DA must record an adjacency ruling.",
    });
  if (
    !Number.isFinite(actorElevation) ||
    !Number.isFinite(targetElevation) ||
    Math.abs(actorElevation - targetElevation) > 0.0001
  )
    return resultFor(actorToken, targetToken);
  try {
    const line = nearestTokenLine(actorToken, targetToken);
    return resultFor(actorToken, targetToken, {
      spaces: line.spaces,
      accessible: line.accessible,
    });
  } catch (error) {
    return resultFor(actorToken, targetToken, {
      unavailableReason: `${error.message} The DA must record an adjacency ruling.`,
    });
  }
}
