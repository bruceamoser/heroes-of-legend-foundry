import { noRollBrew } from "./rules/workshop-crafting.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";

/** Resolve the local example's dice; brewing never asks the die source for a face. */
export function localCraftingOutcome({ abilityId, recipe, attribute, net = 0, die }) {
  if (noRollBrew(abilityId, recipe))
    return { automatic: true, faces: [], kept: [], result: { tier: "Brew without a roll" }, steps: 1 };
  const plan = rollPlan({ attribute, boons: Math.max(0, net), banes: Math.max(0, -net) });
  const faces = Array.from({ length: plan.count }, () => die());
  const kept = [...faces].sort((a, b) => (net < 0 ? a - b : b - a)).slice(0, 3);
  const result = classifyRoll(kept, plan.attribute);
  return { automatic: false, faces, kept, result, steps: { weak: 1, standard: 2, strong: 3 }[result.tier] };
}
