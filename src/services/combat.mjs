import { expireStaleBenefits } from "./benefits.mjs";
import {
  initialBudgets,
  prepareParticipantBudget,
  convertParticipantBudget,
} from "./turn-budget.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import {
  startEncounter,
  chooseParticipant,
  finishTurn,
  changeRoster,
} from "../rules/encounter.mjs";
const ID = "heroes-of-legend";
export function combatSide(combatant) {
  return (
    combatant.getFlag(ID, "side") ??
    (combatant.actor?.hasPlayerOwner ? "players" : "opposition")
  );
}
export async function requestCombat(combat, kind, payload = {}) {
  if (!combat || !game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("A GM must enable the automation coordinator first.");
  return ChatMessage.create({
    content: `Encounter ${kind} requested.`,
    ...(kind === "start"
      ? {}
      : {
          whisper: game.users
            .filter((u) => u.isGM || u.id === game.user.id)
            .map((u) => u.id),
        }),
    flags: {
      [ID]: {
        combatRequest: {
          ...payload,
          combatUuid: combat.uuid,
          kind,
          revision: combat.getFlag(ID, "encounter")?.revision ?? 0,
        },
      },
    },
  });
}
export function resolveCombatRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "combatRequest");
  const combat =
    typeof request?.combatUuid === "string"
      ? await fromUuid(request.combatUuid)
      : null;
  if (
    combat?.documentName !== "Combat" ||
    !message.author ||
    !["start", "choose", "finish", "roster", "convert"].includes(request.kind)
  )
    throw new Error("Invalid encounter request.");
  const receipt = combat.getFlag(ID, "operationReceipts")?.[id];
  if (receipt?.applied) {
    if (
      receipt.authorId !== message.author.id ||
      receipt.request !== JSON.stringify(request)
    )
      throw new Error(
        "Completed request was changed; its receipt cannot be reused.",
      );
    await expireStaleBenefits(combat);
    await presentResult(message, combat);
    return { status: "complete", replay: true };
  }
  if (combat.getFlag(ID, "pendingAbility"))
    throw new Error(
      "Resume the pending action from Manage automation before advancing this encounter.",
    );
  const state = combat.getFlag(ID, "encounter"),
    actor = combat.combatants.get(
      ["choose", "convert"].includes(request.kind)
        ? (request.id ?? state?.current)
        : state?.current,
    )?.actor;
  if (["choose", "finish", "convert"].includes(request.kind)) {
    if (
      !message.author.isGM &&
      !actor?.testUserPermission(message.author, "OWNER")
    )
      throw new Error("Choose or finish a participant you own, or ask the DA.");
  } else if (!message.author.isGM)
    throw new Error("The DA starts encounters and decides roster changes.");
  if (
    !Number.isSafeInteger(request.revision) ||
    request.revision !== (state?.revision ?? 0)
  )
    throw new Error(
      "The encounter changed. Review the current side and choose again.",
    );
  let next, openingRoll;
  if (request.kind === "start") {
    if (state) throw new Error("This encounter has already started.");
    const participants = combat.combatants
      .filter((c) => !c.isDefeated)
      .map((c) => ({ id: c.id, side: combatSide(c) }));
    if (!participants.length)
      throw new Error("Add at least one participating combatant first.");
    openingRoll = await new foundry.dice.Roll("3d6").evaluate();
    next = startEncounter(
      participants,
      openingRoll.dice[0].results.map((r) => r.result),
    );
    next.opening.roll = openingRoll.toJSON();
    next.budgets = initialBudgets(combat, next.roster);
  } else {
    if (!state) throw new Error("Start the encounter first.");
    if (request.kind === "choose") {
      if (!combat.combatants.has(request.id))
        throw new Error(
          "That participant was removed; the DA can withdraw it from the roster.",
        );
      next = chooseParticipant(state, request.id);
      const { budget, profile, ruling } = prepareParticipantBudget(
        combat,
        next,
        request.id,
        request,
        message.author,
      );
      next.budgets = { ...(next.budgets ?? {}), [request.id]: budget };
      if (profile)
        next.movementProfiles = {
          ...(next.movementProfiles ?? {}),
          [request.id]: profile,
        };
      if (ruling)
        next.speedRulings = {
          ...(next.speedRulings ?? {}),
          [request.id]: ruling,
        };
    } else if (request.kind === "finish") next = finishTurn(state);
    else if (request.kind === "convert")
      next = convertParticipantBudget(
        combat,
        state,
        request,
        message.author,
        id,
      );
    else {
      if (request.mode !== "withdraw" && !combat.combatants.has(request.id))
        throw new Error(
          "Add the native combatant before admitting it to the roster.",
        );
      next = changeRoster(state, request);
      if (request.mode !== "withdraw" && !next.budgets?.[request.id])
        next.budgets = {
          ...(next.budgets ?? {}),
          ...initialBudgets(combat, [{ id: request.id }]),
        };
    }
  }
  if (!isCreationAuthority()) return { status: "authority-lost" };
  const turn = next.current
    ? combat.turns.findIndex((c) => c.id === next.current)
    : null;
  if (turn === -1)
    throw new Error("The native turn list changed. Refresh and retry.");
  await writeAuthorityDocument(combat, {
    round: next.round,
    turn,
    [`flags.${ID}.encounter`]: next,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      kind: request.kind,
      authorId: message.author.id,
      request: JSON.stringify(request),
      revision: next.revision,
    },
  });
  await expireStaleBenefits(combat);
  await presentResult(message, combat);
  return { status: "complete", replay: false };
}
async function presentResult(message, combat) {
  const state = combat.getFlag(ID, "encounter"),
    kind = message.getFlag(ID, "combatRequest").kind;
  if (kind === "start")
    await message.update({
      content: `Opening roll: ${state.opening.total}. ${state.startingSide === "players" ? "Players" : "Opposition"} start each round. Choose the first participant in the encounter tracker.`,
      rolls: [state.opening.roll],
    });
  else await message.update({ content: "Encounter decision recorded." });
}
export function registerCombatRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "combatRequest") && isCreationAuthority())
      resolveCombatRequest(message.id).catch(async (e) => {
        ui.notifications.error(e.message);
        await message.update({
          content: `Encounter needs attention: ${foundry.utils.escapeHTML(e.message)}`,
        });
      });
  });
}
