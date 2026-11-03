import { rollPlan, classifyRoll } from "./roll.mjs";

/** Reuse the exact original ordinary-check pool rather than current Actor modifiers. */
export function debtRerollPlan(snapshot) {
  if (!snapshot || snapshot.mode !== "attribute" || snapshot.ability || !snapshot.actorUuid)
    throw new Error("Use the manual Debt procedure for coordinated ability, attack, defense, death or crafting rolls.");
  const plan = rollPlan(snapshot);
  for (const key of ["formula", "attribute", "boons", "banes", "canceled", "net", "count"])
    if (snapshot[key] !== plan[key]) throw new Error("The original attribute roll pool changed.");
  const result = classifyRoll(snapshot.retained, plan.attribute);
  for (const key of ["total", "tier", "natural"])
    if (snapshot[key] !== result[key]) throw new Error("The original attribute roll result changed.");
  return plan;
}

export function debtReplacement(snapshot, retained, dice, requestId) {
  const plan = debtRerollPlan(snapshot);
  return {
    ...structuredClone(snapshot), ...classifyRoll(retained, plan.attribute),
    retained: [...retained], dice: structuredClone(dice),
    debtReroll: { requestId, originalRetained: [...snapshot.retained] },
  };
}
