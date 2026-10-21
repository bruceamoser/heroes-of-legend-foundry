import { actorContributions } from "../services/conditions.mjs";
import { conditionSummary } from "../rules/conditions.mjs";
import { selectNpcProfile } from "../services/npc-profile.mjs";
import { cardContext, bindCardState, toggleCardEdit, mitigationLabel } from "./card-state.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { viewPortrait, bindPortraitControls } from "./portrait.mjs";
import {
  declareNpcMelee,
  declareCreatureAction,
} from "../services/npc-attacks.mjs";
import { CharacterSheet } from "./character.mjs";
import { hpInputValue } from "./hp-input.mjs";
import { numericCreatureAction } from "../rules/numeric-creature-actions.mjs";
import {
  profileUpdateAvailable,
  updateCreatureProfile,
} from "../services/profile-update.mjs";
import {
  creatureReferenceHtml,
  creatureModifierLabel,
  renderMarkdown,
} from "./creature-reference.mjs";

function sourceLink(source, commit) {
  const path = source?.path
    ?.split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return source?.path && commit
    ? `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${path}`
    : "";
}

export class CreatureSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hol-creature"],
    actions: {
      npcMelee: CreatureSheet.npcMelee,
      creatureAction: CreatureSheet.creatureAction,
      viewCreatureAction: CreatureSheet.viewCreatureAction,
      updateProfile: CreatureSheet.updateProfile,
      viewPortrait,
      editImage: CharacterSheet.editPortrait,
      cardEdit: toggleCardEdit,
      npcMode: CreatureSheet.npcMode,
      chooseNpcProfile: CreatureSheet.chooseNpcProfile,
      unlinkNpcProfile: CreatureSheet.unlinkNpcProfile,
    },
    position: { width: 700, height: 720 },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const flags = this.actor.getFlag("heroes-of-legend", "automation")
      ? {
          catalogId: this.actor.getFlag("heroes-of-legend", "catalogId"),
          source: this.actor.getFlag("heroes-of-legend", "source"),
          sourceCommit: this.actor.getFlag("heroes-of-legend", "sourceCommit"),
          automation: this.actor.getFlag("heroes-of-legend", "automation"),
          automationLabel: this.actor.getFlag(
            "heroes-of-legend",
            "automationLabel",
          ),
          classification: this.actor.getFlag(
            "heroes-of-legend",
            "classification",
          ),
          family: this.actor.getFlag("heroes-of-legend", "family"),
        }
      : {};
    const referenceHtml = creatureReferenceHtml(system);
    return {
      ...context,
      ...cardContext(this, this.actor),
      conditionsList: Object.values(conditionSummary(actorContributions(this.actor))).filter(condition => condition.active),
      attributes: context.attributes.map(attribute => ({...attribute, signed: `${attribute.effective >= 0 ? "+" : ""}${attribute.effective}`})),
      referenceOpen: cardContext(this, this.actor).cardCollapsed.reference === false,
      portrayalOpen: cardContext(this, this.actor).cardCollapsed.portrayal === false,
      notesOpen: cardContext(this, this.actor).cardCollapsed.notes === false,
      npc: this.actor.getFlag("heroes-of-legend", "npc") ?? {},
      npcMode: Boolean(this.actor.getFlag("heroes-of-legend", "npc")?.enabled),
      combatLinked: !this.actor.getFlag("heroes-of-legend", "npc")?.enabled || this.actor.getFlag("heroes-of-legend", "npc")?.profileLinked !== false,
      resistanceLabel: mitigationLabel(system.resistances),
      weaknessLabel: mitigationLabel(system.weaknesses),
      immunityLabel: system.immunities.join("; ") || "None",
      gm: game.user.isGM,
      canUpdateProfile: profileUpdateAvailable(this.actor),
      actionGroups: [
        ["main", "Main Actions"],
        ["maneuver", "Maneuvers"],
        ["reaction", "Reactions"],
      ].map(([category, label], index) => ({
        label,
        collapsed: Boolean(cardContext(this, this.actor).cardCollapsed[`actions-${index}`]),
        main: category === "main",
        hasEntries: category === "main" || system.actions.entries.some(entry => entry.category === category),
        entries: system.actions.entries.filter(
          entry => entry.category === category && !(category === "main" && entry.name === "Basic Melee"),
        ).sort((a,b)=>Number(Boolean(b.defenseSource)) - Number(Boolean(a.defenseSource))).map(entry => ({...entry, automaticDamage: Boolean(numericCreatureAction(flags.catalogId,flags.sourceCommit,entry)), context: ["Target", "Damage type", "Limit"].map(label => {
          const match = entry.referenceMarkdown?.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^*\\n]+)`));
          return match ? `${label}: ${match[1].trim()}` : "";
        }).filter(Boolean).join(" · ")})),
      })),
      sourceLink: sourceLink(flags.source, flags.sourceCommit),
      sourcePath: flags.source?.path ?? "",
      sourceCommit: flags.sourceCommit ?? "",
      catalogId: flags.catalogId ?? "",
      family: flags.family ?? "",
      classification: flags.classification ?? null,
      automation: flags.automation ?? "",
      automationLabel: flags.automationLabel ?? "",
      evasionLabel: creatureModifierLabel(system.evasion),
      threatLabel: creatureModifierLabel(system.threat),
      alternateSpeeds: system.alternateSpeeds.map(({ mode, value }) => ({
        mode: mode[0].toUpperCase() + mode.slice(1),
        value,
      })),
      referenceHTML: referenceHtml
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            referenceHtml,
            { relativeTo: this.actor, links: false },
          )
        : "",
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    bindCardState(this, this.actor);
    bindPortraitControls(this);
    const hp = this.element.querySelector("[data-current-hp]");
    if (hp && !hp.dataset.hpBound) {
      hp.dataset.hpBound = "true";
      hp.addEventListener("change", async event => {
        try {
          const value = hpInputValue(event.target.value, this.actor.system.health.max,this.actor.system.health.value);
        const {setOwnedHp} = await import("../services/documents.mjs");
        await setOwnedHp(this.actor, value);
        } catch(error) { ui.notifications.error(error.message); await this.render(); }
      });
    }
  }
  static async npcMode() {
    try {
      await updateOwnedDocument(this.actor, { "flags.heroes-of-legend.npc.enabled": !this.actor.getFlag("heroes-of-legend", "npc")?.enabled });
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async unlinkNpcProfile() {
    try { await updateOwnedDocument(this.actor, { "flags.heroes-of-legend.npc.profileLinked": false }); }
    catch(error) { ui.notifications.error(error.message); }
  }
  static async chooseNpcProfile() {
    try {
      if (!game.user.isGM || !this.actor.isOwner) throw new Error("Only a DA owner can replace this NPC's combat profile.");
      const pack = game.packs.get("heroes-of-legend.creatures");
      if (!pack) throw new Error("The creature compendium is unavailable.");
      const index = await pack.getIndex();
      const escape = foundry.utils.escapeHTML;
      const selection = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Choose NPC combat profile" },
        content: `<p>Replace printed combat statistics and actions. Portrayal, current HP (up to the new maximum), notes, inventory and conditions are retained.</p><label>Profile<select name="profileId">${[...index].sort((a,b)=>a.name.localeCompare(b.name)).map(entry=>`<option value="${escape(entry._id)}">${escape(entry.name)}</option>`).join("")}</select></label>`,
        ok: { label: "Use profile" }
      });
      if (!selection) return;
      await selectNpcProfile(this.actor, selection.profileId);
    } catch(error) { ui.notifications.error(error.message); }
  }
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    if (disabled && this.actor.testUserPermission(game.user, "OBSERVER"))
      for (const button of this.element.querySelectorAll('[data-action="viewCreatureAction"], [data-action="viewPortrait"]')) button.disabled = false;
  }
  static async viewCreatureAction(event, target) {
    try {
      if (!this.actor.testUserPermission(game.user, "OBSERVER")) throw new Error("This action is unavailable.");
      const entry = this.actor.system.actions.entries.find(action => action.id === target.dataset.creatureAction);
      if (!entry) throw new Error("This action is unavailable.");
      const content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(renderMarkdown(entry.referenceMarkdown || entry.effect), { relativeTo: this.actor, links: false });
      await foundry.applications.api.DialogV2.wait({
        window: { title: entry.name },
        classes: ["heroes-of-legend"],
        content: `<div class="hol-item-reference">${content}</div>`,
        buttons: [...(game.user.isGM ? [{action:"post",label:"Post action",callback:()=>declareCreatureAction(this.actor,entry.id)}] : []), {action:"close",label:"Close"}],
      });
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async creatureAction(event, target) {
    try {
      await declareCreatureAction(this.actor, target.dataset.creatureAction);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async updateProfile() {
    try {
      const result = await updateCreatureProfile(this.actor);
      ui.notifications.info(
        result.updated.length
          ? `Profile updated.${result.preserved.length ? " Local edits kept." : ""}`
          : result.preserved.length
            ? "Local edits kept. Current rules are available in the creature compendium."
            : "Profile is current.",
      );
      await this.render({ force: true });
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async npcMelee() {
    try {
      const blockable = this.element.querySelector(
        "[data-npc-blockable]",
      )?.value;
      await declareNpcMelee(this.actor, {
        blockable: blockable === "" ? undefined : blockable === "true",
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/creature.hbs",
      scrollable: [".hol-card-scroll"],
    },
  };
}
