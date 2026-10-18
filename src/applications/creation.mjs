import { resolveBuilderDrop, validateBuilderPurchase, bindBuilderDrop, acquisitionWeaponName } from "../services/builder-drop.mjs";
import {
  bindCreationAuthority,
  requestCreation,
} from "../services/creation.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { newCreationDraft, creationPreview } from "../rules/creation.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { campaignLanguageOptions } from "../rules/languages.mjs";
import { getCampaignLanguageConfiguration } from "../services/languages.mjs";
import { abilityReferenceStatus } from "../rules/ability-definitions.mjs";
import { readPortableCharacter, MAX_CHARACTER_BYTES } from "../rules/portable-character.mjs";
import {
  eligibleFirst,
  purchaseEligibility,
  classEligibility,
  recipeStudyChoices,
} from "../rules/development.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const STEPS = [
  "Identity",
  "Ancestry & languages",
  "Origins",
  "Level 0 learning",
  "Class",
  "Level 1 learning",
  "Equipment",
  "Review",
];
const FLAG = "creationDraft";
export class CreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["heroes-of-legend", "hol-creation"],
    position: { width: 980, height: 800 },
    window: { title: "Create a Hero", resizable: true },
    form: { closeOnSubmit: false, handler: CreationWizard.submit },
    actions: {
      commitCreation: CreationWizard.commitCreation,
      bindAuthority: CreationWizard.bindAuthority,
      navigate: CreationWizard.navigate,
      saveDraft: CreationWizard.saveDraft,
      addPurchase: CreationWizard.addPurchase,
      removePurchase: CreationWizard.removePurchase,
      addEquipment: CreationWizard.addEquipment,
      removeEquipment: CreationWizard.removeEquipment,
      importCharacter: CreationWizard.importCharacter,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/creation.hbs",
      scrollable: [".hol-wizard-main"],
    },
  };
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    const saved = actor.getFlag("heroes-of-legend", FLAG);
    this.draft = structuredClone(saved?.data ?? newCreationDraft());
    if (!saved) this.draft.name = actor.name;
    this.step = saved?.step ?? 0;
    this.revision = saved?.revision ?? 0;
    this.savedLanguageBasis = saved?.languageBasis;
    this.languageConfiguration = null;
    this.renderedLanguageBasis = null;
  }
  async _prepareContext() {
    if (!this.actor.isOwner)
      throw new Error("Only a character owner can edit its creation draft.");
    this.catalogs = await loadCatalogs();
    const { choices, inventory, commit } = this.catalogs;
    this.languageConfiguration = getCampaignLanguageConfiguration();
    this.renderedLanguageBasis = this.languageConfiguration.basis;
    const d = this.draft,
      get = (id) => choices.find((r) => r.id === id),
      name = (id) =>
        get(id)?.name ??
        inventory.equipment.find((r) => r.id === id)?.name ??
        inventory.recipes.find((r) => r.id === id)?.name ??
        id;
    const preview = creationPreview(
        d,
        choices,
        inventory,
        this.languageConfiguration.definitions,
      ),
      languageOptions = campaignLanguageOptions(
        this.languageConfiguration.definitions,
        d.languages,
      );
    this.preview = preview;
    const languageBasisError =
      this.savedLanguageBasis &&
      this.savedLanguageBasis !== this.languageConfiguration.basis
        ? "Campaign languages changed after this draft was saved. Review the current language choices and save the draft again."
        : this.revision > 0 && !this.savedLanguageBasis
          ? "This draft does not record its campaign language configuration. Save the draft again before creation."
          : "";
    const errors = [
      ...preview.errors.map(
        (e) =>
          e.text ??
          `${name(e.id ?? e.code)}: ${(e.reasons ?? []).map((r) => r.text).join(" ")}`,
      ),
      ...(languageBasisError ? [languageBasisError] : []),
    ];
    const options = (records, selected) =>
      records.map((r) => ({
        ...r,
        selected: Array.isArray(selected)
          ? selected.includes(r.id)
          : r.id === selected,
      }));
    const source = (r) =>
      `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${r.source.path}`;
    const stage = this.step === 3 ? 0 : 1,
      state = preview.stages[stage];
    const recipeStudy = recipeStudyChoices(state, inventory.recipes);
    const learning = eligibleFirst(
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
      source: source(r.choice),
      reasons: r.reasons.map((x) => x.text).join(" "),
      recipeStudy: r.choice.purchasePolicy === "new-recipe",
      recipeSelections: [0, 1].map((slot) => ({
        label: slot === 0 ? "First recipe" : "Second recipe",
        name: `recipe-${r.choice.id}-${slot + 1}`,
        options: recipeStudy.options.map((recipe) => ({
          ...recipe,
          selected: recipe.id === recipeStudy.defaultRecipeIds[slot],
        })),
      })),
      nextRank: r.rank,
    }));
    const acquisitions = preview.state.abilities
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
        name: name(a.id),
        weaponOptions: a.weaponChoice?.map((id) => ({
          id,
          name: acquisitionWeaponName(id, inventory),
          selected: d.acquisitions?.[a.id]?.weapon === id,
        })),
        needsHands:
          a.items.includes("item-ordinary-melee-weapon") ||
          a.weaponChoice?.includes("melee"),
        handOptions: [1, 2].map((value) => ({
          value,
          selected: d.acquisitions?.[a.id]?.meleeHands === value,
        })),
        recipeChoices: a.recipeChoices,
        recipes: options(
          inventory.recipes.filter(
            (r) => r.genericChoice && r.permissions.includes(a.id),
          ),
          d.acquisitions?.[a.id]?.recipes ?? [],
        ),
      }));
    const cls = get(d.classId);
    return {
      isGM: game.user.isGM,
      authorityBound: Boolean(
        game.settings.get("heroes-of-legend", "creationAuthorityClient"),
      ),
      committed: Boolean(
        this.actor.getFlag("heroes-of-legend", "creationReceipt"),
      ),
      draft: d,
      step: this.step,
      stage,
      steps: STEPS.map((name, index) => ({
        name,
        index,
        active: index === this.step,
      })),
      title: STEPS[this.step],
      identity: this.step === 0,
      ancestry: this.step === 1,
      origins: this.step === 2,
      learningStep: [3, 5].includes(this.step),
      classStep: this.step === 4,
      equipmentStep: this.step === 6,
      review: this.step === 7,
      previous: this.step - 1,
      next: this.step + 1,
      hasPrevious: this.step > 0,
      hasNext: this.step < 7,
      attributes: ATTRIBUTES.map((id) => ({
        id,
        name: game.i18n.localize(`HOL.Attributes.${id}`),
        value: d.attributes[id],
      })),
      attributeTotal: Object.values(d.attributes).reduce((a, b) => a + b, 0),
      ancestries: options(
        choices.filter((r) => r.kind === "ancestry"),
        d.ancestryId,
      ),
      traits: options(
        choices.filter(
          (r) => r.kind === "trait" && get(d.ancestryId)?.traits.includes(r.id),
        ),
        d.traitIds,
      ),
      languages: languageOptions.home,
      extraLanguages: languageOptions.extraSpoken,
      languageBasis: this.languageConfiguration.basis,
      languageBasisError,
      manyHomes: d.traitIds.includes("trait-human-many-homes"),
      culturePairs: choices
        .filter((r) => r.originType === "culture")
        .flatMap((r) =>
          r.pairs.map((pair, index) => ({
            value: `${r.id}|${index}`,
            label: `${r.name}: ${name(pair.disciplineId)} 1 + ${name(pair.abilityId)}`,
            selected: d.culture?.id === r.id && d.culture?.pair === index,
          })),
        ),
      backgroundPairs: choices
        .filter((r) => r.originType === "background")
        .flatMap((r) =>
          r.pairs.map((pair, index) => ({
            value: `${r.id}|${index}`,
            label: `${r.name}: ${name(pair.disciplineId)} 1 + ${name(pair.abilityId)}`,
            selected: d.background?.id === r.id && d.background?.pair === index,
          })),
        ),
      classes: eligibleFirst(
        choices.filter((r) => r.kind === "class"),
        (r) => classEligibility(r, d.attributes),
      ).map((r) => ({
        ...r,
        selected: d.classId === r.choice.id,
        reasons: r.reasons.map((x) => x.text).join(" "),
      })),
      classDisciplines: options(
        (cls?.startingDisciplines ?? []).map(get),
        d.classDisciplines,
      ),
      signatures: options((cls?.signatures[1] ?? []).map(get), d.signatureId),
      learning,
      dp: state.dp,
      purchases: (d.purchases[stage] ?? []).map((p, index) => {
        const recipeNames = [
          ...(p.recipeIds ?? []),
          ...(p.recipeId ? [p.recipeId] : []),
        ].map(name);
        return {
          ...p,
          index,
          name: name(p.id),
          recipeNames,
          legacyRecipePurchase: Boolean(p.recipeId),
          errors: preview.errors
            .filter(
              (e) =>
                e.code === "purchase" && e.stage === stage && e.index === index,
            )
            .flatMap((e) => e.reasons.map((r) => r.text))
            .join(" "),
        };
      }),
      acquisitions,
      equipment: inventory.equipment.map((r) => ({ ...r, source: source(r) })),
      shopping: (d.shopping ?? []).map((r, index) => ({
        ...r,
        index,
        name: name(r.id),
      })),
      inventory: preview.inventory,
      inventoryItems: preview.inventory.items.map((i) => ({
        ...i,
        name: name(i.catalogId),
      })),
      summary: preview.summary,
      languageSummary: (preview.summary?.languages ?? []).map((language) => ({
        ...language,
        permissions: [
          language.permissions.speak ? "speak" : "",
          language.permissions.sign ? "sign" : "",
          language.permissions.read ? "read" : "",
          language.permissions.write ? "write" : "",
        ]
          .filter(Boolean)
          .join(", "),
      })),
      valid: preview.valid && !languageBasisError,
      errors,
      ledger: preview.ledger.map((e) => ({
        ...e,
        source: e.sourceId ? name(e.sourceId) : "Pool",
      })),
      knownAbilities: preview.state.abilities.map(name),
      knownRecipes: preview.state.recipes.map(
        (id) => inventory.recipes.find((r) => r.id === id)?.name ?? id,
      ),
      revision: this.revision,
    };
  }
  capture() {
    const f = new FormData(this.element),
      d = this.draft;
    const checked = (name) => f.getAll(name).map(String);
    if (this.step === 0) {
      d.name = String(f.get("heroName") ?? "");
      for (const id of ATTRIBUTES)
        d.attributes[id] = Number(f.get(`attribute-${id}`));
    }
    if (this.step === 1) {
      d.ancestryId = String(f.get("ancestryId") ?? "");
      d.traitIds = checked("trait");
      d.rememberedCommunity = String(f.get("rememberedCommunity") ?? "");
      d.languages = {
        home: String(
          this.element.querySelector('[name="homeLanguage"]:checked')?.value ??
            "",
        ),
        extraSpoken: checked("extraLanguage"),
      };
    }
    if (this.step === 2)
      for (const kind of ["culture", "background"]) {
        const [id, pair] = String(f.get(kind) ?? "").split("|");
        d[kind] = { id, pair: Number(pair) };
      }
    if (this.step === 4) {
      d.classId = String(f.get("classId") ?? "");
      d.classDisciplines = checked("classDiscipline");
      d.signatureId = String(f.get("signatureId") ?? "");
    }
    if ([3, 5, 6].includes(this.step))
      for (const field of this.element.querySelectorAll("[data-acquisition]")) {
        const id = field.dataset.acquisition;
        d.acquisitions[id] ??= {};
        if (f.has(`weapon-${id}`))
          d.acquisitions[id].weapon = String(f.get(`weapon-${id}`));
        if (f.has(`hands-${id}`))
          d.acquisitions[id].meleeHands = Number(f.get(`hands-${id}`));
        if (field.querySelector("[data-recipes]"))
          d.acquisitions[id].recipes = checked(`recipes-${id}`);
      }
  }
  async persist() {
    const current = this.actor.getFlag("heroes-of-legend", FLAG);
    if ((current?.revision ?? 0) !== this.revision)
      throw new Error(
        "Another window changed this draft. Close and reopen to load that revision. Your current choices remain in this window.",
      );
    this.requireRenderedLanguageBasis();
    const revision = this.revision + 1;
    await updateOwnedDocument(this.actor, {
      [`flags.heroes-of-legend.${FLAG}`]: {
        schemaVersion: 1,
        sourceCommit: this.catalogs.commit,
        languageBasis: this.renderedLanguageBasis,
        revision,
        step: this.step,
        data: this.draft,
      },
    });
    this.revision = revision;
    this.savedLanguageBasis = this.renderedLanguageBasis;
  }
  requireRenderedLanguageBasis() {
    const current = getCampaignLanguageConfiguration();
    if (current.basis !== this.renderedLanguageBasis)
      throw new Error(
        "Campaign languages changed after this screen was displayed. Review the current language choices before saving or committing.",
      );
    return current;
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
      await this.render({ force: true }).catch(() => {});
    } finally {
      this.busy = false;
    }
  }
  static async bindAuthority() {
    try {
      await bindCreationAuthority();
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async commitCreation() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.requireRenderedLanguageBasis();
      await requestCreation(this.actor, this.revision);
      ui.notifications.info(
        "Creation submitted to the assigned GM window. The character sheet will update when it completes.",
      );
      await this.close();
      await this.actor.sheet.render({ force: true });
    } catch (error) {
      ui.notifications.error(error.message);
      await this.render({ force: true }).catch(() => {});
    } finally {
      this.busy = false;
    }
  }
  static async submit() {
    await this.act(async () => {});
  }
  static async saveDraft() {
    await this.act(async () => {});
  }
  static importCharacter() {
    if (this.busy || !this.actor.isOwner) return;
    if (this.actor.getFlag("heroes-of-legend", "creationReceipt")) {
      ui.notifications.warn("Import creation choices into a new character. This hero has already completed creation.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_CHARACTER_BYTES) throw new Error("Character file is too large.");
        const text = await file.text();
        if (this.actor.getFlag("heroes-of-legend", "creationReceipt"))
          throw new Error("This hero has already completed creation.");
        const languages = this.requireRenderedLanguageBasis();
        const { draft } = readPortableCharacter(text, this.catalogs, languages.definitions);
        if ((draft.progression?.level ?? 1) > 1)
          throw new Error("This file includes later-level advancement. Keep it in the web character library; this Foundry importer currently handles level-1 creation only.");
        await this.act(async () => { this.draft = draft; this.step = 7; });
        if (draft.loadout || draft.basicActions)
          ui.notifications.info("Creation choices imported. Equip items on the Foundry sheet; browser equipment arrangements and action visibility remain in the saved draft.");
      } catch (error) { ui.notifications.error(error.message); }
    }, { once: true });
    input.click();
  }
  static async navigate(event, target) {
    await this.act(async () => {
      this.step = Math.max(0, Math.min(7, Number(target.dataset.step)));
    });
  }
  static async addPurchase(event, target) {
    await this.act(async () => {
      const id = target.dataset.id,
        stage = this.step === 3 ? 0 : 1;
      const choice = this.catalogs.choices.find((r) => r.id === id);
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
      const preview = creationPreview(
        this.draft,
        this.catalogs.choices,
        this.catalogs.inventory,
        this.languageConfiguration.definitions,
      );
      const result = purchaseEligibility(
        choice,
        preview.stages[stage],
        this.catalogs.choices,
        choice.purchasePolicy === "new-recipe" ? { recipeIds } : {},
      );
      if (!result.eligible)
        throw new Error(result.reasons.map((r) => r.text).join(" "));
      this.draft.purchases[stage].push({
        id,
        ...(choice.purchasePolicy === "new-recipe" ? { recipeIds } : {}),
      });
    });
  }
  static async removePurchase(event, target) {
    await this.act(async () => {
      this.draft.purchases[this.step === 3 ? 0 : 1].splice(
        Number(target.dataset.index),
        1,
      );
    });
  }
  static async addEquipment(event, target) {
    await this.act(async () => {
      const id = target.dataset.id;
      const quantity = Number(
        this.element.querySelector(`[name="quantity-${id}"]`).value,
      );
      const hands = Number(
        this.element.querySelector(`[name="shop-hands-${id}"]`)?.value ?? 0,
      );
      this.draft.shopping.push({ id, quantity, hands });
    });
  }
  static async removeEquipment(event, target) {
    await this.act(async () => {
      this.draft.shopping.splice(Number(target.dataset.index), 1);
    });
  }
  async dropAbility(event) {
    if (this.busy) return;
    try {
      const choice = await resolveBuilderDrop(event, this.catalogs.choices);
      if (!this.actor.isOwner) throw new Error("Only a character owner can edit this draft.");
      if (this.busy || !this.rendered) return;
      if (![3, 5].includes(this.step)) throw new Error("Drop abilities on a learning step.");
      const stage = this.step === 3 ? 0 : 1;
      validateBuilderPurchase(this, choice, draft => creationPreview(draft,
        this.catalogs.choices, this.catalogs.inventory,
        this.languageConfiguration.definitions).stages[stage]);
      await CreationWizard.addPurchase.call(this, event, { dataset: { id: choice.id } });
    } catch (error) { ui.notifications.warn(error.message); }
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
    if (this.renderedStep !== this.step)
      this.element.querySelector(".hol-wizard-main").scrollTop = 0;
    this.renderedStep = this.step;
    for (const group of this.element.querySelectorAll("[data-recipe-study]"))
      group.addEventListener("change", () => this.syncRecipeStudySelects());
    this.syncRecipeStudySelects();
    bindBuilderDrop(this);
    this.element
      .querySelector("[data-search]")
      ?.addEventListener("input", (event) => {
        const query = event.target.value.toLocaleLowerCase();
        for (const row of this.element.querySelectorAll("[data-search-name]"))
          row.hidden = !row.dataset.searchName
            .toLocaleLowerCase()
            .includes(query);
      });
    for (const input of this.element.querySelectorAll(
      'label.hol-repair input[name="extraLanguage"]',
    ))
      input.addEventListener("change", () => {
        if (input.checked) return;
        input.disabled = true;
        input.closest("label")?.classList.add("hol-ineligible");
      });
  }
}
