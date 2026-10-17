import { abilityDefinition } from "../rules/ability-definitions.mjs";
import { declareAction, continueAction } from "../rules/actions.mjs";
import {
  blockableJudgment,
  defenseAbilityAvailability,
  defenseAttemptContext,
} from "../rules/defense-abilities.mjs";
import { isShieldEquipment } from "../rules/equipment-identity.mjs";
import { upsertBenefitEffect } from "../rules/defense-benefits.mjs";
import { actionConditions } from "./turn-budget.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { benefitCurrent } from "./benefits.mjs";
import {
  incomingAttackContext,
  verifiedIncomingAttackContext,
} from "./roll-preparation.mjs";
const ID = "heroes-of-legend";
const HELPLESS = ["paralyzed", "asleep", "unconscious", "petrified"];
const DEFENSE_ABILITY_IDS = new Set(["ability-defend", "ability-shield-block"]);
export function itemAbilityDefinition(item) {
  return abilityDefinition(
    item.getFlag(ID, "catalogId"),
    item.getFlag(ID, "source"),
  );
}
export async function activateOwnedAbility(item) {
  if (!item.actor?.isOwner && !game.user.isGM)
    throw new Error(
      "Use an ability belonging to a character you own, or as the DA.",
    );
  const matches = game.combats.contents.flatMap((c) =>
    c.combatants
      .filter(
        (p) =>
          p.actor?.uuid === item.actor.uuid &&
          c.getFlag(ID, "encounter")?.current === p.id,
      )
      .map((p) => ({ combat: c, id: p.id })),
  );
  if (matches.length !== 1)
    throw new Error(
      "Select this character's turn in one encounter before using this action.",
    );
  return requestAbility(item, matches[0].combat, matches[0].id);
}
export async function requestAbility(
  item,
  combat,
  participantId,
  {
    attackMessageId = null,
    defenderTokenUuid = null,
    shieldItemUuid = null,
    additionalAttempt = false,
    attemptReason = "",
  } = {},
) {
  const definition = itemAbilityDefinition(item);
  if (!definition)
    throw new Error("This ability has no reviewed action handler yet.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  if (
    definition.id === "ability-shield-block" &&
    typeof attackMessageId !== "string"
  )
    throw new Error(
      "Shield Block must be activated before a blockable incoming defense.",
    );
  const actor = item.actor,
    request = {
      itemUuid: item.uuid,
      actorUuid: actor.uuid,
      combatUuid: combat.uuid,
      participantId,
      revision: combat.getFlag(ID, "encounter")?.revision ?? 0,
    };
  if (attackMessageId) {
    request.attackMessageId = attackMessageId;
    if (defenderTokenUuid) request.defenderTokenUuid = defenderTokenUuid;
    if (shieldItemUuid) request.shieldItemUuid = shieldItemUuid;
    request.defenseAttempt = {
      additionalAttempt: additionalAttempt === true,
      attemptReason:
        typeof attemptReason === "string" ? attemptReason.trim() : "",
    };
  }
  const recipients = game.users.filter(
    (user) =>
      user.isGM ||
      user.id === game.user.id ||
      actor.testUserPermission(user, "OWNER"),
  );
  return ChatMessage.create({
    content: `${definition.name} requested.`,
    whisper: recipients.map((user) => user.id),
    flags: { [ID]: { abilityRequest: request } },
  });
}
function heldShields(actor) {
  return actor.items
    .filter((item) => isShieldEquipment(item) && item.system.held)
    .sort((a, b) => a.id.localeCompare(b.id));
}
function combatForAttackActor(actor, attack) {
  const combats = attack?.combatId
    ? [game.combats.get(attack.combatId)].filter(Boolean)
    : game.combats.contents;
  const matches = combats.flatMap((combat) =>
    combat.combatants
      .filter((combatant) => combatant.actor?.uuid === actor.uuid)
      .map((participant) => ({ combat, participant })),
  );
  if (matches.length !== 1)
    throw new Error(
      "Select the defender in exactly one encounter before using this defense ability.",
    );
  return matches[0];
}
function validateDefenderToken(actor, defenderTokenUuid) {
  if (!defenderTokenUuid) return;
  const token = fromUuidSync(defenderTokenUuid);
  if (token?.documentName !== "Token" || token.actor?.uuid !== actor.uuid)
    throw new Error(
      "The selected defender token changed. Choose a defender again.",
    );
}
function pendingActorAbility(combat, actorUuid) {
  const pending = combat?.getFlag(ID, "pendingAbility");
  return Boolean(
    pending &&
      combat.getFlag(ID, "abilityOperations")?.[pending]?.actorUuid ===
        actorUuid,
  );
}
function availabilityContext({
  actor,
  combat,
  participant,
  attack,
  heldShieldUuids,
  incoming,
  judgmentError,
  additionalAttempt,
  attemptReason,
}) {
  const state = combat?.getFlag(ID, "encounter"),
    budget = participant && state?.budgets?.[participant.id],
    conditions = actor ? actionConditions(actor) : { unconscious: true },
    attempt = defenseAttemptContext(
      attack?.getFlag(ID, "defenseResponses"),
      actor?.uuid,
    );
  return {
    capable: !HELPLESS.some((key) => Boolean(conditions[key])),
    ownTurn: Boolean(participant && state?.current === participant.id),
    remaining: budget?.remaining ?? {},
    pending: pendingActorAbility(combat, actor?.uuid),
    ...attempt,
    additionalAttempt,
    attemptReason,
    attackMessageId: attack?.id,
    blockable: blockableJudgment(incoming),
    judgmentError,
    heldShieldUuids,
    standalone: !attack,
    standaloneActivationAvailable: Boolean(actor?.isOwner) || game.user.isGM,
  };
}
export function reviewedDefenseAbilityOptions(
  actor,
  {
    attackMessageId = null,
    defenderTokenUuid = null,
    additionalAttempt = false,
    attemptReason = "",
  } = {},
) {
  if (actor?.documentName !== "Actor")
    throw new Error("Choose an available defender.");
  let attack = null,
    incoming = null,
    judgmentError = "";
  if (attackMessageId) {
    attack = game.messages.get(attackMessageId);
    validateDefenderToken(actor, defenderTokenUuid);
    incoming = incomingAttackContext(attackMessageId);
    try {
      verifiedIncomingAttackContext(attackMessageId);
    } catch (error) {
      judgmentError = error.message;
    }
  }
  const matches = game.combats.contents.flatMap((combat) =>
      combat.combatants
        .filter((combatant) => combatant.actor?.uuid === actor.uuid)
        .map((combatant) => ({ combat, combatant })),
    ),
    attackCombat = attack?.getFlag(ID, "attackCard")?.combatId,
    selected = attack
      ? (matches.find(({ combat }) => combat.id === attackCombat) ?? null)
      : matches.length === 1
        ? matches[0]
        : null,
    shields = heldShields(actor),
    context = availabilityContext({
      actor,
      combat: selected?.combat ?? null,
      participant: selected?.combatant ?? null,
      attack,
      heldShieldUuids: shields.map((item) => item.uuid),
      incoming,
      judgmentError,
      additionalAttempt,
      attemptReason,
    });
  const options = actor.items
    .filter(
      (item) =>
        item.type === "ability" &&
        DEFENSE_ABILITY_IDS.has(item.getFlag(ID, "catalogId")),
    )
    .map((item) => {
      let definition;
      try {
        definition = itemAbilityDefinition(item);
        const availability = defenseAbilityAvailability(definition.id, context);
        return {
          id: definition.id,
          name: definition.name,
          itemId: item.id,
          itemUuid: item.uuid,
          shieldItemUuid: shields[0]?.uuid ?? null,
          pending: context.pending,
          ...availability,
        };
      } catch (error) {
        return {
          id: item.getFlag(ID, "catalogId"),
          name: item.name,
          itemId: item.id,
          itemUuid: item.uuid,
          shieldItemUuid: shields[0]?.uuid ?? null,
          pending: context.pending,
          available: false,
          reasons: [error.message],
        };
      }
    })
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        a.name.localeCompare(b.name),
    );
  return {
    combat: selected?.combat ?? null,
    participant: selected?.combatant ?? null,
    options,
  };
}
export async function requestDefenseAbility(
  item,
  {
    attackMessageId,
    defenderTokenUuid = null,
    shieldItemUuid = null,
    additionalAttempt = false,
    attemptReason = "",
  } = {},
) {
  if (!attackMessageId)
    throw new Error(
      "Standalone Defend uses the owned ability action instead of defense context.",
    );
  const actor = item.actor,
    definition = itemAbilityDefinition(item),
    incoming =
      definition?.id === "ability-shield-block"
        ? verifiedIncomingAttackContext(attackMessageId)
        : incomingAttackContext(attackMessageId),
    { combat, participant } = combatForAttackActor(actor, incoming),
    review = reviewedDefenseAbilityOptions(actor, {
      attackMessageId,
      defenderTokenUuid,
      additionalAttempt,
      attemptReason,
    }),
    option = review.options.find((entry) => entry.itemUuid === item.uuid);
  if (!option?.available)
    throw new Error(
      option?.reasons?.join(" ") ?? "This ability is unavailable.",
    );
  return requestAbility(item, combat, participant.id, {
    attackMessageId,
    defenderTokenUuid,
    shieldItemUuid:
      option.id === "ability-shield-block"
        ? (shieldItemUuid ?? option.shieldItemUuid)
        : null,
    additionalAttempt,
    attemptReason,
  });
}
export function resolveAbilityRequest(id, combatUuid) {
  return enqueueCharacterOperation(() => apply(id, combatUuid), {
    requestId: id,
  });
}
async function validateOperationSource(operation) {
  const item = await fromUuid(operation.itemUuid),
    definition = item?.type === "ability" ? itemAbilityDefinition(item) : null;
  if (
    !definition ||
    definition.handler !== operation.handler ||
    (operation.source &&
      JSON.stringify(operation.source) !== JSON.stringify(definition.source))
  )
    throw new Error(
      "The action's reviewed source changed; reconcile it before continuing.",
    );
  return { item, definition };
}
async function preflight({ message, request, combat }) {
  if (!request || !message.author)
    throw new Error("The original ability request is unavailable.");
  if (
    combat.getFlag(ID, "pendingAbility") ||
    combat.getFlag(ID, "pendingTurnPhase")
  )
    throw new Error("Resolve the pending encounter action first.");
  const item = await fromUuid(request.itemUuid),
    actor = item?.actor,
    definition = item?.type === "ability" ? itemAbilityDefinition(item) : null;
  if (
    !actor ||
    actor.uuid !== request.actorUuid ||
    !definition ||
    !DEFENSE_ABILITY_IDS.has(definition.id)
  )
    throw new Error("Unauthorized or mismatched ability source.");
  const participant = combat.combatants.get(request.participantId);
  if (participant?.actor?.uuid !== actor.uuid)
    throw new Error("The defender is not that participant in this encounter.");
  const state = combat.getFlag(ID, "encounter"),
    budget = state?.budgets?.[request.participantId];
  if (
    !state ||
    !budget ||
    !Number.isSafeInteger(request.revision) ||
    request.revision !== state.revision
  )
    throw new Error("The encounter changed. Review this action again.");

  let attack = null,
    incoming = null;
  if (request.attackMessageId) {
    attack = game.messages.get(request.attackMessageId);
    incoming =
      definition.id === "ability-shield-block"
        ? verifiedIncomingAttackContext(request.attackMessageId)
        : incomingAttackContext(request.attackMessageId);
    if (incoming.combatId && incoming.combatId !== combat.id)
      throw new Error("The incoming attack does not belong to this encounter.");
    if (
      definition.id === "ability-shield-block" &&
      incoming.combatId !== combat.id
    )
      throw new Error(
        "The Shield Block attack does not belong to this encounter.",
      );
    validateDefenderToken(actor, request.defenderTokenUuid);
  } else if (
    !message.author.isGM &&
    !actor.testUserPermission(message.author, "OWNER")
  ) {
    throw new Error(
      "Use a standalone ability belonging to a character you own, or as the DA.",
    );
  }
  const shields = heldShields(actor),
    context = availabilityContext({
      actor,
      combat,
      participant,
      attack,
      heldShieldUuids: shields.map((entry) => entry.uuid),
      incoming,
      additionalAttempt: request.defenseAttempt?.additionalAttempt === true,
      attemptReason:
        typeof request.defenseAttempt?.attemptReason === "string"
          ? request.defenseAttempt.attemptReason
          : "",
    }),
    availability = defenseAbilityAvailability(definition.id, context);
  if (!availability.available) throw new Error(availability.reasons.join(" "));
  let shieldItem = null;
  if (definition.handler === "shield-block-v1") {
    if (typeof request.shieldItemUuid !== "string")
      throw new Error("Choose the held shield used for Shield Block.");
    shieldItem = fromUuidSync(request.shieldItemUuid);
    if (
      shieldItem?.actor?.uuid !== actor.uuid ||
      !isShieldEquipment(shieldItem) ||
      !shieldItem.system.held
    )
      throw new Error(
        "The selected shield is no longer held by this defender.",
      );
  }
  return {
    item,
    actor,
    definition,
    shieldItem,
    context,
    incomingAttack: incoming,
  };
}
function benefitEffect(operation) {
  const key = operation.handler === "defend-v1" ? "defend" : "shield-block",
    name =
      key === "defend"
        ? "Defend · 1 defense Boon"
        : "Shield Block · 1 defense Boon",
    benefit = {
      key,
      anchor: {
        combatId: operation.combatId,
        participantId: operation.participantId,
        turnId: operation.turnId,
      },
      sourceUuid: operation.itemUuid,
      requestId: operation.requestId,
    };
  if (key === "shield-block") benefit.shieldItemUuid = operation.shieldItemUuid;
  return {
    _id: operation.effectId,
    name,
    img: "icons/svg/shield.svg",
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    flags: { [ID]: { benefit } },
  };
}
async function continuationCapable(operation, request, combat, actor) {
  if (!actor) return false;
  const conditions = actionConditions(actor),
    state = combat.getFlag(ID, "encounter"),
    budget = state?.budgets?.[operation.participantId];
  if (HELPLESS.some((key) => Boolean(conditions[key]))) return false;
  if (!budget || budget.turnId !== operation.turnId) return false;
  let currentAttack = null;
  if (operation.incomingAttack) {
    try {
      currentAttack =
        operation.handler === "shield-block-v1"
          ? verifiedIncomingAttackContext(request.attackMessageId)
          : incomingAttackContext(request.attackMessageId);
    } catch {
      return false;
    }
    if (
      JSON.stringify(currentAttack) !== JSON.stringify(operation.incomingAttack)
    )
      return false;
  }
  if (operation.handler === "defend-v1")
    return state.current === operation.participantId;
  if (operation.handler === "shield-block-v1") {
    if (currentAttack?.blockable !== true || !operation.incomingAttack)
      return false;
    const attackMessage = game.messages.get(request.attackMessageId),
      attempts = defenseAttemptContext(
        attackMessage?.getFlag(ID, "defenseResponses"),
        actor.uuid,
      );
    if (
      attempts.unresolvedDefense ||
      attempts.priorDefenses !== operation.defenseAttemptCount
    )
      return false;
    const shield = actor.items.get(operation.shieldItemId);
    return Boolean(shield && isShieldEquipment(shield) && shield.system.held);
  }
  return false;
}
async function apply(id, combatUuid) {
  const message = game.messages.get(id);
  let request = message?.getFlag(ID, "abilityRequest");
  const combat = await fromUuid(combatUuid ?? request?.combatUuid ?? "");
  if (combat?.documentName !== "Combat")
    throw new Error("The action's encounter is unavailable.");
  let operation = combat.getFlag(ID, "abilityOperations")?.[id];
  if (operation) {
    if (message && !request)
      throw new Error("The reserved action request changed.");
    if (request && JSON.stringify(request) !== operation.requestSignature)
      throw new Error("The reserved action request was changed.");
    if (message && !message.author)
      throw new Error("The original ability request author is unavailable.");
    if (message?.author && message.author.id !== operation.authorId)
      throw new Error("The original action author changed.");
    request ??= structuredClone(operation.requestSnapshot);
    if (!request)
      throw new Error("The original ability request snapshot is unavailable.");
    await validateOperationSource(operation);
    if (operation.status !== "applying") {
      const actor = await fromUuid(operation.actorUuid),
        receipt = actor?.getFlag(ID, "abilityEffectReceipts")?.[id],
        settlement = combat.getFlag(ID, "operationReceipts")?.[id];
      if (
        operation.status === "complete" &&
        (!receipt?.applied ||
          !actor?.effects.has(operation.effectId) ||
          settlement?.applied !== true ||
          settlement.status !== operation.status)
      )
        throw new Error(
          "The completed action needs reconciliation; do not repeat its cost.",
        );
      return { status: operation.status, replay: true };
    }
  } else {
    if (!message?.author)
      throw new Error("The original ability request is unavailable.");
    const checked = await preflight({ message, request, combat }),
      state = structuredClone(combat.getFlag(ID, "encounter")),
      budget = state.budgets[request.participantId],
      existing = checked.actor.effects.find((effect) => {
        const benefit = effect.getFlag(ID, "benefit");
        return (
          benefit?.key ===
            (checked.definition.handler === "defend-v1"
              ? "defend"
              : "shield-block") &&
          benefitCurrent(effect) &&
          benefit.anchor.combatId === combat.id &&
          benefit.anchor.participantId === request.participantId
        );
      });
    state.budgets[request.participantId] = declareAction(budget, {
      operationId: id,
      sourceId: checked.definition.id,
      category: checked.definition.category,
      conditions: actionConditions(checked.actor),
      ownTurn: state.current === request.participantId,
    });
    state.revision++;
    operation = {
      status: "applying",
      authorId: message.author.id,
      actorUuid: checked.actor.uuid,
      itemUuid: checked.item.uuid,
      participantId: request.participantId,
      combatId: combat.id,
      requestId: id,
      handler: checked.definition.handler,
      source: structuredClone(checked.definition.source),
      requestSnapshot: structuredClone(request),
      requestSignature: JSON.stringify(request),
      effectId: existing?.id ?? foundry.utils.randomID(),
      turnId: budget.turnId,
      shieldItemId: checked.shieldItem?.id ?? null,
      shieldItemUuid: checked.shieldItem?.uuid ?? null,
      incomingAttack: checked.incomingAttack
        ? structuredClone(checked.incomingAttack)
        : null,
      defenseAttemptCount: checked.context.priorDefenses,
    };
    for (const data of checked.actor.toObject().effects) {
      const effect = new foundry.documents.ActiveEffect(data, {
        parent: checked.actor,
        strict: true,
      });
      effect.validate({ strict: true, fallback: false });
    }
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.encounter`]: state,
      [`flags.${ID}.pendingAbility`]: id,
      [`flags.${ID}.abilityOperations.${id}`]: operation,
    });
  }
  if (combat.getFlag(ID, "pendingAbility") !== id)
    throw new Error(
      "The reserved action is not the encounter's pending action.",
    );
  const actor = await fromUuid(operation.actorUuid),
    state = structuredClone(combat.getFlag(ID, "encounter")),
    budget = state.budgets?.[operation.participantId],
    appliedEffect = actor?.getFlag(ID, "abilityEffectReceipts")?.[id];
  if (!budget || budget.turnId !== operation.turnId)
    throw new Error(
      "The reserved turn changed; the DA must reconcile this action.",
    );
  if (appliedEffect?.applied && !actor.effects.has(operation.effectId))
    throw new Error(
      "The applied benefit is missing; reconcile its effect without repeating the action cost.",
    );
  const capable =
      Boolean(appliedEffect?.applied) ||
      (await continuationCapable(operation, request, combat, actor)),
    continuation = continueAction(
      budget,
      { hp: actor?.system.health?.value ?? 0, items: {} },
      { operationId: id, capable },
    );
  state.budgets[operation.participantId] = continuation.state;
  const actionItem = await fromUuid(operation.itemUuid),
    definition =
      actionItem?.type === "ability" ? itemAbilityDefinition(actionItem) : null;
  if (continuation.proceed && !appliedEffect?.applied) {
    const data = benefitEffect(operation);
    if (actor.effects.has(operation.effectId)) {
      const benefit = actor.effects
        .get(operation.effectId)
        .getFlag(ID, "benefit");
      if (
        benefit?.key !==
        (operation.handler === "defend-v1" ? "defend" : "shield-block")
      )
        throw new Error("The reserved effect ID belongs to another effect.");
    }
    const effects = upsertBenefitEffect(actor.toObject().effects, data);
    for (const effectData of effects) {
      const effect = new foundry.documents.ActiveEffect(effectData, {
        parent: actor,
        strict: true,
      });
      effect.validate({ strict: true, fallback: false });
    }
    await writeAuthorityDocument(actor, {
      effects,
      [`flags.${ID}.abilityEffectReceipts.${id}`]: {
        applied: true,
        effectId: operation.effectId,
        key: operation.handler === "defend-v1" ? "defend" : "shield-block",
        source: structuredClone(operation.source),
        shieldItemUuid: operation.shieldItemUuid,
      },
    });
    if (!actor.effects.has(operation.effectId))
      throw new Error(
        "The benefit needs native effect reconciliation; do not repeat its cost.",
      );
  }
  operation = {
    ...operation,
    status: continuation.proceed ? "complete" : "interrupted",
  };
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: state,
    [`flags.${ID}.abilityOperations.${id}`]: operation,
    [`flags.${ID}.pendingAbility`]: null,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      kind: "ability",
      status: operation.status,
    },
  });
  const content =
    operation.status === "interrupted"
      ? `The action could not continue. Its declared ${definition?.category ?? "action"} remains spent.`
      : operation.handler === "defend-v1"
        ? "Defend: one Maneuver spent. Gain one defense Boon until the start of your next turn; repeating the benefit does not increase it."
        : "Shield Block: one Reaction spent. Gain one defense Boon against eligible blockable defenses until the start of your next turn while using the selected held shield; repeating the benefit does not increase it.";
  if (message)
    await message
      .update({
        content,
        [`flags.${ID}.abilityStatus`]: {
          status: operation.status,
          requestId: id,
          definitionId: definition?.id ?? null,
        },
      })
      // Presentation failure must not turn a settled action into a retryable cost.
      .catch(() => {});
  return { status: operation.status, replay: false };
}
export function registerAbilityRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "abilityRequest") && isCreationAuthority())
      resolveAbilityRequest(message.id).catch(async (e) => {
        ui.notifications.error(e.message);
        await message.update({
          content: `Action needs attention: ${foundry.utils.escapeHTML(e.message)}. The DA can resume a reserved action from Manage automation.`,
          [`flags.${ID}.abilityStatus`]: {
            status: "failed",
            requestId: message.id,
            error: e.message,
          },
        });
      });
  });
}
