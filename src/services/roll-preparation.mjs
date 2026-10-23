import { contextualAbilitySources } from "../rules/one-dp-play.mjs";
import { abilityDefinition } from "../rules/ability-definitions.mjs";
import { validReferenceAttack } from "../rules/creature-actions.mjs";
import { numericCreatureAction } from "../rules/numeric-creature-actions.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { conditionRollSources } from "../rules/conditions.mjs";
import { targetEvasionSources } from "../rules/player-attacks.mjs";
import { sourceRollPlan } from "../rules/roll-sources.mjs";
import {
  defenseSubstitutionOptions,
  selectedDefenseSubstitution,
} from "../rules/defense-substitutions.mjs";
import { selectedWoundRollSources } from "../rules/wound-contributions.mjs";
import { actorContributions } from "./conditions.mjs";
import { defenseBenefits } from "./benefits.mjs";
import { actorWoundContributionPlan } from "./wound-effects.mjs";
const ID = "heroes-of-legend";
export function incomingAttackContext(attackMessageId) {
  const message = game.messages.get(attackMessageId),
    incoming = message?.getFlag(ID, "attackCard");
  if (
    !message?.author?.isGM ||
    !message.isContentVisible ||
    !incoming ||
    incoming.perspective !== "defender"
  )
    throw new Error("The incoming attack is unavailable or changed.");
  const attack = structuredClone(incoming);
  const valid =
    attack.resolution === "reference"
      ? validReferenceAttack(attack)
      : ["weak", "standard", "strong"].every(
          (key) =>
            Number.isSafeInteger(attack.damage?.[key]) &&
            attack.damage[key] >= 0,
        );
  if (!valid) throw new Error("The incoming attack is unavailable or changed.");
  return attack;
}

/**
 * Budget-backed Shield Block alone requires the GM's immutable attack record
 * and receipt. Ordinary defense remains available for legacy or historical
 * cards whose encounter is no longer loaded.
 */
