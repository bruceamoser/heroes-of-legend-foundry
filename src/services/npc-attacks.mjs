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
  if (typeof blockable !== "boolean")
    throw new Error("The DA must judge whether this attack is blockable.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  const matches = game.combats.contents.flatMap((c) =>
    c.combatants
      .filter(
        (p) =>
          p.actor?.uuid === actor.uuid &&
          c.getFlag(ID, "encounter")?.current === p.id,
      )
      .map((p) => ({ c, p })),
  );
  if (matches.length !== 1)
    throw new Error("Select this creature's turn in one encounter first.");
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
          blockable,
        },
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
    const actor = await fromUuid(request.actorUuid),
      state = combat.getFlag(ID, "encounter"),
      budget = state?.budgets?.[request.participantId];
    if (
      actor?.type !== "creature" ||
      combat.combatants.get(request.participantId)?.actor?.uuid !==
        actor.uuid ||
      state?.current !== request.participantId ||
      request.revision !== state.revision ||
      !budget ||
      typeof request.blockable !== "boolean"
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
      ownTurn: true,
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
      blockable: request.blockable,
      hasBlockableJudgment: true,
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
