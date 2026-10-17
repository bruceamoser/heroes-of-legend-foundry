import { rollBasis, prepareRoll } from "./roll-preparation.mjs";
import { classifyRoll } from "../rules/roll.mjs";

export async function rollAttribute(actor, attributeKey, draft = {}) {
  const basis = rollBasis(actor, attributeKey);
  return rollPrepared(actor, basis, draft);
}

export async function rollPrepared(actor, basis, draft) {
  const current = rollBasis(
    actor,
    basis.attributeKey,
    basis.mode,
    basis.attackMessageId,
  );
  if (JSON.stringify(current) !== JSON.stringify(basis))
    throw new Error("Roll sources changed. Review the dialog before rolling.");
  const plan = prepareRoll(current, draft);
  const mode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(plan.formula).evaluate({
    allowInteractive: mode !== "blind",
  });
  const retained = roll.dice[0].results
    .filter((result) => result.active)
    .map((result) => result.result);
  const result = classifyRoll(retained, plan.attribute);
  const snapshot = {
    schemaVersion: 2,
    actorUuid: actor.uuid,
    rollerId: game.user.id,
    attackMessageId: basis.attackMessageId,
    attackOutcome: basis.incoming
      ? {
          damage: basis.incoming.damage[result.tier],
          type: "physical",
          applied: false,
        }
      : null,
    attributeKey: basis.attributeKey,
    mode: basis.mode,
    perception: structuredClone(draft.perception ?? {}),
    ...plan,
    retained,
    ...result,
  };
  return roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${basis.mode === "defense" ? "Defense · " : ""}${game.i18n.localize(`HOL.Attributes.${basis.attributeKey}`)}`,
      flags: { "heroes-of-legend": { roll: snapshot } },
    },
    { messageMode: mode },
  );
}

export function renderRollSummary(message, element) {
  const result = message.getFlag("heroes-of-legend", "roll");
  if (
    !result ||
    !message.isContentVisible ||
    element.querySelector(".hol-roll-summary")
  )
    return;
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
  detail.textContent = game.i18n.format("HOL.RollDetails", {
    faces: result.retained.join(", "),
    boons: result.boons,
    banes: result.banes,
  });
  summary.append(detail);
  if (result.attackOutcome) {
    const outcome = document.createElement("p");
    outcome.textContent = `${result.attackOutcome.damage} physical damage before resistance. Apply consequences manually in this preview.`;
    summary.append(outcome);
  }
  if (result.sources?.length) {
    const list = document.createElement("ul");
    for (const source of result.sources) {
      const li = document.createElement("li");
      li.textContent = `${source.label}: ${source.amount} ${source.kind}`;
      list.append(li);
    }
    summary.append(list);
  }
  element.querySelector(".message-content")?.append(summary);
}
