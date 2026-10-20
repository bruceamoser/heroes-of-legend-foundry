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
      viewPortrait: CharacterSheet.viewPortrait,
      savePortrait: CharacterSheet.savePortrait,
      switchTab: CharacterSheet.switchTab,
      toggleEdit: CharacterSheet.toggleEdit,
      saveStory: CharacterSheet.saveStoryAction,
      basicVisibility: CharacterSheet.basicVisibility,
      favorite: CharacterSheet.favorite,
      useItem: CharacterSheet.useItem,
      supply: CharacterSheet.supply,
      resupply: CharacterSheet.resupply,
      crafting: CharacterSheet.crafting,
      death: CharacterSheet.death,
      spendGrit: CharacterSheet.spendGrit,
      evade: CharacterSheet.evade,
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
      scrollable: [".hol-character-content"],
    },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const character = this.actor.type === "character";
    const {characterSheetView} = character ? await import("./character-view.mjs") : {};
    const {actorContributions} = character ? await import("../services/conditions.mjs") : {};
    const {conditionSummary} = character ? await import("../rules/conditions.mjs") : {};
    const {damageBasis} = character ? await import("../services/damage.mjs") : {};
    const catalogs = character ? await loadCatalogs() : null;
    const development = this.actor.getFlag("heroes-of-legend", "development") ?? {};
    const sheetState = this.actor.getFlag("heroes-of-legend", "characterSheet") ?? {};
    const view = character ? characterSheetView({
      development, equipment: this.actor.items.filter((i) => i.type === "equipment"),
      abilities: this.actor.items.filter((i) => i.type === "ability"),
      choices: catalogs.choices, inventory: catalogs.inventory, sheetState: !this.actor.isOwner && this.observerTab ? {...sheetState, tab:this.observerTab} : sheetState,
      survival: this.actor.getFlag("heroes-of-legend", "survival") ?? {},
      wounds: Object.values(this.actor.getFlag("heroes-of-legend", "wounds") ?? {}),
    }) : {};
    const defenses = character ? damageBasis(this.actor).passiveDefenses : null;
    let movement = null;
    if (character && Number.isSafeInteger(development.creationSummary?.speedBase)) {
      const {actorMovement} = await import("../services/turn-budget.mjs");
      movement = actorMovement(this.actor);
    }
    return {
      ...context,
      ...view,
      movement,
      bulk: movement?.bulk ?? view.bulk,
      conditionsList: character ? Object.values(conditionSummary(actorContributions(this.actor))).filter((c) => c.active) : [],
      resistances: defenses?.resistances ?? [],
      weaknesses: defenses?.weaknesses ?? [],
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
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.actor.type !== "character") return;
    const {bindPortraitControls} = await import("./portrait.mjs");
    bindPortraitControls(this);
    // Bind once to each freshly rendered part, not to the persistent window.
    const root = this.element.querySelector(".hol-character-sheet");
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "true";
    for (const detail of root.querySelectorAll("details[data-disclosure]")) {
      const state = this.actor.getFlag("heroes-of-legend", "characterSheet") ?? {};
      detail.open = state.closed?.[detail.dataset.disclosure] !== true;
      detail.addEventListener("toggle", () => {
        if (!this.actor.isOwner || Boolean(this.actor.getFlag("heroes-of-legend", "characterSheet")?.closed?.[detail.dataset.disclosure]) === !detail.open) return;
        void updateOwnedDocument(this.actor, { [`flags.heroes-of-legend.characterSheet.closed.${detail.dataset.disclosure}`]: !detail.open }).catch((error) => ui.notifications.error(error.message));
      });
    }
    for (const field of root.querySelectorAll('[name="system.biography"], [name="system.memorizedMessage"]')) field.addEventListener("change", () => {
      void this.saveStory().catch((error) => ui.notifications.error(error.message));
    });
    for (const input of root.querySelectorAll("[data-quantity]")) input.addEventListener("change", async () => {
      try {
        const item = this.actor.items.get(input.dataset.quantity), quantity = Number(input.value);
        if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Quantity must be a whole number of at least zero.");
        await updateOwnedDocument(item, {"system.quantity": quantity});
      } catch (error) { ui.notifications.error(error.message); await this.render(); }
    });
  }
  async saveStory() {
    if (!this.actor.isOwner) return;
    const biography = this.element.querySelector('[name="system.biography"]')?.value;
    const message = this.element.querySelector('[name="system.memorizedMessage"]')?.value;
    if (typeof message === "string" && message.trim().split(/\s+/).filter(Boolean).length > 50)
      throw new Error("Message by Heart holds at most 50 words.");
    const data = {};
    if (typeof biography === "string" && biography !== this.actor.system.biography) data["system.biography"] = biography;
    if (typeof message === "string" && message !== this.actor.system.memorizedMessage) data["system.memorizedMessage"] = message;
    this.storySavePromise = (this.storySavePromise ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (Object.keys(data).length) await updateOwnedDocument(this.actor, data, {render:false});
    });
    return this.storySavePromise;
  }
  static async saveStoryAction() {
    try { await this.saveStory(); } catch(error) { ui.notifications.error(error.message); }
  }
  static async switchTab(event, target) {
    const tab = target.dataset.tab;
    if (!this.actor.isOwner) {
      // Observers navigate locally without changing an owner's preferred view.
      this.observerTab = tab;
      for (const pane of this.element.querySelectorAll("[data-tab-pane]")) pane.hidden = pane.dataset.tabPane !== tab;
      for (const button of this.element.querySelectorAll('[data-action="switchTab"]')) {
        if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      return;
    }
    try {
      await this.saveStory();
      await updateOwnedDocument(this.actor, {"flags.heroes-of-legend.characterSheet.tab": tab});
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async viewPortrait() {
    const {viewPortrait} = await import("./portrait.mjs");
    return viewPortrait.call(this);
  }
  static async savePortrait() {
    try {
      const {savePortrait} = await import("./portrait.mjs");
      return await savePortrait.call(this);
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async toggleEdit() {
    if (!this.actor.isOwner) return;
    await updateOwnedDocument(this.actor, {"flags.heroes-of-legend.characterSheet.edit": !this.actor.getFlag("heroes-of-legend", "characterSheet")?.edit});
  }
  static async basicVisibility(event, target) {
    try {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      const id = item?.getFlag("heroes-of-legend", "catalogId");
      if (!this.actor.isOwner || !(await loadCatalogs()).choices.find(record => record.id === id)?.universal) throw new Error("Choose an owned basic action.");
      await updateOwnedDocument(this.actor, { [`flags.heroes-of-legend.characterSheet.basicActions.${id}`]: target.dataset.visible !== "true" });
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async favorite(event, target) {
    try {
      if (!this.actor.isOwner) throw new Error("Only this character's owner can change favorites.");
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      if (!this.actor.items.get(id)) throw new Error("This item is no longer available.");
      const favorites = new Set(this.actor.getFlag("heroes-of-legend", "characterSheet")?.favorites ?? []);
      favorites.has(id) ? favorites.delete(id) : favorites.add(id);
      await updateOwnedDocument(this.actor, {"flags.heroes-of-legend.characterSheet.favorites": [...favorites]});
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async useItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !this.actor.isOwner) return;
    if (item.type === "equipment") {
      try {
        const {isHealingPotionItem} = await import("../services/potions.mjs");
        if (isHealingPotionItem(item)) {
          const {openPotionPreparation} = await import("../applications/potions.mjs");
          return openPotionPreparation(item, {bottleItemUuid: item.uuid});
        }
        const {isMeleeWeaponEquipment} = await import("../rules/equipment-identity.mjs");
        const abilityId = isMeleeWeaponEquipment(item) ? "ability-basic-melee" : item.system.catalogId === "item-ordinary-ranged-weapon" ? "ability-basic-ranged" : item.system.catalogId === "item-ordinary-shield" ? "ability-shield-block" : null;
        const ability = abilityId && this.actor.items.find((candidate) => candidate.type === "ability" && candidate.getFlag("heroes-of-legend", "catalogId") === abilityId);
        if (!ability) return item.sheet.render({force:true});
        if (abilityId === "ability-shield-block") return this.openShieldDefense(ability);
        if (abilityId === "ability-basic-ranged") return ability.sheet.render({force:true});
        const {activateOwnedAbility} = await import("../services/abilities.mjs");
        const dialog = await activateOwnedAbility(ability);
        if (dialog?.draft && "weaponItemUuid" in dialog.draft) {
          dialog.draft.weaponItemUuid = item.uuid;
          await dialog.render({force:true});
        }
        return dialog;
      } catch (error) { ui.notifications.error(error.message); return; }
    }
    try {
      const {isPotionAbility} = await import("../services/potions.mjs");
      if (isPotionAbility(item)) {
        const {openPotionPreparation} = await import("../applications/potions.mjs");
        return openPotionPreparation(item);
      }
      const {activateOwnedAbility, itemAbilityDefinition} = await import("../services/abilities.mjs");
      const definition = itemAbilityDefinition(item);
      if (!definition) {
        if (item.system.activity.rollMode === "attribute") {
          const dialog = new SharedRollDialog(this.actor, item.system.activity.attribute);
          dialog.draft.referenceItemIds = [item.id];
          return dialog.render({force:true});
        }
        return item.sheet.render({force:true});
      }
      await activateOwnedAbility(item);
    } catch (error) { ui.notifications.error(error.message); }
  }
  async openShieldDefense(ability) {
    const attacks = game.messages.contents.filter((message) => message.isContentVisible && message.author?.isGM && message.getFlag("heroes-of-legend", "attackCard")).slice(-20).reverse();
    if (!attacks.length) {
      ui.notifications.info("Use Shield Block from an incoming attack's Defend dialog before rolling.");
      return ability.sheet.render({force:true});
    }
    const escape = foundry.utils.escapeHTML;
    const selection = await foundry.applications.api.DialogV2.input({window:{title:"Shield Block · choose incoming attack"}, content:`<p>Prepare a defense, then use Shield Block from its applicable abilities before rolling.</p><label>Incoming attack<select name="attackId">${attacks.map((message) => { const attack=message.getFlag("heroes-of-legend", "attackCard"); return `<option value="${escape(message.id)}">${escape(attack.name ?? attack.actionName ?? message.speaker?.alias ?? "Incoming attack")} · ${escape(message.id)}</option>`; }).join("")}</select></label>`, ok:{label:"Prepare defense"}});
    if (!selection) return;
    const attack = game.messages.get(selection.attackId)?.getFlag("heroes-of-legend", "attackCard");
    const {promptDefenseRoll} = await import("../dialogs/attribute-roll.mjs");
    const dialog = await promptDefenseRoll(this.actor, attack.attributeKey, {attackMessageId:selection.attackId, defenderTokenUuid:this.actor.isToken ? this.actor.parent?.uuid ?? null : null});
    dialog.draft.referenceItemIds = [ability.id];
    await dialog.render({force:true});
    return dialog;
  }
  static async supply(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item && this.actor.isOwner) {
      const {InventoryPanel} = await import("../applications/inventory.mjs");
      await new InventoryPanel(this.actor, item.id).render({force:true});
    }
  }
  static async resupply(event, target) {
    try {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      const {requestResupply} = await import("../services/resupply.mjs");
      await requestResupply(this.actor, item, 1);
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async crafting() {
    const {CraftingPanel} = await import("../applications/crafting.mjs");
    await new CraftingPanel(this.actor).render({force:true});
  }
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    // Opening a reference is read-only; all edit controls keep native disabling.
    if (disabled && this.actor.testUserPermission(game.user, "OBSERVER"))
      for (const button of this.element.querySelectorAll(
        '[data-action="openAbility"], [data-action="switchTab"], [data-action="viewPortrait"]',
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
  static async spendGrit() {
    try {
      if (!this.actor.isOwner) throw new Error("Only the character owner can spend Grit.");
      if (!this.actor.system.grit.available) throw new Error("No Grit remains.");
      const confirmed = await foundry.applications.api.DialogV2.confirm({window: {title: "Spend one Grit?"}, content: "<p>Restore full HP and clear death marks. Wounds remain.</p>"});
      if (!confirmed) return;
      const {requestRecovery} = await import("../services/recovery.mjs");
      const {damageBasis} = await import("../services/damage.mjs");
      await requestRecovery(this.actor, damageBasis(this.actor), {kind: "grit"});
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async evade() {
    const result = await foundry.applications.api.DialogV2.input({window: {title: "Evade"}, content: `<p>Choose the attribute appropriate to the incoming attack. Strong defense uses its Weak effect; Weak defense uses its Strong effect.</p><label>Attribute<select name="attribute">${ATTRIBUTES.map((key) => `<option value="${key}" ${key === "agility" ? "selected" : ""}>${game.i18n.localize(`HOL.Attributes.${key}`)}</option>`).join("")}</select></label>`, ok: {label: "Prepare Evade"}});
    if (result) await promptAttributeRoll(this.actor, result.attribute);
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
