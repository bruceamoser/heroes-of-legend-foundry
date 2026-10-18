/** Exact reviewed source editions for the four optional defense substitutions. */
export const DEFENSE_SUBSTITUTIONS = Object.freeze({
  "ability-catch-the-mechanism": Object.freeze({
    path: "design/cards/catch-the-mechanism.md",
    sha256: "35855ba80829acc5d06968cbb33b361c5bbe1cbad3c7166e8561cfcce46f8646",
    attributeKey: "knowledge",
    boons: 0,
    guidance:
      "Before a mechanical trap defense; see and reach its mechanism; held craft tool. No disarm.",
  }),
  "ability-steel-at-the-wrist": Object.freeze({
    path: "design/cards/steel-at-the-wrist.md",
    sha256: "c6c0a8951be457f96d8099cf99d240ed55412f496956a2fe08587ffca8a2e885",
    attributeKey: "brawn",
    boons: 0,
    guidance:
      "Before defense against an adjacent creature's melee weapon attack; requires a melee weapon. No Boon.",
  }),
  "ability-snare-the-missile": Object.freeze({
    path: "design/cards/snare-the-missile.md",
    sha256: "7cf8c76643b934e75974edc02f9e278e908bb2338e10e9f4425a82c25f65872a",
    attributeKey: "knowledge",
    boons: 1,
    guidance:
      "Before one physical projectile defense; held craft tools and free hand; not area or oversize projectile.",
  }),
  "ability-thought-before-the-blow": Object.freeze({
    path: "design/cards/thought-before-the-blow.md",
    sha256: "07d814715c441190e7c7959fefb703b18d312b6d2c3c2df4b6ec6be55ba66dce",
    attributeKey: "reason",
    boons: 1,
    guidance:
      "Before defense against a perceived attack; on Strong, move up to 2 squares without provoking after resolution.",
  }),
});

const ID = "heroes-of-legend";

/** An embedded, pinned card is a choice; table-specific timing/equipment stays visible. */
export function defenseSubstitutionOptions(actor) {
  return (actor?.items ?? [])
    .filter(
      (item) => item?.type === "ability" && item.actor?.uuid === actor.uuid,
    )
    .flatMap((item) => {
      const id = item.getFlag(ID, "catalogId"),
        definition = DEFENSE_SUBSTITUTIONS[id];
      if (!definition) return [];
      const source = item.getFlag(ID, "source");
      if (
        source?.path !== definition.path ||
        source?.sha256 !== definition.sha256
      )
        return [];
      return [
        {
          itemUuid: item.uuid,
          catalogId: id,
          name: item.name,
          attributeKey: definition.attributeKey,
          attribute:
            actor.system.attributes?.[definition.attributeKey]?.effective,
          boons: definition.boons,
          guidance: definition.guidance,
          source: { path: definition.path, sha256: definition.sha256 },
        },
      ];
    })
    .filter((option) => Number.isSafeInteger(option.attribute))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.itemUuid.localeCompare(b.itemUuid),
    );
}

export function selectedDefenseSubstitution(basis, draft = {}) {
  const itemUuid = draft.defenseSubstitutionItemUuid ?? "";
  if (itemUuid === "") return null;
  if (basis?.mode !== "defense" || typeof itemUuid !== "string")
    throw new Error(
      "Choose a reviewed defense substitution on a defense roll.",
    );
  const option = (basis.defenseSubstitutions ?? []).find(
    (candidate) => candidate.itemUuid === itemUuid,
  );
  if (!option)
    throw new Error(
      "This defense substitution changed. Reopen the defense and review it.",
    );
  return option;
}
