import { conditionEndPlan } from "./conditions.mjs";
import { sufferDamage, survivalState, endSurvivalTurn } from "./survival.mjs";
/** Every damaging condition is a separate event; DA records their order when needed. */
export function conditionTurn({
  contributions,
  policy = {},
  turnId,
  hp,
  maxHp,
  gritAvailable = 0,
  survival = null,
  character = true,
}) {
  const plan = conditionEndPlan(contributions, { ...policy, turnId });
  if (!plan.ready)
    throw new Error(
      "Overlapping duration sources need a DA policy before finishing this turn.",
    );
  const keys = plan.events.map((e) => e.condition);
  const order = policy.order ?? keys;
  if (
    !Array.isArray(order) ||
    new Set(order).size !== order.length ||
    keys.some((k) => !order.includes(k))
  )
    throw new Error("Record the damage tick order.");
  if (keys.length > 1 && !policy.order)
    throw new Error("The DA must order simultaneous condition damage ticks.");
  let state = character
    ? survival
      ? { ...survival, maxHp, gritAvailable }
      : survivalState({ hp, maxHp, gritAvailable })
    : null;
  // A due death choice precedes every end-turn consequence.
  if (state) endSurvivalTurn(state, state.ownTurn);
  const events = [],
    wounds = [];
  for (const key of order) {
    const event = plan.events.find((e) => e.condition === key);
    if (!event) continue;
    const before = hp;
    let wound = false;
    if (state) {
      const result = sufferDamage(state, event.damage.total);
      state = result.state;
      hp = state.hp;
      wound = result.wound;
      if (wound)
        wounds.push({
          eventId: event.id,
          priorWounds: state.wounds - 1,
          types: event.damage.woundTypes ?? ["physical"],
          status: "awaiting-roll",
        });
    } else hp = Math.max(0, hp - event.damage.total);
    events.push({ ...event, before, after: hp, wound });
  }
  if (state) state = endSurvivalTurn(state, state.ownTurn);
  // Damage wakes Asleep; other source-defined unconscious states remain.
  const damaged = events.some((e) => e.damage.total > 0);
  return {
    hp,
    survival: state,
    events,
    wounds,
    contributions: plan.contributions.filter(
      (c) => !damaged || c.key !== "asleep",
    ),
  };
}
