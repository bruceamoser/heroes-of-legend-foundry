/** Reviewed permanent ancestry benefits. Narrative text never selects mechanics. */
export const ANCESTRY_SOURCE_COMMIT =
  "c5c84c0da3a5bd54b2553426408d1ea581fe22b9";

const rule = (path, sha256) =>
  Object.freeze({ commit: ANCESTRY_SOURCE_COMMIT, path, sha256 });

export const ANCESTRY_RULE_REFERENCES = Object.freeze({
  vision: rule(
    "design/rules/vision.md",
    "321e19030ac14ade7e51dc2718d0a73d9d98abe068479c0b6de171fa94d5d1f4",
  ),
  procedures: rule(
    "design/rules/ancestry-procedures.md",
    "cda6c068ddb0ee947d61fae963687442e610f05bce8e021bc49e23c5e10892b7",
  ),
});

/** Published identities remain stable while accepting descriptive import aliases. */
export function currentAncestryId(id) {
  if (id === "ancestry-wood-elf") return "ancestry-elf";
  if (id === "ancestry-hill-dwarf") return "ancestry-dwarf";
  return id;
}

/** Flatten a committed, validated choice for read-only native calculations. */
export function ancestryTraitIds(draft = {}) {
  const traits = [...(draft.traitIds ?? [])];
  if (
    currentAncestryId(draft.ancestryId) === "ancestry-human" &&
    traits.includes("trait-human-many-homes") &&
    typeof draft.borrowedTraitId === "string" && draft.borrowedTraitId
  ) traits.push(draft.borrowedTraitId);
  return [...new Set(traits)];
}

/** Validate A Foot in Two Worlds without inventing ancestry-language mappings. */
export function ancestrySelection(draft, catalog) {
  const traits = [...(draft.traitIds ?? [])];
  const errors = [];
  if (
    currentAncestryId(draft.ancestryId) !== "ancestry-human" ||
    !traits.includes("trait-human-many-homes")
  ) return {traitIds:traits, errors};
  const borrowed = catalog.find(record => record.id === currentAncestryId(draft.borrowedAncestryId));
  if (borrowed?.kind !== "ancestry" || borrowed.id === "ancestry-human")
    errors.push({code:"borrowed-ancestry",text:"A Foot in Two Worlds requires another ancestry."});
  if (!borrowed?.traits?.includes(draft.borrowedTraitId) || borrowed.id === "ancestry-human")
    errors.push({code:"borrowed-trait",text:"Choose one trait from your other ancestry."});
  if (!errors.length) traits.push(draft.borrowedTraitId);
  return {traitIds:[...new Set(traits)], errors};
}

const HP_TRAITS = new Set([
  "trait-dwarf-deep-constitution",
  "trait-human-weathered",
  "trait-halfling-stout-heart",
]);
const SPEED_TRAITS = new Set([
  "trait-elf-unhurried-grace",
  // Long Stride and Quick on Your Feet retain their original proposal IDs.
  "trait-tallfolk-you-take-the-blow",
  "trait-goblin-run-away-better",
]);

/**
 * Facts only: conditional roll grants and perception/targeting are adjudicated
 * with the linked rules. A sense never enables Foundry darkness vision here.
 */
export function ancestryBenefits(traitIds = []) {
  if (!Array.isArray(traitIds) || traitIds.some((id) => typeof id !== "string"))
    throw new TypeError("Ancestry traits must be an array of stable IDs.");
  const traits = new Set(traitIds);
  const maximumHpBonus = [...traits].filter((id) => HP_TRAITS.has(id)).length;
  const speedBaseBonus = [...traits].filter((id) => SPEED_TRAITS.has(id)).length;
  const capacityBonus =
    (traits.has("trait-halfling-resilient") ? 1 : 0) +
    (traits.has("trait-tallfolk-broad-back") ? 3 : 0);
  const defenseBoons = Number(traits.has("trait-gnome-small-target"));
  const lowLightVision = traits.has("trait-deep-dwarf-eyes-for-the-dark")
    ? 2
    : Number(traits.has("trait-high-elf-starlight-eyes"));
  const seismicVisionRange = traits.has("trait-deep-dwarf-stone-tells-you")
    ? 6
    : 0;
  const reach = traits.has("trait-tallfolk-long-reach") ? 2 : 1;
  const references = [];
  if (lowLightVision || seismicVisionRange)
    references.push(ANCESTRY_RULE_REFERENCES.vision);
  if (defenseBoons || reach === 2 || traits.has("trait-oath-bound-the-debt-comes-due"))
    references.push(ANCESTRY_RULE_REFERENCES.procedures);
  return {
    maximumHpBonus,
    speedBaseBonus,
    capacityBonus,
    additionalDpPerLevel: Number(traits.has("trait-human-far-walker")),
    stability: Number(traits.has("trait-dwarf-low-center")),
    defenseBoons,
    lowLightVision,
    seismicVisionRange,
    interactionRange: reach,
    nonAttackTouchRange: reach,
    ruleReferences: structuredClone(references),
  };
}
