import { bindCreationAuthority } from "../services/creation.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import {
  currentDevelopment,
  requestDevelopment,
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
    position: { width: 940, height: 800 },
    form: { closeOnSubmit: false, handler: AdvancementWizard.save },
    actions: {
      bindAuthority: AdvancementWizard.bindAuthority,
      save: AdvancementWizard.save,
      refresh: AdvancementWizard.refresh,
      add: AdvancementWizard.add,
      remove: AdvancementWizard.remove,
      award: AdvancementWizard.award,
      safePlace: AdvancementWizard.safePlace,
      commit: AdvancementWizard.commit,
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
    this.preview = advancementPreview(current, this.draft, choices, inventory);
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
          (a.weaponChoice ||
            a.recipeChoices ||
            a.items.includes("item-ordinary-melee-weapon")),
      )
      .map((a) => ({
        id: a.id,
        name: get(a.id).name,
        weaponOptions: a.weaponChoice?.map((id) => ({
          id,
          selected: this.draft.acquisitions[a.id]?.weapon === id,
        })),
        needsHands:
          a.items.includes("item-ordinary-melee-weapon") ||
          a.weaponChoice?.includes("melee"),
        handOptions: [1, 2].map((value) => ({
          value,
          selected: this.draft.acquisitions[a.id]?.meleeHands === value,
        })),
        recipeChoices: a.recipeChoices,
        recipes: inventory.recipes
          .filter((r) => r.genericChoice && r.permissions.includes(a.id))
          .map((r) => ({
            ...r,
            selected: this.draft.acquisitions[a.id]?.recipes?.includes(r.id),
          })),
      }));
    return {
      actor: this.actor,
      current,
      isGM: game.user.isGM,
      authorityBound: Boolean(game.settings.get(ID, "creationAuthorityClient")),
      nextLevel: current.level + 1,
      stale: this.baseRevision !== (current.revision ?? 0),
      canCommit:
        this.preview.valid &&
        this.baseRevision === (current.revision ?? 0) &&
        (this.draft.purchases.length > 0 ||
          (current.pendingSignatures ?? []).length > 0),
      dp: state.dp,
      maximumHp: this.actor.system.health.baseMax + this.preview.maximumHpDelta,
      grit: state.gritGranted,
      spent: state.gritSpent,
      signatures: (current.pendingSignatures ?? []).map((level) => ({
        level,
        options: (get(current.classId)?.signatures[level] ?? []).map((id) => ({
          id,
          name: get(id).name,
          selected: this.draft.signatures[level] === id,
          disabled: current.abilities.includes(id),
        })),
      })),
      acquisitions,
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
        choices.filter((r) => ["ability", "discipline"].includes(r.kind)),
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
        automationStatus: abilityReferenceStatus(r.choice.id, r.choice.source),
        reasons: r.reasons.map((e) => e.text).join(" "),
        source: `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${r.choice.source.path}`,
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
      this.draft.signatures[field.dataset.signature] = field.value;
    for (const field of this.element.querySelectorAll("[data-acquisition]")) {
      const id = field.dataset.acquisition,
        s = (this.draft.acquisitions[id] ??= {});
      if (f.has(`weapon-${id}`)) s.weapon = String(f.get(`weapon-${id}`));
      if (f.has(`hands-${id}`)) s.meleeHands = Number(f.get(`hands-${id}`));
      if (field.querySelector("[data-recipes]"))
        s.recipes = f.getAll(`recipes-${id}`).map(String);
    }
  }
  async persist() {
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
        data: this.draft,
      },
    });
    this.revision = revision;
  }
  async act(fn) {
    if (this.busy) return;
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
    }
  }
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
  static async award() {
    try {
      await requestDevelopment(this.actor, "award", {
        level: Number(this.element.querySelector("[name=newLevel]").value),
      });
      ui.notifications.info(
        "Milestone requested. Refresh the ledger after the DA processes it.",
      );
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async safePlace() {
    try {
      await requestDevelopment(this.actor, "safePlace", {
        approved: this.element.querySelector("[name=safePlace]").checked,
      });
      ui.notifications.info(
        "Safe-place decision requested. Refresh the ledger after it is processed.",
      );
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async commit() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.capture();
      await this.persist();
      await requestDevelopment(this.actor, "commitDraft", {
        draftId: this.draftId,
        revision: this.revision,
      });
      await this.close();
      await this.actor.sheet.render({ force: true });
    } catch (e) {
      ui.notifications.error(e.message);
    } finally {
      this.busy = false;
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
    for (const group of this.element.querySelectorAll("[data-recipe-study]"))
      group.addEventListener("change", () => this.syncRecipeStudySelects());
    this.syncRecipeStudySelects();
    this.element
      .querySelector("[data-search]")
      ?.addEventListener("input", (event) => {
        for (const row of this.element.querySelectorAll("[data-search-name]"))
          row.hidden = !row.dataset.searchName
            .toLowerCase()
            .includes(event.target.value.toLowerCase());
      });
  }
}
