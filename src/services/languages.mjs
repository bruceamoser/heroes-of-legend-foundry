import {
  LANGUAGE_SETTING_KEY,
  languageConfigurationBasis,
  languageValidationMessage,
  requireLanguageConfiguration,
  validateLanguageConfiguration,
} from "../rules/languages.mjs";

const ID = "heroes-of-legend";

export function getCampaignLanguageConfiguration() {
  const raw = game.settings.get(ID, LANGUAGE_SETTING_KEY),
    result = validateLanguageConfiguration(raw);
  if (!result.valid)
    throw new Error(
      `Campaign language configuration is invalid. ${languageValidationMessage(result.errors)} Review the campaign language definitions with a GM in Configure Settings → Campaign languages.`,
    );
  return {
    ...result.configuration,
    basis: languageConfigurationBasis(result.configuration),
  };
}

/** World settings are GM-owned even before Foundry's permission check. */
export async function writeCampaignLanguages(value) {
  if (!game.user.isGM)
    throw new Error("Only a GM can change campaign languages.");
  const configuration = requireLanguageConfiguration(value);
  await game.settings.set(ID, LANGUAGE_SETTING_KEY, configuration);
  return {
    ...configuration,
    basis: languageConfigurationBasis(configuration),
  };
}
