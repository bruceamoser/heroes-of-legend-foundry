import { promptDefenseRoll } from "./attribute-roll.mjs";
const ID = "heroes-of-legend";
export async function chooseDefender(messageId, { forceChoice = false } = {}) {
  const message = game.messages.get(messageId),
    attack = message?.getFlag(ID, "attackCard");
  if (!message?.author?.isGM || !attack || !message.isContentVisible)
    throw new Error("This attack card is unavailable.");
  const entries = new Map();
  for (const uuid of attack.suggestedDefenderTokenUuids) {
    const token = await fromUuid(uuid);
    if (token?.actor && (!token.hidden || game.user.isGM))
      entries.set(uuid, { uuid, name: token.name, suggested: true });
  }
  const suggested = [...entries.values()];
  if (suggested.length === 1 && !forceChoice)
    return open(suggested[0].uuid, messageId);
  for (const token of game.scenes.viewed?.tokens ?? [])
    if (
      token.actor &&
      (!token.hidden || game.user.isGM) &&
      !entries.has(token.uuid)
    )
      entries.set(token.uuid, { uuid: token.uuid, name: token.name });
  for (const actor of game.actors)
    if (actor.testUserPermission(game.user, "OBSERVER"))
      entries.set(actor.uuid, { uuid: actor.uuid, name: actor.name });
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/heroes-of-legend/templates/defender-choice.hbs",
    {
      entries: [...entries.values()],
      missing: attack.suggestedDefenderTokenUuids.length - suggested.length,
    },
  );
  const choice = await foundry.applications.api.DialogV2.input({
    window: { title: "Choose defender" },
    classes: ["heroes-of-legend", "hol-defender-choice"],
    position: { width: 500 },
    content,
    ok: { label: "Prepare defense" },
  });
  if (!choice) return;
  return open(choice.additionalUuid?.trim() || choice.defenderUuid, messageId);
}
async function open(uuid, messageId) {
  const document =
    typeof uuid === "string" && uuid ? await fromUuid(uuid) : null;
  const actor =
    document?.documentName === "Token"
      ? document.actor
      : document?.documentName === "Actor"
        ? document
        : null;
  if (!actor)
    throw new Error(
      "Choose an available defender; this entry may have been deleted.",
    );
  return promptDefenseRoll(actor, "agility", { attackMessageId: messageId });
}
export function renderAttackCard(message, element) {
  if (
    !message.isContentVisible ||
    !message.author?.isGM ||
    !message.getFlag(ID, "attackCard") ||
    element.querySelector(".hol-defend-button")
  )
    return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hol-defend-button";
  button.textContent = "Defend";
  button.addEventListener("click", () =>
    chooseDefender(message.id).catch((e) => ui.notifications.error(e.message)),
  );
  element.querySelector(".hol-attack-card")?.append(button);
}
