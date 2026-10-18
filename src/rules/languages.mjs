/** Pure campaign-language configuration, validation and character-creation choices. */
export const LANGUAGE_CONFIGURATION_SCHEMA = 1;
export const LANGUAGE_SETTING_KEY = "campaignLanguages";
export const COMMON_LANGUAGE_ID = "common";

const LANGUAGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_FORMS = new Set(["spoken", "signed"]);

/** The ordinary and uncommon choices supplied by the shared language source. */
export const DEFAULT_LANGUAGES = Object.freeze(
  [
    ["common", "Common", true, "spoken", true],
    ["dwarven", "Dwarven", true, "spoken", true],
    ["elven", "Elven", true, "spoken", true],
    ["halfling", "Halfling", true, "spoken", true],
    ["goblin", "Goblin", true, "spoken", true],
    ["orc", "Orc", true, "spoken", true],
    ["giant", "Giant", true, "spoken", true],
    ["kobold", "Kobold", true, "spoken", true],
    ["harbor-cant", "Harbor Cant", true, "spoken", true],
    ["way-sign", "Way Sign", true, "signed", false],
    ["draconic", "Draconic", false, "spoken", true],
    ["fey", "Fey", false, "spoken", true],
    ["infernal", "Infernal", false, "spoken", true],
    ["celestial", "Celestial", false, "spoken", true],
    ["elemental", "Elemental", false, "spoken", true],
  ].map(([id, name, ordinary, form, writing]) =>
    Object.freeze({ id, name, ordinary, form, writing }),
  ),
);

