import { EquipmentPanel } from "../applications/equipment.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
export class EquipmentSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2,
) {
  static DEFAULT_OPTIONS = {
    actions: { hands: EquipmentSheet.hands },
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
      owned: Boolean(this.item.actor),
    };
  }
  static async hands() {
    if (this.item.actor)
      await new EquipmentPanel(this.item.actor).render({ force: true });
  }
  async _processSubmitData(event, form, data, options) {
    if (
      this.item.actor &&
      ["hands", "held"].some(
        (key) =>
          (data[`system.${key}`] ?? data.system?.[key]) !== undefined &&
          (data[`system.${key}`] ?? data.system?.[key]) !==
            this.item.system[key],
      )
    )
      throw new Error(
        "Use Hands and equipment to change an owned item’s hand arrangement.",
      );
    return { updated: await updateOwnedDocument(this.item, data, options) };
  }
}
