import { ATTRIBUTES } from "../rules/character.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
export class AbilitySheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-ability"],
    position: { width: 640, height: 720 }, window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false }
  };
  static PARTS = { main: { template: "systems/heroes-of-legend/templates/ability.hbs", scrollable: [""] } };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const labels = keys => Object.fromEntries(keys.map(key => [key, game.i18n.localize(`HOL.Choices.${key}`)]));
    return { ...context, item: this.item, system: this.item.system, editable: this.isEditable,
      attributes: Object.fromEntries(ATTRIBUTES.map(key => [key, game.i18n.localize(`HOL.Attributes.${key}`)])),
      actions: labels(["main", "maneuver", "reaction", "passive"]),
      rollModes: labels(["attribute", "none", "delegated"])
    };
  }
  async _processSubmitData(event, form, data, options) {
    if (!this.isEditable) throw new Error(game.i18n.localize("HOL.NoPermission"));
    return { updated: await updateOwnedDocument(this.item, data, options) };
  }
}
