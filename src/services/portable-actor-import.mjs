import { readPortableCharacter } from "../rules/portable-character.mjs";
import { nativePlayEffects } from "../rules/native-play-import.mjs";
import { importedCharacterState } from "../rules/native-character-state.mjs";
import { buildCharacterItems } from "./creation.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { getCampaignLanguageConfiguration } from "./languages.mjs";

const ID = "heroes-of-legend";

/** Native Import Data replaces contents; never reuse grants from its destination. */
export function buildPortableActorSource(source, catalogs, languages, { woundsCatalog } = {}) {
  const { draft, preview } = readPortableCharacter(source, catalogs, languages.definitions);
  if (!preview.valid)
    throw new Error("Finish the character's unresolved choices in the workshop before importing it into an Actor.");
  const { items, createdIds, reusedIds, instanceIds } = buildCharacterItems(
    { toObject: () => ({ items: [] }), items: [] },
    [...preview.state.abilities, ...catalogs.choices.filter(record => record.kind === "ability" && record.universal).map(record => record.id)],
    preview.inventory.items,
    { ...catalogs, grantKind: "creation" },
  );
  const effects = nativePlayEffects(draft, catalogs, { randomID: () => foundry.utils.randomID(), woundsCatalog });
  const changes = {
    name: draft.name.trim(),
    type: "character",
    prototypeToken: { name: draft.name.trim(), actorLink: true },
    items,
    effects: effects.effects,
    "system.health.baseMax": preview.summary.maximumHp,
    "system.health.value": Math.min(preview.summary.maximumHp, draft.play?.hp ?? preview.summary.maximumHp),
    "system.grit.granted": preview.summary.gritGranted,
    "system.grit.spent": Math.min(preview.summary.gritGranted, draft.play?.gritSpent ?? 0),
    "system.biography": draft.profile?.story ?? "",
    "system.memorizedMessage": draft.play?.memorizedMessage ?? "",
    [`flags.${ID}.development`]: {
      ...preview.state,
      stage: "advancement",
      safePlace: preview.state.level > 1 ? false : preview.state.safePlace,
      sourceCommit: catalogs.commit,
      creation: structuredClone(draft),
      creationSummary: preview.creation.summary,
      languages: preview.play.languages,
      ledger: [...preview.ledger, ...preview.advancementLedger],
      coins: preview.inventory.remainingCoins,
    },
    [`flags.${ID}.creationReceipt`]: {
      status: "complete", revision: 1, requestId: foundry.utils.randomID(),
      sourceCommit: catalogs.commit, languageBasis: languages.basis,
      createdIds, reusedIds, createdEffectIds: effects.effects.map(effect => effect._id),
    },
    [`flags.${ID}.wounds`]: effects.wounds,
    ...importedCharacterState(draft, preview, items, instanceIds),
  };
  for (const [key, value] of Object.entries(preview.summary.creationAttributes))
    changes[`system.attributes.${key}.base`] = value;
  return foundry.utils.expandObject(changes);
}

export async function portableActorSource(source) {
  const catalogs = await loadCatalogs();
  const languages = getCampaignLanguageConfiguration();
  // Validate before fetching an optional wound catalog or allocating native IDs.
  const { draft, preview } = readPortableCharacter(source, catalogs, languages.definitions);
  if (!preview.valid)
    throw new Error("Finish the character's unresolved choices in the workshop before importing it into an Actor.");
  let woundsCatalog;
  if (draft.play?.wounds?.some(wound => wound.catalogId)) {
    const response = await fetch("systems/heroes-of-legend/data/wounds.json");
    if (!response.ok) throw new Error("Cannot load the wound catalog required by this character.");
    woundsCatalog = await response.json();
  }
  return buildPortableActorSource(source, catalogs, languages, { woundsCatalog });
}
