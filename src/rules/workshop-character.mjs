import { forgeAdvancement, forgeArmorRequirement } from "./forge-character.mjs";
import { forgeMaximums } from "./forge-vitals.mjs";
import { workshopPlay } from "./workshop-play.mjs";
import { creationPreview } from "./creation.mjs";
import { awardMilestones } from "./development.mjs";
import { advancementPreview } from "./advancement.mjs";
import { inventoryTotals } from "./acquisition.mjs";
import { passiveDefenseSources } from "./passive-defenses.mjs";
import { currentAncestryId, ancestryBenefits, ancestrySelection } from "./ancestry.mjs";

export const emptyLevelDraft = () => ({
  purchases: [],
  signatures: {},
  acquisitions: {},
});

/** Rebuild from choices so lowering/revisiting a level cannot duplicate grants. */
export function workshopCharacter(draft, catalogs, languages) {
  languages ??= catalogs.languages;
  draft = { ...draft, ancestryId: currentAncestryId(draft.ancestryId) };
  const effectiveTraitIds = ancestrySelection(draft, catalogs.choices).traitIds;
  const creation = creationPreview(
    draft,
    catalogs.choices,
    catalogs.inventory,
    languages,
    catalogs.forge,
  );
  const target = draft.progression?.level ?? 1;
  if (!Number.isSafeInteger(target) || target < 1 || target > 100)
    throw new Error("Choose a whole level from 1 to 100.");
  let state = {
    ...structuredClone(creation.state),
    level: 1,
    stage: "advancement",
    dp: 0,
    items: structuredClone(creation.inventory.items),
    safePlace: true,
  };
  let maximumHpDelta = 0;
  const errors = [...creation.errors],
    levels = {},
    advancementLedger = [];
  for (let level = 2; level <= target; level++) {
    state = awardMilestones(state, level);
    state.safePlace = true; // Browser planning; native commitment retains campaign authority.
    const before = structuredClone(state);
    const levelPlan = draft.progression?.levels?.[level] ?? emptyLevelDraft();
    const currentPlay = workshopPlay(draft, state.items, state.languages ?? [], catalogs);
    const result = catalogs.forge
      ? forgeAdvancement(state, levelPlan, catalogs, languages, currentPlay)
      : advancementPreview(state, levelPlan, catalogs.choices, catalogs.inventory, languages, {
          knownLanguages: currentPlay.languages,
          ownedItems: currentPlay.inventory,
        });
    state = result.state;
    maximumHpDelta += result.maximumHpDelta;
    errors.push(
      ...result.errors.map((e) => ({
        ...e,
        level,
        ...(e.code === "signature" ? { signatureTier: e.level } : {}),
      })),
    );
    levels[level] = { before, ...result };
    advancementLedger.push(
      { kind: "award", level, delta: 8 + level + ancestryBenefits(effectiveTraitIds).additionalDpPerLevel },
      ...result.ledger,
    );
  }
  const play = workshopPlay(
    draft,
    state.items,
    state.languages ?? creation.summary?.languages ?? [],
    catalogs,
  );
  const items = play.inventory.map((item) => {
    const definition = catalogs.inventory.equipment.find(
      (r) => r.id === item.catalogId,
    );
    const saved = draft.loadout?.[item.instanceId];
    const carried = saved?.carried !== false && item.quantity > 0;
    return {
      ...item,
      carried,
      worn: carried && (saved?.worn ?? item.instanceId === "creation-outfit"),
      held: carried && (saved?.held ?? false),
      inventoryDie: item.inventoryDie ?? definition.inventoryDie,
      bulk: definition.bulk * item.quantity,
      definition,
    };
  });
  const outfit = items.find(
    (i) => i.catalogId === "item-travel-clothes" && i.worn,
  );
  const bulk = inventoryTotals(
    items.filter((i) => i.carried),
    catalogs.inventory,
    { wornOutfitId: outfit?.instanceId },
  ).bulk;
  const attributes = { ...draft.attributes };
  if (catalogs.forge && items.some((item) => item.worn && item.catalogId === "item-cincture-of-might"))
    attributes.brawn += 1;
  const capacity = 10 + 3 * attributes.brawn + ancestryBenefits(effectiveTraitIds).capacityBonus;
  const encumbrance = Math.max(0, bulk - capacity);
  const passive = passiveDefenseSources({
    abilities: state.abilities.map((id) => ({
      catalogId: id,
      instanceId: id,
      source: catalogs.choices.find((r) => r.id === id)?.source,
    })),
    equipment: items.filter((item) => !catalogs.forge || !forgeArmorRequirement(item.catalogId)).map((i) => ({ ...i, source: i.definition.source })),
  });
  if (catalogs.forge) {
    for (const item of items.filter((entry) => entry.worn)) {
      const required = forgeArmorRequirement(item.catalogId);
      if (required && state.learned.includes(required))
        passive.resistances.push({ type: "physical", value: Number(required.at(-1)), label: item.definition.name });
    }
  }
  const resistances = {};
  for (const source of passive.resistances)
    resistances[source.type] = Math.min(
      3,
      Math.max(resistances[source.type] ?? 0, source.value),
    );
  const spent = [...creation.ledger, ...advancementLedger]
    .filter((e) => e.kind === "purchase")
    .reduce((n, e) => n - e.delta, 0);
  const total =
    creation.ledger.reduce((n, e) => n + Math.max(0, e.delta), 0) +
    advancementLedger
      .filter((e) => e.kind === "award")
      .reduce((n, e) => n + e.delta, 0);
  const expired = creation.ledger
    .filter((e) => e.kind === "expired-pool")
    .reduce((n, e) => n - e.delta, 0);
  const limits = catalogs.forge && creation.summary ? forgeMaximums({
    level: target,
    ancestryHp: catalogs.choices.find((entry) => entry.id === draft.ancestryId).hp,
    classHp: catalogs.choices.find((entry) => entry.id === draft.classId).hp,
    fortitude: draft.attributes.fortitude,
    fixedHp: ancestryBenefits(effectiveTraitIds).maximumHpBonus,
    capacitySp: state.learning.capacitySp,
  }) : null;
  const unresolved = errors.filter(
    (e) =>
      e.code !== "signature" ||
      !e.signatureTier ||
      (state.pendingSignatures ?? []).includes(e.signatureTier),
  );
  return {
    ...creation,
    creation,
    state,
    valid: unresolved.length === 0,
    errors: unresolved,
    limits,
    attributes,
    play,
    levels,
    advancementLedger,
    development: { level: target, current: state.dp, spent, total, expired },
    inventory: { ...creation.inventory, items, bulk, capacity, encumbrance },
    resistances,
    passiveSources: passive.resistances,
    summary: creation.summary
      ? {
          ...creation.summary,
          languages: state.languages ?? creation.summary.languages,
          maximumHp: limits?.maxHp ?? creation.summary.maximumHp + maximumHpDelta,
          ...(limits ? { maximumSp: limits.maxSp } : {}),
          gritGranted: state.gritGranted,
          speed: Math.max(0, creation.summary.unencumberedSpeed - encumbrance),
        }
      : null,
  };
}

