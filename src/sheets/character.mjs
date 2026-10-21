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
    position: { width: 940, height: 940 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      addEquipment: CharacterSheet.addEquipment,
      removeEquipment: CharacterSheet.removeEquipment,
      viewPortrait: CharacterSheet.viewPortrait,
      editImage: CharacterSheet.editPortrait,
      savePortrait: CharacterSheet.savePortrait,
      switchTab: CharacterSheet.switchTab,
      toggleEdit: CharacterSheet.toggleEdit,
      saveStory: CharacterSheet.saveStoryAction,
      basicVisibility: CharacterSheet.basicVisibility,
      favorite: CharacterSheet.favorite,
      useItem: CharacterSheet.useItem,
      supply: CharacterSheet.supply,
      depleteSupply: CharacterSheet.depleteSupply,
      editEquipment: CharacterSheet.editEquipment,
      conditionDetails: CharacterSheet.conditionDetails,
      woundDetails: CharacterSheet.woundDetails,
      resupply: CharacterSheet.resupply,
      crafting: CharacterSheet.crafting,
      startCraft: CharacterSheet.startCraft,
      attemptCraft: CharacterSheet.attemptCraft,
      death: CharacterSheet.death,
      spendGrit: CharacterSheet.spendGrit,
      evade: CharacterSheet.evade,
      wounds: CharacterSheet.wounds,
      treatWound: CharacterSheet.treatWound,
      addScar: CharacterSheet.addScar,
      removeScar: CharacterSheet.removeScar,
      removeWound: CharacterSheet.removeWound,
      recovery: CharacterSheet.recovery,
      damage: CharacterSheet.damage,
      equipment: CharacterSheet.equipment,
      conditions: CharacterSheet.conditions,
      addCondition: CharacterSheet.addCondition,
      confirmCondition: CharacterSheet.confirmCondition,
      adjustCondition: CharacterSheet.adjustCondition,
      removeCondition: CharacterSheet.removeCondition,
      applyConditionDamage: CharacterSheet.applyConditionDamage,
      advanceHero: CharacterSheet.advanceHero,
      chooseClassSignature: CharacterSheet.chooseClassSignature,
      addLevel: CharacterSheet.addLevel,
      removeLevel: CharacterSheet.removeLevel,
      createHero: CharacterSheet.createHero,
      openAbility: CharacterSheet.openAbility,
      closeReference: CharacterSheet.closeReference,
      referenceChoice: CharacterSheet.referenceChoice,
      addLanguage: CharacterSheet.addLanguage,
      removeLanguage: CharacterSheet.removeLanguage,
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
      craftingState: this.actor.getFlag("heroes-of-legend", "craftingState") ?? {},
      survival: {...this.actor.getFlag("heroes-of-legend", "survival"),marks:this.actor.getFlag("heroes-of-legend", "deathMarks") ?? this.actor.getFlag("heroes-of-legend", "survival")?.marks ?? 0},
      wounds: Object.values(this.actor.getFlag("heroes-of-legend", "wounds") ?? {}),
    }) : {};
    if(character){
      const {describeWoundEffect}=await import("../rules/wound-contributions.mjs");
      const {manualScarRecords}=await import("../services/scars.mjs");
      const manual=new Set(manualScarRecords(this.actor).map(record=>record.id));
      view.wounds=view.wounds.map(wound=>({...wound,manual:manual.has(wound.eventId),canTreat:this.actor.isOwner&&Boolean(wound.recoveryValue)&&(wound.recoveryProgress??0)<wound.recoveryValue,effectSummary:this.actor.effects.filter(effect=>effect.active&&!effect.getFlag("heroes-of-legend","retired")&&effect.getFlag("heroes-of-legend","woundEvent")===wound.eventId).map(effect=>describeWoundEffect(effect.toObject())).join(" · ")||"—"}));
      view.priorWounds=this.actor.getFlag("heroes-of-legend","survival")?.wounds ?? view.wounds.length;

    }
    const defenses = character ? damageBasis(this.actor).passiveDefenses : null;
    const {CONDITION_KINDS} = character ? await import("../rules/conditions.mjs") : {};
    const {nativeCraftingRecipes} = character ? await import("../services/crafting.mjs") : {};
    const craftingRecipes = character ? nativeCraftingRecipes(this.actor,catalogs).map(recipe => ({...recipe,
      available: recipe.abilities.length > 0,
      supplies: this.actor.items.filter(item => item.type === "equipment" && item.system.catalogId === recipe.product && item.system.quantity > 0).map(item => ({id:item.id,name:item.name,die:item.system.inventoryDie,selected:recipe.project?.supplyId === item.id})),
    })) : [];
    let movement = null;
    if (character && Number.isSafeInteger(development.creationSummary?.speedBase)) {
      const {actorMovement} = await import("../services/turn-budget.mjs");
      movement = actorMovement(this.actor);
      movement = {...movement,speed:Math.max(0,movement.speed - conditionSummary(actorContributions(this.actor)).slowed.rating)};
      movement.speedReduced=movement.speed < movement.unencumbered;
    }
    return {
      ...context,
      ...view,
      craftingRecipes,
      craftingProjects: craftingRecipes.filter(recipe => recipe.project?.active),
      movement,
      bulk: movement?.bulk ?? view.bulk,
      conditionSources: character ? Object.values(conditionSummary(actorContributions(this.actor))).filter(c=>c.active).map(summary=>{
        const sources=actorContributions(this.actor).filter(c=>c.key===summary.key).sort((a,b)=>Number(a.persistence!=="temporary")-Number(b.persistence!=="temporary"));
        return {...summary,id:sources[0].id,binary:summary.kind==="binary",starred:summary.persistent>0,duration:summary.kind==="duration",canApply:["burning","freezing","bleeding"].includes(summary.key)};
      }) : [],
      conditionsList: character ? Object.values(conditionSummary(actorContributions(this.actor))).filter((c) => c.active) : [],
      armorDr: defenses?.resistances?.find(resistance => resistance.type === "physical")?.value ?? 0,
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
        signedEffective:`${this.actor.system.attributes[key].effective>0?"+":""}${this.actor.system.attributes[key].effective}`,
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
    if (this.pendingTabFocus) {
      root.querySelector(`[data-action="switchTab"][data-tab="${this.pendingTabFocus}"]`)?.focus();this.pendingTabFocus=null;
    }
    root.querySelector(".hol-character-tabs")?.addEventListener("keydown",event=>{
      const buttons=[...root.querySelectorAll('[data-action="switchTab"]')],index=buttons.indexOf(event.target);
      if(index<0 || !["ArrowUp","ArrowDown","Home","End"].includes(event.key))return;
      event.preventDefault();const next=buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length-1 : (index+(event.key === "ArrowDown" ? 1 : -1)+buttons.length)%buttons.length];
      this.pendingTabFocus=next.dataset.tab;next.click();if(!this.actor.isOwner)next.focus();
    });
    for (const detail of root.querySelectorAll("details[data-disclosure]")) {
      const state = this.actor.getFlag("heroes-of-legend", "characterSheet") ?? {};
      if(state.closed?.[detail.dataset.disclosure] !== undefined) detail.open = !state.closed[detail.dataset.disclosure];
      detail.addEventListener("toggle", () => {
        if (!this.actor.isOwner || Boolean(this.actor.getFlag("heroes-of-legend", "characterSheet")?.closed?.[detail.dataset.disclosure]) === !detail.open) return;
        void updateOwnedDocument(this.actor, { [`flags.heroes-of-legend.characterSheet.closed.${detail.dataset.disclosure}`]: !detail.open }).catch((error) => ui.notifications.error(error.message));
      });
    }
    const filterAbilities = () => {
      const query = root.querySelector("[data-ability-search]")?.value.toLowerCase() ?? "";
      const discipline = root.querySelector("[data-ability-filter]")?.value ?? "all";
      for (const row of root.querySelectorAll("[data-ability-row]")) row.hidden = !row.dataset.searchName.toLowerCase().includes(query) || (discipline !== "all" && !row.dataset.disciplineIds.split(" ").includes(discipline));
    };
    root.querySelector("[data-ability-search]")?.addEventListener("input", filterAbilities);
    root.querySelector("[data-ability-filter]")?.addEventListener("change", filterAbilities);
    for (const field of root.querySelectorAll('[name="system.biography"], [name="system.memorizedMessage"]')) field.addEventListener("change", () => {
      void this.saveStory().catch((error) => ui.notifications.error(error.message));
    });
    root.querySelector("[data-current-hp]")?.addEventListener("change", async event => {
      try {
        const {currentHpInput}=await import("../rules/resource-input.mjs");
        const hp=currentHpInput(event.target.value,this.actor.system.health.max,this.actor.system.health.value);
        const {setOwnedHp} = await import("../services/documents.mjs");
        await setOwnedHp(this.actor, hp);
      } catch(error) { ui.notifications.error(error.message); await this.render(); }
    });
    for (const input of root.querySelectorAll("[data-arrangement]")) input.addEventListener("change", async () => {
      try {
        const {equipmentBasis, requestEquipment} = await import("../services/equipment.mjs");
        const {itemArrangement} = await import("../rules/workshop-play.mjs");
        const basis = equipmentBasis(this.actor);
        const id = input.dataset.arrangement, prop = input.dataset.prop;
        const items = basis.items.map(item => item.id === id ? {...item, ...itemArrangement(item, prop, input.checked)} : item);
        await requestEquipment(this.actor, basis, items, basis.capacity);
      } catch (error) { ui.notifications.error(error.message); await this.render(); }
    });
    for (const select of root.querySelectorAll("[data-ammunition-for]")) select.addEventListener("change", async () => {
      try {
        const weapon=this.actor.items.get(select.dataset.ammunitionFor), ammo=select.value?this.actor.items.get(select.value):null;
        if(weapon?.system.catalogId!=="item-ordinary-ranged-weapon")throw new Error("Choose a ranged weapon.");
        if(select.value && (ammo?.system.catalogId!=="item-ammunition-bundle" || ammo.system.quantity<1 || ammo.system.inventoryDie<1))throw new Error("Choose available ammunition on this character.");
        await updateOwnedDocument(weapon,{"flags.heroes-of-legend.ammunitionItemId":select.value});
      }catch(error){ui.notifications.error(error.message);await this.render();}
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
        button.setAttribute("aria-selected",String(button.dataset.tab === tab));
        button.setAttribute("tabindex",button.dataset.tab === tab ? "0" : "-1");
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
  static async editPortrait() {
    try {const {editPortrait}=await import("./portrait.mjs");return await editPortrait.call(this);} catch(error) {ui.notifications.error(error.message);}
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
    const item = this.actor.items.get(target.dataset.useItemId || target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !this.actor.isOwner) return;
    if (item.type === "equipment") {
      try {
        if (target.dataset.supplyUse === "true") {
          if(target.disabled)return;
          target.disabled=true;
          try {const {consumeOwnedSupply}=await import("../services/inventory.mjs");return await consumeOwnedSupply(this.actor,item,{});}
          finally {target.disabled=false;}
        }
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
        const {activateOwnedAbility} = await import("../services/abilities.mjs");
        const dialog = await activateOwnedAbility(ability,abilityId === "ability-basic-ranged" ? {rangedWeaponItemId:item.id} : {weaponItemId:item.id});
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
      const {activateOwnedAbility} = await import("../services/abilities.mjs");
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
    const selection = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"], window:{title:"Shield Block · choose incoming attack"}, content:`<p>Prepare a defense, then use Shield Block from its applicable abilities before rolling.</p><label>Incoming attack<select name="attackId">${attacks.map((message) => { const attack=message.getFlag("heroes-of-legend", "attackCard"); return `<option value="${escape(message.id)}">${escape(attack.name ?? attack.actionName ?? message.speaker?.alias ?? "Incoming attack")} · ${escape(message.id)}</option>`; }).join("")}</select></label>`, ok:{label:"Prepare defense"}});
    if (!selection) return;
    const attack = game.messages.get(selection.attackId)?.getFlag("heroes-of-legend", "attackCard");
    const {promptDefenseRoll} = await import("../dialogs/attribute-roll.mjs");
    const dialog = await promptDefenseRoll(this.actor, attack.attributeKey, {attackMessageId:selection.attackId, defenderTokenUuid:this.actor.isToken ? this.actor.parent?.uuid ?? null : null});
    dialog.draft.referenceItemIds = [ability.id];
    await dialog.render({force:true});
    return dialog;
  }
  static async depleteSupply(event,target) {
    try{const item=this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);const {depleteOwnedSupply}=await import("../services/inventory.mjs");await depleteOwnedSupply(this.actor,item);}
    catch(error){ui.notifications.error(error.message);}
  }
  static async editEquipment(event,target) {
    const item=this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if(item?.isOwner)await item.sheet.render({force:true,editing:true});
  }
  static async woundDetails(event,target) {
    const {openWoundDetails}=await import("../applications/wound-details.mjs");
    await openWoundDetails(this.actor,target.dataset.eventId ?? target.closest("[data-wound-event]")?.dataset.woundEvent);
  }
  static async conditionDetails(event,target) {
    try{const {showConditionDetails}=await import("../applications/condition-details.mjs");await showConditionDetails(target.dataset.key);}
    catch(error){ui.notifications.error(error.message);}
  }
  static async supply(event, target) {
    const item=this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if(!item || !this.actor.isOwner || target.disabled)return;
    target.disabled=true;
    try {const {consumeOwnedSupply}=await import("../services/inventory.mjs");await consumeOwnedSupply(this.actor,item,{});}
    catch(error){ui.notifications.error(error.message);}finally{if(target.isConnected)target.disabled=false;}
  }
  static async resupply(event, target) {
    try {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      const {requestResupply} = await import("../services/resupply.mjs");
      await requestResupply(this.actor, item, 1);
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async startCraft(event,target) {
    try {
      const {requestCrafting} = await import("../services/crafting.mjs");
      await requestCrafting(this.actor,{kind:"start",recipeId:target.dataset.recipeId});
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async attemptCraft(event,target) {
    try {
      const row = target.closest("[data-craft-project]");
      const {openCraftingAttempt} = await import("../applications/crafting.mjs");
      await openCraftingAttempt(this.actor,row.dataset.craftProject,target.dataset.abilityId);
    } catch(error) { ui.notifications.error(error.message); }
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
        '[data-action="openAbility"], [data-action="referenceChoice"], [data-action="closeReference"], [data-action="switchTab"], [data-action="viewPortrait"]',
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
      const confirmed = await foundry.applications.api.DialogV2.confirm({classes: ["heroes-of-legend", "hol-native-dialog"], window: {title: "Spend one Grit?"}, content: "<p>Restore full HP and clear death marks. Wounds remain.</p>"});
      if (!confirmed) return;
      const {requestRecovery} = await import("../services/recovery.mjs");
      const {damageBasis} = await import("../services/damage.mjs");
      await requestRecovery(this.actor, damageBasis(this.actor), {kind: "grit"});
    } catch (error) { ui.notifications.error(error.message); }
  }
  static async evade() {
    const result = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"], window: {title: "Evade"}, content: `<p>Choose the attribute appropriate to the incoming attack. Strong defense uses its Weak effect; Weak defense uses its Strong effect.</p><label>Attribute<select name="attribute">${ATTRIBUTES.map((key) => `<option value="${key}" ${key === "agility" ? "selected" : ""}>${game.i18n.localize(`HOL.Attributes.${key}`)}</option>`).join("")}</select></label>`, ok: {label: "Prepare Evade"}});
    if (result) await promptAttributeRoll(this.actor, result.attribute);
  }
  static async death() {
    await new SharedRollDialog(this.actor, "fortitude", {
      mode: "death",
    }).render({ force: true });
  }
  static async treatWound(event,target) {
    try { const {requestWoundTreatment}=await import("../services/wound-treatment.mjs"); await requestWoundTreatment(this.actor,target.dataset.eventId,Number(target.dataset.progress)); }
    catch(error){ui.notifications.error(error.message);}
  }
  static async addScar() {
    try {const value=await foundry.applications.api.DialogV2.prompt({classes: ["heroes-of-legend", "hol-native-dialog"], window:{title:"Add scar note"},content:'<label>Scar name<input name="scarName" maxlength="200" required></label><label>Notes<textarea name="scarNotes" maxlength="2000"></textarea></label>',ok:{label:"Add note",callback:(event,button,dialog)=>({name:dialog.element.querySelector('[name=scarName]').value,notes:dialog.element.querySelector('[name=scarNotes]').value})}});if(!value)return;const {requestManualScar}=await import("../services/scars.mjs");await requestManualScar(this.actor,{kind:"add",...value});await this.render();}catch(error){ui.notifications.error(error.message);}
  }
  static async removeScar(event,target) {
    try {const {requestManualScar}=await import("../services/scars.mjs");await requestManualScar(this.actor,{kind:"remove",id:target.dataset.eventId});await this.render();}catch(error){ui.notifications.error(error.message);}
  }
  static async removeWound(event, target) {
    try {
      const {removeCharacterWound} = await import("../services/wound-roll.mjs");
      await removeCharacterWound(this.actor, target.dataset.eventId);
      await this.render();
    } catch(error) { ui.notifications.error(error.message); }
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
  static async chooseClassSignature(event, target) {
    if (!this.actor.isOwner) return;
    const level=Number(target.dataset.level);
    if (![1,3,7].includes(level)) return;
    await new AdvancementWizard(this.actor,{signatureLevel:level}).render({force:true});
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
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const path = item?.getFlag("heroes-of-legend", "source")?.path;
    if (!path) {
      if (!item?.testUserPermission(game.user, "OBSERVER")) return;
      const panel = this.element.querySelector("[data-character-reference]");
      panel.hidden = false;
      const content = panel.querySelector("[data-rule-content]");
      content.innerHTML = `<h2>${foundry.utils.escapeHTML(item.name)}</h2>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? "", {async:true, secrets:item.isOwner, relativeTo:item})}`;
      panel.querySelector("[data-action=closeReference]").focus();
      return;
    }
    await this.showRule(path);
  }
  async showRule(path) {
    try {
      const panel = this.element.querySelector("[data-character-reference]");
      panel.hidden = false;
      const {renderInlineRule} = await import("../services/journals.mjs");
      await renderInlineRule(path, panel.querySelector("[data-rule-content]"));
      panel.querySelector("[data-action=closeReference]").focus();
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async addCondition() {
    if (!this.actor.isOwner) return;
    const {CONDITION_KINDS} = await import("../rules/conditions.mjs");
    const panel = this.element.querySelector("[data-character-reference]");panel.hidden = false;
    panel.querySelector("[data-rule-content]").innerHTML = `<h2>Add condition</h2><label>Condition<select name="sheetCondition">${Object.keys(CONDITION_KINDS).sort().map(key => `<option value="${key}">${key[0].toUpperCase()+key.slice(1)}</option>`).join("")}</select></label><label data-condition-rating>Rating / turns<input name="sheetConditionRating" type="number" min="1" max="10000" step="1" value="1"></label><label data-condition-starred><input name="sheetConditionStarred" type="checkbox"> Starred</label><button type="button" data-action="confirmCondition">Add condition</button>`;
    const select = panel.querySelector("[name=sheetCondition]");
    const sync = () => {const kind = CONDITION_KINDS[select.value];panel.querySelector("[data-condition-rating]").hidden = kind === "binary";panel.querySelector("[data-condition-starred]").hidden = ["binary","maintained"].includes(kind);};
    select.addEventListener("change",sync);sync();
  }
  static async confirmCondition() {
    try {
      const panel = this.element.querySelector("[data-character-reference]");
      const {CONDITION_KINDS} = await import("../rules/conditions.mjs");
      const {requestCondition} = await import("../services/conditions.mjs");
      const key = panel.querySelector("[name=sheetCondition]").value,kind = CONDITION_KINDS[key];
      const rating = kind === "binary" ? 1 : Number(panel.querySelector("[name=sheetConditionRating]").value);
      if (!Number.isSafeInteger(rating) || rating < 1 || rating > 10000) throw new Error("Choose a whole rating or duration from 1 to 10,000.");
      const persistence = kind === "binary" ? "binary" : kind === "maintained" ? "maintained" : panel.querySelector("[name=sheetConditionStarred]").checked ? "starred" : "temporary";
      await requestCondition(this.actor,"add",{key,rating,persistence,source:"sheet"});panel.hidden = true;
    } catch(error) { ui.notifications.error(error.message); }
  }
  static async adjustCondition(event,target) {
    try {const {requestCondition} = await import("../services/conditions.mjs");await requestCondition(this.actor,"adjust",{effectId:target.dataset.id,delta:Number(target.dataset.delta)});} catch(error) {ui.notifications.error(error.message);}
  }
  static async removeCondition(event,target) {
    try {const {requestCondition} = await import("../services/conditions.mjs");await requestCondition(this.actor,"remove",{effectId:target.dataset.id,key:target.dataset.key});} catch(error) {ui.notifications.error(error.message);}
  }
  static async applyConditionDamage(event,target) {
    try {const {requestConditionApply} = await import("../services/condition-apply.mjs");await requestConditionApply(this.actor,target.dataset.key);} catch(error) {ui.notifications.error(error.message);}
  }
  static async changeLevel(kind) {
    if(!this.actor.isOwner)return;
    try {
      const {requestDevelopment,waitForDevelopmentOperation}=await import("../services/advancement.mjs");
      const message=await requestDevelopment(this.actor,kind,{revision:this.actor.getFlag("heroes-of-legend","development")?.revision??0});
      await waitForDevelopmentOperation(this.actor,message.id);await this.render();
    }catch(error){ui.notifications.error(error.message);}
  }
  static async addLevel(){return CharacterSheet.changeLevel.call(this,"addLevel");}
  static async removeLevel(){return CharacterSheet.changeLevel.call(this,"removeLevel");}
  static async addLanguage() {
    try {const {CharacterLanguagePicker}=await import("../applications/language-picker.mjs");await new CharacterLanguagePicker(this.actor).render({force:true});}
    catch(error){ui.notifications.error(error.message);}
  }
  static async removeLanguage(event,target) {
    try {
      const {requestDevelopment} = await import("../services/advancement.mjs");
      await requestDevelopment(this.actor,"editLanguage",{revision:this.actor.getFlag("heroes-of-legend","development")?.revision ?? 0,removeId:target.dataset.id});
    } catch(error) { ui.notifications.error(error.message); }
  }
  static closeReference() { this.element.querySelector("[data-character-reference]").hidden = true; }
  static async referenceChoice(event,target) {
    const catalogs = await loadCatalogs();
    const record = catalogs.choices.find(record => record.id === target.dataset.id) ?? catalogs.inventory.recipes.find(record => record.id === target.dataset.id);
    if (record?.source?.path) await this.showRule(record.source.path);
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
    try {const {EquipmentMarket}=await import("../applications/equipment-market.mjs");await new EquipmentMarket(this.actor).render({force:true});}
    catch(error){ui.notifications.error(error.message);}
  }
  static async removeEquipment(event,target) {
    try {const {removeEquipmentFromActor} = await import("../services/item-import.mjs");await removeEquipmentFromActor(this.actor,target.closest("[data-item-id]").dataset.itemId);} catch(error) {ui.notifications.error(error.message);}
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
