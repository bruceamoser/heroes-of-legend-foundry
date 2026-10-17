import { ATTRIBUTES } from "../rules/character.mjs";
import { rollPlan, classifyRoll } from "../rules/roll.mjs";

export async function rollAttribute(actor, attributeKey, { boons = 0, banes = 0 } = {}) {
  if (!actor?.testUserPermission(game.user, "OWNER")) throw new Error(game.i18n.localize("HOL.NoPermission"));
  if (!ATTRIBUTES.includes(attributeKey)) throw new Error("Unknown attribute.");
  const plan = rollPlan({ attribute: actor.system.attributes[attributeKey].effective, boons, banes });
  const mode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(plan.formula).evaluate({ allowInteractive: mode !== "blind" });
  const retained = roll.dice[0].results.filter(result => result.active).map(result => result.result);
  const result = classifyRoll(retained, plan.attribute);
  const snapshot = { schemaVersion: 1, actorUuid: actor.uuid, attributeKey, ...plan, retained, ...result };
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize(`HOL.Attributes.${attributeKey}`),
    flags: { "heroes-of-legend": { roll: snapshot } }
  }, { messageMode: mode });
}

export function renderRollSummary(message, element) {
  const result = message.getFlag("heroes-of-legend", "roll");
  if (!result || !message.isContentVisible || element.querySelector(".hol-roll-summary")) return;
  const summary = document.createElement("div");
  summary.className = "hol-roll-summary";
  const title = document.createElement("strong");
  title.textContent = game.i18n.localize(`HOL.Tiers.${result.tier}`);
  summary.append(title);
  if (result.natural !== "none") {
    const natural = document.createElement("p");
    natural.textContent = game.i18n.localize(`HOL.Naturals.${result.natural}`);
    summary.append(natural);
  }
  const detail = document.createElement("p");
  detail.textContent = game.i18n.format("HOL.RollDetails", { faces: result.retained.join(", "), boons: result.boons, banes: result.banes });
  summary.append(detail);
  element.querySelector(".message-content")?.append(summary);
}
