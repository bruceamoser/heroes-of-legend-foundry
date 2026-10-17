import { updateOwnedDocument } from "../services/documents.mjs";
export class EquipmentSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-equipment"],
    position: { width: 520, height: 540 },
    form: { submitOnChange: false, closeOnSubmit: false },
  };
  static PARTS = {
    main: { template: "systems/heroes-of-legend/templates/equipment.hbs" },
  };
  async _prepareContext(options) {
    return {
      ...(await super._prepareContext(options)),
      item: this.item,
      system: this.item.system,
      editable: this.isEditable,
    };
  }
  async _processSubmitData(event, form, data, options) {
    return { updated: await updateOwnedDocument(this.item, data, options) };
  }
}
