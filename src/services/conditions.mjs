import { assertNoPendingTurn } from "./turn-lock.mjs";
import {
  CONDITION_KINDS,
  validateContributions,
  reduceTemporary,
} from "../rules/conditions.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function actorContributions(actor) {
  const records = actor.effects
    .filter(
      (e) =>
        e.active && !e.getFlag(ID, "retired") && e.getFlag(ID, "condition"),
    )
    .map((e) => ({ ...structuredClone(e.getFlag(ID, "condition")), id: e.id }));
  validateContributions(records);
  return records;
}
export function conditionIcon(key) {
  return `icons/svg/${{ burning: "fire", freezing: "frozen", bleeding: "blood", poisoned: "poison", frightened: "terror", slowed: "downgrade", dazed: "daze", grappled: "net", blinded: "blind", deafened: "deaf", asleep: "sleep", paralyzed: "paralysis", unconscious: "unconscious", petrified: "statue", prone: "falling", hidden: "mystery-man", invisible: "invisible" }[key] ?? "aura"}.svg`;
}
export function registerHOLStatuses() {
  const keep = new Set([
    CONFIG.specialStatusEffects.DEFEATED,
    CONFIG.specialStatusEffects.BURROW,
    CONFIG.specialStatusEffects.HOVER,
    CONFIG.specialStatusEffects.FLY,
  ]);
  const preserved = CONFIG.statusEffects.filter((s) => keep.has(s.id));
  CONFIG.statusEffects.splice(
    0,
    CONFIG.statusEffects.length,
    ...preserved,
    ...Object.keys(CONDITION_KINDS).map((key) => ({
      id: `hol.${key}`,
      name: key[0].toUpperCase() + key.slice(1),
      img: conditionIcon(key),
    })),
  );
  CONFIG.specialStatusEffects.BLIND = "hol.blinded";
  CONFIG.specialStatusEffects.INVISIBLE = "hol.invisible";
}
export async function requestCondition(actor, kind, payload = {}) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: "Condition adjustment requested.",
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: {
        conditionRequest: {
          ...payload,
          actorUuid: actor.uuid,
          kind,
          revision: actor.getFlag(ID, "conditionRevision") ?? 0,
        },
      },
    },
  });
}
export function resolveConditionRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "conditionRequest");
  if (!message?.author?.isGM)
    throw new Error("The DA must authorize manual condition adjustments.");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.documentName !== "Actor" ||
    actor.pack ||
    !["add", "remove", "reduce"].includes(request.kind)
  )
    throw new Error("Invalid condition target or adjustment.");
  const receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (
      receipt.request !== JSON.stringify(request) ||
      receipt.authorId !== message.author.id
    )
      throw new Error("The completed adjustment was changed.");
    if (receipt.createdId && !actor.effects.has(receipt.createdId))
      throw new Error(
        "Condition effect needs reconciliation; do not apply it again.",
      );
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  if (
    !Number.isSafeInteger(request.revision) ||
    request.revision !== (actor.getFlag(ID, "conditionRevision") ?? 0)
  )
    throw new Error(
      "Conditions changed. Review their current sources and retry.",
    );
  const effects = actor.toObject().effects,
    active = actorContributions(actor);
  let createdId;
  if (request.kind === "add") {
    createdId = foundry.utils.randomID();
    const condition = {
      id: createdId,
      key: request.key,
      rating: request.rating,
      persistence: request.persistence,
      source: request.source,
      order: Date.now(),
    };
    validateContributions([condition]);
    effects.push({
      _id: createdId,
      name: `${request.key[0].toUpperCase() + request.key.slice(1)} ${request.rating}${request.persistence === "starred" ? "*" : ""}`,
      img: conditionIcon(request.key),
      statuses: [`hol.${request.key}`],
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      flags: { [ID]: { condition, operationId: id } },
    });
  } else {
    const effect = effects.find((e) => e._id === request.effectId),
      contribution = active.find((c) => c.id === request.effectId);
    if (!effect || !contribution)
      throw new Error("That active condition source is no longer available.");
    if (request.kind === "remove") {
      effect.disabled = true;
      effect.statuses = [];
      effect.flags[ID].retired = { requestId: id, reason: "DA removed source" };
    } else {
      if (contribution.persistence !== "temporary")
        throw new Error(
          "A generic temporary reduction cannot remove a persistent source.",
        );
      if (!Number.isSafeInteger(request.amount) || request.amount < 1)
        throw new Error("Choose a positive temporary reduction.");
      const result = reduceTemporary(
        [contribution],
        contribution.key,
        request.amount,
      )[0];
      if (!result) {
        effect.disabled = true;
        effect.statuses = [];
        effect.flags[ID].retired = {
          requestId: id,
          reason: "Temporary rating reached zero",
        };
      } else {
        effect.flags[ID].condition = result;
        effect.name = `${result.key[0].toUpperCase() + result.key.slice(1)} ${result.rating}`;
      }
    }
  }
  for (const data of effects) {
    const effect = new foundry.documents.ActiveEffect(data, {
      parent: actor,
      strict: true,
    });
    effect.validate({ strict: true, fallback: false });
  }
  const changes = {
    effects,
    [`flags.${ID}.conditionRevision`]: request.revision + 1,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: JSON.stringify(request),
      ...(createdId ? { createdId } : {}),
    },
  };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  if (createdId && !actor.effects.has(createdId))
    throw new Error(
      "Condition effect needs reconciliation; do not apply it again.",
    );
  await message.update({
    content:
      "Condition adjustment recorded. Sources remain available in the character's condition panel.",
  });
  return { status: "complete", replay: false };
}
export function registerConditionRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "conditionRequest") && isCreationAuthority())
      resolveConditionRequest(message.id).catch(async (e) => {
        ui.notifications.error(e.message);
        await message.update({
          content: `Condition adjustment needs attention: ${foundry.utils.escapeHTML(e.message)}`,
        });
      });
  });
}
