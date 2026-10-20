import { equipmentReferenceHtml } from "../rules/item-construction.mjs";
import { itemCardContext, formatItemCard } from "./item-card-view.mjs";
import { localRulePage } from "../services/journals.mjs";
import { itemDisplayIcon } from "../rules/item-icons.mjs";
import { requestResupply } from "../services/resupply.mjs";
import { cardContext, bindCardState, toggleCardEdit } from "./card-state.mjs";
import { EquipmentPanel } from "../applications/equipment.mjs";
import { InventoryPanel } from "../applications/inventory.mjs";
import { openPotionPreparation } from "../applications/potions.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { isHealingPotionItem } from "../services/potions.mjs";
export class EquipmentSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2,
) {
  static DEFAULT_OPTIONS = {
    actions: {
      cardEdit: toggleCardEdit,
      resupply: EquipmentSheet.resupply,
      hands: EquipmentSheet.hands,
      supply: EquipmentSheet.supply,
      usePotion: EquipmentSheet.usePotion,
    },
    classes: ["heroes-of-legend", "hol-equipment"],
    position: { width: 510, height: "auto" },
    window: { resizable:true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };
  static PARTS = {
    main: { template: "systems/heroes-of-legend/templates/equipment.hbs", scrollable: [".hol-card-scroll"] },
  };
  async _prepareContext(options) {
    const catalogs = await loadCatalogs(),
      description = this.item.system.description,
      pending = this.item.actor?.getFlag(
        "heroes-of-legend",
        "pendingInventory",
      ),
      results =
        this.item.actor?.getFlag("heroes-of-legend", "inventoryResults") ?? {},
      catalogSupply = catalogs?.inventory.equipment.find(
        (record) => record.id === this.item.system.catalogId,
      )?.inventoryDie,
      priorSupply =
        pending?.target?.itemId === this.item.id
          ? pending.target.inventoryDie
          : Object.values(results)
              .reverse()
              .find((result) => result.target?.itemId === this.item.id)?.target
              .inventoryDie,
      originalSupplyDie = Number.isSafeInteger(catalogSupply)
        ? catalogSupply
        : priorSupply,
      hadSupply =
        Number.isSafeInteger(originalSupplyDie) && originalSupplyDie > 0,
      hasSupply = hadSupply || this.item.system.inventoryDie > 0;
    const presentation = itemCardContext(this.item, catalogs);
    let rules = description;
    if (presentation.cardSourcePath) {
      try { rules = (await localRulePage(presentation.cardSourcePath)).text.content; }
      catch (error) { console.warn("heroes-of-legend | Equipment rule reference unavailable", error.message); }
    }
    return {
      ...(await super._prepareContext(options)),
      ...presentation,
      customDescriptionHTML: description && presentation.cardRecord && description !== equipmentReferenceHtml(presentation.cardRecord,{sourceCommit:catalogs.commit})
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(description,{relativeTo:this.item}) : "",
      ...cardContext(this, this.item),
      item: this.item,
      cardMark: itemDisplayIcon(this.item.toObject(), catalogs),
      system: this.item.system,
      editable: this.isEditable,
      descriptionHTML: rules
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            rules,
            { relativeTo: this.item },
          )
        : "",
      owned: Boolean(this.item.actor),
      canCheckSupply: Boolean(
        this.item.actor &&
          hasSupply &&
          this.item.system.inventoryDie > 0 &&
          (this.item.actor.isOwner || game.user.isGM),
      ),
      canResupply: Boolean(this.item.actor?.isOwner && hasSupply),
      supplyOut:
        Boolean(this.item.actor) &&
        hadSupply &&
        this.item.system.inventoryDie === 0,
      potion: Boolean(
        this.item.actor &&
          isHealingPotionItem(this.item) &&
          (this.item.actor.isOwner || game.user.isGM),
      ),
    };
  }
  static async resupply() {
    try { await requestResupply(this.item.actor, this.item); }
    catch(error) { ui.notifications.error(error.message); }
  }
  static async hands() {
    if (this.item.actor)
      await new EquipmentPanel(this.item.actor).render({ force: true });
  }
  static async supply() {
    try {
      if (!this.item.actor)
        throw new Error("Only an owned equipment item can check supply.");
      await new InventoryPanel(this.item.actor, this.item.id).render({
        force: true,
      });
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async usePotion() {
    try {
      if (!isHealingPotionItem(this.item))
        throw new Error("This equipment does not use a healing potion plan.");
      await openPotionPreparation(this.item, {
        bottleItemUuid: this.item.uuid,
      });
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  _onRender(context, options) {
    super._onRender(context, options);
    bindCardState(this, this.item);
    formatItemCard(this.element);
    this.element.querySelector("[data-item-quantity]")?.addEventListener("change", async event => {
      try {
        if (!this.isEditable) throw new Error(game.i18n.localize("HOL.NoPermission"));
        const quantity = Number(event.target.value);
        if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Quantity must be a nonnegative whole number.");
        await updateOwnedDocument(this.item,{"system.quantity":quantity});
        await this.render({force:true});
      } catch (error) { ui.notifications.error(error.message); await this.render({force:true}); }
    });
  }
  async _processSubmitData(event, form, data, options) {
    if (
      this.item.actor &&
      ["hands", "held", "worn"].some(
        (key) =>
          (data[`system.${key}`] ?? data.system?.[key]) !== undefined &&
          (data[`system.${key}`] ?? data.system?.[key]) !==
            this.item.system[key],
      )
    )
      throw new Error(
        "Use Hands, worn gear and equipment to change an owned item’s arrangement.",
      );
    return { updated: await updateOwnedDocument(this.item, data, options) };
  }
}
