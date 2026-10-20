import { selectedDefender } from "../services/defender-selection.mjs";
import { promptDefenseRoll } from "./attribute-roll.mjs";
const ID = "heroes-of-legend";
export async function chooseDefender(messageId) {
  const message = game.messages.get(messageId),
    attack = message?.getFlag(ID, "attackCard");
  if (!message?.author?.isGM || !attack || !message.isContentVisible)
    throw new Error("This attack card is unavailable.");
  const { actor, tokenUuid } = selectedDefender({
    isGM: game.user.isGM,
    controlled: canvas.tokens?.controlled ?? [],
    character: game.user.character,
    tokens: [...(game.scenes.viewed?.tokens ?? [])],
  });
  return promptDefenseRoll(actor, attack.attributeKey, {
    attackMessageId: messageId,
    defenderTokenUuid: tokenUuid,
  });
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
  const card = element.querySelector(".hol-attack-card");
  (card?.querySelector(".hol-chat-footer") ?? card)?.append(button);
}
