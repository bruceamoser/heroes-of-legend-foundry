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
    basis.defenderTokenUuid,
  );
  if (JSON.stringify(current) !== JSON.stringify(basis))
    throw new Error("Roll sources changed. Review the dialog before rolling.");
  prepareRoll(current, draft);
  if (basis.mode === "death") {
    const { requestSurvival } = await import("./survival.mjs");
    return requestSurvival(actor, basis, draft, "roll");
  }
  if (basis.attackMessageId) {
    const { requestDefense } = await import("./defense-responses.mjs");
    return requestDefense(actor, basis, draft);
  }
  const mode = game.settings.get("core", "messageMode");
  const { roll, snapshot } = await evaluatePreparedRoll(actor, basis, draft, {
    allowInteractive: mode !== "blind",
  });
  return roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize(`HOL.Attributes.${basis.attributeKey}`),
      flags: { "heroes-of-legend": { roll: snapshot } },
    },
    { messageMode: mode },
  );
}
export async function evaluatePreparedRoll(
  actor,
  basis,
  draft,
  { rollerId = game.user.id, allowInteractive = false } = {},
) {
  const plan = prepareRoll(basis, draft);
  const roll = await new foundry.dice.Roll(plan.formula).evaluate({
    allowInteractive,
  });
  const retained = roll.dice[0].results
    .filter((result) => result.active)
    .map((result) => result.result);
  const result = classifyRoll(retained, plan.attribute);
  const snapshot = {
    schemaVersion: 2,
    actorUuid: actor.uuid,
    defenderTokenUuid: basis.defenderTokenUuid,
    rollerId,
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
  return { roll, snapshot };
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
    outcome.textContent = `${result.attackOutcome.damage} physical damage before resistance. The DA can review and apply damage; reactions and wound resolution are still being integrated.`;
    summary.append(outcome);
    if (game.user.isGM && result.attackMessageId) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Review and apply damage";
      button.addEventListener("click", async () => {
        try {
          const { openDefenseDamage } = await import(
            "../applications/damage.mjs"
          );
          await openDefenseDamage(message);
        } catch (e) {
          ui.notifications.error(e.message);
        }
      });
      summary.append(button);
    }
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
