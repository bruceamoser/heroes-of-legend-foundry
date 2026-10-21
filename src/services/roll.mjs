import { outcomeEffects } from "../rules/outcome-effects.mjs";
import { abilityRollConfiguration, assertAbilityConfiguration, outcomeDamage } from "../rules/ability-roll.mjs";
import { loadCatalogs } from "./catalog.mjs";
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
      targetTokenUuid: basis.mode === "attack" ? null : basis.targetTokenUuid,
    },
  );
  if (JSON.stringify(current) !== JSON.stringify(basis))
    throw new Error("Roll sources changed. Review the dialog before rolling.");
  let ammunition;
  let abilityConfiguration=draft.abilityConfiguration;
  if(draft.abilityItemId){
    const item=actor.items.get(draft.abilityItemId), catalogs=await loadCatalogs();
    abilityConfiguration=abilityRollConfiguration(item,catalogs.choices.find(choice=>choice.id===item.getFlag("heroes-of-legend","catalogId")));
  }
  if (abilityConfiguration?.ranged) {
    const {rangedAmmunition} = await import("./ranged-ammunition.mjs");
    ammunition = rangedAmmunition(actor,draft.rangedWeaponItemId);
  }
  const prepared = prepareRoll(current, draft);
  const mode = game.settings.get("core", "messageMode");
  const { roll, snapshot } = await evaluatePreparedRoll(actor, basis, draft, {
    allowInteractive: mode !== "blind",
  });
  const message = await roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize(
        `HOL.Attributes.${prepared.resolvedAttributeKey ?? basis.attributeKey}`,
      ),
      flags: { "heroes-of-legend": { roll: snapshot } },
    },
    { messageMode: mode },
  );
  if (ammunition) {
    try {
      const {consumeOwnedSupply} = await import("./inventory.mjs");
      await consumeOwnedSupply(actor,ammunition.ammo,{operationId:message.id,label:ammunition.ammo.name});
    } catch(error) { ui.notifications.error(`Attack rolled; ammunition check failed: ${error.message}`); }
  }
  return message;
}
export async function evaluatePreparedRoll(
  actor,
  basis,
  draft,
  { rollerId = game.user.id, allowInteractive = false } = {},
) {
  let ability;
  if (draft.abilityItemId) {
    const item = actor.items.get(draft.abilityItemId);
    if (item?.type !== "ability" || !actor.testUserPermission(game.user, "OWNER"))
      throw new Error("This ability is no longer available to roll.");
    const catalogs = await loadCatalogs();
    ability = abilityRollConfiguration(item, catalogs.choices.find(choice => choice.id === item.getFlag("heroes-of-legend", "catalogId")));
    assertAbilityConfiguration(ability, draft.abilityConfiguration);
  }
  const references = selectedReferences(actor, draft, {
    mode: basis.mode,
    attributeKey:basis.attributeKey,initiatingItemId:draft.abilityItemId,
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
    ...(ability ? {ability} : {}),
    references,
    actorUuid: actor.uuid,
    defenderTokenUuid: basis.defenderTokenUuid,
    rollerId,
    attackMessageId: basis.attackMessageId,
    attackOutcome: incomingOutcome(basis.incoming, result.tier),
    targetTokenUuid: basis.targetTokenUuid ?? null,
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
  const reference = message.getFlag("heroes-of-legend", "abilityReference");
  if (message.isContentVisible && /\bdamage\b/i.test(reference?.damageText ?? "") && !element.querySelector(".hol-reference-damage")) {
    const button = document.createElement("button"); button.type = "button"; button.className = "hol-reference-damage";
    button.textContent = "Apply Damage…";
    button.addEventListener("click", async () => {
      if (button.disabled) return; button.disabled = true;
      try { const {promptChatDamage} = await import("../dialogs/chat-damage.mjs"); await promptChatDamage(message, reference.damageText); }
      catch (error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
    element.querySelector(".hol-reference-card")?.append(button);
  }
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
  actorName.textContent = `${message.speaker?.alias ?? ""} · ${result.mode === "defense" ? "Defense" : result.mode === "attack" ? "Attack" : "Check"}`;
  const attributeName = game.i18n.localize(`HOL.Attributes.${result.resolvedAttributeKey ?? result.attributeKey}`);
  const incoming = game.messages?.get?.(result.attackMessageId)?.getFlag("heroes-of-legend", "attackCard");
  heading.textContent = result.mode === "defense" ? `Defend${incoming?.title ? ` · ${incoming.title}` : ""}` : result.ability?.name ?? "Attribute check";
  identity.append(heading);
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
  if(result.ability?.trigger){const trigger=document.createElement("p");trigger.className="hol-chat-trigger";const label=document.createElement("strong");label.textContent="Trigger: ";trigger.append(label,document.createTextNode(result.ability.trigger));summary.append(trigger);}
  if (result.ability?.outcomes?.[result.tier] || result.ability?.effect) {
    const outcome = document.createElement("p");
    outcome.className = "hol-chat-effect";
    outcome.textContent = result.ability.outcomes[result.tier] || result.ability.effect;
    summary.append(outcome);
  }
  if (result.mode === "death") {
    const effect = document.createElement("p"); effect.className = "hol-chat-effect";
    effect.textContent = result.natural === "fumble" ? "Two death marks." : result.natural === "critical" ? "Regain 1 HP." : result.tier === "weak" ? "One death mark." : result.tier === "strong" ? "Stabilize." : "No change.";
    summary.append(effect);
  }
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
  const damageText = result.ability?.outcomes?.[result.tier] ?? result.attackOutcome?.text ?? "";
  const effects = result.attackOutcome?.components ? {components:result.attackOutcome.components,conditions:result.attackOutcome.conditions ?? []}
    : Number.isSafeInteger(result.attackOutcome?.damage)
      ? {components:[{type:result.attackOutcome.type,amount:result.attackOutcome.damage}],conditions:[]}
      : outcomeEffects(damageText);
  if (result.attackOutcome) {
    const outcome = document.createElement("p"); outcome.className = "hol-chat-effect";
    outcome.textContent = result.attackOutcome.text ?? `${result.attackOutcome.damage} ${result.attackOutcome.type} damage`;
    summary.append(outcome);
  }
  let damageButton;
  if (effects?.components.length || effects?.conditions.length || result.attackOutcome || /\bdamage\b/i.test(damageText)) {
    const button = document.createElement("button"); button.type = "button";
    button.className = "hol-apply-damage"; button.textContent = "Apply Damage";
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (effects) {
          const {applySelectedDamage} = await import("./explicit-damage.mjs");
          await applySelectedDamage(effects.components,{conditions:effects.conditions,sourceMessageId:message.id,label:heading.textContent});
        } else {
          const {promptChatDamage} = await import("../dialogs/chat-damage.mjs");
          await promptChatDamage(message,damageText);
        }
      } catch(error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
    damageButton = button;
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
    detail.append(references);
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
  if (damageButton) footer.append(damageButton);
  if (result.mode === "defense" && result.attackMessageId || actor?.isOwner && ["attribute", "attack"].includes(result.mode)) {
    const again = document.createElement("button"); again.type = "button"; again.textContent = "Roll again";
    again.addEventListener("click", async () => {
      try {
        if (result.mode === "defense") {
          const {chooseDefender} = await import("../dialogs/defender-choice.mjs");
          await chooseDefender(result.attackMessageId);
        } else {
          const ability = result.ability?.itemUuid ? await fromUuid(result.ability.itemUuid) : null;
          if (ability?.actor?.uuid === actor.uuid) {
            const {activateOwnedAbility} = await import("./abilities.mjs");
            await activateOwnedAbility(ability);
          } else {
            const {promptAttributeRoll} = await import("../dialogs/attribute-roll.mjs");
            await promptAttributeRoll(actor, result.resolvedAttributeKey ?? result.attributeKey);
          }
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
  if (["attribute", "attack", "defense"].includes(result.mode))
    nativeNodes.push(...Array.from(content.childNodes).filter(node => node.nodeType === 3 && node.textContent.trim()));
  if (nativeNodes.length) {
    detail.classList.add("hol-native-roll-details");
    detail.append(...nativeNodes);
  }
  summary.append(detail);
  content.append(summary);
}

export function showAbilityOutcome(message) {
  const result=message.getFlag("heroes-of-legend","roll"), ability=result?.ability;
  if(!ability || /\bdamage\b/i.test(ability.outcomes?.[result.tier] || ability.effect || ""))return;
  const escape=foundry.utils.escapeHTML;
  const attribute=game.i18n.localize(`HOL.Attributes.${result.resolvedAttributeKey ?? result.attributeKey}`);
  const modifier=result.attribute>=0?`+${result.attribute}`:String(result.attribute);
  const content=`<section class="hol-ability-outcome"><div class="hol-outcome-total"><strong>${escape(String(result.total))} · ${escape(game.i18n.localize(`HOL.Tiers.${result.tier}`))}</strong><span>${escape(attribute)} ${escape(modifier)} · ${(result.retained??[]).join(" · ")}</span></div>${ability.trigger?`<p class="hol-chat-trigger"><strong>Trigger:</strong> ${escape(ability.trigger)}</p>`:""}<p>${escape(ability.outcomes?.[result.tier] || ability.effect || "")}</p><a class="content-link" data-link data-type="Item" data-uuid="${escape(ability.itemUuid)}">Full ability details</a></section>`;
  void foundry.applications.api.DialogV2.prompt({classes:["heroes-of-legend","hol-native-dialog"],window:{title:ability.name},content,ok:{label:"Close"}}).catch(error=>ui.notifications.error(error.message));
}
