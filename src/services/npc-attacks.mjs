import { assertNoPendingActorPotion } from "./turn-lock.mjs";
import { renderMarkdown } from "../sheets/creature-reference.mjs";
import { declareAction, continueAction } from "../rules/actions.mjs";
import { actionConditions } from "./turn-budget.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
/** Explicit DA-selected NPC perspective, never inferred just from Actor type. */
export async function declareNpcMelee(actor, { blockable } = {}) {
  const suggestedDefenderTokenUuids = [...game.user.targets].map(
    (t) => t.document.uuid,
  );
  if (!game.user.isGM || actor.type !== "creature")
    throw new Error("The DA declares this NPC creature attack.");
  if (blockable != null && typeof blockable !== "boolean")
    throw new Error("Invalid blockability hint.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  const matches = game.combats.contents.flatMap((c) =>
    c.combatants
      .filter(
        (p) =>
          p.actor?.uuid === actor.uuid &&
          Boolean(c.getFlag(ID, "encounter")?.budgets?.[p.id]),
      )
      .map((p) => ({ c, p })),
  );
  if (matches.length !== 1)
    throw new Error("Place this creature in exactly one encounter first.");
  const { c, p } = matches[0];
  return ChatMessage.create({
    content: "NPC Basic Melee declaration pending.",
    flags: {
      [ID]: {
        npcAttackRequest: {
          actorUuid: actor.uuid,
          combatUuid: c.uuid,
          participantId: p.id,
          revision: c.getFlag(ID, "encounter").revision,
          suggestedDefenderTokenUuids,
          blockable: blockable ?? null,
        },
      },
    },
  });
}
/** A GM reference declaration records intent; costs and effects remain manual. */
export async function declareCreatureAction(actor, actionId) {
  if (!game.user.isGM || actor?.type !== "creature")
    throw new Error("The DA declares this creature action.");
  const action = actor.system.actions.entries.find(
    (entry) => entry.id === actionId,
  );
  if (!action) throw new Error("This creature action is unavailable.");
  const encounters = game.combats.contents.filter((combat) =>
    combat.combatants.some(
      (participant) => participant.actor?.uuid === actor.uuid,
    ),
  );
  const reference = {
    ...(encounters.length === 1 ? { combatId: encounters[0].id } : {}),
    resolution: "reference",
    actorUuid: actor.uuid,
    attackerName: actor.name,
    actionId: action.id,
    abilityId: action.abilityId ?? "",
    category: action.category,
    title: action.name,
    perspective: "defender",
    attributeKey: action.attributeKey,
    defenseSource: action.defenseSource,
    harmfulOnly: action.harmfulOnly,
    threat: {
      boons: actor.system.threat.boons,
      banes: actor.system.threat.banes,
    },
    outcomes: action.hasOutcomes ? structuredClone(action.outcomes) : null,
    effect: action.effect,
    referenceMarkdown: action.referenceMarkdown,
    suggestedDefenderTokenUuids: [...game.user.targets].map(
      (token) => token.document.uuid,
    ),
    source: actor.getFlag(ID, "source") ?? null,
    sourceCommit: actor.getFlag(ID, "sourceCommit") ?? null,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/heroes-of-legend/templates/creature-action-card.hbs",
    {
      ...reference,
      categoryLabel: {
        main: "Main Action",
        maneuver: "Maneuver",
        reaction: "Reaction",
      }[reference.category],
      referenceHTML: renderMarkdown(reference.referenceMarkdown),
    },
  );
  return ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [ID]: {
        creatureAction: reference,
        ...(reference.attributeKey ? { attackCard: reference } : {}),
      },
    },
  });
}

export function resolveNpcAttack(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "npcAttackRequest");
  const combat = request && (await fromUuid(request.combatUuid));
  if (!message?.author?.isGM || combat?.documentName !== "Combat")
    throw new Error("Invalid DA attack declaration.");
  const receipt = combat.getFlag(ID, "operationReceipts")?.[id];
  let snapshot = combat.getFlag(ID, "attacks")?.[id];
  if (receipt?.applied) {
    if (
      receipt.authorId !== message.author.id ||
      receipt.request !== JSON.stringify(request) ||
      !snapshot
    )
      throw new Error("The settled attack request changed.");
  } else {
    if (
      combat.getFlag(ID, "pendingAbility") ||
      combat.getFlag(ID, "pendingPotion") ||
      combat.getFlag(ID, "pendingTurnPhase")
    )
      throw new Error("Resolve the pending encounter action first.");
    assertNoPendingActorPotion(combat);
    const actor = await fromUuid(request.actorUuid),
      state = combat.getFlag(ID, "encounter"),
      budget = state?.budgets?.[request.participantId];
    if (
      actor?.type !== "creature" ||
      combat.combatants.get(request.participantId)?.actor?.uuid !==
        actor.uuid ||
      request.revision !== state.revision ||
      !budget ||
      (request.blockable != null && typeof request.blockable !== "boolean")
    )
      throw new Error(
        "The creature's selected turn changed. Review the attack again.",
      );
    if (
      !Array.isArray(request.suggestedDefenderTokenUuids) ||
      new Set(request.suggestedDefenderTokenUuids).size !==
        request.suggestedDefenderTokenUuids.length ||
      request.suggestedDefenderTokenUuids.some(
        (uuid) =>
          typeof uuid !== "string" ||
          !/^Scene\.[^.]+\.Token\.[^.]+$/.test(uuid),
      )
    )
      throw new Error("Invalid suggested token identities.");
    const declared = declareAction(budget, {
      operationId: id,
      sourceId: "npc-basic-melee",
      category: "main",
      conditions: actionConditions(actor),
      ownTurn: state.current === request.participantId,
    });
    const next = structuredClone(state);
    next.budgets[request.participantId] = continueAction(
      declared,
      { hp: actor.system.health.value, items: {} },
      { operationId: id, capable: true },
    ).state;
    next.revision++;
    snapshot = {
      id,
      actorUuid: actor.uuid,
      attackerName: actor.name,
      guidance: declared.operations[id].audit?.exceptions.join(" ") ?? "",
      attributeKey: "agility",
      threat: {
        boons: actor.system.threat.boons,
        banes: actor.system.threat.banes,
      },
      damage: Object.fromEntries(
        ["weak", "standard", "strong"].map((key) => [
          key,
          actor.system.basicMelee[key],
        ]),
      ),
      suggestedDefenderTokenUuids: [...request.suggestedDefenderTokenUuids],
      blockable: request.blockable ?? null,
      hasBlockableJudgment: typeof request.blockable === "boolean",
      combatId: combat.id,
      perspective: "defender",
      title: "Basic Melee",
    };
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.encounter`]: next,
      [`flags.${ID}.attacks.${id}`]: snapshot,
      [`flags.${ID}.operationReceipts.${id}`]: {
        applied: true,
        authorId: message.author.id,
        request: JSON.stringify(request),
        kind: "npc-attack",
      },
    });
  }
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/heroes-of-legend/templates/attack-card.hbs",
    snapshot,
  );
  await message.update({ content, [`flags.${ID}.attackCard`]: snapshot });
  return { status: "complete", replay: Boolean(receipt?.applied) };
}
export function registerNpcAttacks() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "npcAttackRequest") && isCreationAuthority())
      resolveNpcAttack(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Attack needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