export function createDefaultLanguageConfiguration() {
  return {
    schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
    definitions: DEFAULT_LANGUAGES.map((definition) => ({ ...definition })),
  };
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validationError(errors, code, path, text) {
  errors.push({ code, path, text });
}

/**
 * Validate and normalize a complete world language configuration.
 * Invalid values are never replaced with source defaults.
 */
export function validateLanguageConfiguration(value) {
  const errors = [],
    definitions = [];
  if (!plainObject(value))
    validationError(
      errors,
      "configuration-type",
      "",
      "Campaign language configuration must be an object.",
    );
  else {
    if (value.schemaVersion !== LANGUAGE_CONFIGURATION_SCHEMA)
      validationError(
        errors,
        "schema-version",
        "schemaVersion",
        `Campaign language schemaVersion must be ${LANGUAGE_CONFIGURATION_SCHEMA}.`,
      );
    if (!Array.isArray(value.definitions))
      validationError(
        errors,
        "definitions-type",
        "definitions",
        "Campaign language definitions must be an array.",
      );
    else {
      const ids = new Map(),
        names = new Map();
      value.definitions.forEach((entry, index) => {
        const path = `languages[${index}]`;
        if (!plainObject(entry)) {
          validationError(
            errors,
            "entry-type",
            path,
            `Language ${index + 1} must be an object.`,
          );
          return;
        }
        if (
          typeof entry.id !== "string" ||
          entry.id.length > 64 ||
          !LANGUAGE_ID.test(entry.id)
        )
          validationError(
            errors,
            "language-id",
            `${path}.id`,
            `Language ${index + 1} needs a stable lowercase ID using letters, numbers and single hyphens.`,
          );
        else if (ids.has(entry.id))
          validationError(
            errors,
            "duplicate-language-id",
            `${path}.id`,
            `Language ID “${entry.id}” is used more than once.`,
          );
        else ids.set(entry.id, index);

        if (
          typeof entry.name !== "string" ||
          !entry.name.trim() ||
          entry.name.trim().length > 80
        )
          validationError(
            errors,
            "language-name",
            `${path}.name`,
            `Language ${index + 1} needs a name of 1–80 characters.`,
          );
        else {
          const name = entry.name.trim(),
            key = name.toLocaleLowerCase();
          if (names.has(key))
            validationError(
              errors,
              "duplicate-language-name",
              `${path}.name`,
              `Language name “${name}” is used more than once.`,
            );
          else names.set(key, index);
        }
        if (typeof entry.ordinary !== "boolean")
          validationError(
            errors,
            "language-availability",
            `${path}.ordinary`,
            `Language ${index + 1} must say whether it is ordinary.`,
          );
        if (!LANGUAGE_FORMS.has(entry.form))
          validationError(
            errors,
            "language-form",
            `${path}.form`,
            `Language ${index + 1} must be spoken or signed.`,
          );
        if (typeof entry.writing !== "boolean")
          validationError(
            errors,
            "language-writing",
            `${path}.writing`,
            `Language ${index + 1} must say whether grants include writing.`,
          );
        if (
          typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          typeof entry.ordinary === "boolean" &&
          LANGUAGE_FORMS.has(entry.form) &&
          typeof entry.writing === "boolean"
        )
          definitions.push({
            id: entry.id,
            name: entry.name.trim(),
            ordinary: entry.ordinary,
            form: entry.form,
            writing: entry.writing,
          });
      });
    }
  }

  const common = Array.isArray(value?.definitions)
    ? value.definitions.find((entry) => entry?.id === COMMON_LANGUAGE_ID)
    : null;
  if (!common)
    validationError(
      errors,
      "common-required",
      "languages",
      "The stable Common language ID “common” is required.",
    );
  else if (common.ordinary !== true)
    validationError(
      errors,
      "common-ordinary",
      "languages",
      "Common must remain an ordinary language.",
    );
  return {
    valid: errors.length === 0,
    errors,
    definitions,
    configuration: errors.length
      ? null
      : {
          schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
          definitions,
        },
  };
}

export function languageValidationMessage(errors) {
  return errors.map((error) => error.text).join(" ");
}

export function requireLanguageConfiguration(value) {
  const result = validateLanguageConfiguration(value);
  if (!result.valid)
    throw new Error(
      `Campaign language configuration is invalid. ${languageValidationMessage(result.errors)} Review the campaign language definitions.`,
    );
  return result.configuration;
}

/** Stable basis for the exact normalized definitions used to preview a draft. */
export function languageConfigurationBasis(value) {
  const configuration = Array.isArray(value)
    ? requireLanguageConfiguration({
        schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
        definitions: value,
      })
    : requireLanguageConfiguration(value);
  return `heroes-of-legend-languages-v${LANGUAGE_CONFIGURATION_SCHEMA}:${JSON.stringify(configuration.definitions)}`;
}

/** Preserve malformed editor values for explicit repair, without adopting defaults. */
export function editorLanguageDefinitions(value) {
  if (!plainObject(value) || !Array.isArray(value.definitions)) return [];
  return value.definitions.map((entry) => ({
    id:
      typeof entry?.id === "string"
        ? entry.id
        : entry?.id == null
          ? ""
          : String(entry.id),
    name:
      typeof entry?.name === "string"
        ? entry.name
        : entry?.name == null
          ? ""
          : String(entry.name),
    ordinary: entry?.ordinary === true,
    form: typeof entry?.form === "string" ? entry.form : "",
    writing: entry?.writing === true,
    ordinaryInvalid: typeof entry?.ordinary !== "boolean",
    writingInvalid: typeof entry?.writing !== "boolean",
    formInvalid: !LANGUAGE_FORMS.has(entry?.form),
  }));
}

function orderedChoices(rows) {
  return rows
    .map((row, index) => ({ ...row, order: index }))
    .sort(
      (a, b) => Number(b.eligible) - Number(a.eligible) || a.order - b.order,
    )
    .map(({ order, ...row }) => row);
}

function displayForm(definition) {
  return `${definition.form === "signed" ? "Signed" : "Spoken"} · ${
    definition.writing ? "writing" : "no writing"
  }`;
}

/** All defined choices plus any removed saved IDs, ordered eligible first. */
export function campaignLanguageOptions(
  definitions,
  { home = "", extraSpoken = [] } = {},
) {
  const entries = requireLanguageConfiguration({
      schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
      definitions,
    }).definitions,
    byId = new Map(entries.map((entry) => [entry.id, entry])),
    extras = Array.isArray(extraSpoken) ? extraSpoken.map(String) : [],
    homeChoices = entries.map((definition) => {
      const selected = definition.id === home,
        reasons = [];
      if (definition.id === COMMON_LANGUAGE_ID)
        reasons.push(`${definition.name} is already granted as Common.`);
      else if (!definition.ordinary)
        reasons.push(
          `${definition.name} is uncommon and cannot be an ordinary home language in this campaign.`,
        );
      if (extras.includes(definition.id))
        reasons.push(
          `${definition.name} is already selected as an extra language.`,
        );
      const eligible = reasons.length === 0;
      return {
        ...definition,
        selected,
        eligible,
        disabled: !eligible,
        repair: selected && !eligible,
        summary: displayForm(definition),
        reasons,
        reason: reasons.join(" "),
      };
    });
  if (home && !byId.has(home))
    homeChoices.push({
      id: home,
      name: `${home} (no longer defined)`,
      ordinary: false,
      form: "",
      writing: false,
      selected: true,
      eligible: false,
      disabled: true,
      repair: true,
      summary: "Saved choice",
      reasons: [
        `This saved home language is no longer defined in Campaign Languages. Choose another language or have the DA restore “${home}”.`,
      ],
      reason: `This saved home language is no longer defined in Campaign Languages. Choose another language or have the DA restore “${home}”.`,
    });

  const extraChoices = entries.map((definition) => {
    const selected = extras.includes(definition.id),
      reasons = [];
    if (definition.id === COMMON_LANGUAGE_ID)
      reasons.push(`${definition.name} is already granted as Common.`);
    else if (!definition.ordinary)
      reasons.push(
        `${definition.name} is uncommon and unavailable to this ordinary-language grant in this campaign.`,
      );
    else if (definition.form !== "spoken")
      reasons.push(
        `${definition.name} is signed and cannot satisfy a spoken-only grant.`,
      );
    if (definition.id === home)
      reasons.push(
        `${definition.name} is already selected as your home language.`,
      );
    const eligible = reasons.length === 0;
    return {
      ...definition,
      selected,
      eligible,
      disabled: !eligible && !selected,
      repair: selected && !eligible,
      summary: displayForm(definition),
      reasons,
      reason: reasons.join(" "),
    };
  });
  for (const id of new Set(extras))
    if (!byId.has(id))
      extraChoices.push({
        id,
        name: `${id} (no longer defined)`,
        ordinary: false,
        form: "",
        writing: false,
        selected: true,
        eligible: false,
        disabled: false,
        repair: true,
        summary: "Saved choice",
        reasons: [
          `This saved extra language is no longer defined in Campaign Languages. Uncheck it or have the DA restore “${id}”.`,
        ],
        reason: `This saved extra language is no longer defined in Campaign Languages. Uncheck it or have the DA restore “${id}”.`,
      });

  return {
    home: orderedChoices(homeChoices),
    extraSpoken: orderedChoices(extraChoices),
  };
}

/** Ordinary acquisition choices retain blocked and removed saved entries for repair. */
export function additionalLanguageOptions(
  definitions,
  knownLanguages = [],
  selectedId = "",
  sourceId,
) {
  const entries = requireLanguageConfiguration({
    schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
    definitions,
  }).definitions;
  const rows = entries.map((definition) => {
    const reasons = [];
    if (!definition.ordinary)
      reasons.push(
        `${definition.name} is uncommon and unavailable to this ordinary-language grant.`,
      );
    if (
      knownLanguages.some(
        (known) =>
          known.id === definition.id &&
          !(sourceId && known.source === sourceId),
      )
    )
      reasons.push(`${definition.name} is already known.`);
    return {
      ...definition,
      selected: definition.id === selectedId,
      eligible: reasons.length === 0,
      disabled: reasons.length > 0,
      repair: definition.id === selectedId && reasons.length > 0,
      summary: displayForm(definition),
      reasons,
      reason: reasons.join(" "),
    };
  });
  if (selectedId && !entries.some((entry) => entry.id === selectedId)) {
    const reason = `This saved language is no longer defined in Campaign Languages. Choose another language or have the DA restore “${selectedId}”.`;
    rows.push({
      id: selectedId,
      name: `${selectedId} (no longer defined)`,
      selected: true,
      eligible: false,
      disabled: true,
      repair: true,
      reasons: [reason],
      reason,
      summary: "Saved choice",
    });
  }
  return orderedChoices(rows);
}
