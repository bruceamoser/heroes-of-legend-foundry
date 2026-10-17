import { assertNoPendingTurn } from "./turn-lock.mjs";
import { classifyRoll } from "../rules/roll.mjs";
import { damageEvent } from "../rules/damage.mjs";
import {
  survivalState,
  validateSurvival,
  sufferDamage,
} from "../rules/survival.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function damageBasis(actor) {
  if (!["character", "creature"].includes(actor?.type) || actor.pack)
    throw new Error("Choose a world character or creature.");
  return {
    actorUuid: actor.uuid,
    hp: actor.system.health.value,
    maxHp: actor.system.health.max,
    gritAvailable: actor.system.grit?.available ?? 0,
    survival: structuredClone(actor.getFlag(ID, "survival") ?? null),
    revision: actor.getFlag(ID, "damageRevision") ?? 0,
    printedArmor: actor.type === "creature" ? actor.system.armor : 0,
  };
}
export function damagePreview(actor, basis, draft) {
  const sources = [...(draft.resistances ?? [])];
  if (basis.printedArmor)
    sources.push({
      type: "physical",
      value: basis.printedArmor,
      label: "Printed creature Physical DR",
    });
  for (const source of [...sources, ...(draft.weaknesses ?? [])])
    if (typeof source.label !== "string" || !source.label.trim())
      throw new Error("Label each damage modifier source.");
  const event = damageEvent({
    components: draft.components,
    resistances: sources,
    weaknesses: draft.weaknesses ?? [],
  });
  let survival = null,
    wound = false,
    after = Math.max(0, basis.hp - event.total);
  if (actor.type === "character") {
    if (basis.survival && basis.survival.hp !== basis.hp)
      throw new Error(
        "HP was edited outside survival tracking. The DA must reconcile survival before applying more damage.",
      );
    if (!basis.survival && basis.hp === 0)
      throw new Error(
        "This zero-HP character needs a recorded survival state before automated damage.",
      );
    const current = basis.survival
      ? {
          ...basis.survival,
          maxHp: basis.maxHp,
          gritAvailable: basis.gritAvailable,
        }
      : survivalState({
          hp: basis.hp,
          maxHp: basis.maxHp,
          gritAvailable: basis.gritAvailable,
        });
    validateSurvival(current);
    const result = sufferDamage(current, event.total);
    survival = result.state;
    wound = result.wound;
    after = survival.hp;
  }
  return {
    event,
    survival,
    wound,
    after,
    resistances: sources,
    weaknesses: draft.weaknesses ?? [],
  };
}
export function defenseDamage(message) {
  const result = message?.getFlag(ID, "roll"),
    request = message?.getFlag(ID, "defenseRequest"),
    attack = game.messages.get(result?.attackMessageId);
  const response = attack
    ?.getFlag(ID, "defenseResponses")
    ?.find((r) => r.requestId === message.id);
  if (
    !attack?.author?.isGM ||
    response?.status !== "resolved" ||
    response.actorUuid !== result?.actorUuid ||
    request?.actorUuid !== result?.actorUuid ||
    !message.rolls.length
  )
    throw new Error("Choose a settled defense result.");
  const retained = message.rolls[0].dice[0]?.results
    .filter((r) => r.active)
    .map((r) => r.result);
  if (
    !retained ||
    JSON.stringify(retained) !== JSON.stringify(result.retained) ||
    classifyRoll(retained, result.attribute).tier !== result.tier
  )
    throw new Error("The stored outcome does not match its native dice.");
  const card = attack.getFlag(ID, "attackCard"),
    amount = card?.damage?.[result.tier];
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    result.attackOutcome?.damage !== amount ||
    result.attackOutcome.type !== "physical"
  )
    throw new Error("The saved attack outcome changed.");
  return {
    actorUuid: result.actorUuid,
    components: [{ type: "physical", amount }],
    eventId: `defense-${message.id}`,
  };
}
export async function requestDamage(actor, basis, draft, rollMessageId = null) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: "Damage application requested.",
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    flags: {
      [ID]: {
        damageRequest: { actorUuid: actor.uuid, basis, draft, rollMessageId },
      },
    },
  });
}
export function resolveDamageRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "damageRequest");
  if (!message?.author?.isGM)
    throw new Error("The DA must authorize damage application.");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (actor?.documentName !== "Actor" || actor.pack)
    throw new Error("Damage target is unavailable.");
  const signature = JSON.stringify(request),
    receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id)
      throw new Error("The completed damage request changed.");
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  let eventId = id,
    draft = structuredClone(request.draft);
  if (request.rollMessageId) {
    const defense = defenseDamage(game.messages.get(request.rollMessageId));
    if (defense.actorUuid !== actor.uuid)
      throw new Error("The roll belongs to a different defender.");
    draft.components = defense.components;
    eventId = defense.eventId;
  } else if (typeof draft.reason !== "string" || !draft.reason.trim())
    throw new Error("Describe the source of manual damage.");
  const applied = actor.getFlag(ID, "damageEvents")?.[eventId];
  if (applied) {
    await message.update({
      content:
        "This defense damage was already applied; HP was not changed again.",
    });
    return { status: "complete", replay: true };
  }
  const basis = damageBasis(actor);
  if (JSON.stringify(basis) !== JSON.stringify(request.basis))
    throw new Error(
      "HP, survival or defenses changed. Review the damage preview again.",
    );
  const plan = damagePreview(actor, basis, draft);
  const record = {
    eventId,
    requestId: id,
    authorId: message.author.id,
    rollMessageId: request.rollMessageId,
    before: basis.hp,
    after: plan.after,
    event: plan.event,
    resistances: plan.resistances,
    weaknesses: plan.weaknesses,
    reason: draft.reason ?? "Settled defense",
    wound: plan.wound,
  };
  const changes = {
    "system.health.value": plan.after,
    [`flags.${ID}.damageRevision`]: basis.revision + 1,
    [`flags.${ID}.damageEvents.${eventId}`]: record,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: signature,
    },
  };
  if (plan.survival) changes[`flags.${ID}.survival`] = plan.survival;
  else changes[`flags.${ID}.creatureDefeated`] = plan.after === 0;
  if (plan.wound)
    changes[`flags.${ID}.pendingWounds.${eventId}`] = {
      eventId,
      priorWounds: plan.survival.wounds - 1,
      types: plan.event.woundTypes,
      status: "awaiting-roll",
    };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  await message.update({
    content: `Damage applied: ${plan.event.total}; HP ${basis.hp} → ${plan.after}.${plan.wound ? " A wound is awaiting resolution." : ""}`,
  });
  Hooks.callAll("holDamageApplied", { actor, event: record });
  return { status: "complete", replay: false };
}
export function registerDamageRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "damageRequest") && isCreationAuthority())
      resolveDamageRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Damage needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
