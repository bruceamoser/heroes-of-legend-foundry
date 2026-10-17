import { WoundPanel } from "../applications/wounds.mjs";
import { RecoveryPanel } from "../applications/recovery.mjs";
import { DamagePanel } from "../applications/damage.mjs";
import { EquipmentPanel } from "../applications/equipment.mjs";
import { ConditionPanel } from "../applications/conditions.mjs";
import { AdvancementWizard } from "../applications/advancement.mjs";
import { CreationWizard } from "../applications/creation.mjs";
import {
  SharedRollDialog,
  promptAttributeRoll,
} from "../dialogs/attribute-roll.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { addHotbarShortcut, openItemShortcut } from "../services/shortcuts.mjs";
const { HandlebarsApplicationMixin } = foundry.applications.api;
export class CharacterSheet extends HandlebarsApplicationMixin(
  foundry.applications.sheets.ActorSheetV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-character"],
    position: { width: 720, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      death: CharacterSheet.death,
      wounds: CharacterSheet.wounds,
      recovery: CharacterSheet.recovery,
      damage: CharacterSheet.damage,
      equipment: CharacterSheet.equipment,
      conditions: CharacterSheet.conditions,
      advanceHero: CharacterSheet.advanceHero,
      createHero: CharacterSheet.createHero,
      openAbility: CharacterSheet.openAbility,
      addShortcut: CharacterSheet.addShortcut,
      rollAttribute: CharacterSheet.rollAttribute,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/character.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      actor: this.actor,
      gm: game.user.isGM,
      dyingDue:
        this.actor.getFlag("heroes-of-legend", "survival")?.status ===
          "dying" &&
        this.actor.getFlag("heroes-of-legend", "survival")?.due ===
          this.actor.getFlag("heroes-of-legend", "survival")?.ownTurn,
      system: this.actor.system,
      editable: this.isEditable,
      attributes: ATTRIBUTES.map((key) => ({
        key,
        label: game.i18n.localize(`HOL.Attributes.${key}`),
        base: this.actor.system.attributes[key].base,
        effective: this.actor.system.attributes[key].effective,
      })),
      development: this.actor.getFlag("heroes-of-legend", "development"),
      created: Boolean(
        this.actor.getFlag("heroes-of-legend", "creationReceipt"),
      ),
      owned: this.actor.isOwner,
      equipment: this.actor.items
        .filter((item) => item.type === "equipment")
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
      abilities: this.actor.items
        .filter((item) => item.type === "ability")
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    };
  }
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    // Opening a reference is read-only; all edit controls keep native disabling.
    if (disabled && this.actor.testUserPermission(game.user, "OBSERVER"))
      for (const button of this.element.querySelectorAll(
        '[data-action="openAbility"]',
      ))
        button.disabled = false;
  }
  async _processSubmitData(event, form, data, options) {
    if (!this.isEditable)
      throw new Error(game.i18n.localize("HOL.NoPermission"));
    return { updated: await updateOwnedDocument(this.actor, data, options) };
  }
  static async death() {
    await new SharedRollDialog(this.actor, "fortitude", {
      mode: "death",
    }).render({ force: true });
  }
  static async wounds() {
    await new WoundPanel(this.actor).render({ force: true });
  }
  static async recovery() {
    await new RecoveryPanel(this.actor).render({ force: true });
  }
  static async damage() {
    await new DamagePanel(this.actor).render({ force: true });
  }
  static async equipment() {
    await new EquipmentPanel(this.actor).render({ force: true });
  }
  static async conditions() {
    await new ConditionPanel(this.actor).render({ force: true });
  }
  static async advanceHero() {
    if (this.actor.isOwner)
      await new AdvancementWizard(this.actor).render({ force: true });
  }
  static async createHero() {
    if (this.actor.isOwner)
      await new CreationWizard(this.actor).render({ force: true });
  }
  static async rollAttribute(event, target) {
    try {
      await promptAttributeRoll(this.actor, target.dataset.attribute);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async openAbility(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId,
      item = this.actor.items.get(itemId);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("HOL.ShortcutSourceMissing"));
      return;
    }
    try {
      await openItemShortcut(item.uuid);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async addShortcut(event, target) {
    const row = target.closest("[data-item-id]"),
      item = this.actor.items.get(row?.dataset.itemId),
      slot = row?.querySelector("[data-hotbar-slot]")?.value;
    if (!item) {
      ui.notifications.warn(game.i18n.localize("HOL.ShortcutSourceMissing"));
      return;
    }
    try {
      await addHotbarShortcut(item.uuid, slot);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  // Acquisition requires the later purchase/grant service; core copying would bypass it.
  async _onDropDocument(event, document) {
    if (
      document?.documentName === "Item" &&
      document.parent?.uuid === this.actor.uuid
    )
      return super._onDropDocument(event, document);
    ui.notifications.warn(game.i18n.localize("HOL.AcquisitionPending"));
    return null;
  }
  _canDragStart(selector) {
    return this.actor.isOwner && super._canDragStart(selector);
  }
}
