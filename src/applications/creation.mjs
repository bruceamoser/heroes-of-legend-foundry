import {bindWizardHp,wizardGrit,wizardWounds,wizardDeath} from "./wizard-play.mjs";
import { workshopNavIcon } from "../sheets/workshop-icons.mjs";
import { bindLearningMarket } from "./learning-market.mjs";
import { equipmentEligibility, isUniversalAbility } from "../rules/equipment-eligibility.mjs";
import { additionalLanguageOptions } from "../rules/languages.mjs";
import {
  resolveBuilderDrop,
  validateBuilderPurchase,
  bindBuilderDrop,
  acquisitionWeaponName,
} from "../services/builder-drop.mjs";
import {
  bindCreationAuthority,
  requestCreation,
  waitForCreation,
} from "../services/creation.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { updateOwnedDocument } from "../services/documents.mjs";
import { newCreationDraft, creationPreview } from "../rules/creation.mjs";
import { workshopVitals } from "../rules/workshop-vitals.mjs";
import { workshopCharacter } from "../rules/workshop-character.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { campaignLanguageOptions } from "../rules/languages.mjs";
import { getCampaignLanguageConfiguration } from "../services/languages.mjs";
import { abilityReferenceStatus } from "../rules/ability-definitions.mjs";
import {
  readPortableCharacter,
  currentCreationDraft,
  MAX_CHARACTER_BYTES,
} from "../rules/portable-character.mjs";
import {
  eligibleFirst,
  purchaseEligibility,
  classEligibility,
  recipeStudyChoices,
} from "../rules/development.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const STEPS = [
  "Identity",
  "Ancestry",
  "Origins",
  "Early learning",
  "Class",
  "Heroic learning",
  "Equipment",
  "Review",
];
const FLAG = "creationDraft";
export class CreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["heroes-of-legend", "hol-creation"],
    position: { width: 940, height: 940 },
    window: { title: "Create a Hero", resizable: true },
    form: { closeOnSubmit: false, handler: CreationWizard.submit },
    actions: {
      wizardGrit,wizardWounds,wizardDeath,
      commitCreation: CreationWizard.commitCreation,
      bindAuthority: CreationWizard.bindAuthority,
      navigate: CreationWizard.navigate,
      saveDraft: CreationWizard.saveDraft,
      addPurchase: CreationWizard.addPurchase,
      removePurchase: CreationWizard.removePurchase,
      addEquipment: CreationWizard.addEquipment,
      removeEquipment: CreationWizard.removeEquipment,
      importCharacter: CreationWizard.importCharacter,
      referenceChoice: CreationWizard.referenceChoice,
      closeReference: CreationWizard.closeReference,
      chooseAncestry: CreationWizard.chooseAncestry,
      chooseClass: CreationWizard.chooseClass,
      chooseSignature: CreationWizard.chooseSignature,
      chooseImportedSignature: CreationWizard.chooseImportedSignature,
      removeImportedPurchase: CreationWizard.removeImportedPurchase,
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
    this.draft = currentCreationDraft(
      saved?.data ?? newCreationDraft(),
      saved?.sourceCommit,
    );
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
    const preview = workshopCharacter(d, this.catalogs, this.languageConfiguration.definitions),
      languageOptions = campaignLanguageOptions(
        this.languageConfiguration.definitions,
        d.languages,
      );
    this.preview = preview;
    let woundsCatalog;
    if (d.play?.wounds?.some(wound => wound.catalogId)) {
      const {woundCatalog} = await import("../services/wounds.mjs");
      woundsCatalog = await woundCatalog();
    }
    const vitals = workshopVitals(preview,d,woundsCatalog);
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
      r.source?.path ? `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${r.source.path}` : "";
    const stage = this.step === 3 ? 0 : 1,
      state = preview.stages[stage];
    const recipeStudy = recipeStudyChoices(state, inventory.recipes);
    const learning = eligibleFirst(
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
      disciplineIds: (r.choice.requirements ?? []).filter((q) => q.kind === "discipline").map((q) => q.id).join(" "),
      universal: isUniversalAbility(r.choice),
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
    this.languageDefinitions = getCampaignLanguageConfiguration().definitions;
    const acquisitions = preview.state.abilities
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
        name: name(a.id),
        weaponOptions: a.weaponChoice?.map((id) => ({
          id,
          name: acquisitionWeaponName(id, inventory),
          selected: d.acquisitions?.[a.id]?.weapon === id,
        })),
        needsHands:
          a.items.includes("item-ordinary-melee-weapon") ||
          (a.weaponChoice?.includes("melee") && d.acquisitions?.[a.id]?.weapon === "melee"),
        handOptions: [1, 2].map((value) => ({
          value,
          selected: d.acquisitions?.[a.id]?.meleeHands === value,
        })),
        languageChoice: a.languageChoice,
        languageOptions: additionalLanguageOptions(
          this.languageDefinitions,
          preview.state.languages ?? [],
          d.acquisitions?.[a.id]?.languageId,
          a.id,
        ),
        specialtyChoice: a.specialtyChoice,
        specialty: d.acquisitions?.[a.id]?.specialty ?? "",
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
      vitals,
      speedReduced: vitals.speed < vitals.maxSpeed,
      armorDr: preview.resistances?.physical ?? 0,
      characterLevel: preview.state.level,
      identityLine: [name(d.ancestryId),name(d.culture?.id),name(d.background?.id),name(d.classId)].filter(Boolean).join(" · "),
      showContext: [3,5,6].includes(this.step),
      step: this.step,
      stepNumber: this.step + 1,
      stage,
      steps: STEPS.map((name, index) => ({
        name,
        index,
        active: index === this.step,
        icon: workshopNavIcon(["Character", "Ancestry", "Origins", "Abilities", "Class", "Heroic", "Inventory", "Review"][index]),
      })),
      title: ["Identity & attributes","Ancestry & languages","Culture & background","Early learning","Class","Heroic learning","Equipment","Review"][this.step],
      identity: this.step === 0,
      ancestry: this.step === 1,
      origins: this.step === 2,
      learningStep: [3, 5].includes(this.step),
      classStep: this.step === 4,
      classSelected: Boolean(cls),
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
        signedValue: d.attributes[id] > 0 ? `+${d.attributes[id]}` : d.attributes[id],
      })),
      attributeTotal: Object.values(d.attributes).reduce((a, b) => a + b, 0),
      signedAttributeTotal: `${Object.values(d.attributes).reduce((a,b)=>a+b,0) >= 0 ? "+" : ""}${Object.values(d.attributes).reduce((a,b)=>a+b,0)}`,
      ancestries: options(
        choices.filter((r) => r.kind === "ancestry"),
        d.ancestryId,
      ),
      traits: options([...new Set([...(get(d.ancestryId)?.traits ?? []), ...d.traitIds])].map(get).filter(Boolean),d.traitIds).map(trait=>({...trait,stale:!get(d.ancestryId)?.traits.includes(trait.id)})),
      languages: languageOptions.home,
      extraLanguages: languageOptions.extraSpoken,
      languageBasis: this.languageConfiguration.basis,
      languageBasisError,
      ageOfMemory: d.traitIds.includes("trait-elf-age-of-memory"),
      manyHomes: d.traitIds.includes("trait-human-many-homes"),
      originCards: ["culture","background"].map(kind=>{
        const origin=get(d[kind]?.id),pair=origin?.pairs?.[d[kind]?.pair];
        return {kind,label:kind[0].toUpperCase()+kind.slice(1),id:origin?.id,name:origin?.name,disciplineId:pair?.disciplineId,discipline:name(pair?.disciplineId),abilityId:pair?.abilityId,ability:name(pair?.abilityId),mark:pair?`systems/heroes-of-legend/assets/marks/${pair.disciplineId.replace(/^discipline-/,"")}.webp`:null,
          options:choices.filter(record=>record.originType===kind).flatMap(record=>record.pairs.map((pair,index)=>({value:`${record.id}|${index}`,label:`${record.name} — ${name(pair.disciplineId)} 1 + ${name(pair.abilityId)}`,selected:d[kind]?.id===record.id && d[kind]?.pair===index})))};
      }),
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
        [...new Set([...(cls?.startingDisciplines ?? []), ...d.classDisciplines])].map(id => get(id) ?? {id,name:id}),
        d.classDisciplines,
      ).map((r) => ({...r, stale: !cls?.startingDisciplines.includes(r.id), disabled: !r.selected && (preview.stages[0]?.ranks?.[r.id] ?? 0) > 0})),
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
      importedRepairs: preview.errors.filter(error=>error.level>1).map(error=>{
        const level=error.level, saved=d.progression?.levels?.[level]?.acquisitions?.[error.id]??{}, acquisition=acquisitions.find(a=>a.id===error.id);
        return {...error, signatureTier:error.signatureTier??level, name:name(error.id), signature:error.code==="signature", purchase:error.code==="purchase", signatureOptions:error.code==="signature"?(get(d.classId)?.signatures[error.signatureTier??level]??[]).map(id=>({id,name:name(id),flavor:get(id)?.reference?.flavor?.[0]??""})):[], acquisition:acquisition?{...acquisition,level,needsHands:inventory.acquisitions.find(a=>a.id===error.id)?.items.includes("item-ordinary-melee-weapon") || saved.weapon==="melee",weaponOptions:acquisition.weaponOptions?.map(option=>({...option,selected:saved.weapon===option.id})),handOptions:[1,2].map(value=>({value,selected:saved.meleeHands===value})),languageOptions:additionalLanguageOptions(this.languageDefinitions,preview.state.languages??[],saved.languageId,error.id),specialty:saved.specialty??"",recipes:acquisition.recipes.map(recipe=>({...recipe,selected:saved.recipes?.includes(recipe.id)}))}:null};
      }),
      acquisitions,
      requiredChoices: acquisitions.filter((a) => preview.errors.some((e) => e.code === "acquisition" && e.id === a.id)),
      currentBuild: state.abilities.map(id=>{
        const index=(d.purchases[stage]??[]).findIndex(p=>p.id===id),locked=stage===1 && preview.stages[0].abilities.includes(id);
        let grantSource=locked?"Early learning":index>=0?"Learned":"Granted";
        for (const kind of ["culture","background"]) if(get(d[kind]?.id)?.pairs?.[d[kind]?.pair]?.abilityId === id)grantSource=name(d[kind].id);
        if(id === d.signatureId)grantSource=name(d.classId);
        return {id,name:name(id),grantSource,locked,index,removable:index>=0,acquisition:acquisitions.find(a=>a.id===id && preview.errors.some(error=>error.code === "acquisition" && error.id===id))};
      }),
      disciplineFilters: choices.filter((r) => r.kind === "discipline"),
      disciplinePurchases: (d.purchases[stage] ?? []).map((p, index) => ({...p,index,name: name(p.id),rank:state.ranks[p.id]})).filter((p) => get(p.id)?.kind === "discipline"),
      knownRanks: Object.entries(state.ranks ?? {}).map(([id, rank]) => ({name: name(id), rank,mark:`systems/heroes-of-legend/assets/marks/${id.replace(/^discipline-/,"")}.webp`})),
      showDisciplineMarket: stage > 0,
      equipment: inventory.equipment.map((r) => ({ ...r, source: source(r), ...equipmentEligibility(r.id, state.abilities) })),
      shopping: (d.shopping ?? []).map((r, index) => ({
        ...r,
        index,
        name: name(r.id),
      })),
      inventory: preview.inventory,
      creationInventoryItems: preview.creation.inventory.items.map(item=>{
        const definition=inventory.equipment.find(record=>record.id === item.catalogId);
        let purchaseIndex=(d.shopping ?? []).findIndex(purchase=>purchase.instanceId===item.instanceId);
        if(purchaseIndex<0 && item.source === "coins" && /^purchase:\d+$/.test(item.instanceId)) purchaseIndex=Number(item.instanceId.split(":")[1]);
        return {...item,name:name(item.catalogId),bulk:(definition?.bulk ?? 0)*item.quantity,supply:item.inventoryDie ?? definition?.inventoryDie,grantSource:item.source === "creation" ? "Starting outfit" : item.source === "coins" ? "Purchased" : name(item.source),purchaseIndex,removable:purchaseIndex>=0};
      }),
      creationInventory: preview.creation.inventory,
      creationEncumbrance: Math.max(0,preview.creation.inventory.bulk - (preview.summary?.capacity ?? 0)),
      characterAncestry: name(d.ancestryId),
      characterClass: name(d.classId),
      abilityCount: preview.state.abilities.length,
      inventoryItems: preview.inventory.items.map((i) => ({
        ...i,
        name: name(i.catalogId),
      })),
      summary: preview.summary,
      languageSummary: (preview.play?.languages ?? preview.summary?.languages ?? []).map((language) => ({
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
    for(const fieldset of this.element.querySelectorAll("[data-import-acquisition]")) {
      const {level,importAcquisition:id}=fieldset.dataset;
      const levelDraft=this.draft.progression.levels[level];
      const saved=(levelDraft.acquisitions??={})[id]??={};
      for(const field of fieldset.querySelectorAll("[data-import-field]")) {
        const key=field.dataset.importField;
        if(key==="recipes") saved.recipes=[...fieldset.querySelectorAll('[data-import-field="recipes"]:checked')].map(input=>input.value);
        else saved[key]=key==="meleeHands"?Number(field.value):field.value;
      }
    }

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
        home: String(f.get("homeLanguage") ?? ""),
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
        for (const key of ["languageId", "specialty"])
          if (f.has(`${key}-${id}`))
            d.acquisitions[id][key] = String(f.get(`${key}-${id}`));
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
    const changes = {
      [`flags.heroes-of-legend.${FLAG}`]: {
        schemaVersion: 1,
        sourceCommit: this.catalogs.commit,
        languageBasis: this.renderedLanguageBasis,
        revision,
        step: this.step,
        data: this.draft,
      },
    };
    // Foundry merges nested flags; an omitted historical marker needs explicit deletion.
    for (const kind of ["culture", "background"])
      if (current?.data?.[kind]?.retainedFrom)
        changes[`flags.heroes-of-legend.${FLAG}.data.${kind}.-=retainedFrom`] =
          null;
    await updateOwnedDocument(this.actor, changes);
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
      await this.render({ force: true }).catch(() => {});
    } finally {
      this.busy = false;
      const next = this.pendingActions?.shift();
      if (next) void this.act(next.fn).finally(next.resolve);
      else for (const resolve of this.idleWaiters?.splice(0) ?? []) resolve();
    }
  }
  static async chooseAncestry(event,target) {
    await this.act(async()=>{if (!this.catalogs.choices.some(record=>record.kind === "ancestry" && record.id === target.dataset.id)) throw new Error("Choose a current ancestry.");this.draft.ancestryId = target.dataset.id;});
  }
  static async chooseClass(event,target) {
    await this.act(async()=>{const record = this.catalogs.choices.find(record=>record.kind === "class" && record.id === target.dataset.id);const eligibility = classEligibility(record,this.draft.attributes);if (!eligibility.eligible) throw new Error(eligibility.reasons.map(reason=>reason.text).join(" "));this.draft.classId = record.id;});
  }
  static async chooseImportedSignature(event,target) {
    await this.act(async()=>{
      const level=Number(target.dataset.level);
      const draft=(this.draft.progression.levels[level]??={purchases:[],signatures:{},acquisitions:{}});
      (draft.signatures??={})[Number(target.dataset.tier??level)]=target.dataset.id;
    });
  }
  static async removeImportedPurchase(event,target) {
    await this.act(async()=>{this.draft.progression.levels[target.dataset.level].purchases.splice(Number(target.dataset.index),1);});
  }
  static async chooseSignature(event,target) {
    await this.act(async()=>{const cls = this.catalogs.choices.find(record=>record.id === this.draft.classId);if (!cls?.signatures?.[1]?.includes(target.dataset.id)) throw new Error("Choose this class’s level-1 signature.");this.draft.signatureId = target.dataset.id;});
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
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async commitCreation() {
    if (this.committing) return;
    if (this.busy) await new Promise(resolve => {this.idleWaiters ??= [];this.idleWaiters.push(resolve);});
    if (this.committing) return;
    this.committing = true;
    this.busy = true;
    if(this.element){this.element.inert=true;this.element.setAttribute("aria-busy","true");}
    try {
      const existing = this.actor.getFlag("heroes-of-legend", "creationReceipt");
      if (existing) {
        if (existing.status !== "complete") await waitForCreation(this.actor, existing.requestId, existing.revision);
        await this.close();
        await this.actor.sheet.render({ force: true });
        return;
      }
      this.capture();
      this.requireRenderedLanguageBasis();
      const preview = workshopCharacter(this.draft, this.catalogs, this.languageConfiguration.definitions);
      if (!preview.valid) {
        this.step = 7;
        throw new Error("Resolve the choices listed on Review before saving this character.");
      }
      await this.persist();
      const request = await requestCreation(this.actor, this.revision);
      await waitForCreation(this.actor, request.id, this.revision);
      ui.notifications.info("Character saved.");
      await this.close();
      await this.actor.sheet.render({ force: true });
    } catch (error) {
      ui.notifications.error(error.message);
      await this.render({ force: true }).catch(() => {});
    } finally {
      this.committing = false;
      if(this.element){this.element.inert=false;this.element.removeAttribute("aria-busy");}
      this.busy = false;
      for (const resolve of this.idleWaiters?.splice(0) ?? []) resolve();
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
      ui.notifications.warn(
        "Import creation choices into a new character. This hero has already completed creation.",
      );
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > MAX_CHARACTER_BYTES)
            throw new Error("Character file is too large.");
          const text = await file.text();
          if (this.actor.getFlag("heroes-of-legend", "creationReceipt"))
            throw new Error("This hero has already completed creation.");
          const languages = this.requireRenderedLanguageBasis();
          const { draft } = readPortableCharacter(
            text,
            this.catalogs,
            languages.definitions,
          );
          await this.act(async () => {
            this.draft = draft;
            this.step = 7;
          });
          if (draft.loadout || draft.basicActions || draft.play)
            ui.notifications.info(
              "Character choices and play state imported. Review the preview, then save the character to apply them to this new Foundry hero.",
            );
        } catch (error) {
          ui.notifications.error(error.message);
        }
      },
      { once: true },
    );
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
      const choice = this.catalogs.inventory.equipment.find((r) => r.id === id);
      const preview = creationPreview(this.draft, this.catalogs.choices, this.catalogs.inventory, this.languageConfiguration.definitions);
      const eligibility = equipmentEligibility(id, preview.state.abilities);
      if (!eligibility.eligible) throw new Error(`Requires ${eligibility.requiredAbilityId}.`);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Choose a positive whole quantity.");
      if (choice.price * quantity > preview.inventory.remainingCoins) {
        const approved = await foundry.applications.api.DialogV2.confirm({classes: ["heroes-of-legend", "hol-native-dialog"], window: {title: "Spend beyond available coins?"}, content: `<p>This purchase costs ${choice.price * quantity} coins; ${preview.inventory.remainingCoins} remain.</p>`});
        if (!approved) return;
        this.draft.coinOverride = true;
      }
      this.draft.shopping.push({ id, quantity, hands, instanceId:`shop-${crypto.randomUUID()}` });
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
      if (!this.actor.isOwner)
        throw new Error("Only a character owner can edit this draft.");
      if (this.busy || !this.rendered) return;
      if (![3, 5].includes(this.step))
        throw new Error("Drop abilities on a learning step.");
      const stage = this.step === 3 ? 0 : 1;
      validateBuilderPurchase(
        this,
        choice,
        (draft) =>
          creationPreview(
            draft,
            this.catalogs.choices,
            this.catalogs.inventory,
            this.languageConfiguration.definitions,
          ).stages[stage],
      );
      await CreationWizard.addPurchase.call(this, event, {
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
    if (this.renderedStep !== this.step)
      this.element.querySelector(".hol-wizard-main").scrollTop = 0;
    this.renderedStep = this.step;
    for (const group of this.element.querySelectorAll("[data-recipe-study]"))
      group.addEventListener("change", () => this.syncRecipeStudySelects());
    this.syncRecipeStudySelects();
    bindBuilderDrop(this);
    // Workshop controls refresh dependent choices immediately. Serialize each
    // change through the same capture/persist path as navigation and purchases.
    for (const input of this.element.querySelectorAll(".hol-wizard-main input:not([data-search]), .hol-wizard-main select:not([data-market-filter])")) {
      if (input.closest("dialog")) continue;
      input.addEventListener("change", () => this.act(async () => {}));
    }

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
