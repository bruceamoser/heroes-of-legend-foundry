import { actorContributions } from "../services/conditions.mjs";
import { requestCombat } from "../services/combat.mjs";
export async function finishCombatParticipant(combat, { review = false } = {}) {
  const state = combat.getFlag("heroes-of-legend", "encounter"),
    actor = combat.combatants.get(state?.current)?.actor;
  const contributions = actor ? actorContributions(actor) : [];
  const needsReview = contributions.some((c) =>
    ["burning", "freezing", "bleeding"].includes(c.key),
  );
  const old = actor?.getFlag("heroes-of-legend", "conditionTurnPolicy");
  if (!contributions.length || (!game.user.isGM && old))
    return requestCombat(combat, "finish");
  if (!game.user.isGM) return requestCombat(combat, "finish");
  const durationKeys = ["blinded", "deafened", "asleep", "paralyzed"].filter(
    (k) =>
      contributions.filter((c) => c.key === k && c.persistence === "temporary")
        .length > 1,
  );
  if (
    !review &&
    old?.reviewed &&
    durationKeys.every((key) =>
      ["independent", "combined"].includes(old.durationPolicies?.[key]),
    )
  )
    return requestCombat(combat, "finish");
  if (!needsReview && !durationKeys.length)
    return requestCombat(combat, "finish");
  const escape = foundry.utils.escapeHTML;
  const content = `<p>Review condition damage modifiers. Bleeding bypasses resistance. These rulings are saved for subsequent turns; update when defenses change.</p>${["fire", "cold"].map((type) => `<label>${type} resistance<input name="${type}Resistance" type="number" min="0" max="3" value="${old?.resistances?.find((s) => s.type === type)?.value ?? 0}"></label><label>${type} weakness<input name="${type}Weakness" type="number" min="0" max="3" value="${old?.weaknesses?.find((s) => s.type === type)?.value ?? 0}"></label>`).join("")}<label>Tick order<select name="order">${["burning,freezing,bleeding", "burning,bleeding,freezing", "freezing,burning,bleeding", "freezing,bleeding,burning", "bleeding,burning,freezing", "bleeding,freezing,burning"].map((order) => `<option value="${order}" ${old?.order?.join(",") === order ? "selected" : ""}>${order}</option>`).join("")}</select></label>${durationKeys.map((k) => `<label>${k} overlapping durations<select name="${k}"><option value="">DA ruling</option><option value="independent" ${old?.durationPolicies?.[k] === "independent" ? "selected" : ""}>Each source decays</option><option value="combined" ${old?.durationPolicies?.[k] === "combined" ? "selected" : ""}>Combined duration decays once</option></select></label>`).join("")}<label>DA reason<input name="reason" value="${escape(old?.reason ?? "")}" required></label>`;
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: "Finish turn · condition effects" },
    classes: ["heroes-of-legend"],
    content,
    ok: { label: "Apply effects and finish" },
  });
  if (!result) return;
  const policy = {
    reviewed: true,
    reason: result.reason,
    order: result.order.split(","),
    durationPolicies: { ...old?.durationPolicies },
    resistances: [],
    weaknesses: [],
  };
  for (const type of ["fire", "cold"]) {
    policy.resistances.push({
      type,
      value: Number(result[`${type}Resistance`]),
      label: "DA condition tick ruling",
    });
    policy.weaknesses.push({
      type,
      value: Number(result[`${type}Weakness`]),
      label: "DA condition tick ruling",
    });
  }
  for (const key of durationKeys) policy.durationPolicies[key] = result[key];
  return requestCombat(combat, "finish", { conditionPolicy: policy });
}
