import { abilityDefinition } from "../rules/ability-definitions.mjs";
import { declareAction, continueAction } from "../rules/actions.mjs";
import { actionConditions } from "./turn-budget.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { benefitCurrent } from "./benefits.mjs";
const ID = "heroes-of-legend";
export function itemAbilityDefinition(item) {
  return abilityDefinition(
    item.getFlag(ID, "catalogId"),
    item.getFlag(ID, "source"),
  );
}
export async function activateOwnedAbility(item) {
  if (!item.actor?.isOwner)
    throw new Error("Use an ability belonging to a character you own.");
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
export async function requestAbility(item, combat, participantId) {
  const definition = itemAbilityDefinition(item);
  if (!definition)
    throw new Error("This ability has no reviewed action handler yet.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: `${definition.name} requested.`,
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: {
        abilityRequest: {
          itemUuid: item.uuid,
          actorUuid: item.actor?.uuid,
          combatUuid: combat.uuid,
          participantId,
          revision: combat.getFlag(ID, "encounter")?.revision ?? 0,
        },
      },
    },
  });
}
export function resolveAbilityRequest(id, combatUuid) {
  return enqueueCharacterOperation(() => apply(id, combatUuid), {
    requestId: id,
  });
}
async function apply(id, combatUuid) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "abilityRequest");
  const combat = await fromUuid(combatUuid ?? request?.combatUuid ?? "");
  if (combat?.documentName !== "Combat")
    throw new Error("The action's encounter is unavailable.");
  let operation = combat.getFlag(ID, "abilityOperations")?.[id];
  if (operation) {
    if (request && JSON.stringify(request) !== operation.requestSignature)
      throw new Error("The reserved action request was changed.");
    if (message?.author && message.author.id !== operation.authorId)
      throw new Error("The original action author changed.");
    if (operation.status !== "applying")
      return { status: operation.status, replay: true };
  } else {
    if (!request || !message.author)
      throw new Error("The original ability request is unavailable.");
    if (combat.getFlag(ID, "pendingAbility"))
      throw new Error("Resolve the pending encounter action first.");
    const item = await fromUuid(request.itemUuid),
      actor = item?.actor,
      definition =
        item?.type === "ability" ? itemAbilityDefinition(item) : null;
    if (
      !actor ||
      actor.uuid !== request.actorUuid ||
      !actor.testUserPermission(message.author, "OWNER") ||
      !definition ||
      combat.combatants.get(request.participantId)?.actor?.uuid !== actor.uuid
    )
      throw new Error("Unauthorized or mismatched ability source.");
    const state = combat.getFlag(ID, "encounter"),
      budget = state?.budgets?.[request.participantId];
    if (
      !state ||
      !budget ||
      !Number.isSafeInteger(request.revision) ||
      request.revision !== state.revision
    )
      throw new Error("The encounter changed. Review this action again.");
    const next = structuredClone(state);
    next.budgets[request.participantId] = declareAction(budget, {
      operationId: id,
      sourceId: definition.id,
      category: definition.category,
      conditions: actionConditions(actor),
      ownTurn: state.current === request.participantId,
    });
    next.revision++;
    operation = {
      status: "applying",
      authorId: message.author.id,
      actorUuid: actor.uuid,
      itemUuid: item.uuid,
      participantId: request.participantId,
      handler: definition.handler,
      requestSignature: JSON.stringify(request),
      effectId: foundry.utils.randomID(),
      turnId: budget.turnId,
    };
    const existing = actor.effects.find(
      (e) =>
        e.getFlag(ID, "benefit")?.key === "defend" &&
        benefitCurrent(e) &&
        e.getFlag(ID, "benefit").anchor.combatId === combat.id &&
        e.getFlag(ID, "benefit").anchor.participantId === request.participantId,
    );
    if (existing) operation.effectId = existing.id;
    // Reject invalid native records before reserving a cost; revalidate again on continuation.
    for (const data of actor.toObject().effects) {
      const effect = new foundry.documents.ActiveEffect(data, {
        parent: actor,
        strict: true,
      });
      effect.validate({ strict: true, fallback: false });
    }
    // Reserve cost and durable continuation before any second document changes.
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.encounter`]: next,
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
    budget = state.budgets?.[operation.participantId];
  if (!budget || budget.turnId !== operation.turnId)
    throw new Error(
      "The reserved turn changed; the DA must reconcile this action.",
    );
  const appliedEffect = actor?.getFlag(ID, "abilityEffectReceipts")?.[id];
  if (appliedEffect?.applied && !actor.effects.has(operation.effectId))
    throw new Error(
      "The applied benefit is missing; reconcile its effect without repeating the action cost.",
    );
  const restrictions = actor ? actionConditions(actor) : { unconscious: true };
  const capable =
    Boolean(appliedEffect?.applied) ||
    (Boolean(actor) &&
      !["paralyzed", "asleep", "unconscious", "petrified"].some((k) =>
        Boolean(restrictions[k]),
      ));
  const continuation = continueAction(
    budget,
    { hp: actor?.system.health?.value ?? 0, items: {} },
    { operationId: id, capable },
  );
  state.budgets[operation.participantId] = continuation.state;
  if (continuation.proceed && !appliedEffect?.applied) {
    if (operation.handler !== "defend-v1")
      throw new Error("Unknown reserved action handler.");
    const effects = actor.toObject().effects;
    if (!actor.effects.has(operation.effectId))
      effects.push({
        _id: operation.effectId,
        name: "Defend · 1 defense Boon",
        img: "icons/svg/shield.svg",
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
        flags: {
          [ID]: {
            benefit: {
              key: "defend",
              anchor: {
                combatId: combat.id,
                participantId: operation.participantId,
                turnId: operation.turnId,
              },
              sourceUuid: operation.itemUuid,
              requestId: id,
            },
          },
        },
      });
    else if (
      actor.effects.get(operation.effectId).getFlag(ID, "benefit")?.key !==
      "defend"
    )
      throw new Error("The reserved effect ID belongs to another effect.");
    for (const data of effects) {
      const effect = new foundry.documents.ActiveEffect(data, {
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
  if (message)
    await message.update({
      content: continuation.proceed
        ? "Defend: one Maneuver spent. Gain one defense Boon until the start of your next turn; repeating the benefit does not increase it."
        : "The action could not continue. Its declared action remains spent.",
    });
  return { status: operation.status, replay: false };
}
export function registerAbilityRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "abilityRequest") && isCreationAuthority())
      resolveAbilityRequest(message.id).catch(async (e) => {
        ui.notifications.error(e.message);
        await message.update({
          content: `Action needs attention: ${foundry.utils.escapeHTML(e.message)}. The DA can resume a reserved action from Manage automation.`,
        });
      });
  });
}
