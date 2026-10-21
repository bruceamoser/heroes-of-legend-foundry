import {bindWizardHp,wizardGrit,wizardWounds,wizardDeath} from "./wizard-play.mjs";
import { workshopNavIcon } from "../sheets/workshop-icons.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { bindLearningMarket, learningCardView } from "./learning-market.mjs";
import { equipmentEligibility, isUniversalAbility } from "../rules/equipment-eligibility.mjs";
import { additionalLanguageOptions } from "../rules/languages.mjs";
import { getCampaignLanguageConfiguration } from "../services/languages.mjs";
import {
  resolveBuilderDrop,
  validateBuilderPurchase,
  bindBuilderDrop,
  acquisitionWeaponName,
} from "../services/builder-drop.mjs";
import { bindCreationAuthority } from "../services/creation.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import {
  currentDevelopment,
  requestDevelopment,
  waitForDevelopment,
  waitForDevelopmentOperation,
} from "../services/advancement.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { advancementPreview } from "../rules/advancement.mjs";
import { abilityReferenceStatus } from "../rules/ability-definitions.mjs";
import {
  eligibleFirst,
  purchaseEligibility,
  recipeStudyChoices,
} from "../rules/development.mjs";
const ID = "heroes-of-legend";
export class AdvancementWizard extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["heroes-of-legend", "hol-creation", "hol-advancement"],
    window: { title: "Develop your Hero", resizable: true },
    position: { width: 940, height: 940 },
    form: { closeOnSubmit: false, handler: AdvancementWizard.save },
    actions: {
      wizardGrit,wizardWounds,wizardDeath,
      bindAuthority: AdvancementWizard.bindAuthority,
      save: AdvancementWizard.save,
      refresh: AdvancementWizard.refresh,
      add: AdvancementWizard.add,
      remove: AdvancementWizard.remove,
      chooseSignature: AdvancementWizard.chooseSignature,
      award: AdvancementWizard.award,
      safePlace: AdvancementWizard.safePlace,
      commit: AdvancementWizard.commit,
      referenceChoice: AdvancementWizard.referenceChoice,
      closeReference: AdvancementWizard.closeReference,
      returnSheet: AdvancementWizard.returnSheet,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/advancement.hbs",
      scrollable: [".hol-wizard-main"],
    },
  };
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.committedPlay = true;
    const state = currentDevelopment(actor),
      saved = actor.getFlag(ID, "advancementDraft"),
      resume = saved && !state.commitReceipts?.[saved.id];
    this.draft = structuredClone(
      resume ? saved.data : { purchases: [], signatures: {}, acquisitions: {} },
    );
    this.draftId = resume ? saved.id : foundry.utils.randomID();
    this.revision = saved?.revision ?? 0;
    this.baseRevision = resume ? saved.baseRevision : (state.revision ?? 0);
  }
  async _prepareContext() {
    if (!this.actor.isOwner) throw new Error("You must own the character.");
    this.catalogs = await loadCatalogs();
    const { choices, inventory, commit } = this.catalogs;
    const current = currentDevelopment(this.actor),
      get = (id) => choices.find((r) => r.id === id);
    const languageConfiguration = getCampaignLanguageConfiguration();
    this.languageDefinitions = languageConfiguration.definitions;
    this.languageBasis = languageConfiguration.basis;
    this.preview = advancementPreview(
      current,
      this.draft,
      choices,
      inventory,
      this.languageDefinitions,
    );
    const state = this.preview.state;
    const recipeName = (id) =>
      get(id)?.name ??
      inventory.recipes.find((recipe) => recipe.id === id)?.name ??
      id;
    const recipeStudy = recipeStudyChoices(state, inventory.recipes);
    const acquisitions = state.abilities
      .filter((id) => !current.abilities.includes(id))
      .map((id) => inventory.acquisitions.find((a) => a.id === id))
      .filter(
        (a) =>
          a &&
          (a.languageChoice ||
            a.specialtyChoice ||
            a.weaponChoice ||
            a.recipeChoices ||
            a.items.includes("item-ordinary-melee-weapon")),
      )
      .map((a) => ({
        id: a.id,
        name: get(a.id).name,
        weaponOptions: a.weaponChoice?.map((id) => ({
          id,
          name: acquisitionWeaponName(id, inventory),
          selected: this.draft.acquisitions[a.id]?.weapon === id,
        })),
        needsHands:
          a.items.includes("item-ordinary-melee-weapon") ||
          (a.weaponChoice?.includes("melee") && this.draft.acquisitions?.[a.id]?.weapon === "melee"),
        handOptions: [1, 2].map((value) => ({
          value,
          selected: this.draft.acquisitions[a.id]?.meleeHands === value,
        })),
        languageChoice: a.languageChoice,
        languageOptions: additionalLanguageOptions(
          this.languageDefinitions,
          state.languages ?? [],
          this.draft.acquisitions?.[a.id]?.languageId,
          a.id,
        ),
        specialtyChoice: a.specialtyChoice,
        specialty: this.draft.acquisitions?.[a.id]?.specialty ?? "",
        recipeChoices: a.recipeChoices,
        recipes: inventory.recipes
          .filter((r) => r.genericChoice && r.permissions.includes(a.id))
          .map((r) => ({
            ...r,
            selected: this.draft.acquisitions[a.id]?.recipes?.includes(r.id),
          })),
      }));
    const {actorMovement}=await import("../services/turn-budget.mjs");
    const {actorContributions}=await import("../services/conditions.mjs");
    const {conditionSummary}=await import("../rules/conditions.mjs");
    const {damageBasis}=await import("../services/damage.mjs");
    const movement=actorMovement(this.actor);
    movement.speed=Math.max(0,movement.speed-conditionSummary(actorContributions(this.actor)).slowed.rating);
    movement.speedReduced=movement.speed<movement.unencumbered;
    const armorDr=damageBasis(this.actor).passiveDefenses.resistances.find(resistance=>resistance.type==="physical")?.value??0;
    return {
      actor: this.actor,
      movement,armorDr,woundCount:Object.keys(this.actor.getFlag(ID,"wounds")??{}).length,
      developmentIcon: workshopNavIcon("Development"),
      learningIcon: workshopNavIcon("Abilities"),
      headerAttributes: ATTRIBUTES.map(key => ({name:game.i18n.localize(`HOL.Attributes.${key}`),value:this.actor.system.attributes[key].effective > 0 ? `+${this.actor.system.attributes[key].effective}` : this.actor.system.attributes[key].effective})),
      identityLine: [current.creation?.ancestryId,current.creation?.culture?.id,current.creation?.background?.id,current.classId].map(id=>get(id)?.name).filter(Boolean).join(" · "),
      current,
      isGM: game.user.isGM,
      authorityBound: Boolean(game.settings.get(ID, "creationAuthorityClient")),
      nextLevel: current.level + 1,
      stale: this.baseRevision !== (current.revision ?? 0),
      canCommit:
        this.preview.valid &&
        this.baseRevision === (current.revision ?? 0),
      dp: state.dp,
      maximumHp: this.actor.system.health.baseMax + this.preview.maximumHpDelta,
      grit: state.gritGranted,
      gritAvailable: Math.max(0,state.gritGranted-state.gritSpent),
      spent: state.gritSpent,
      signatures: (current.pendingSignatures ?? []).map((level) => ({
        level,
        options: (get(current.classId)?.signatures[level] ?? []).map((id) => ({
          id,
          name: get(id)?.name ?? id,
          flavor: get(id)?.reference?.flavor?.[0] ?? "",
          selected: this.draft.signatures[level] === id,
          disabled: current.abilities.includes(id),
        })),
      })),
      acquisitions,
      requiredChoices: acquisitions.filter((a) => this.preview.errors.some((e) => e.id === a.id)),
      currentBuild: state.abilities.map(id=>{
        const index=this.draft.purchases.findIndex(p=>p.id===id),locked=current.abilities.includes(id);
        let source=locked?"Earlier levels":index>=0?"Learned":"Granted";
        for(const kind of ["culture","background"]){const origin=get(current.creation?.[kind]?.id);if(origin?.pairs?.[current.creation?.[kind]?.pair]?.abilityId===id)source=origin.name;}
        if(id===current.creation?.signatureId)source=get(current.classId)?.name??source;
        return {id,name:get(id)?.name??id,grantSource:source,locked,acquisition:this.preview.errors.some(error=>error.id===id)?acquisitions.find(a=>a.id===id):null,index,removable:index>=0};
      }),
      disciplineFilters: choices.filter((r) => r.kind === "discipline"),
      disciplinePurchases: this.draft.purchases.map((p, index) => ({...p,index,name: get(p.id)?.name ?? p.id})).filter((p) => get(p.id)?.kind === "discipline"),
      knownRanks: Object.entries(state.ranks ?? {}).map(([id, rank]) => ({name: get(id)?.name ?? id, rank,mark:`systems/heroes-of-legend/assets/marks/${id.replace(/^discipline-/,"")}.webp`})),
      purchases: this.draft.purchases.map((p, index) => ({
        ...p,
        index,
        name: get(p.id)?.name ?? p.id,
        recipeNames: [
          ...(p.recipeIds ?? []),
          ...(p.recipeId ? [p.recipeId] : []),
        ].map(recipeName),
        legacyRecipePurchase: Boolean(p.recipeId),
      })),
      errors: this.preview.errors.map(
        (e) =>
          e.text ??
          `${get(e.id)?.name ?? e.id}: ${(e.reasons ?? []).map((r) => r.text).join(" ")}`,
      ),
      learning: eligibleFirst(
        choices.filter((r) => r.kind === "discipline" || (r.kind === "ability" && !r.universal)),
        (r) => {
          const recipeIds =
            r.purchasePolicy === "new-recipe"
              ? recipeStudy.defaultRecipeIds
              : null;
          return purchaseEligibility(
            r,
            state,
            choices,
            recipeIds ? { recipeIds } : {},
          );
        },
      ).map((r) => ({
        ...r,
        reference: r.choice.reference,
      ...learningCardView(r.choice, choices),
      disciplineIds: (r.choice.requirements ?? []).filter((q) => q.kind === "discipline").map((q) => q.id).join(" "),
      universal: isUniversalAbility(r.choice),
        automationStatus: abilityReferenceStatus(r.choice.id, r.choice.source),
        reasons: r.reasons.map((e) => e.text).join(" "),
        source: r.choice.source?.path ? `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${r.choice.source.path}` : "",
        recipeStudy: r.choice.purchasePolicy === "new-recipe",
        recipeSelections: [0, 1].map((slot) => ({
          label: slot === 0 ? "First recipe" : "Second recipe",
          name: `recipe-${r.choice.id}-${slot + 1}`,
          options: recipeStudy.options.map((recipe) => ({
            ...recipe,
            selected: recipe.id === recipeStudy.defaultRecipeIds[slot],
          })),
        })),
      })),
    };
  }
  capture() {
    const f = new FormData(this.element);
    for (const field of this.element.querySelectorAll("[data-signature]"))
      if (field.type !== "radio" || field.checked) this.draft.signatures[field.dataset.signature] = field.value;
    for (const field of this.element.querySelectorAll("[data-acquisition]")) {
      const id = field.dataset.acquisition,
        s = (this.draft.acquisitions[id] ??= {});
      for (const key of ["languageId", "specialty"])
        if (f.has(`${key}-${id}`)) s[key] = String(f.get(`${key}-${id}`));
      if (f.has(`weapon-${id}`)) s.weapon = String(f.get(`weapon-${id}`));
      if (f.has(`hands-${id}`)) s.meleeHands = Number(f.get(`hands-${id}`));
      if (field.querySelector("[data-recipes]"))
        s.recipes = f.getAll(`recipes-${id}`).map(String);
    }
  }
  async persist() {
    if (getCampaignLanguageConfiguration().basis !== this.languageBasis)
      throw new Error(
        "Campaign languages changed. Refresh and review the language choices before saving.",
      );
    if (
      (this.actor.getFlag(ID, "advancementDraft")?.revision ?? 0) !==
      this.revision
    )
      throw new Error(
        "Another window changed the draft. Reopen to load its revision.",
      );
    const revision = this.revision + 1;
    await updateOwnedDocument(this.actor, {
      [`flags.${ID}.advancementDraft`]: {
        id: this.draftId,
        revision,
        baseRevision: this.baseRevision,
        sourceCommit: this.catalogs.commit,
        languageBasis: this.languageBasis,
        data: this.draft,
      },
    });
    this.revision = revision;
  }
  async act(fn) {
    if (this.committing) return;
    // Blur/change fires before a navigation click. Keep that click in order
    // instead of dropping it while the automatic draft save is in flight.
    if (this.busy) {
      this.pendingActions ??= [];
      return new Promise(resolve => this.pendingActions.push({fn,resolve}));
    }
    this.busy = true;
    try {
      this.capture();
      await fn();
      await this.persist();
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    } finally {
      this.busy = false;
      const next = this.pendingActions?.shift();
      if (next) void this.act(next.fn).finally(next.resolve);
      else for (const resolve of this.idleWaiters?.splice(0) ?? []) resolve();
    }
  }
  static async returnSheet() {
    await this.act(async()=>{});
    await this.close();
    await this.actor.sheet.render({force:true});
  }
  static async referenceChoice(event, target) {
    const record = this.catalogs.choices.find(record => record.id === target.dataset.id) ?? this.catalogs.inventory.equipment.find(record => record.id === target.dataset.id) ?? this.catalogs.inventory.recipes.find(record => record.id === target.dataset.id);
    if (!record?.source?.path) return;
    try {
      const panel = this.element.querySelector("[data-creation-reference]");
      this.referenceMarket = this.element.querySelector("dialog[open]");
      this.referenceMarket?.close();
      panel.hidden = false;
      const {renderInlineRule} = await import("../services/journals.mjs");
      const content=panel.querySelector("[data-rule-content]");
      await renderInlineRule(record.source.path,content);
      const close=[...content.querySelectorAll(":scope > header button")].find(button=>button.textContent === "Close rules");
      close?.addEventListener("click",()=>{this.referenceMarket?.showModal();this.referenceMarket=null;});
      panel.querySelector("[data-action=closeReference]").focus();
    } catch(error) { ui.notifications.error(error.message); }
  }
  static closeReference() { this.element.querySelector("[data-creation-reference]").hidden = true; this.referenceMarket?.showModal(); this.referenceMarket = null; }
  static async bindAuthority() {
    try {
      await bindCreationAuthority();
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async save() {
    await this.act(async () => {});
  }
  static async refresh() {
    await this.act(async () => {
      this.baseRevision = this.actor.getFlag(ID, "development")?.revision ?? 0;
    });
  }
  static async add(event, target) {
    await this.act(async () => {
      const id = target.dataset.id,
        choice = this.catalogs.choices.find((r) => r.id === id);
      const recipeIds =
        choice.purchasePolicy === "new-recipe"
          ? [1, 2]
              .map(
                (slot) =>
                  this.element.querySelector(`[name="recipe-${id}-${slot}"]`)
                    ?.value,
              )
              .filter(Boolean)
          : [];
      const preview = advancementPreview(
        currentDevelopment(this.actor),
        this.draft,
        this.catalogs.choices,
        this.catalogs.inventory,
        this.languageDefinitions,
      );
      const eligibility = purchaseEligibility(
        choice,
        preview.state,
        this.catalogs.choices,
        choice.purchasePolicy === "new-recipe" ? { recipeIds } : {},
      );
      if (!eligibility.eligible)
        throw new Error(eligibility.reasons.map((r) => r.text).join(" "));
      this.draft.purchases.push({
        id,
        ...(choice.purchasePolicy === "new-recipe" ? { recipeIds } : {}),
      });
    });
  }
  static async remove(event, target) {
    await this.act(async () => {
      this.draft.purchases.splice(Number(target.dataset.index), 1);
    });
  }
  static async chooseSignature(event,target) {
    await this.act(async()=>{this.draft.signatures[target.dataset.level]=target.dataset.id;});
  }
  static async award() {
    try {
      const request = await requestDevelopment(this.actor, "award", {
        level: Number(this.element.querySelector("[name=newLevel]").value),
      });
      await waitForDevelopmentOperation(this.actor,request.id);
      await AdvancementWizard.refresh.call(this);
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async safePlace() {
    try {
      const request = await requestDevelopment(this.actor, "safePlace", {
        approved: this.element.querySelector("[name=safePlace]").checked,
      });
      await waitForDevelopmentOperation(this.actor,request.id);
      await AdvancementWizard.refresh.call(this);
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async commit() {
    if (this.committing) return;
    if (this.busy) await new Promise(resolve => {this.idleWaiters ??= [];this.idleWaiters.push(resolve);});
    if (this.committing) return;
    if(this.preview?.valid && !this.draft.purchases.length && !(currentDevelopment(this.actor).pendingSignatures??[]).length) return AdvancementWizard.returnSheet.call(this);
    this.committing = true;
    this.busy = true;
    if(this.element){this.element.inert=true;this.element.setAttribute("aria-busy","true");}
    try {
      this.capture();
      await this.persist();
      const request = await requestDevelopment(this.actor, "commitDraft", {
        draftId: this.draftId,
        revision: this.revision,
      });
      await waitForDevelopment(this.actor, request.id, this.draftId);
      await this.close();
      await this.actor.sheet.render({ force: true });
    } catch (e) {
      ui.notifications.error(e.message);
    } finally {
      this.committing = false;
      if(this.element){this.element.inert=false;this.element.removeAttribute("aria-busy");}
      this.busy = false;
      for (const resolve of this.idleWaiters?.splice(0) ?? []) resolve();
    }
  }
  async dropAbility(event) {
    if (this.busy) return;
    try {
      const choice = await resolveBuilderDrop(event, this.catalogs.choices);
      if (!this.actor.isOwner)
        throw new Error("Only a character owner can edit this draft.");
      if (this.busy || !this.rendered) return;
      validateBuilderPurchase(
        this,
        choice,
        (draft) =>
          advancementPreview(
            currentDevelopment(this.actor),
            draft,
            this.catalogs.choices,
            this.catalogs.inventory,
            this.languageDefinitions,
          ).state,
      );
      await AdvancementWizard.add.call(this, event, {
        dataset: { id: choice.id },
      });
    } catch (error) {
      ui.notifications.warn(error.message);
    }
  }
  syncRecipeStudySelects() {
    for (const group of this.element.querySelectorAll("[data-recipe-study]")) {
      const selects = [...group.querySelectorAll("select")];
      for (const select of selects)
        for (const option of select.options)
          option.disabled = option.dataset.intrinsicDisabled === "true";
      for (const select of selects)
        for (const other of selects) {
          if (other === select || !other.value) continue;
          const option = [...select.options].find(
            (candidate) => candidate.value === other.value,
          );
          if (option) option.disabled = true;
        }
    }
  }
  _onRender(context, options) {
    super._onRender(context, options);
    bindWizardHp(this);
    bindLearningMarket(this);
    for (const group of this.element.querySelectorAll("[data-recipe-study]"))
      group.addEventListener("change", () => this.syncRecipeStudySelects());
    this.syncRecipeStudySelects();
    bindBuilderDrop(this);
    for (const input of this.element.querySelectorAll("[data-acquisition] input, [data-acquisition] select, [data-signature]")) input.addEventListener("change", () => this.act(async () => {}));

  }
}
