import { ATTRIBUTES } from "../rules/character.mjs";
import { conditionRollSources } from "../rules/conditions.mjs";
import { sourceRollPlan } from "../rules/roll-sources.mjs";
import { actorContributions } from "./conditions.mjs";
import { defenseBenefits } from "./benefits.mjs";
export function rollBasis(
  actor,
  attributeKey,
  mode = "attribute",
  attackMessageId = null,
) {
  if (!["attribute", "defense"].includes(mode))
    throw new Error("Unsupported shared roll context.");
  if (
    !actor ||
    !fromUuidSync(actor.uuid) ||
    !ATTRIBUTES.includes(attributeKey) ||
    !actor.system.attributes?.[attributeKey]
  )
    throw new Error("Choose an available character and attribute.");
  // Rolling a defense is intentionally independent of ownership. This service
  // creates a ChatMessage only; it never mutates the defender's documents.
  if (mode !== "defense" && !actor.testUserPermission(game.user, "OWNER"))
    throw new Error(game.i18n.localize("HOL.NoPermission"));
  const contributions = actorContributions(actor).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (
    actor.system.health?.value === 0 &&
    !contributions.some((c) => c.key === "unconscious")
  )
    contributions.push({
      id: "health-zero",
      key: "unconscious",
      rating: 1,
      persistence: "binary",
      source: "Zero HP",
    });
  let incoming = null;
  if (attackMessageId) {
    const message = game.messages.get(attackMessageId);
    incoming = message?.getFlag("heroes-of-legend", "attackCard");
    if (
      mode !== "defense" ||
      !message?.author?.isGM ||
      !message.isContentVisible ||
      !incoming ||
      incoming.perspective !== "defender" ||
      !["weak", "standard", "strong"].every(
        (key) =>
          Number.isSafeInteger(incoming.damage?.[key]) &&
          incoming.damage[key] >= 0,
      ) ||
      incoming.attributeKey !== attributeKey
    )
      throw new Error("The incoming attack is unavailable or changed.");
    incoming = structuredClone(incoming);
  }
  return {
    attackMessageId,
    incoming,
    actorUuid: actor.uuid,
    attributeKey,
    mode,
    attribute: actor.system.attributes[attributeKey].effective,
    contributions,
    benefits: mode === "defense" ? defenseBenefits(actor) : [],
  };
}
export function prepareRoll(basis, draft = {}) {
  const fears = [
    ...new Set(
      basis.contributions
        .filter((c) => c.key === "frightened")
        .map((c) => c.source),
    ),
  ];
  const perception = draft.perception ?? {};
  if (fears.some((source) => !["yes", "no"].includes(perception[source])))
    throw new Error("Choose whether each fear source is currently perceived.");
  const sources = [
    ...conditionRollSources(basis.contributions, {
      mode: basis.mode,
      perceivedSources: fears.filter((source) => perception[source] === "yes"),
    }),
    ...basis.benefits,
  ];
  if (basis.incoming)
    for (const [field, kind] of [
      ["boons", "boon"],
      ["banes", "bane"],
    ]) {
      const amount = basis.incoming.threat[field];
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error("Invalid incoming Threat.");
      if (amount)
        sources.push({
          id: `incoming-threat-${field}`,
          kind,
          amount,
          label: "Incoming Threat",
          automatic: true,
          sourceIds: [basis.attackMessageId],
        });
    }
  for (const [field, kind] of [
    ["boons", "boon"],
    ["banes", "bane"],
  ]) {
    const amount = Number(draft[field] ?? 0);
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error(
        "Situational modifiers must be nonnegative whole numbers.",
      );
    if (amount)
      sources.push({
        id: `situational-${field}`,
        kind,
        amount,
        label: draft[`${field}Label`] ?? `Situational ${field}`,
        automatic: false,
        sourceIds: [],
      });
  }
  return sourceRollPlan(basis.attribute, sources);
}
