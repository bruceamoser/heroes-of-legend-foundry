/**
 * Pure square-grid movement plans for the native movement adapter.
 *
 * Paths include their starting square and contain only consecutive orthogonal
 * or diagonal steps. Each square fact is serializable adapter evidence:
 * `{x, y, terrain: "normal"|"difficult", occupant: "none"|"standing"|"prone",
 * access: "walk"|"climb"|"swim", footprintLegal, supported, routeLegal}`.
 * Barriers are explicit edges shaped `{from: {x, y}, to: {x, y}}`. The adapter
 * owns those geometry, footprint, support and route judgments; this module
 * never infers them.
 */
export const MOVEMENT_RULES_SOURCE = Object.freeze({
  commit: "64089a1c8961d7faff172f179448a8b6e57827ef",
  paths: Object.freeze([
    "design/rules/foundations.md",
    "design/rules/session-resolution.md",
    "design/player-book/manuscript/06-playing.md",
    "design/player-book/manuscript/07-adventure.md",
  ]),
});

const integer = (value, label, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${label} must be a safe integer of at least ${minimum}.`);
  return value;
};

const point = (value, label) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Number.isSafeInteger(value.x) ||
    !Number.isSafeInteger(value.y)
  )
    throw new Error(`${label} must contain integer x and y coordinates.`);
  return { x: value.x, y: value.y };
};

const key = ({ x, y }) => `${x},${y}`;
const adjacent = (a, b) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
const edgeKey = (a, b) => [key(a), key(b)].sort().join("|");

const cloneCoordinates = (points) => points.map(({ x, y }) => ({ x, y }));

function readPath(value, label, minimumLength = 2) {
  if (!Array.isArray(value) || value.length < minimumLength)
    throw new Error(`${label} must contain at least ${minimumLength} squares.`);
  const result = value.map((entry, index) =>
    point(entry, `${label}[${index}]`),
  );
  for (let index = 1; index < result.length; index++)
    if (!adjacent(result[index - 1], result[index]))
      throw new Error(`${label} must be consecutive.`);
  return result;
}

function readSquares(value) {
  if (!Array.isArray(value) || !value.length)
    throw new Error("Square facts must be a nonempty array.");
  const result = new Map();
  for (const [index, raw] of value.entries()) {
    const square = point(raw, `Square fact ${index}`);
    if (result.has(key(square))) throw new Error("Duplicate square fact.");
    if (!["normal", "difficult"].includes(raw.terrain))
      throw new Error("Square terrain must be normal or difficult.");
    if (!["none", "standing", "prone"].includes(raw.occupant))
      throw new Error("Square occupant must be none, standing or prone.");
    if (!["walk", "climb", "swim"].includes(raw.access))
      throw new Error("Square access must be walk, climb or swim.");
    for (const field of ["footprintLegal", "supported", "routeLegal"])
      if (typeof raw[field] !== "boolean")
        throw new Error(`Square ${field} must be boolean.`);
    result.set(key(square), { ...square, ...raw, x: square.x, y: square.y });
  }
  return result;
}

function requireSquares(squares, points) {
  return points.map((entry, index) => {
    const square = squares.get(key(entry));
    if (!square) throw new Error(`Missing square fact at path index ${index}.`);
    return square;
  });
}

function readBarriers(value) {
  if (!Array.isArray(value)) throw new Error("Barriers must be an array.");
  const result = new Set();
  for (const [index, barrier] of value.entries()) {
    if (!barrier || typeof barrier !== "object" || Array.isArray(barrier))
      throw new Error(`Barrier ${index} must identify two square edges.`);
    const from = point(barrier.from, `Barrier ${index} source`),
      to = point(barrier.to, `Barrier ${index} destination`);
    if (!adjacent(from, to))
      throw new Error(`Barrier ${index} must join consecutive squares.`);
    result.add(edgeKey(from, to));
  }
  return result;
}

function assertOpenEdge(barriers, from, to) {
  if (barriers.has(edgeKey(from, to)))
    throw new Error("Movement path crosses a wall or barrier.");
}

function readApproach(value, takeoff) {
  if (!Array.isArray(value) || value.length > 2)
    throw new Error("Jump approach must contain at most two squares.");
  const approach = value.map((entry, index) =>
    point(entry, `Approach[${index}]`),
  );
  for (const [index, square] of approach.entries()) {
    if (index && !adjacent(approach[index - 1], square))
      throw new Error("Jump approach must be consecutive.");
  }
  if (approach.length && !adjacent(approach.at(-1), takeoff))
    throw new Error("Jump approach must end adjacent to takeoff.");
  return approach;
}

function ordinaryCost(square) {
  if (square.occupant === "standing")
    throw new Error("Standing occupied squares cannot be traversed.");
  return square.terrain === "difficult" ||
    square.occupant === "prone" ||
    square.access !== "walk"
    ? 2
    : 1;
}

function validateOrdinarySquares(
  squares,
  path,
  barriers,
  enforceEndpoint = true,
) {
  const facts = requireSquares(squares, path);
  for (const [index, square] of facts.entries()) {
    if (!square.footprintLegal)
      throw new Error(`Square ${index} cannot hold the mover's footprint.`);
    if (!square.supported)
      throw new Error(`Movement path at square ${index} is unsupported.`);
    if (!square.routeLegal)
      throw new Error(`Movement route at square ${index} is implausible.`);
    if (index) assertOpenEdge(barriers, path[index - 1], path[index]);
    if (
      enforceEndpoint &&
      index === path.length - 1 &&
      square.occupant === "prone"
    )
      throw new Error("A prone occupied square cannot be an endpoint.");
    if (index) ordinaryCost(square);
  }
  return facts;
}

