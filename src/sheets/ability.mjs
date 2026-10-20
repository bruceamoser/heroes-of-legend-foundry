import { itemDisplayIcon, hasGenericItemIcon } from "../rules/item-icons.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { cardContext, bindCardState, toggleCardEdit } from "./card-state.mjs";
import { postAbilityReference } from "../services/reference-play.mjs";
import {
  itemAbilityDefinition,
  activateOwnedAbility,
} from "../services/abilities.mjs";
import { openPotionPreparation } from "../applications/potions.mjs";
import { isPotionAbility } from "../services/potions.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
export class AbilitySheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-ability"],
    position: { width: 500, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      cardEdit: toggleCardEdit,
      useAbility: AbilitySheet.useAbility,
      postReference: AbilitySheet.postReference,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/ability.hbs",
      scrollable: [".hol-card-scroll"],
    },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    let definition = null;
    try {
      definition = itemAbilityDefinition(this.item);
    } catch {}
    const description = this.item.system.description;
    const iconCatalogs = hasGenericItemIcon(this.item.img) ? await loadCatalogs() : null;
    const labels = (keys) =>
      Object.fromEntries(
        keys.map((key) => [key, game.i18n.localize(`HOL.Choices.${key}`)]),
      );
    return {
      ...context,
      ...cardContext(this, this.item),
      definition,
      cardMark: itemDisplayIcon(this.item.toObject(), iconCatalogs),
      canPost: Boolean(this.item.actor && this.item.isOwner),
      potionAbility: isPotionAbility(this.item),
      canUse: Boolean(
        ((definition && definition.category !== "passive") ||
          isPotionAbility(this.item)) &&
          this.item.actor?.isOwner,
      ),
      pendingAutomation:
        !definition &&
        this.item.getFlag("heroes-of-legend", "automation") === "pending",
      descriptionHTML: description
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            description,
            { relativeTo: this.item },
          )
        : "",
      item: this.item,
      system: this.item.system,
      editable: this.isEditable,
      attributes: Object.fromEntries(
        ATTRIBUTES.map((key) => [
          key,
          game.i18n.localize(`HOL.Attributes.${key}`),
        ]),
      ),
      actions: labels(["main", "maneuver", "reaction", "passive"]),
      rollModes: labels(["attribute", "none", "delegated"]),
    };
  }
  static async postReference() {
    try {
      await postAbilityReference(this.item);
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async useAbility() {
    try {
      if (isPotionAbility(this.item)) return openPotionPreparation(this.item);
      await activateOwnedAbility(this.item);
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  _onRender(context, options) {
    super._onRender(context, options);
    bindCardState(this, this.item);
  }
  async _processSubmitData(event, form, data, options) {
    if (!this.isEditable)
      throw new Error(game.i18n.localize("HOL.NoPermission"));
    return { updated: await updateOwnedDocument(this.item, data, options) };
  }
}
