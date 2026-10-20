import { actorContributions } from "./conditions.mjs";
import { conditionActionRestrictions } from "../rules/conditions.mjs";
import {
  ACTION_CATEGORIES,
  startTurn,
  convertAction,
  declareAction,
  spendMovement,
  movementRemaining,
} from "../rules/actions.mjs";
import {
  movementBreakdown,
  movementProfile,
} from "../rules/movement-budget.mjs";
import { actorWoundContributionPlan } from "./wound-effects.mjs";
const ID = "heroes-of-legend";
export function actionConditions(actor) {
  const conditions = conditionActionRestrictions(actorContributions(actor));
  if (actor.system.health?.value === 0) conditions.unconscious = true;
  return conditions;
}
export function actorMovement(actor) {
  if (actor.type === "creature")
    return { speed: actor.system.speed, source: "printed-creature-speed" };
  const speedBase =
    actor.getFlag(ID, "development")?.creationSummary?.speedBase;
  const wounds = actorWoundContributionPlan(actor).movement;
  return movementProfile({
    speedBase,
    agility: actor.system.attributes?.agility?.effective,
    brawn: actor.system.attributes?.brawn?.effective,
    items: actor.items
      .filter((i) => i.type === "equipment")
      .map((i) => i.system),
    woundPenalty: wounds.penalty,
    woundSources: wounds.sources,
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
      request.speedOverride < 0
    )
      throw new Error("A Speed setting needs the actual DA and a nonnegative integer.");
    ruling = {
      speed: request.speedOverride,
      reason: typeof request.reason === "string" ? request.reason.trim() : "",
      choice: "set-speed",
      userId: user.id,
    };
  }
  if (ruling) {
    profile = {
      source: "da-speed-override",
      speed: ruling.speed,
      reason: ruling.reason,
    };
    speed = ruling.speed;
  } else {
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
    actor = combat.combatants.get(id)?.actor,
    encounter = combat.getFlag(ID, "encounter"),
    movementProfile = encounter?.movementProfiles?.[id] ?? null;
  if (!budget || !actor) return null;
  return {
    ...budget,
    movementRemaining: movementRemaining(budget, actionConditions(actor)),
    movementProfile,
    movementBreakdown: movementProfile
      ? movementBreakdown(movementProfile)
      : null,
  };
}

/** Record the table's explicitly completed action/movement through normal budgets. */
export function spendParticipantBudget(combat,state,request,user,operationId){
  const actor=combat.combatants.get(request.id)?.actor,budget=state.budgets?.[request.id];
  if(!actor||!budget||state.current!==request.id)throw Error("Choose the active participant’s budget.");
  const next=structuredClone(state),conditions=actionConditions(actor);
  if(request.category === "movement") next.budgets[request.id]=spendMovement(budget,{operationId,amount:1,conditions,ownTurn:true});
  else {
    if(!ACTION_CATEGORIES.includes(request.category))throw Error("Choose Main, Maneuver, Reaction or movement.");
    next.budgets[request.id]=declareAction(budget,{operationId,sourceId:"manual-table-action",category:request.category,conditions,ownTurn:true});
  }
  if(budget.operations[operationId])return structuredClone(state);
  next.revision++;next.history.push({kind:"budget-spend",id:request.id,category:request.category,round:state.round,operationId});return next;
}