function movementInteger(value) {
  return integer(value, "Movement", 0);
}

function addSafe(a, b) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("Movement overflow.");
  return result;
}

function planPath({ movement, path: rawPath, squares: rawSquares, barriers }) {
  const movementAvailable = movementInteger(movement),
    path = readPath(rawPath, "Movement path"),
    squares = readSquares(rawSquares),
    blockedEdges = readBarriers(barriers),
    facts = validateOrdinarySquares(squares, path, blockedEdges),
    steps = [];
  let spent = 0;
  for (let index = 1; index < path.length; index++) {
    const cost = ordinaryCost(facts[index]);
    spent = addSafe(spent, cost);
    steps.push({ to: { ...path[index] }, cost });
  }
  if (spent > movementAvailable)
    throw new Error("Insufficient movement for the complete path.");
  return {
    path: cloneCoordinates(path),
    steps,
    spent,
    remaining: movementAvailable - spent,
  };
}

/** Plan one complete ordinary path, including its starting square. */
export function planOrdinaryMovement({
  movement,
  path,
  squares,
  barriers = [],
}) {
  return {
    kind: "ordinary",
    ...planPath({ movement, path, squares, barriers }),
  };
}

/** Standing is a movement action, not square traversal. */
export function planStanding({ movement }) {
  const movementAvailable = movementInteger(movement);
  if (movementAvailable < 2) throw new Error("Insufficient movement to stand.");
  return {
    kind: "stand",
    spent: 2,
    remaining: movementAvailable - 2,
  };
}

function jumpMaximum(agility, kind, running) {
  integer(agility, "Agility", Number.MIN_SAFE_INTEGER);
  if (kind === "high") {
    const maximum = Math.max(0, addSafe(1, Math.floor(agility / 2)));
    return integer(maximum, "High jump maximum", 0);
  }
  const maximum = Math.max(1, addSafe(2, agility));
  return running ? maximum : Math.max(1, Math.floor(maximum / 2));
}

/** Approved broad/high-jump reach calculation for explicit approach state. */
export function calculateJumpReach({ agility, running }) {
  if (typeof running !== "boolean")
    throw new Error("Running approach state must be boolean.");
  return {
    broad: jumpMaximum(agility, "broad", running),
    high: jumpMaximum(agility, "high", false),
  };
}

/**
 * Validate a high jump against its approved reach. `height` is explicit
 * vertical height supplied by the caller, not derived from a horizontal jump path.
 * Native vertical geometry and cross-level trajectory remain outside this
 * calculation.
 */
