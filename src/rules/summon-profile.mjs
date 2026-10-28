const ID = "heroes-of-legend";
export const SUMMON_FLAG = "summon";

/** A summon is a standard creature Actor carrying a profile flag. */
export function summonState(actor) {
  return (
    actor?.getFlag?.(ID, SUMMON_FLAG) ??
    actor?.flags?.[ID]?.[SUMMON_FLAG] ??
    null
  );
}

export function isSummon(actor) {
  return Boolean(summonState(actor)?.record);
}

export function summonRecord(actor) {
  return summonState(actor)?.record ?? null;
}

const modifier = (value = {}) => ({
  boons: value.boons ?? 0,
  banes: value.banes ?? 0,
  sourceText: value.sourceText ?? "",
});

const mitigation = (value = {}) => ({
  numeric: (value.ordinary ?? []).map(({ type, value }) => ({ type, value })),
  special: (value.special ?? []).map((entry) => ({
    type: entry.type ?? entry.reference ?? "",
    reference: entry.sourceText ?? entry.reference ?? "see source",
  })),
  sourceText: value.sourceText ?? "",
});

/** Project the pinned summon profile into the old summon-sheet shape. */
export function summonSystemFromRecord(record) {
  if (!record?.basicMelee || !record?.attacks) {
    throw new Error("Invalid summon profile.");
  }
  const commit = record.source?.commit ?? "";
  const sourceLink = commit
    ? `\n\n[Source profile](https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${record.source.path})`
    : "";
  return {
    schemaVersion: 1,
    attributes: Object.fromEntries(
      Object.entries(record.attributes ?? {}).map(([key, base]) => [
        key,
        { base },
      ]),
    ),
    health: { value: record.hp.maximum, baseMax: record.hp.maximum, max: record.hp.maximum },
    cv: record.cv,
    eligibility: record.eligibility ?? "",
    biography: "",
    speed: record.speed.ordinary.value,
    speedSource: record.speed.sourceText ?? "",
    alternateSpeeds: (record.speed.alternates ?? []).map(({ mode, value }) => ({
      mode,
      value,
    })),
    footprint: {
      width: record.footprint.width,
      height: record.footprint.height,
    },
    defenseModifier: modifier(record.defenseModifier),
    stability: record.stability.value,
    stabilitySource: record.stability.sourceText ?? "",
    resistances: mitigation(record.mitigation?.resistances),
    weaknesses: mitigation(record.mitigation?.weakness),
    immunities: [...(record.mitigation?.conditionImmunities ?? [])],
    senses: record.senses ?? "",
    communication: record.communication ?? "",
    basicMelee: {
      orientation: "attacker",
      attribute: record.basicMelee.attribute,
      attackModifier: modifier(record.basicMelee.attackModifier),
      weak: record.basicMelee.outcomes.weak.damage.amount,
      standard: record.basicMelee.outcomes.standard.damage.amount,
      strong: record.basicMelee.outcomes.strong.damage.amount,
    },
    attacks: (record.attacks.actions ?? []).map((action) => ({
      name: action.name,
      attribute: action.attribute,
      orientation: "attacker",
      attackModifier: modifier(action.attackModifier),
      ...action.outcomes,
    })),
    commandSource: record.command?.sourceText ?? "",
    healingSource: record.healing?.sourceText ?? "",
    restrictions: {
      canReceiveHealing: false,
      reactions: false,
      opportunityAttacks: false,
      independentTurns: false,
      turnAnchor: "controller",
      maximumCommandsPerTurn: 1,
      tetherSquares: record.command?.tether?.maximumSquares ?? 6,
      disappearsAtHp: record.healing?.disappearsAtHp ?? 0,
      permanentLoot: false,
    },
    sourceMarkdown: record.reference?.sourceMarkdown ?? "",
    referenceMarkdown: `${record.reference?.sourceMarkdown ?? ""}${sourceLink}`,
  };
}
