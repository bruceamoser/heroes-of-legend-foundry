import { assertNoPendingTurn } from "./turn-lock.mjs";
import { woundRoll, woundResult } from "../rules/wounds.mjs";
import { DAMAGE_TYPES } from "../rules/damage.mjs";
import { enterLastWords, validateSurvival, survivalState } from "../rules/survival.mjs";
import { conditionIcon } from "./conditions.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
let catalog;
export async function woundCatalog() {
  if (!catalog) {
    const response = await fetch("systems/heroes-of-legend/data/wounds.json");
    if (!response.ok) throw new Error("Wound references are unavailable.");
    catalog = await response.json();
  }
  return catalog;
}
export function woundBasis(actor, eventId) {
  return {
    pending: structuredClone(
      actor.getFlag(ID, "pendingWounds")?.[eventId] ?? null,
    ),
    revision: actor.getFlag(ID, "damageRevision") ?? 0,
    conditionRevision: actor.getFlag(ID, "conditionRevision") ?? 0,
    hp: actor.system.health.value,
    survival: structuredClone(actor.getFlag(ID, "survival") ?? null),
  };
}
export async function requestWound(actor, eventId, kind, payload = {}) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: `Wound ${kind} requested.`,
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: {
        woundRequest: {
          actorUuid: actor.uuid,
          eventId,
          kind,
          basis: woundBasis(actor, eventId),
          ...payload,
        },
      },
    },
  });
}
export function resolveWoundRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "woundRequest");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.type !== "character" ||
    actor.pack ||
    !message.author ||
    !actor.testUserPermission(message.author, "OWNER")
  )
    throw new Error("A character owner or the DA must request this wound.");
  if (!["record", "roll", "apply", "recover"].includes(request.kind))
    throw new Error("Unknown wound operation.");
  if (request.kind === "recover" && !message.author.isGM)
    throw new Error("Only the DA can recover an unresolved wound roll.");
  if (request.skipped?.length && !message.author.isGM)
    throw new Error("Only the DA can record an anatomy exception.");
  const signature = JSON.stringify(request),
    receipt = actor.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (receipt.request !== signature || receipt.authorId !== message.author.id)
      throw new Error("The completed wound request changed.");
    if (
      request.kind === "apply" &&
      actor
        .getFlag(ID, "wounds")
        ?.[
          request.eventId
        ]?.effectIds.some((effectId) => !actor.effects.has(effectId))
    )
      throw new Error(
        "Applied wound effects need reconciliation; do not recreate them by repeating the wound.",
      );
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  if (request.kind === "record") {
    if (request.eventId !== null || JSON.stringify(woundBasis(actor, null)) !== JSON.stringify(request.basis))
      throw new Error("Character state changed. Review the wound count and record again.");
    const existing = actor.getFlag(ID, "survival");
    if (!existing && actor.system.health.value === 0)
      throw new Error("Reconcile this zero-HP character’s survival state before recording an additional wound.");
    const state = existing ? structuredClone(existing) : survivalState({
      hp: actor.system.health.value,
      maxHp: actor.system.health.max,
      gritAvailable: actor.system.grit.available,
      wounds: Object.keys(actor.getFlag(ID, "wounds") ?? {}).length,
    });
    validateSurvival(state);
    if (state.hp !== actor.system.health.value) throw new Error("Reconcile HP and survival before recording an additional wound.");
    const priorWounds = state.wounds;
    state.wounds += 1;
    validateSurvival(state);
    const eventId = `manual-wound-${id}`;
    const changes = {
      [`flags.${ID}.pendingWounds.${eventId}`]: { eventId, priorWounds, types: [...DAMAGE_TYPES], status: "awaiting-roll", manual: true },
      [`flags.${ID}.survival`]: state,
      [`flags.${ID}.damageRevision`]: request.basis.revision + 1,
      [`flags.${ID}.operationReceipts.${id}`]: { applied: true, authorId: message.author.id, request: signature },
    };
    actor.validate({ changes: foundry.utils.expandObject(changes), strict: true, fallback: false });
    await writeAuthorityDocument(actor, changes);
    await message.update({ content: "Additional wound recorded. Choose its damage type and roll once. HP and survival status were preserved." });
    return { status: "complete", replay: false, eventId };
  }
  let pending = structuredClone(
    actor.getFlag(ID, "pendingWounds")?.[request.eventId],
  );
  if (!pending) throw new Error("This pending wound is unavailable.");
  if (request.kind === "roll") {
    if (pending.status === "awaiting-roll") {
      if (JSON.stringify(pending) !== JSON.stringify(request.basis.pending))
        throw new Error("The pending wound changed. Review it again.");
      if (!Number.isSafeInteger(pending.priorWounds) || pending.priorWounds < 0)
        throw new Error("Invalid prior wound count.");
      if (
        !Array.isArray(pending.types) ||
        !pending.types.includes(request.damageType)
      )
        throw new Error("Choose a damage type eligible for this wound.");
      woundResult(await woundCatalog(), request.damageType, "111");
      pending = {
        ...pending,
        status: "rolling",
        damageType: request.damageType,
        rollRequestId: id,
        rollAuthorId: message.author.id,
        rollSignature: signature,
        catalogCommit: (await woundCatalog()).sourceCommit,
      };
      await writeAuthorityDocument(actor, {
        [`flags.${ID}.pendingWounds.${request.eventId}`]: pending,
      });
      const count = Math.min(5, 3 + pending.priorWounds),
        roll = await new foundry.dice.Roll(`${count}d6kh3`).evaluate({
          allowInteractive: false,
        });
      const faces = roll.dice[0].results.map((r) => r.result),
        result = woundRoll(pending.priorWounds, faces);
      pending = {
        ...pending,
        status: "rolled",
        faces,
        result,
        nativeRoll: roll.toJSON(),
      };
      await writeAuthorityDocument(actor, {
        [`flags.${ID}.pendingWounds.${request.eventId}`]: pending,
        [`flags.${ID}.operationReceipts.${id}`]: {
          applied: true,
          authorId: message.author.id,
          request: signature,
        },
      });
      await message.update({
        content: `Wound result ${result.key}. Review and apply its consequences; the DA resolves anatomy exceptions and placement.`,
        rolls: [roll],
      });
    } else if (pending.status === "rolling")
      throw new Error(
        "This wound may have rolled without a saved result. The DA must record a retained-dice recovery; retry will not reroll.",
      );
    else
      throw new Error(
        "This wound already has a result. Review the saved result instead of rolling again.",
      );
    return { status: "complete", replay: false };
  }
  if (request.kind === "recover") {
    if (pending.status !== "rolling")
      throw new Error(
        "Only an unresolved roll can be recovered, by the DA.",
      );
    const result = woundRoll(pending.priorWounds, request.faces);
    pending = {
      ...pending,
      status: "rolled",
      faces: request.faces,
      result,
      recovered: { reason: typeof request.reason === "string" ? request.reason : "", authorId: message.author.id },
    };
    const originalReceipt =
      pending.rollRequestId && pending.rollAuthorId && pending.rollSignature
        ? {
            [`flags.${ID}.operationReceipts.${pending.rollRequestId}`]: {
              applied: true,
              authorId: pending.rollAuthorId,
              request: pending.rollSignature,
              recoveredBy: id,
            },
          }
        : {};
    await writeAuthorityDocument(actor, {
      ...originalReceipt,
      [`flags.${ID}.pendingWounds.${request.eventId}`]: pending,
      [`flags.${ID}.operationReceipts.${id}`]: {
        applied: true,
        authorId: message.author.id,
        request: signature,
      },
    });
    await message.update({
      content: `The DA recorded recovered wound dice: ${request.faces.join(", ")} → ${result.key}. No new dice were rolled.`,
    });
    return { status: "complete", replay: false };
  }
  const appliedWound = actor.getFlag(ID, "wounds")?.[request.eventId];
  if (appliedWound) {
    if (appliedWound.effectIds.some((effectId) => !actor.effects.has(effectId)))
      throw new Error(
        "Applied wound effects need reconciliation; do not repeat the wound.",
      );
    await message.update({
      content:
        "This wound was already applied; its scar and effects were not duplicated.",
    });
    return { status: "complete", replay: true };
  }
  if (
    pending.status !== "rolled" ||
    JSON.stringify(woundBasis(actor, request.eventId)) !==
      JSON.stringify(request.basis)
  )
    throw new Error(
      "Wound or character state changed. Review the current result.",
    );
  const catalog = await woundCatalog();
  if (pending.catalogCommit !== catalog.sourceCommit)
    throw new Error(
      "The wound reference changed since this roll. Review its content migration before applying.",
    );
  if (woundRoll(pending.priorWounds, pending.faces).key !== pending.result.key)
    throw new Error("The saved wound key does not match its dice.");
  const result = woundResult(
      catalog,
      pending.damageType,
      pending.result.key,
      request.skipped ?? [],
    ),
    effects = actor.toObject().effects;
  if (
    result.effects.some((e) => e.requiresSource) &&
    (typeof request.fearSource !== "string" || !request.fearSource.trim())
  )
    throw new Error("Name the source of this wound’s Frightened condition.");
  const nativeIds = [],
    displacements = [];
  for (const consequence of result.effects) {
    if (consequence.kind === "lastWords") continue;
    if (consequence.kind === "forcedMovement") {
      displacements.push({ ...consequence, status: "awaiting-placement" });
      continue;
    }
    const effectId = foundry.utils.randomID();
    nativeIds.push(effectId);
    const condition =
      consequence.kind === "condition"
        ? {
            id: effectId,
            key: consequence.key,
            rating: consequence.rating,
            persistence: consequence.persistence,
            source:
              consequence.key === "frightened"
                ? request.fearSource
                : `Wound ${result.record.id}`,
            order: Date.now(),
          }
        : null;
    const woundModifier = condition
      ? null
      : {
          ...consequence,
          woundId: result.record.id,
          injury: result.record.injury,
          source: structuredClone(result.record.source),
          sourceCommit: catalog.sourceCommit,
        };
    effects.push({
      _id: effectId,
      name: `${result.record.injury} · ${condition ? condition.key : consequence.kind}`,
      img: condition ? conditionIcon(condition.key) : "icons/svg/blood.svg",
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      ...(condition ? { statuses: [`hol.${condition.key}`] } : {}),
      flags: {
        [ID]: {
          woundEvent: request.eventId,
          ...(condition ? { condition } : { woundModifier }),
        },
      },
    });
  }
  for (const data of effects) {
    const effect = new foundry.documents.ActiveEffect(data, {
      parent: actor,
      strict: true,
    });
    effect.validate({ strict: true, fallback: false });
  }
  const record = {
    ...result.record,
    eventId: request.eventId,
    originalKey: pending.result.key,
    damageType: pending.damageType,
    skipped: request.skipped ?? [],
    scar: true,
    recoveryProgress: 0,
    effectIds: nativeIds,
    displacements,
    appliedBy: message.author.id,
  };
  const changes = {
    effects,
    [`flags.${ID}.pendingWounds.${request.eventId}.status`]: "resolved",
    [`flags.${ID}.wounds.${request.eventId}`]: record,
    [`flags.${ID}.conditionRevision`]: request.basis.conditionRevision + 1,
    [`flags.${ID}.damageRevision`]: request.basis.revision + 1,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: signature,
    },
  };
  if (result.effects.some((e) => e.kind === "lastWords")) {
    if (
      !request.basis.survival ||
      request.basis.survival.hp !== actor.system.health.value
    )
      throw new Error("Reconcile survival before applying Last Words.");
    const survival = enterLastWords(request.basis.survival);
    validateSurvival(survival);
    changes[`flags.${ID}.survival`] = survival;
    changes["system.health.value"] = survival.hp;
  }
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  if (nativeIds.some((id) => !actor.effects.has(id)))
    throw new Error(
      "Wound effects need reconciliation; do not apply them again.",
    );
  await message.update({
    content: `Wound ${result.record.key} recorded with its scar and native effects.${displacements.length ? " Immediate displacement still needs DA direction and legal placement." : ""} Lasting movement and contextual roll modifiers now contribute through normal preparation.`,
  });
  return { status: "complete", replay: false };
}
export function registerWoundRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "woundRequest") && isCreationAuthority())
      resolveWoundRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Wound needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
