import { CreationWizard } from "../applications/creation.mjs";
import { promptAttributeRoll } from "../dialogs/attribute-roll.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
const { HandlebarsApplicationMixin } = foundry.applications.api;
export class CharacterSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-character"],
    position: { width: 720, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: { createHero: CharacterSheet.createHero, openAbility: CharacterSheet.openAbility, rollAttribute: CharacterSheet.rollAttribute }
  };
  static PARTS = { main: { template: "systems/heroes-of-legend/templates/character.hbs", scrollable: [""] } };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, actor: this.actor, system: this.actor.system, editable: this.isEditable,
      attributes: ATTRIBUTES.map(key => ({ key, label: game.i18n.localize(`HOL.Attributes.${key}`),
        base: this.actor.system.attributes[key].base, effective: this.actor.system.attributes[key].effective })),
      abilities: this.actor.items.filter(item => item.type === "ability")
    };
  }
  async _processSubmitData(event, form, data, options) {
    if (!this.isEditable) throw new Error(game.i18n.localize("HOL.NoPermission"));
    return { updated: await updateOwnedDocument(this.actor, data, options) };
  }
  static async createHero() { if (this.actor.isOwner) await new CreationWizard(this.actor).render({force:true}); }
  static async rollAttribute(event, target) {
    try { await promptAttributeRoll(this.actor, target.dataset.attribute); }
    catch (error) { ui.notifications.error(error.message); }
  }
  static openAbility(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.testUserPermission(game.user, "OBSERVER")) item.sheet.render({ force: true });
  }
  // Acquisition requires the later purchase/grant service; core copying would bypass it.
  async _onDropDocument() { ui.notifications.warn(game.i18n.localize("HOL.AcquisitionPending")); return null; }
}
