import { conditionApplication } from "./condition-apply.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import { classifyRoll } from "../rules/roll.mjs";
import { damageEvent, canonicalDamageType } from "../rules/damage.mjs";
import { passiveDefenseSources } from "../rules/passive-defenses.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { playerBasicMeleeDamage } from "./player-attacks.mjs";
const ID = "heroes-of-legend";
function passiveCatalogRecords(actor, type) {
  return actor.items
    .filter((item) => item.type === type)
    .map((item) => ({
      instanceId: item.id,
      catalogId:
        (type === "equipment"
          ? item.system.catalogId
          : item.getFlag(ID, "catalogId")) ?? "",
      worn: type === "equipment" ? item.system.worn : undefined,
      quantity: type === "equipment" ? item.system.quantity : undefined,
      source: structuredClone(item.getFlag(ID, "source") ?? null),
    }))
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}
export function damageBasis(actor) {
  if (!["character", "creature", "summon"].includes(actor?.type) || actor.pack)
    throw new Error("Choose a world character or creature.");
  const resolved = passiveDefenseSources({
    abilities: passiveCatalogRecords(actor, "ability"),
    equipment: passiveCatalogRecords(actor, "equipment"),
  });
  const passiveDefenses = structuredClone({
    resistances: [...resolved.resistances, ...(actor.system.resistances?.numeric ?? []).map(source => ({ ...source, type: canonicalDamageType(source.type), label: "Printed resistance" }))],
    weaknesses: [...resolved.weaknesses, ...(actor.system.weaknesses?.numeric ?? []).map(source => ({ ...source, type: canonicalDamageType(source.type), label: "Printed weakness" }))],
  });
  return {
    actorUuid: actor.uuid,
    hp: actor.system.health.value,
    maxHp: actor.system.health.max,
    gritAvailable: actor.system.grit?.available ?? 0,
    survival: structuredClone(actor.getFlag(ID, "survival") ?? null),
    revision: actor.getFlag(ID, "damageRevision") ?? 0,
    equipmentRevision: actor.getFlag(ID, "equipmentRevision") ?? 0,
    passiveDefenses,
    printedArmor: actor.type === "creature" ? actor.system.armor : 0,
  };
}
export function damagePreview(actor, basis, draft, { bypassResistance = false } = {}) {
  const resistances = [
      ...(basis.passiveDefenses?.resistances ?? []),
      ...(draft.resistances ?? []),
    ],
    weaknesses = [
      ...(basis.passiveDefenses?.weaknesses ?? []),
      ...(draft.weaknesses ?? []),
    ],
    sources = [...resistances];
  if (basis.printedArmor)
    sources.push({
      sourceId: "creature-printed-armor",
      type: "physical",
      value: basis.printedArmor,
      label: "Printed creature Physical DR",
      automatic: true,
    });
  for (const source of [...sources, ...weaknesses])
    if (typeof source.label !== "string" || !source.label.trim())
      throw new Error("Label each damage modifier source.");
  const event = damageEvent({
    components: draft.components.map(component => ({...component,type:canonicalDamageType(component.type)})),
    resistances: bypassResistance ? [] : sources.map(source => ({...source,type:canonicalDamageType(source.type)})),
    weaknesses: bypassResistance ? [] : weaknesses.map(source => ({...source,type:canonicalDamageType(source.type)})),
  });
  // Consequences are separate player actions. HP corrections never need a
  // survival-state reconciliation before this button can be used again.
  const survival = null, wound = false, after = Math.max(0, basis.hp - event.total);
  return {
    event,
    survival,
    wound,
    after,
    resistances: sources,
    weaknesses,
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
  const card = attack.getFlag(ID, "attackCard");
  if (card?.resolution === "reference" || result.attackOutcome?.resolution === "reference")
    throw new Error("Resolve this reference action's effects manually.");
  const amount = card?.damage?.[result.tier];
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
/** Run within the defense coordinator operation. The GM-authored attack and
 * saved native dice authorize only its exact fixed outcome, never arbitrary damage.
 * HP, survival, event and receipt share one Actor update for crash-safe replay. */
export async function settleDefenseDamage(message) {
  if (!isCreationAuthority()) throw new Error("Only the active GM coordinator can settle defense damage.");
  const snapshot = message.getFlag(ID, "roll");
  const ledger = game.messages.get(snapshot?.attackMessageId)?.getFlag(ID, "defenseResponses")?.find(row => row.requestId === message.id);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(snapshot)));
  const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (!ledger?.resultSignature || ledger.resultSignature !== signature)
    throw new Error("The saved defense result is unverified or changed. The DA must reconcile this attempt.");
  const defense = defenseDamage(message);
  const actor = await fromUuid(defense.actorUuid);
  const source = JSON.stringify({ attackMessageId: message.getFlag(ID, "roll").attackMessageId,
    actorUuid: defense.actorUuid, components: defense.components });
  const prior = actor.getFlag(ID, "damageEvents")?.[defense.eventId];
  if (prior) {
    if (prior.source !== source || prior.requestId !== message.id)
      throw new Error("The applied defense damage source changed.");
    return prior;
  }
  assertNoPendingTurn(actor);
  const basis = damageBasis(actor);
  const plan = damagePreview(actor, basis, { components: defense.components });
  const record = { eventId: defense.eventId, requestId: message.id,
    authorId: message.author.id, rollMessageId: message.id,
    kind: "defense-damage", source, before: basis.hp, after: plan.after,
    event: plan.event, resistances: plan.resistances, weaknesses: plan.weaknesses,
    wound: plan.wound };
  const changes = { "system.health.value": plan.after,
    [`flags.${ID}.damageRevision`]: basis.revision + 1,
    [`flags.${ID}.damageEvents.${defense.eventId}`]: record,
    [`flags.${ID}.operationReceipts.${message.id}`]: { applied: true, kind: "defense-damage", source } };
  if (plan.survival) changes[`flags.${ID}.survival`] = plan.survival;
  else changes[`flags.${ID}.creatureDefeated`] = plan.after === 0;
  if (plan.wound) changes[`flags.${ID}.pendingWounds.${defense.eventId}`] = {
    eventId: defense.eventId, priorWounds: plan.survival.wounds - 1,
    types: plan.event.woundTypes, status: "awaiting-roll" };
  actor.validate({ changes: foundry.utils.expandObject(changes), strict: true, fallback: false });
  await writeAuthorityDocument(actor, changes);
  Hooks.callAll("holDamageApplied", { actor, event: record });
  return record;
}
export async function requestDamage(
  actor,
  basis,
  draft,
  rollMessageId = null,
  attackMessageId = null,
) {
  if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("Only this actor’s owner can apply damage.");
  const { applyOwnedDamage } = await import("./explicit-damage.mjs");
  const current = damageBasis(actor);
  if (JSON.stringify(current) !== JSON.stringify(basis)) throw new Error("HP or defenses changed. Reopen the damage preview.");
  const source = rollMessageId ? defenseDamage(game.messages.get(rollMessageId))
    : attackMessageId ? playerBasicMeleeDamage(attackMessageId) : null;
  const result = await applyOwnedDamage(actor, source?.components ?? draft.components, {
    sourceMessageId: rollMessageId ?? attackMessageId,
    label: draft.reason || "Damage", resistances: draft.resistances, weaknesses: draft.weaknesses,
    bypassResistance: draft.conditionKey === "bleeding",
  });
  try {
    await ChatMessage.create({ content: `${foundry.utils.escapeHTML(actor.name)}: ${result.total} damage · HP ${result.before} → ${result.after}. Edit HP to correct a mistake.` });
  } catch { ui.notifications.warn("Damage was applied, but the chat summary could not be posted. Check HP before applying again."); }
  return result;
}
export function resolveDamageRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "damageRequest");
  if (!message?.author) throw new Error("The damage request has no author.");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (actor?.documentName !== "Actor" || actor.pack)
    throw new Error("Damage target is unavailable.");
  const conditionKey = request.draft?.conditionKey;
  if (!actor.testUserPermission(message.author, "OWNER")) throw new Error("Only the target actor’s owner can apply damage.");
  if (conditionKey && (request.rollMessageId || request.attackMessageId)) throw new Error("A condition event cannot also be an attack result.");
  const signature = JSON.stringify(request),
    receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id)
      throw new Error("The completed damage request changed.");
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  let eventId = id,
    draft = structuredClone(request.draft),
    attackLink = null;
  if (conditionKey) {
    const current = conditionApplication(actor, conditionKey);
    if (JSON.stringify(current.conditionSnapshot) !== JSON.stringify(draft.conditionSnapshot)) throw new Error("Condition sources changed. Review and apply again.");
    draft = current;
  }
  if (request.rollMessageId) {
    const defense = defenseDamage(game.messages.get(request.rollMessageId));
    if (defense.actorUuid !== actor.uuid)
      throw new Error("The roll belongs to a different defender.");
    draft.components = defense.components;
    eventId = defense.eventId;
  } else if (request.attackMessageId) {
    const attack = playerBasicMeleeDamage(
      request.attackMessageId,
    );
    if (attack.actorUuid !== actor.uuid)
      throw new Error("The Basic Melee target is a different actor.");
    draft.components = attack.components;
    eventId = attack.eventId;
    attackLink = attack;
  }
  const applied = actor.getFlag(ID, "damageEvents")?.[eventId];
  if (applied) {
    await message.update({
      content:
        request.attackMessageId
          ? "This Basic Melee damage was already applied; HP was not changed again."
          : "This defense damage was already applied; HP was not changed again.",
    });
    return { status: "complete", replay: true };
  }
  const basis = damageBasis(actor);
  if (JSON.stringify(basis) !== JSON.stringify(request.basis))
    throw new Error(
      "HP, survival or defenses changed. Review the damage preview again.",
    );
  const plan = damagePreview(actor, basis, draft, { bypassResistance: conditionKey === "bleeding" });
  const record = {
    eventId,
    requestId: id,
    authorId: message.author.id,
    rollMessageId: request.rollMessageId,
    attackMessageId: attackLink?.attackMessageId ?? null,
    attackSource: attackLink?.source ?? null,
    before: basis.hp,
    after: plan.after,
    event: plan.event,
    resistances: plan.resistances,
    weaknesses: plan.weaknesses,
    kind: conditionKey ? "condition-damage" : attackLink ? "basic-melee-damage" : request.rollMessageId ? "defense-damage" : "manual-damage",
    reason: typeof draft.reason === "string" ? draft.reason.trim() : "",
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