export function verifiedIncomingAttackContext(attackMessageId) {
  const attack = incomingAttackContext(attackMessageId);
  if (attack.resolution === "reference" || attack.numericSource) {
    const message = game.messages.get(attackMessageId),
      source = message?.getFlag(ID, "creatureAction"),
      actor = fromUuidSync(attack.actorUuid);
    if (
      actor?.type !== "creature" ||
      actor.uuid !== attack.actorUuid ||
      JSON.stringify(source) !== JSON.stringify(attack)
    )
      throw new Error("The incoming reference action could not be verified.");
    if (attack.numericSource) {
      const {catalogId, sourceCommit, action} = attack.numericSource;
      const numeric = numericCreatureAction(catalogId, sourceCommit, action);
      if (!numeric || attack.resolution !== "numeric" || attack.attributeKey !== action.attributeKey ||
          JSON.stringify(attack.damage) !== JSON.stringify(numeric.damage) || attack.damageType !== "physical")
        throw new Error("The incoming numeric creature action could not be verified.");
    }
    return attack;
  }
  if (!Object.hasOwn(attack, "blockable")) return attack;
  if (attack.blockable !== null && typeof attack.blockable !== "boolean")
    throw new Error("The DA's blockable judgment is invalid.");
  const combat =
      typeof attack.combatId === "string" && game.combats.get(attack.combatId),
    message = game.messages.get(attackMessageId),
    stored = combat?.getFlag(ID, "attacks")?.[attackMessageId],
    receipt = combat?.getFlag(ID, "operationReceipts")?.[attackMessageId];
  if (
    !combat ||
    !message ||
    !stored ||
    receipt?.applied !== true ||
    receipt.kind !== "npc-attack" ||
    JSON.stringify(stored) !== JSON.stringify(attack)
  )
    throw new Error("The incoming attack's DA judgment could not be verified.");
  return attack;
}
export function rollBasis(
  actor,
  attributeKey,
  mode = "attribute",
  attackMessageId = null,
  defenderTokenUuid = null,
  { actorTokenUuid = null, targetTokenUuid = null } = {},
) {
  if (!["attribute", "attack", "defense", "death"].includes(mode))
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
  let survival = null;
  if (mode === "death") {
    const state = actor.getFlag("heroes-of-legend", "survival");
    if (attributeKey !== "fortitude" || actor.type !== "character")
      throw new Error("Death rolls use a character's Fortitude.");
    survival = {...structuredClone(state ?? {}), hp: actor.system.health.value,
      gritAvailable: actor.system.grit.available, pending: false};
  }

  const contributions = actorContributions(actor).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const woundModifiers =
    mode === "death" ? [] : actorWoundContributionPlan(actor).rollModifiers;
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
  if (defenderTokenUuid) {
    const token = fromUuidSync(defenderTokenUuid);
    if (token?.documentName !== "Token" || token.actor?.uuid !== actor.uuid)
      throw new Error(
        "The selected defender token changed. Choose a defender again.",
      );
  }
  let actorToken = null,
    targetToken = null,
    targetActor = null;
  if (mode === "attack") {
    actorToken =
      typeof actorTokenUuid === "string"
        ? fromUuidSync(actorTokenUuid)
        : actor.token;
    const selected = [...(game.user.targets ?? [])];
    targetToken = typeof targetTokenUuid === "string" ? fromUuidSync(targetTokenUuid)
      : selected.length === 1 ? selected[0].document ?? selected[0] : null;
    targetActor = targetToken?.actor;
    if (!targetActor || !["character", "creature", "summon"].includes(targetActor.type)) {
      targetToken = null; targetActor = null;
    }
  }

  let incoming = null;
  if (attackMessageId) {
    incoming = incomingAttackContext(attackMessageId);
    if (mode !== "defense" || incoming.attributeKey !== attributeKey)
      throw new Error("The incoming attack is unavailable or changed.");
  }
  return {
    attackMessageId,
    defenderTokenUuid,
    survival,
    incoming,
    partyPiece:
      actor.items.find(
        (item) =>
          item.type === "ability" &&
          item.getFlag(ID, "catalogId") === "ability-a-party-piece" &&
          abilityDefinition(
            item.getFlag(ID, "catalogId"),
            item.getFlag(ID, "source"),
          ),
      )?.uuid ?? null,
    actorUuid: actor.uuid,
    ...(mode === "attack"
      ? {
          actorTokenUuid: actorToken?.uuid ?? null,
          targetTokenUuid: targetToken?.uuid ?? null,
          targetActorUuid: targetActor?.uuid ?? null,
          targetContributions: (targetActor ? actorContributions(targetActor) : []).sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
          targetEvasion:
            targetActor?.type === "creature"
              ? structuredClone(targetActor.system.evasion)
              : null,
        }
      : {}),
    attributeKey,
    mode,
    attribute: actor.system.attributes[attributeKey].effective,
    contributions,
    woundModifiers,
    benefits:
      mode === "defense"
        ? defenseBenefits(actor, { incomingAttack: Boolean(incoming) })
        : [],
    ...(mode === "defense"
      ? { defenseSubstitutions: defenseSubstitutionOptions(actor) }
      : {}),
  };
}
export function prepareRoll(basis, draft = {}) {
  const substitution = selectedDefenseSubstitution(basis, draft);
  const fears = [
    ...new Set(
      basis.contributions
        .filter((c) => basis.mode !== "death" && c.key === "frightened")
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
      targetContributions: basis.targetContributions ?? [],
    }),
    ...selectedWoundRollSources(
      basis.mode === "death" ? [] : (basis.woundModifiers ?? []),
      draft.woundApplicability ?? {},
    ),
    ...basis.benefits,
    ...contextualAbilitySources(basis, draft),
  ];
  if (substitution?.boons)
    sources.push({
      id: `defense-substitution-${substitution.itemUuid}`,
      kind: "boon",
      amount: substitution.boons,
      label: substitution.name,
      automatic: true,
      sourceIds: [substitution.itemUuid],
    });
  if (basis.mode === "attack")
    sources.push(
      ...targetEvasionSources(basis.targetEvasion, basis.targetTokenUuid),
    );
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
  return {
    ...sourceRollPlan(substitution?.attribute ?? basis.attribute, sources),
    resolvedAttributeKey: substitution?.attributeKey ?? basis.attributeKey,
    defenseSubstitutionItemUuid: substitution?.itemUuid ?? null,
  };
}
