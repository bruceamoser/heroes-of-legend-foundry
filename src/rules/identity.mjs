import { forgeCreationLedger } from "./forge-character.mjs";
import { forgeMaximums } from "./forge-vitals.mjs";
import { creationLedger } from "./development.mjs";
import { ancestryBenefits, ancestrySelection, currentAncestryId } from "./ancestry.mjs";
import {
  DEFAULT_LANGUAGES,
  LANGUAGE_CONFIGURATION_SCHEMA,
  requireLanguageConfiguration,
} from "./languages.mjs";
export { DEFAULT_LANGUAGES } from "./languages.mjs";
export function languageGrants(
  { home, extraSpoken = [], ancestry },
  traits,
  definitions = DEFAULT_LANGUAGES,
) {
  const errors = [],
    languages = [];
  const byId = new Map();
  for (const d of requireLanguageConfiguration({
    schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
    definitions,
  }).definitions)
    byId.set(d.id, d);
  const add = (id, source, spokenOnly = false) => {
    const d = byId.get(id);
    if (!d || !d.ordinary) {
      errors.push({
        code: "language-availability",
        id,
        text: "Choose a named ordinary language approved for this campaign.",
      });
      return;
    }
    if (languages.some((l) => l.id === id)) {
      errors.push({
        code: "duplicate-language",
        id,
        text: "Choose a distinct language you do not already know.",
      });
      return;
    }
    if (spokenOnly && d.form !== "spoken") {
      errors.push({
        code: "spoken-language",
        id,
        text: "This grant requires an ordinary spoken language.",
      });
      return;
    }
    languages.push({
      id,
      name: d.name,
      form: d.form,
      source,
      permissions: {
        understand: true,
        express: true,
        speak: d.form === "spoken",
        sign: d.form === "signed",
        read: !spokenOnly && d.writing,
        write: !spokenOnly && d.writing,
      },
    });
  };
  add("common", "creation-common");
  add(home, "creation-home");
  const mixed = traits.includes("trait-human-many-homes");
  if (extraSpoken.length)
    errors.push({
      code: "extra-languages",
      text: "Extra spoken-language choices are superseded. A Foot in Two Worlds grants one named ancestry language.",
    });
  if (mixed) {
    if (!ancestry)
      errors.push({code:"ancestry-language",text:"Choose one ordinary language native to your other ancestry, as approved by the DA."});
    else add(ancestry, "trait-human-many-homes");
  }
  return { valid: errors.length === 0, errors, languages };
}
/** Identity/learning preview only: inventory and acquisition checks must also pass before commitment. */
export function creationIdentity(
  draft,
  catalog,
  definitions = DEFAULT_LANGUAGES,
  options = {},
) {
  const baseLanguages = languageGrants(
    draft.languages ?? {},
    draft.traitIds ?? [],
    definitions,
  );
  const result = (options.graph ? forgeCreationLedger : creationLedger)(draft, catalog, {
    ...options,
    languages: definitions,
    initialLanguages: baseLanguages.languages,
  });
  const errors = [...result.errors];
  const get = (id) => catalog.find((r) => r.id === id);
  const ancestry = get(currentAncestryId(draft.ancestryId)),
    cls = get(draft.classId),
    culture = get(draft.culture?.id),
    background = get(draft.background?.id);
  const traits = draft.traitIds ?? [];
  if (ancestry?.kind !== "ancestry")
    errors.push({ code: "ancestry", text: "Choose an ancestry." });
  const validTraits =
    traits.length === 2 &&
    new Set(traits).size === 2 &&
    traits.every((id) => ancestry?.traits?.includes(id));
  if (!validTraits)
    errors.push({
      code: "traits",
      text: "Choose two distinct traits from your ancestry.",
    });
  const selection = ancestrySelection(draft, catalog);
  errors.push(...selection.errors);
  const languages = languageGrants(
    draft.languages ?? {},
    validTraits ? traits : [],
    definitions,
  );
  errors.push(...languages.errors);
  let summary = null;
  if (
    ancestry?.kind === "ancestry" &&
    cls?.kind === "class" &&
    culture?.kind === "origin" &&
    background?.kind === "origin" &&
    validTraits && !selection.errors.length &&
    result.valid
  ) {
    const attributes = structuredClone(draft.attributes);
    const benefits = ancestryBenefits(selection.traitIds);
    const hpTraining = (result.state.purchases ?? []).filter(
      (p) => p.id === "ability-conditioned-body",
    ).length;
    const limits = options.graph ? forgeMaximums({
      level: 1,
      ancestryHp: ancestry.hp,
      classHp: cls.hp,
      fortitude: attributes.fortitude,
      fixedHp: benefits.maximumHpBonus,
      capacitySp: result.state.learning.capacitySp,
    }) : null;
    const maximumHp = limits?.maxHp ??
      12 +
      ancestry.hp +
      cls.hp +
      attributes.fortitude +
      benefits.maximumHpBonus +
      hpTraining;
    const speedBase =
      ancestry.speed + benefits.speedBaseBonus;
    summary = {
      creationAttributes: attributes,
      maximumHp,
      ...(limits ? { maximumSp: limits.maxSp } : {}),
      gritGranted: result.state.gritGranted,
      gritSpent: 0,
      stability: benefits.stability,
      speedBase,
      unencumberedSpeed: Math.max(0, speedBase + attributes.agility),
      capacity: 10 + 3 * attributes.brawn + benefits.capacityBonus,
      capacityBonus: benefits.capacityBonus,
      ancestryTraitIds: selection.traitIds,
      defenseBoons: benefits.defenseBoons,
      vision: {
        lowLightVision: benefits.lowLightVision,
        seismicVisionRange: benefits.seismicVisionRange,
        ruleReferences: benefits.ruleReferences.filter((rule) => rule.path === "design/rules/vision.md"),
      },
      startingCoins:
        40 + ancestry.coins + cls.coins + culture.coins + background.coins,
      languages: result.state.languages,
    };
  }
  return { ...result, valid: errors.length === 0, errors, summary };
}
