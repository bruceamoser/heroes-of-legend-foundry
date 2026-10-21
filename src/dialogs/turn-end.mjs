import { requestCombat } from "../services/combat.mjs";

export function conditionFinishAction({
  review = false,
  policy = null,
  requirements,
  durationKeys = [],
}) {
  const orderReady =
      !requirements.orderRequired ||
      (Array.isArray(policy?.order) &&
        requirements.keys.every((key) => policy.order.includes(key))),
    durationsReady = durationKeys.every((key) =>
      ["independent", "combined"].includes(policy?.durationPolicies?.[key]),
    );
  if (review) return "review";
  if (policy?.reviewed === true && orderReady && durationsReady)
    return "use-saved-policy";
  if (orderReady && durationsReady)
    return "finish";
  return "review";
}

/** Finishing a turn only advances the shared tracker. */
export async function finishCombatParticipant(combat) {
  return requestCombat(combat, "finish");
}
