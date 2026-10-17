import { creationLedger } from "./development.mjs";
import {
  DEFAULT_LANGUAGES,
  LANGUAGE_CONFIGURATION_SCHEMA,
  requireLanguageConfiguration,
} from "./languages.mjs";
export { DEFAULT_LANGUAGES } from "./languages.mjs";
const HP_TRAITS = new Set([
  "trait-dwarf-deep-constitution",
  "trait-human-weathered",
]);
const SPEED_TRAITS = new Set([
  "trait-human-far-walker",
  "trait-elf-unhurried-grace",
]);
export function languageGrants(
  { home, extraSpoken = [] },
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
  const expected = traits.includes("trait-human-many-homes") ? 2 : 0;
  if (extraSpoken.length !== expected)
    errors.push({
      code: "extra-languages",
      text: `Choose exactly ${expected} additional ordinary spoken languages.`,
    });
  if (expected)
    for (const id of extraSpoken) add(id, "trait-human-many-homes", true);
  return { valid: errors.length === 0, errors, languages };
}
/** Identity/learning preview only: inventory and acquisition checks must also pass before commitment. */
export function creationIdentity(
  draft,
  catalog,
  definitions = DEFAULT_LANGUAGES,
  options = {},
) {
  const result = creationLedger(draft, catalog, options);
  const errors = [...result.errors];
  const get = (id) => catalog.find((r) => r.id === id);
  const ancestry = get(draft.ancestryId),
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
  if (
    traits.includes("trait-elf-age-of-memory") &&
    !draft.rememberedCommunity?.trim()
  )
    errors.push({
      code: "remembered-community",
      text: "Name a place or community you knew in an earlier age.",
    });
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
    validTraits &&
    result.valid
  ) {
    const attributes = structuredClone(draft.attributes);
    const hpTraining = result.state.purchases.filter(
      (p) => p.id === "ability-conditioned-body",
    ).length;
    const maximumHp =
      12 +
      ancestry.hp +
      cls.hp +
      attributes.fortitude +
      traits.filter((id) => HP_TRAITS.has(id)).length +
      hpTraining;
    const speedBase =
      ancestry.speed + traits.filter((id) => SPEED_TRAITS.has(id)).length;
    summary = {
      creationAttributes: attributes,
      maximumHp,
      gritGranted: result.state.gritGranted,
      gritSpent: 0,
      stability: 0,
      speedBase,
      unencumberedSpeed: Math.max(0, speedBase + attributes.agility),
      capacity: 10 + 3 * attributes.brawn,
      startingCoins:
        40 + ancestry.coins + cls.coins + culture.coins + background.coins,
      languages: languages.languages,
    };
  }
  return { ...result, valid: errors.length === 0, errors, summary };
}
