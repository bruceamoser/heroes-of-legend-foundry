import { selectedReferences } from "./reference-play.mjs";
import { incomingOutcome } from "../rules/creature-actions.mjs";
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
    {
      actorTokenUuid: basis.actorTokenUuid,
      targetTokenUuid: basis.targetTokenUuid,
    },
  );
  if (JSON.stringify(current) !== JSON.stringify(basis))
    throw new Error("Roll sources changed. Review the dialog before rolling.");
  const prepared = prepareRoll(current, draft);
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
      flavor: game.i18n.localize(
        `HOL.Attributes.${prepared.resolvedAttributeKey ?? basis.attributeKey}`,
      ),
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
  const references = selectedReferences(actor, draft, {
    mode: basis.mode,
    defenderTokenUuid: basis.defenderTokenUuid,
    user: game.users?.get(rollerId) ?? game.user,
  });
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
    references,
    actorUuid: actor.uuid,
    defenderTokenUuid: basis.defenderTokenUuid,
    rollerId,
    attackMessageId: basis.attackMessageId,
    attackOutcome: incomingOutcome(basis.incoming, result.tier),
    attributeKey: basis.attributeKey,
    mode: basis.mode,
    perception: structuredClone(draft.perception ?? {}),
    woundApplicability: structuredClone(draft.woundApplicability ?? {}),
    ...plan,
    retained,
    dice: roll.dice[0].results.map((die, index) => ({ index, face: die.result, kept: Boolean(die.active) })),
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
  summary.className = "hol-roll-summary hol-chat-card";
  summary.dataset.tier = result.tier;
  summary.dataset.chatKind = result.mode;
  const header = document.createElement("header");
  header.className = "hol-chat-header";
  const identity = document.createElement("div"), actorName = document.createElement("small"), heading = document.createElement("h3");
  actorName.textContent = `${message.speaker?.alias ?? ""} · ${result.mode === "defense" ? "Defense" : "Check"}`;
  const attributeName = game.i18n.localize(`HOL.Attributes.${result.resolvedAttributeKey ?? result.attributeKey}`);
  const incoming = game.messages?.get?.(result.attackMessageId)?.getFlag("heroes-of-legend", "attackCard");
  heading.textContent = result.mode === "defense" ? `Defend${incoming?.title ? ` · ${incoming.title}` : ""}` : "Attribute check";
  identity.append(actorName, heading);
  const actor = game.actors?.get?.(message.speaker?.actor);
  header.append(identity);
  const bar = document.createElement("div"); bar.className = "hol-chat-bar";
  const barPart = text => { const part = document.createElement("span"); part.textContent = text; bar.append(part); };
  if (incoming?.attackerName) barPart(`Against ${incoming.attackerName}`);
  barPart(`${attributeName} ${result.attribute >= 0 ? "+" : ""}${result.attribute}`);
  barPart(result.net ? `${Math.abs(result.net)} ${result.net < 0 ? "Banes" : "Boons"}` : "Even");
  barPart(`${result.count}d6 · ${result.net ? `keep ${result.net > 0 ? "highest" : "lowest"} 3` : "keep 3"}`);
  const resolution = document.createElement("div"); resolution.className = "hol-chat-resolution";
  const verdict = document.createElement("div"); verdict.className = `hol-chat-verdict ${result.tier}`;
  const total = document.createElement("strong"), tier = document.createElement("span");
  total.textContent = result.total;
  tier.textContent = `${game.i18n.localize(`HOL.Tiers.${result.tier}`)}${result.mode === "defense" ? " defense" : ""}`;
  verdict.append(total, tier);
  summary.append(header, bar, resolution);
  const original = result.dice ?? message.rolls?.[0]?.dice?.[0]?.results?.map((die, index) => ({ index, face: die.result, kept: Boolean(die.active) })) ?? [];
  if (original.length) {
    const dice = document.createElement("div");
    dice.className = "hol-chat-dice";
    dice.setAttribute("aria-label", "Rolled dice");
    for (const die of original) {
      const face = document.createElement("span");
      face.className = `hol-chat-die ${die.kept ? "kept" : "discarded"}`;
      face.dataset.dieIndex = die.index;
      face.textContent = die.face;
      face.setAttribute("role", "img");
      face.setAttribute("aria-label", `${die.face}, ${die.kept ? "kept" : "discarded"}`);
      dice.append(face);
    }
    resolution.append(dice);
  }
  resolution.append(verdict);
  if (result.natural !== "none") {
    const natural = document.createElement("p");
    natural.className = "hol-chat-natural";
    natural.textContent = game.i18n.localize(`HOL.Naturals.${result.natural}`);
    summary.append(natural);
  }
  const detail = document.createElement("details"), detailLabel = document.createElement("summary"), audit = document.createElement("p");
  detailLabel.textContent = "Roll details";
  audit.textContent = game.i18n.format("HOL.RollDetails", {
    faces: result.retained.join(", "),
    boons: result.boons,
    banes: result.banes,
  });
  detail.className = "hol-chat-details";
  detail.append(detailLabel, audit);
  if (result.attackOutcome) {
    const outcome = document.createElement("p");
    outcome.className = "hol-chat-effect";
    const settledDamage = message.getFlag("heroes-of-legend", "defenseDamage");
    outcome.textContent = settledDamage
      ? `${settledDamage.event.total} damage applied · HP ${settledDamage.before} → ${settledDamage.after}${settledDamage.wound ? " · Wound awaiting resolution" : ""}`
      : result.attackOutcome.resolution === "reference"
        ? `${result.attackOutcome.text} · Resolve costs and effects manually.`
        : `${result.attackOutcome.damage} physical damage before resistance. The DA can review and apply damage.`;
    summary.append(outcome);
    if (
      game.user.isGM &&
      !settledDamage &&
      result.attackMessageId &&
      result.attackOutcome.resolution !== "reference"
    ) {
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
  if (result.references?.length) {
    const references = document.createElement("p");
    references.className = "hol-roll-references";
    references.append(document.createTextNode("References: "));
    for (const [index, reference] of result.references.entries()) {
      if (index) references.append(document.createTextNode(" · "));
      const link = document.createElement("a");
      link.className = "content-link";
      link.dataset.uuid = reference.itemUuid;
      link.dataset.type = "Item";
      link.dataset.link = "";
      link.textContent = reference.name;
      references.append(link);
    }
    summary.append(references);
  }
  if (result.sources?.length) {
    const list = document.createElement("ul");
    for (const source of result.sources) {
      const li = document.createElement("li");
      li.textContent = `${source.label}: ${source.amount} ${source.kind}`;
      list.append(li);
    }
    detail.append(list);
  }
  const footer = document.createElement("footer"); footer.className = "hol-chat-footer";
  const status = document.createElement("span");
  status.textContent = message.getFlag("heroes-of-legend", "defenseDamage") ? "Damage applied" : "Rolled";
  footer.append(status);
  if (result.mode === "defense" && result.attackMessageId || actor?.isOwner && result.mode === "attribute") {
    const again = document.createElement("button"); again.type = "button"; again.textContent = "Roll again";
    again.addEventListener("click", async () => {
      try {
        if (result.mode === "defense") {
          const {chooseDefender} = await import("../dialogs/defender-choice.mjs");
          await chooseDefender(result.attackMessageId);
        } else {
          const {promptAttributeRoll} = await import("../dialogs/attribute-roll.mjs");
          await promptAttributeRoll(actor, result.resolvedAttributeKey ?? result.attributeKey);
        }
      } catch (error) { ui.notifications.error(error.message); }
    });
    footer.append(again);
  }
  summary.append(footer);
  const content = element.querySelector(".message-content");
  if (!content) return;
  // Keep Foundry's evaluated dice and tooltip controls available without a
  // second primary result panel above the approved card. Never rebuild dice.
  const nativeNodes = [...content.querySelectorAll(".dice-roll"), ...element.querySelectorAll(".message-flavor, .flavor-text")];
  if (["attribute", "defense"].includes(result.mode))
    nativeNodes.push(...Array.from(content.childNodes).filter(node => node.nodeType === 3 && node.textContent.trim()));
  if (nativeNodes.length) {
    detail.classList.add("hol-native-roll-details");
    detail.append(...nativeNodes);
  }
  summary.append(detail);
  content.append(summary);
}
