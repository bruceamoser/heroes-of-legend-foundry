/** Deterministic plans only. The coordinator must persist a plan and its receipt together. */
import { upfrontHpCost } from "./damage.mjs";
export const ACTION_CATEGORIES = Object.freeze([
  "main",
  "maneuver",
  "reaction",
]);
const int = (n, label) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`${label} must be a nonnegative safe integer.`);
  return n;
};
const bool = (value, label) => {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
};
const identity = (id) => {
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
    ["__proto__", "constructor", "prototype"].includes(id)
  )
    throw new Error("Invalid operation identity.");
  return id;
};
const helpless = (conditions) =>
  ["paralyzed", "asleep", "unconscious", "petrified"].some((k) =>
    Boolean(conditions[k]),
  );
function validateConditions(conditions) {
  for (const [key, value] of Object.entries(conditions)) {
    if (
      ![
        "dazed",
        "grappled",
        "slowed",
        "paralyzed",
        "asleep",
        "unconscious",
        "petrified",
      ].includes(key)
    )
      throw new Error(`Unknown action restriction: ${key}`);
    if (["unconscious", "petrified"].includes(key)) {
      if (typeof value !== "boolean")
        throw new Error(`${key} must be boolean.`);
    } else int(value, key);
  }
}
export function startTurn({
  turnId,
  speed,
  conditions = {},
  retained = ACTION_CATEGORIES,
  independentReaction = true,
}) {
  identity(turnId);
  int(speed, "Speed");
  validateConditions(conditions);
  if (typeof independentReaction !== "boolean")
    throw new Error("Invalid Reaction permission.");
  const restriction = Math.min(
    3,
    Math.max(conditions.dazed ?? 0, conditions.grappled ?? 0),
  );
  if (
    !Array.isArray(retained) ||
    new Set(retained).size !== retained.length ||
    retained.some((c) => !ACTION_CATEGORIES.includes(c)) ||
    retained.length !== 3 - restriction
  )
    throw new Error(
      `Choose exactly ${3 - restriction} distinct action categories.`,
    );
  return {
    turnId,
    speed,
    retained: [...retained],
    restriction,
    remaining: Object.fromEntries(
      ACTION_CATEGORIES.map((c) => [
        c,
        Number(
          retained.includes(c) && (c !== "reaction" || independentReaction),
        ),
      ]),
    ),
    movementAllowances: 1,
    movementSpent: 0,
    operations: {},
  };
}
function validateTurn(state) {
  identity(state.turnId);
  int(state.restriction, "Action restriction");
  if (state.restriction > 3 || state.retained?.length !== 3 - state.restriction)
    throw new Error("Invalid category selection.");
  int(state.speed, "Speed");
  int(state.movementAllowances, "Movement allowances");
  int(state.movementSpent, "Movement spent");
  if (
    !Array.isArray(state.retained) ||
    new Set(state.retained).size !== state.retained.length ||
    state.retained.some((c) => !ACTION_CATEGORIES.includes(c))
  )
    throw new Error("Invalid retained categories.");
  for (const c of ACTION_CATEGORIES) int(state.remaining[c], `${c} remaining`);
  if (
    !state.operations ||
    typeof state.operations !== "object" ||
    Array.isArray(state.operations)
  )
    throw new Error("Invalid operation ledger.");
}
function replay(state, id, signature) {
  validateTurn(state);
  identity(id);
  if (!Object.hasOwn(state.operations, id)) return false;
  if (state.operations[id].signature !== signature)
    throw new Error("Operation ID already belongs to different choices.");
  return true;
}
function adjudication(reasons, override) {
  if (!reasons.length) return null;
  if (
    !override ||
    typeof override.userId !== "string" ||
    !override.userId
  )
    throw new Error(reasons.join(" "));
  // This is an audit plan, not authorization. A document service must verify this is the actual DA.
  return {
    userId: override.userId,
    reason: typeof override.reason === "string" ? override.reason.trim() : "",
    choice: "budget-override",
    exceptions: reasons,
  };
}
function actionGuidance(reasons, override) {
  return reasons.length ? {
    choice: "action-guidance", exceptions: reasons,
    ...(override?.userId ? { userId: override.userId, reason: typeof override.reason === "string" ? override.reason.trim() : "" } : {}),
  } : null;
}
export function movementRemaining(state, conditions = {}) {
  validateTurn(state);
  validateConditions(conditions);
  const speed = Math.max(0, state.speed - (conditions.slowed ?? 0));
  const allowance = int(speed * state.movementAllowances, "Movement allowance");
  return helpless(conditions) || conditions.grappled > 0
    ? 0
    : Math.max(0, allowance - state.movementSpent);
}
export function convertAction(
  state,
  { operationId, from, to, conditions = {}, ownTurn = true, override },
) {
  if (
    !(
      (from === "main" && to === "maneuver") ||
      (from === "maneuver" && to === "movement")
    )
  )
    throw new Error(
      "Conversion is only Main to Maneuver or Maneuver to movement.",
    );
  validateConditions(conditions);
  bool(ownTurn, "Own turn");
  const signature = JSON.stringify({ kind: "convert", from, to });
  if (replay(state, operationId, signature)) return structuredClone(state);
  const reasons = [];
  if (!ownTurn) reasons.push("Conversion requires your turn.");
  if (helpless(conditions))
    reasons.push("The current condition prevents actions.");
  if (state.remaining[from] < 1) reasons.push(`No ${from} remains.`);
  if (to !== "movement" && !state.retained.includes(to))
    reasons.push(
      "The destination category was not retained.",
    );
  const funded = state.remaining[from] > 0,
    audit = actionGuidance(reasons, override),
    next = structuredClone(state);
  next.remaining[from] = Math.max(0, next.remaining[from] - 1);
  if (funded && to === "movement")
    next.movementAllowances = int(
      next.movementAllowances + 1,
      "Movement allowances",
    );
  else if (funded) next.remaining[to] = int(next.remaining[to] + 1, "Action allowance");
  next.operations[operationId] = { signature, status: "complete", audit, trackedCost: { category: from, availableBefore: state.remaining[from], spent: funded ? 1 : 0 } };
  return next;
}
export function spendMovement(
  state,
  { operationId, amount, conditions = {}, ownTurn = true, override },
) {
  int(amount, "Movement cost");
  bool(ownTurn, "Own turn");
  const available = movementRemaining(state, conditions),
    signature = JSON.stringify({ kind: "movement", amount });
  if (replay(state, operationId, signature)) return structuredClone(state);
  const reasons = [];
  if (!ownTurn) reasons.push("Ordinary movement requires your turn.");
  if (amount > available)
    reasons.push("Movement cost exceeds the current allowance.");
  const audit = adjudication(reasons, override),
    next = structuredClone(state);
  next.movementSpent = int(next.movementSpent + amount, "Movement spent");
  next.operations[operationId] = { signature, status: "complete", audit };
  return next;
}
export function declareAction(
  state,
  {
    operationId,
    sourceId,
    category,
    conditions = {},
    ownTurn = true,
    freeAttack = false,
    triggeredByFreeAttack = false,
    override,
  },
) {
  identity(sourceId);
  bool(ownTurn, "Own turn");
  bool(freeAttack, "Free attack");
  bool(triggeredByFreeAttack, "Free attack trigger");
  validateConditions(conditions);
  if (![...ACTION_CATEGORIES, "defense", "free"].includes(category))
    throw new Error("Unknown action category.");
  if (freeAttack && (category !== "free" || triggeredByFreeAttack))
    throw new Error(
      "A free attack must be explicitly granted and cannot trigger another free attack.",
    );
  const signature = JSON.stringify({
    kind: "action",
    sourceId,
    category,
    freeAttack,
  });
  if (replay(state, operationId, signature)) return structuredClone(state);
  const reasons = [];
  // Even helpless creatures can be the subject of a defense roll; its Banes are separate.
  if (category !== "defense") {
    if (helpless(conditions))
      reasons.push("The current condition prevents actions.");
    if (["main", "maneuver"].includes(category) && !ownTurn)
      reasons.push("This action requires your turn.");
    if (ACTION_CATEGORIES.includes(category) && state.remaining[category] < 1)
      reasons.push(`No ${category} remains.`);
  }
  const audit = actionGuidance(reasons, override),
    next = structuredClone(state);
  if (ACTION_CATEGORIES.includes(category))
    next.remaining[category] = Math.max(0, next.remaining[category] - 1);
  next.operations[operationId] = {
    signature,
    status: "declared",
    sourceId,
    category,
    audit,
    trackedCost: ACTION_CATEGORIES.includes(category) ? {
      category, availableBefore: state.remaining[category],
      spent: state.remaining[category] > 0 ? 1 : 0,
    } : null,
  };
  return next;
}
function costPlan(costs) {
  const hp = int(costs.hp ?? 0, "HP cost"),
    items = {};
  for (const item of costs.items ?? []) {
    identity(item.id);
    int(item.quantity, "Item cost");
    items[item.id] = int(
      (items[item.id] ?? 0) + item.quantity,
      "Combined item cost",
    );
  }
  return {
    hp,
    items: Object.entries(items)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, quantity]) => ({ id, quantity })),
  };
}
export function continueAction(
  state,
  resources,
  { operationId, capable, costs = {} },
) {
  validateTurn(state);
  identity(operationId);
  if (typeof capable !== "boolean")
    throw new Error("Capability must be explicit after interruption.");
  const operation =
    Object.hasOwn(state.operations, operationId) &&
    state.operations[operationId];
  if (
    !operation ||
    !["declared", "resolving", "interrupted"].includes(operation.status)
  )
    throw new Error("No matching declared action.");
  const plan = costPlan(costs),
    signature = JSON.stringify(plan);
  if (operation.costSignature && operation.costSignature !== signature)
    throw new Error("Printed costs changed; do not reuse this operation.");
  if (operation.status !== "declared")
    return {
      state: structuredClone(state),
      resources: structuredClone(resources),
      replay: true,
      proceed: operation.status === "resolving",
    };
  int(resources.hp, "Payer HP");
  const next = structuredClone(state),
    paid = structuredClone(resources);
  next.operations[operationId].costSignature = signature;
  if (!capable) {
    next.operations[operationId].status = "interrupted";
    return { state: next, resources: paid, replay: false, proceed: false };
  }
  if (plan.hp) {
    const payment = upfrontHpCost(resources.hp, plan.hp);
    if (!payment.allowed)
      throw new Error("The HP payer must remain above zero.");
    paid.hp = payment.after;
  }
  for (const item of plan.items) {
    const quantity = Object.hasOwn(resources.items ?? {}, item.id)
      ? resources.items[item.id]
      : 0;
    int(quantity, "Available item quantity");
    if (quantity < item.quantity)
      throw new Error(`Insufficient quantity of ${item.id}.`);
    paid.items ??= {};
    paid.items[item.id] = quantity - item.quantity;
  }
  next.operations[operationId].status = "resolving";
  next.operations[operationId].paid = plan;
  return { state: next, resources: paid, replay: false, proceed: true };
}
export function attackPerspective(control) {
  if (!["player", "npc"].includes(control))
    throw new Error("Explicit attacker control is required.");
  return control === "player" ? "attacker" : "defender";
}
export function outcomeTier(
  rollTier,
  rollPerspective,
  tableOrientation = "attacker",
) {
  if (
    !["weak", "standard", "strong"].includes(rollTier) ||
    !["attacker", "defender"].includes(rollPerspective) ||
    !["attacker", "defender"].includes(tableOrientation)
  )
    throw new Error("Invalid outcome perspective.");
  return rollPerspective === tableOrientation
    ? rollTier
    : { weak: "strong", standard: "standard", strong: "weak" }[rollTier];
}
export function basicMeleeOutcome({ tier, control }) {
  const perspective = attackPerspective(control),
    appliedTier = outcomeTier(tier, perspective);
  return {
    perspective,
    appliedTier,
    components: [
      {
        type: "physical",
        amount: { weak: 2, standard: 3, strong: 5 }[appliedTier],
      },
    ],
  };
}
