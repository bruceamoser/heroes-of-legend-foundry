import {
  DEFAULT_LANGUAGES,
  LANGUAGE_CONFIGURATION_SCHEMA,
  LANGUAGE_SETTING_KEY,
  createDefaultLanguageConfiguration,
  editorLanguageDefinitions,
  languageValidationMessage,
  validateLanguageConfiguration,
} from "../rules/languages.mjs";
import { writeCampaignLanguages } from "../services/languages.mjs";

const ID = "heroes-of-legend";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CampaignLanguageSettings extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["heroes-of-legend", "hol-language-settings"],
    position: { width: 960, height: 760 },
    window: {
      title: "Campaign languages",
      resizable: true,
    },
    form: {
      closeOnSubmit: false,
      handler: CampaignLanguageSettings.saveLanguages,
    },
    actions: {
      addLanguage: CampaignLanguageSettings.addLanguage,
      removeLanguage: CampaignLanguageSettings.removeLanguage,
      restoreDefaults: CampaignLanguageSettings.restoreDefaults,
      saveLanguages: CampaignLanguageSettings.saveLanguages,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/languages.hbs",
      scrollable: [".hol-language-body"],
    },
  };
  constructor(options = {}) {
    super(options);
    this.rows = null;
    this.feedback = [];
    this.notice = "";
  }
  async _prepareContext() {
    if (!game.user.isGM) throw new Error("GM access required.");
    if (!this.rows) {
      const saved = game.settings.get(ID, LANGUAGE_SETTING_KEY),
        savedResult = validateLanguageConfiguration(saved);
      this.rows = editorLanguageDefinitions(saved);
      if (!savedResult.valid)
        this.feedback = [languageValidationMessage(savedResult.errors)];
    }
    const result = validateLanguageConfiguration({
      schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
      definitions: this.rows,
    });
    const rowErrors = (index) =>
      result.errors
        .filter((error) => error.path.startsWith(`languages[${index}]`))
        .map((error) => error.text);
    const generalErrors = result.errors
      .filter((error) => !error.path.startsWith("languages["))
      .map((error) => error.text);
    return {
      languages: this.rows.map((row, index) => ({
        ...row,
        index,
        isCommon: row.id === "common",
        spoken: row.form === "spoken",
        signed: row.form === "signed",
        ordinaryInvalid: row.ordinaryInvalid ?? false,
        writingInvalid: row.writingInvalid ?? false,
        formInvalid: row.formInvalid ?? false,
        errors: rowErrors(index),
      })),
      errors: [...new Set([...this.feedback, ...generalErrors])],
      notice: this.notice,
      valid: result.valid,
      sourceUrl:
        "https://github.com/bruceamoser/heroes-of-legend/blob/64089a1c8961d7faff172f179448a8b6e57827ef/design/rules/languages.md",
    };
  }
  readForm() {
    this.rows = Array.from(
      this.element.querySelectorAll("[data-language-row]"),
      (row) => ({
        id: String(row.querySelector("[name=languageId]")?.value ?? ""),
        name: String(row.querySelector("[name=languageName]")?.value ?? ""),
        ordinary: Boolean(
          row.querySelector("[name=languageOrdinary]")?.checked,
        ),
        form: String(row.querySelector("[name=languageForm]")?.value ?? ""),
        writing: Boolean(row.querySelector("[name=languageWriting]")?.checked),
      }),
    );
  }
  async renderResult(message) {
    this.notice = message;
    await this.render();
  }
  static async addLanguage() {
    this.readForm();
    this.rows.push({
      id: "",
      name: "",
      ordinary: false,
      form: "spoken",
      writing: true,
    });
    this.notice = "";
    await this.render();
  }
  static async removeLanguage(event, target) {
    this.readForm();
    this.rows.splice(Number(target.dataset.index), 1);
    this.notice = "";
    await this.render();
  }
  static async restoreDefaults() {
    this.rows = DEFAULT_LANGUAGES.map((definition) => ({ ...definition }));
    this.feedback = [];
    this.notice =
      "Source defaults loaded into this editor. Review them, then save to apply.";
    await this.render();
  }
  static async saveLanguages() {
    try {
      this.readForm();
      const result = validateLanguageConfiguration({
        schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
        definitions: this.rows,
      });
      if (!result.valid) {
        this.feedback = [languageValidationMessage(result.errors)];
        this.notice = "";
        await this.render();
        return;
      }
      await writeCampaignLanguages(result.configuration);
      this.feedback = [];
      await this.renderResult(
        "Campaign languages saved. New and saved drafts will require a fresh review before commitment.",
      );
    } catch (error) {
      this.feedback = [error.message];
      this.notice = "";
      await this.render();
    }
  }
}

export function registerLanguageSettings() {
  game.settings.register(ID, LANGUAGE_SETTING_KEY, {
    name: "Campaign languages",
    hint: "Named ordinary and uncommon languages available to the native charactermancer.",
    scope: "world",
    config: false,
    type: Object,
    default: createDefaultLanguageConfiguration(),
  });
  game.settings.registerMenu(ID, "campaignLanguageSettings", {
    name: "Campaign languages",
    label: "Configure languages",
    hint: "Define stable IDs, names, availability, form and writing for this world.",
    icon: "fa-solid fa-language",
    type: CampaignLanguageSettings,
    restricted: true,
  });
}