export function validateHighJumpHeight({ agility, height }) {
  if (typeof height !== "number" || !Number.isFinite(height) || height < 0)
    throw new Error("High jump height must be a nonnegative finite number.");
  const maximum = jumpMaximum(agility, "high", false);
  if (height > maximum)
    throw new Error("High jump height exceeds the approved maximum.");
  return { height, maxHeight: maximum };
}

/**
 * Plan a broad horizontal jump on the scene's two-dimensional square grid.
 * `approach` holds at most two squares already traversed. Running reach applies
 * only when it contains two consecutive squares immediately before
 * takeoff, so its final square must be adjacent to takeoff. Those squares are
 * not part of this plan's movement cost. Jump distance costs one movement per
 * square flown; terrain does not add a traversal category in flight. Every path
 * square's footprint and route facts must remain legal, while intermediate
 * support is not required. High jumps use `validateHighJumpHeight` instead.
 */
export function planJump({
  movement,
  agility,
  kind = "broad",
  path,
  approach = [],
  squares,
  barriers = [],
  adjudication,
}) {
  const movementAvailable = movementInteger(movement);
  if (kind !== "broad")
    throw new Error(
      "planJump plans broad horizontal jumps only; validate high jump height separately.",
    );
  if (!["safe", "uncertain"].includes(adjudication))
    throw new Error("Jump adjudication must be safe or uncertain.");
  const jumpPath = readPath(path, "Jump path"),
    approachPath = readApproach(approach, jumpPath[0]),
    squareFacts = readSquares(squares),
    blockedEdges = readBarriers(barriers);
  if (approachPath.length) {
    validateOrdinarySquares(squareFacts, approachPath, blockedEdges, false);
    assertOpenEdge(blockedEdges, approachPath.at(-1), jumpPath[0]);
  }
  const facts = requireSquares(squareFacts, jumpPath);
  for (const [index, square] of facts.entries()) {
    if (!square.footprintLegal)
      throw new Error(`Jump path at square ${index} has an illegal footprint.`);
    if (!square.routeLegal)
      throw new Error(`Jump route at square ${index} is implausible.`);
    if (index)
      assertOpenEdge(blockedEdges, jumpPath[index - 1], jumpPath[index]);
  }
  for (const [label, index] of [
    ["takeoff", 0],
    ["landing", jumpPath.length - 1],
  ]) {
    if (!facts[index].supported)
      throw new Error(`Jump ${label} square must be supported.`);
  }
  if (facts.at(-1).occupant !== "none")
    throw new Error("Jump landing square must be free.");

  const running = approachPath.length === 2,
    reach = calculateJumpReach({ agility, running }),
    maximum = reach.broad,
    distance = jumpPath.length - 1;
  if (distance > maximum)
    throw new Error("Jump distance exceeds the approved maximum.");
  if (distance > movementAvailable)
    throw new Error("Insufficient movement for the complete jump.");

  return {
    kind: "jump",
    jumpType: "broad",
    agility,
    maxDistance: maximum,
    approach: cloneCoordinates(approachPath),
    path: cloneCoordinates(jumpPath),
    distance,
    spent: distance,
    remaining: movementAvailable - distance,
    resolution:
      adjudication === "safe"
        ? { kind: "safe" }
        : { kind: "uncertain", requiresAdjudication: true },
  };
}

/** Physical falling damage before the existing damage-plan resistance step. */
export function planFalling({ squares }) {
  if (typeof squares !== "number" || !Number.isFinite(squares) || squares < 0)
    throw new Error("Falling distance must be a nonnegative finite number.");
  const completePairs = Math.floor(squares / 2);
  if (!Number.isSafeInteger(completePairs))
    throw new Error("Falling distance arithmetic is unsafe.");
  const damage = 3 * completePairs;
  if (!Number.isSafeInteger(damage))
    throw new Error("Falling distance arithmetic is unsafe.");
  return {
    kind: "falling",
    squares,
    completePairs,
    damageType: "physical",
    damage,
  };
}