export function workshopAbility(character, record) {
  if (!record) return undefined;
  const improvements = character.state.learning?.improvements.get(record.id) ?? [];
  const currentAction = improvements.map((entry) => entry.effect.match(
    /takes (?:a |an )?(Main Action|Maneuver|Reaction)\b/i,
  )?.[1]).find(Boolean);
  return currentAction ? { ...record, currentAction } : record;
}

export function actionTiming(record) {
  const action = record.currentAction ??
    record.reference?.rules.details.find((d) => d.label === "Action")?.value ??
    "Passive";
  if (/^Passive/i.test(action)) return ["Passive"];
  const groups = [
    [/Main Action/i, "Main Action"],
    [/Maneuver/i, "Maneuver"],
    [/Reaction/i, "Reaction"],
  ]
    .filter(([pattern]) => pattern.test(action))
    .map(([, group]) => group);
  return groups.length
    ? groups
    : [/Movement/i.test(action) ? "Movement" : "Other"];
}

/** Visible weapon basics derive from owned gear, not the first six learned cards. */
export function mainActions(character, draft, catalogs) {
  const get = (id) => workshopAbility(character, catalogs.choices.find((r) => r.id === id));
  const has = (id) =>
    character.inventory.items.some((i) => i.catalogId === id && i.carried);
  const records = character.state.abilities
    .map(get)
    .filter(Boolean)
    .map((record) => ({ record, basic: false, visible: true }));
  for (const record of catalogs.choices.filter((r) => r.universal)) {
    let available = true;
    if (record.id === "ability-opportunity-attack" && catalogs.forge) {
      const held = character.inventory.items.filter((item) => item.held);
      available = held.some((item) => item.catalogId === "item-ordinary-melee-weapon") ||
        held.reduce((used, item) => used + (item.hands || 1), 0) < 2;
    } else if (["ability-basic-melee", "ability-opportunity-attack"].includes(record.id))
      available = has("item-ordinary-melee-weapon");
    if (record.id === "ability-basic-ranged")
      available = has("item-ordinary-ranged-weapon");
    if (record.id === "ability-shield-block")
      available = has("item-ordinary-shield");
    const visible = draft.basicActions?.[record.id] ?? available;
    if (!records.some((r) => r.record.id === record.id))
      records.push({ record, basic: true, visible, available });
  }
  return records;
}

export function craftingActions(character, catalogs) {
  return character.state.recipes.flatMap((id) => {
    const recipe = catalogs.inventory.recipes.find((r) => r.id === id);
    if (!recipe) return [];
    return (catalogs.forge ? ["craft:supplies:1"] : recipe.permissions)
      .filter((id) => (catalogs.forge ? character.state.learned : character.state.abilities).includes(id))
      .map((abilityId) => {
        const ability = catalogs.choices.find((r) => r.id === abilityId);
        const attribute = ability?.reference?.rules.details.find(
          (d) => d.label === "Attribute",
        )?.value;
        return { recipe, ability, attribute };
      });
  });
}
