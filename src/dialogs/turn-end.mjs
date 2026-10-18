import { actorContributions } from "../services/conditions.mjs";
import { damageBasis } from "../services/damage.mjs";
import { requestCombat } from "../services/combat.mjs";
import { conditionTickRequirements } from "../rules/condition-turn.mjs";

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

export async function finishCombatParticipant(combat, { review = false } = {}) {
  const state = combat.getFlag("heroes-of-legend", "encounter"),
    actor = combat.combatants.get(state?.current)?.actor;
  const contributions = actor ? actorContributions(actor) : [];
  const old = actor?.getFlag("heroes-of-legend", "conditionTurnPolicy");
  if (!contributions.length || (!game.user.isGM && old))
    return requestCombat(combat, "finish");
  if (!game.user.isGM) return requestCombat(combat, "finish");
  const passiveDefenses = actor
      ? damageBasis(actor).passiveDefenses
      : { resistances: [], weaknesses: [] },
    requirements = conditionTickRequirements(contributions, passiveDefenses),
    durationKeys = ["blinded", "deafened", "asleep", "paralyzed"].filter(
      (key) =>
        contributions.filter(
          (condition) =>
            condition.key === key && condition.persistence === "temporary",
        ).length > 1,
    ),
    action = conditionFinishAction({
      review,
      policy: old,
      requirements,
      durationKeys,
    });
  if (action !== "review") return requestCombat(combat, "finish");

  const escape = foundry.utils.escapeHTML,
    automatic = [
      ...passiveDefenses.resistances.map(
        (source) =>
          `${escape(source.label)}: ${escape(source.type)} resistance ${source.value}`,
      ),
      ...passiveDefenses.weaknesses.map(
        (source) =>
          `${escape(source.label)}: ${escape(source.type)} weakness ${source.value}`,
      ),
    ],
    automaticText = automatic.length
      ? `<ul>${automatic.map((line) => `<li>${line}</li>`).join("")}</ul>`
      : "<p>No reviewed automatic passive defense applies to these ticks.</p>",
    content = `<p>Review condition damage modifiers. Bleeding bypasses resistance. Automatic catalog passives always apply; the manual values below are additional DA sources and do not replace or cache those passives.</p>${automaticText}${["fire", "cold"].map((type) => `<label>Additional ${type} resistance<input name="${type}Resistance" type="number" min="0" max="3" value="${old?.resistances?.find((source) => source.type === type)?.value ?? 0}"></label><label>Additional ${type} weakness<input name="${type}Weakness" type="number" min="0" max="3" value="${old?.weaknesses?.find((source) => source.type === type)?.value ?? 0}"></label>`).join("")}${requirements.orderRequired ? `<label>Tick order<select name="order">${["burning,freezing,bleeding", "burning,bleeding,freezing", "freezing,burning,bleeding", "freezing,bleeding,burning", "bleeding,burning,freezing", "bleeding,freezing,burning"].map((order) => `<option value="${order}" ${old?.order?.join(",") === order ? "selected" : ""}>${order}</option>`).join("")}</select></label>` : ""}${durationKeys.map((key) => `<label>${key} overlapping durations<select name="${key}"><option value="">DA ruling</option><option value="independent" ${old?.durationPolicies?.[key] === "independent" ? "selected" : ""}>Each source decays</option><option value="combined" ${old?.durationPolicies?.[key] === "combined" ? "selected" : ""}>Combined duration decays once</option></select></label>`).join("")}<label>Note (optional)<input name="reason" value="${escape(old?.reason ?? "")}"></label>`;
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: "Finish turn · condition effects" },
    classes: ["heroes-of-legend"],
    content,
    ok: { label: "Apply effects and finish" },
  });
  if (!result) return;
  const policy = {
    reviewed: true,
    reason: result.reason ?? "",
    order: result.order?.split(",") ?? requirements.keys,
    durationPolicies: { ...old?.durationPolicies },
    resistances: [],
    weaknesses: [],
  };
  for (const type of ["fire", "cold"]) {
    const resistance = Number(result[`${type}Resistance`]),
      weakness = Number(result[`${type}Weakness`]);
    if (resistance)
      policy.resistances.push({
        type,
        value: resistance,
        label: "Additional DA condition tick resistance",
      });
    if (weakness)
      policy.weaknesses.push({
        type,
        value: weakness,
        label: "Additional DA condition tick weakness",
      });
  }
  for (const key of durationKeys) policy.durationPolicies[key] = result[key];
  return requestCombat(combat, "finish", { conditionPolicy: policy });
}
