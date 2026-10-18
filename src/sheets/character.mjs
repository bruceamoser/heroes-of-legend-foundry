import {
  copyEquipmentToActor,
  equipmentCopyOptions,
} from "../services/item-import.mjs";
import { builderDropChoice } from "../services/builder-drop.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { postAbilityReference } from "../services/reference-play.mjs";
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
      addEquipment: CharacterSheet.addEquipment,
      death: CharacterSheet.death,
      wounds: CharacterSheet.wounds,
      recovery: CharacterSheet.recovery,
      damage: CharacterSheet.damage,
      equipment: CharacterSheet.equipment,
      conditions: CharacterSheet.conditions,
      advanceHero: CharacterSheet.advanceHero,
      createHero: CharacterSheet.createHero,
      openAbility: CharacterSheet.openAbility,
      postReference: CharacterSheet.postReference,
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
    const message =
      data["system.memorizedMessage"] ?? data.system?.memorizedMessage;
    if (
      typeof message === "string" &&
      message !== this.actor.system.memorizedMessage &&
      message.trim().split(/\s+/).filter(Boolean).length > 50
    )
      throw new Error("Message by Heart holds at most 50 words.");
    return { updated: await updateOwnedDocument(this.actor, data, options) };
  }
  static async postReference(event, target) {
    try {
      await postAbilityReference(
        this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId),
      );
    } catch (e) {
      ui.notifications.error(e.message);
    }
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
  static async addEquipment() {
    try {
      if (!this.actor.isOwner)
        throw new Error("Only this character's owner can add equipment.");
      const sources = await equipmentCopyOptions();
      if (!sources.length)
        throw new Error("No readable equipment sources are available.");
      const escape = foundry.utils.escapeHTML;
      const result = await foundry.applications.api.DialogV2.input({
        window: { title: "Add equipment" },
        content: `<label>Equipment<select name="equipmentSourceUuid">${sources
          .map(
            (source) =>
              `<option value="${escape(source.uuid)}">${escape(source.name)}</option>`,
          )
          .join(
            "",
          )}</select></label><p>Add a copy to inventory. Purchases are resolved at the table.</p>`,
        ok: { label: "Add" },
      });
      if (result)
        await copyEquipmentToActor(this.actor, result.equipmentSourceUuid);
    } catch (error) {
      ui.notifications.warn(error.message);
    }
  }

  async openLearningReference(item) {
    if (!this.actor.isOwner || !item.testUserPermission(game.user, "OBSERVER"))
      throw new Error("This character or ability card is unavailable.");
    const choice = builderDropChoice(item, (await loadCatalogs()).choices),
      existing = [...foundry.applications.instances.values()].find(
        (app) =>
          app.actor?.uuid === this.actor.uuid &&
          (app instanceof CreationWizard || app instanceof AdvancementWizard),
      ),
      wizard =
        existing ??
        (this.actor.getFlag("heroes-of-legend", "development")
          ? new AdvancementWizard(this.actor)
          : new CreationWizard(this.actor));
    if (wizard.busy)
      throw new Error("This learning window is already processing a change.");
    if (existing?.rendered) existing.capture();
    await wizard.render({ force: true });
    const learning =
      wizard instanceof AdvancementWizard || [3, 5].includes(wizard.step);
    const search = learning
      ? wizard.element.querySelector("[data-search]")
      : null;
    if (search) {
      search.value = choice.name;
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.focus();
    } else
      ui.notifications.info(
        "Ability choices are available on the creation learning steps. Your current step is unchanged.",
      );
    return null;
  }

  async _onDropDocument(event, document) {
    try {
      if (!this.actor.isOwner)
        throw new Error(
          "Only this character's owner can change its inventory or learning draft.",
        );
      if (document?.documentName !== "Item")
        throw new Error("Drop equipment or an ability card here.");
      if (document.parent?.uuid === this.actor.uuid)
        return super._onDropDocument(event, document);
      if (document.type === "equipment")
        return await copyEquipmentToActor(this.actor, document.uuid);
      if (document.type === "ability")
        return await this.openLearningReference(document);
      throw new Error("Drop equipment or an ability card here.");
    } catch (error) {
      ui.notifications.warn(error.message);
      return null;
    }
  }
  _canDragStart(selector) {
    return this.actor.isOwner && super._canDragStart(selector);
  }
}
