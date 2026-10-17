import { actorContributions } from "./conditions.mjs";
import {
  conditionTickRequirements,
  conditionTurn,
} from "../rules/condition-turn.mjs";
const ID = "heroes-of-legend";
export function conditionTurnBasis(actor) {
  return {
    effects: actor.toObject().effects,
    revision: actor.getFlag(ID, "conditionRevision") ?? 0,
    contributions: actorContributions(actor),
    policy: actor.getFlag(ID, "conditionTurnPolicy") ?? null,
  };
}
export function prepareConditionTurn(actor, basis, request, id, authorId) {
  if (actor.type === "character" && basis.hp === 0 && !basis.survival)
    throw new Error(
      "Record the existing zero-HP survival state before resolving conditions.",
    );
  const conditions = conditionTurnBasis(actor);
  if (!conditions.contributions.length) return null;
  const policy = request.conditionPolicy ?? conditions.policy ?? {};
  if (request.conditionPolicy && !game.users.get(authorId)?.isGM)
    throw Error("Only the DA records condition tick rulings.");
  const damaging = conditions.contributions.some((c) =>
    ["burning", "freezing", "bleeding"].includes(c.key),
  );
  const requirements = conditionTickRequirements(
    conditions.contributions,
    basis.passiveDefenses,
  );
  if (
    damaging &&
    !policy.reviewed &&
    (requirements.typesNeedingReview.length > 0 || requirements.orderRequired)
  )
    throw Error(
      "The DA must review condition tick defenses and order in Finish turn.",
    );
  if (
    request.conditionPolicy &&
    (typeof policy.reason !== "string" || !policy.reason.trim())
  )
    throw Error("Explain the condition tick ruling.");
  const result = conditionTurn({
    ...basis,
    character: actor.type === "character",
    contributions: conditions.contributions,
    policy,
    turnId: id,
  });
  const effects = actor.toObject().effects;
  for (const original of conditions.contributions) {
    const data = effects.find((e) => e._id === original.id),
      next = result.contributions.find((c) => c.id === original.id);
    if (next) {
      data.flags[ID].condition = next;
      data.name = `${next.key} ${next.rating}${next.persistence === "starred" ? "*" : ""}`;
    } else {
      data.disabled = true;
      data.statuses = [];
      data.flags[ID].retired = {
        requestId: id,
        reason: "End-turn decay or damage waking sleep",
      };
    }
  }
  for (const data of effects)
    new foundry.documents.ActiveEffect(data, {
      parent: actor,
      strict: true,
    }).validate({ strict: true, fallback: false });
  const changes = {
    effects,
    "system.health.value": result.hp,
    [`flags.${ID}.conditionRevision`]: conditions.revision + 1,
    [`flags.${ID}.conditionTurnEvents.${id}`]: result.events,
  };
  if (result.survival) changes[`flags.${ID}.survival`] = result.survival;
  else changes[`flags.${ID}.creatureDefeated`] = result.hp === 0;
  for (const wound of result.wounds)
    changes[`flags.${ID}.pendingWounds.${wound.eventId}`] = wound;
  if (request.conditionPolicy)
    changes[`flags.${ID}.conditionTurnPolicy`] = { ...policy, authorId };
  return changes;
}
