import { classifyRoll } from "./roll.mjs";
const states = ["active", "dying", "stable", "lastWords", "dead"];
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a nonnegative whole number.`);
  return value;
}
export function validateSurvival(state) {
  if (!state || !states.includes(state.status))
    throw new Error("Unknown survival state.");
  for (const key of [
    "hp",
    "maxHp",
    "marks",
    "wounds",
    "gritAvailable",
    "ownTurn",
  ])
    integer(state[key], key);
  if (!state.maxHp || state.hp > state.maxHp || state.marks > 3)
    throw new Error("Invalid HP or death marks.");
  if ((state.status === "active") !== state.hp > 0)
    throw new Error("Survival status and HP disagree.");
  if (["active", "stable"].includes(state.status) && state.marks)
    throw new Error("Active and stabilized characters have no death marks.");
  if (state.status === "dying" && state.marks >= 3)
    throw new Error("Three death marks cause Last Words.");
  if (state.due !== null && state.due !== state.ownTurn)
    throw new Error("Invalid due survival turn.");
  if (state.status === "lastWords") {
    integer(state.lastWordsAt, "Last Words turn");
    integer(state.lastWordsEnds, "Last Words deadline");
    if (
      state.lastWordsEnds !== state.lastWordsAt + 2 ||
      state.lastWordsAt > state.ownTurn
    )
      throw new Error("Invalid Last Words deadline.");
  }
  if (
    state.choice &&
    (!["grit", "roll"].includes(state.choice.kind) ||
      !Number.isSafeInteger(state.choice.turn) ||
      state.choice.turn < 0 ||
      state.choice.turn > state.ownTurn ||
      typeof state.choice.resolved !== "boolean")
  )
    throw new Error("Invalid locked survival choice.");
  return state;
}
function copy(state) {
  validateSurvival(state);
  return structuredClone(state);
}
export function survivalState({
  hp,
  maxHp,
  wounds = 0,
  gritAvailable = 0,
  status = hp > 0 ? "active" : "dying",
  marks = 0,
  ownTurn = 0,
}) {
  return validateSurvival({
    hp,
    maxHp,
    wounds,
    gritAvailable,
    status,
    marks,
    ownTurn,
    choice: null,
    due: null,
  });
}
function lastWords(state) {
  state.due = null;
  state.status = "lastWords";
  state.hp = 0;
  state.lastWordsAt = state.ownTurn;
  state.lastWordsEnds = integer(state.ownTurn + 2, "Last Words deadline");
  return state;
}
export function enterLastWords(state) {
  const next = copy(state);
  if (next.status === "dead" || next.status === "lastWords") return next;
  return lastWords(next);
}
/** Pass one already-reduced damage event; service receipts prevent repeating events. */
export function sufferDamage(state, amount) {
  const next = copy(state);
  integer(amount, "Damage");
  let wound = false;
  if (!amount || ["lastWords", "dead"].includes(next.status))
    return { state: next, wound };
  if (next.status === "dying") next.marks++;
  else if (next.status === "stable") {
    next.status = "dying";
    next.marks = 1;
    next.wounds++;
    wound = true;
  } else {
    next.hp = Math.max(0, next.hp - amount);
    if (!next.hp) {
      next.status = "dying";
      next.marks = 0;
      next.wounds++;
      wound = true;
    }
  }
  if (next.marks >= 3) lastWords(next);
  return { state: validateSurvival(next), wound };
}
export function stabilize(state) {
  const next = copy(state);
  if (["lastWords", "dead"].includes(next.status))
    throw new Error(
      "Ordinary stabilization cannot reverse Last Words or death.",
    );
  if (next.status === "dying") {
    next.status = "stable";
    next.due = null;
    next.marks = 0;
  }
  return next;
}
export function receiveHealing(state, amount) {
  const next = copy(state);
  integer(amount, "Healing");
  if (["lastWords", "dead"].includes(next.status))
    throw new Error("Ordinary healing cannot reverse Last Words or death.");
  if (amount) {
    next.hp = Math.min(next.maxHp, next.hp + amount);
    next.status = "active";
    next.due = null;
    next.marks = 0;
  }
  return validateSurvival(next);
}
export function safeBreath(state) {
  const next = copy(state);
  if (!["active", "stable"].includes(next.status))
    throw new Error("Resolve Dying before taking a safe breath.");
  next.hp = next.maxHp;
  next.due = null;
  next.status = "active";
  next.marks = 0;
  return next;
}
export function startSurvivalTurn(state, serial) {
  const next = copy(state);
  integer(serial, "Own turn");
  if (serial < next.ownTurn) throw new Error("Cannot rewind survival turns.");
  if (serial === next.ownTurn) return next;
  if (
    next.status === "dying" &&
    next.due === next.ownTurn &&
    (!next.choice || next.choice.turn !== next.ownTurn || !next.choice.resolved)
  )
    throw new Error("Resolve the locked death choice first.");
  if (serial !== next.ownTurn + 1)
    throw new Error("Advance one own turn at a time.");
  next.ownTurn = serial;
  next.due = next.status === "dying" ? serial : null;
  return next;
}
export function chooseSurvival(state, kind) {
  const next = copy(state);
  if (!["grit", "roll"].includes(kind))
    throw new Error("Choose Grit or a death roll.");
  if (next.choice?.turn === next.ownTurn) {
    if (next.choice.kind !== kind)
      throw new Error("The survival choice is locked for this turn.");
    return next;
  }
  if (next.status !== "dying" || next.due !== next.ownTurn)
    throw new Error("Make the Dying choice at the start of your turn.");
  if (kind === "grit" && !next.gritAvailable)
    throw new Error("No Grit remains.");
  next.choice = { turn: next.ownTurn, kind, resolved: false };
  return next;
}
export function resolveSurvival(state, { retained, fortitude } = {}) {
  const next = copy(state);
  if (!next.choice || next.choice.turn !== next.ownTurn)
    throw new Error("Lock the survival choice before resolving it.");
  if (next.choice.resolved) return next;
  if (next.status !== "dying" || next.due !== next.ownTurn)
    throw new Error(
      "The pending choice is no longer due; reconcile it before resolution.",
    );
  if (next.choice.kind === "grit") {
    if (!next.gritAvailable)
      throw new Error("The reserved Grit is no longer available.");
    next.gritAvailable--;
    next.hp = next.maxHp;
    next.marks = 0;
    next.status = "active";
  } else {
    const result = classifyRoll(retained, fortitude);
    if (result.natural === "critical") {
      next.hp = 1;
      next.marks = 0;
      next.status = "active";
    } else if (result.natural === "fumble")
      next.marks = Math.min(3, next.marks + 2);
    else if (result.tier === "weak") next.marks++;
    else if (result.tier === "strong") {
      next.status = "stable";
      next.marks = 0;
    }
    if (next.marks >= 3) lastWords(next);
  }
  next.choice.resolved = true;
  next.due = null;
  return validateSurvival(next);
}
export function endSurvivalTurn(state, serial) {
  const next = copy(state);
  if (serial !== next.ownTurn) throw new Error("End the current own turn.");
  if (
    next.status === "dying" &&
    next.due === serial &&
    (!next.choice || next.choice.turn !== serial || !next.choice.resolved)
  )
    throw new Error("Resolve Dying before ending this turn.");
  if (next.status === "lastWords" && serial >= next.lastWordsEnds)
    next.status = "dead";
  return next;
}
