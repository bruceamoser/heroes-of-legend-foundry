import { cardContext, bindCardState } from "./card-state.mjs";
import { viewPortrait, savePortrait, bindPortraitControls } from "./portrait.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import {
  creatureModifierLabel,
  renderMarkdown,
} from "./creature-reference.mjs";
import {
  profileUpdateAvailable,
  updateCreatureProfile,
} from "../services/profile-update.mjs";

/** Read-only reference sheet: importing a profile never commands or spawns it. */
export class SummonSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ActorSheetV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-summon"],
    actions: { viewPortrait, savePortrait: SummonSheet.savePortrait, updateProfile: SummonSheet.updateProfile },
    position: { width: 700, height: 660 },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/summon.hbs",
      scrollable: [".hol-card-scroll"],
    },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const flags = this.actor.flags["heroes-of-legend"] ?? {};
    return {
      ...context,
      ...cardContext(this, this.actor),
      actor: this.actor,
      editable: this.isEditable,
      system,
      canUpdateProfile: profileUpdateAvailable(this.actor),
      attributes: ATTRIBUTES.map((key) => ({
        label: key[0].toUpperCase() + key.slice(1),
        value: system.attributes[key].base,
      })),
      defenseLabel: creatureModifierLabel(system.defenseModifier),
      attackLabel: creatureModifierLabel(system.basicMelee.attackModifier),
      catalogId: flags.catalogId ?? "",
      sourceCommit: flags.sourceCommit ?? "",
      sourcePath: flags.source?.path ?? "",
      referenceHTML:
        await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          renderMarkdown(system.referenceMarkdown),
          { relativeTo: this.actor, links: false },
        ),
    };
  }
  _onRender(context, options) {
    super._onRender(context, options);
    bindCardState(this, this.actor);
    bindPortraitControls(this);
  }
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    if (disabled && this.actor.testUserPermission(game.user, "OBSERVER"))
      for (const button of this.element.querySelectorAll('[data-action="viewPortrait"]')) button.disabled = false;
  }
  static async savePortrait() {
    try { return await savePortrait.call(this); }
    catch (error) { ui.notifications.error(error.message); }
  }
  static async updateProfile() {
    try {
      const result = await updateCreatureProfile(this.actor);
      ui.notifications.info(
        result.updated.length
          ? `Profile updated.${result.preserved.length ? " Local edits kept." : ""}`
          : result.preserved.length
            ? "Local edits kept. Current rules are available in the summon compendium."
            : "Profile is current.",
      );
      await this.render({ force: true });
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
}
