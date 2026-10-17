import { actorContributions } from "./conditions.mjs";
import { conditionActionRestrictions } from "../rules/conditions.mjs";
import {
  ACTION_CATEGORIES,
  startTurn,
  convertAction,
  movementRemaining,
} from "../rules/actions.mjs";
import { movementProfile } from "../rules/movement-budget.mjs";
const ID = "heroes-of-legend";
export function actionConditions(actor) {
  const conditions = conditionActionRestrictions(actorContributions(actor));
  if (actor.system.health?.value === 0) conditions.unconscious = true;
  return conditions;
}
export function actorMovement(actor) {
  const speedBase = actor.getFlag(ID, "development")?.creationSummary
    ?.speedBase;
  return movementProfile({
    speedBase,
    agility: actor.system.attributes?.agility?.effective,
    brawn: actor.system.attributes?.brawn?.effective,
    items: actor.items
      .filter((i) => i.type === "equipment")
      .map((i) => i.system),
  });
}
export function initialBudgets(combat, roster) {
  return Object.fromEntries(
    roster.map((p) => [
      p.id,
      startTurn({
        turnId: `${combat.id}_initial_${p.id}`,
        speed: 0,
        independentReaction:
          combat.combatants.get(p.id)?.actor?.type !== "summon",
      }),
    ]),
  );
}
export function prepareParticipantBudget(combat, state, id, request, user) {
  const actor = combat.combatants.get(id)?.actor;
  if (!actor)
    throw new Error("This participant needs an Actor before taking a turn.");
  let speed,
    profile,
    ruling = state.speedRulings?.[id];
  if (request.speedOverride !== undefined) {
    if (
      !user.isGM ||
      !Number.isSafeInteger(request.speedOverride) ||
      request.speedOverride < 0 ||
      typeof request.reason !== "string" ||
      !request.reason.trim()
    )
      throw new Error("A speed ruling needs the actual DA and a reason.");
    ruling = {
      speed: request.speedOverride,
      reason: request.reason.trim(),
      userId: user.id,
    };
  }
  if (ruling) speed = ruling.speed;
  else {
    profile = actorMovement(actor);
    speed = profile.speed;
  }
  const conditions = actionConditions(actor),
    restriction = Math.min(3, Math.max(conditions.dazed, conditions.grappled));
  const retained =
    request.retained ??
    (restriction === 0 ? ACTION_CATEGORIES : restriction === 3 ? [] : null);
  const budget = startTurn({
    turnId: `${combat.id}_${state.serial}`,
    speed,
    conditions,
    retained,
    independentReaction: actor.type !== "summon",
  });
  return { budget, profile, ruling };
}
export function convertParticipantBudget(
  combat,
  state,
  request,
  user,
  operationId,
) {
  const id = request.id ?? state.current,
    actor = combat.combatants.get(id)?.actor,
    budget = state.budgets?.[id];
  if (!actor || !budget)
    throw new Error("This participant has no active encounter budget.");
  let override;
  if (request.overrideReason !== undefined) {
    if (!user.isGM)
      throw new Error("Only the DA can adjudicate a budget exception.");
    override = { userId: user.id, reason: request.overrideReason };
  }
  const next = structuredClone(state);
  next.budgets[id] = convertAction(budget, {
    operationId,
    from: request.from,
    to: request.to,
    ownTurn: state.current === id,
    conditions: actionConditions(actor),
    override,
  });
  next.revision++;
  next.history.push({
    kind: "conversion",
    id,
    from: request.from,
    to: request.to,
    round: state.round,
    serial: state.serial,
    operationId,
  });
  return next;
}
export function displayedBudget(combat, id) {
  const budget = combat.getFlag(ID, "encounter")?.budgets?.[id],
    actor = combat.combatants.get(id)?.actor;
  if (!budget || !actor) return null;
  return {
    ...budget,
    movementRemaining: movementRemaining(budget, actionConditions(actor)),
  };
}
