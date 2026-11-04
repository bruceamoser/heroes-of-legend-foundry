/** Exact reviewed source editions for the four optional defense substitutions. */
export const DEFENSE_SUBSTITUTIONS = Object.freeze({
  "ability-catch-the-mechanism": Object.freeze({
    path: "design/cards/catch-the-mechanism.md",
    sha256: "87820ce2266df81da20d35cee15b1ee973cbbcc8454a1e838b88ed946b1f7f57",
    attributeKey: "knowledge",
    boons: 1,
    guidance:
      "Reaction before defending against a visible mechanical trap whose workings you can reach; held craft tool. On Strong, after the trap resolves, its mechanism stays jammed until someone spends a Main Action freeing it.",
  }),
  "ability-steel-at-the-wrist": Object.freeze({
    path: "design/cards/steel-at-the-wrist.md",
    sha256: "c263759c45b45268f57d5dfe2031da9967b89af97314639abbda060694ebc52c",
    attributeKey: "brawn",
    boons: 1,
    guidance:
      "Reaction before defense against an adjacent creature's melee weapon attack; use an ordinary melee weapon.",
  }),
  "ability-snare-the-missile": Object.freeze({
    path: "design/cards/snare-the-missile.md",
    sha256: "c91722d584ff57945c116367ddc98134b6cc8360e7a9b46a97d95648073b5a99",
    attributeKey: "knowledge",
    boons: 2,
    guidance:
      "Reaction before defending against a single-target physical projectile attack; held craft tools and a free hand. On Strong, after the attack resolves, catch the projectile if it fits in your free hand.",
  }),
  "ability-thought-before-the-blow": Object.freeze({
    path: "design/cards/thought-before-the-blow.md",
    sha256: "49a4eb62bcc8001c89ed520d9f88e06ef012772183a7fbc6001ef516070090ed",
    attributeKey: "reason",
    boons: 1,
    guidance:
      "Reaction before defense against an attack you can perceive. After the attack resolves, move up to 2 squares without provoking.",
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
