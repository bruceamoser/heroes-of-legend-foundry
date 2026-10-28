/** Reviewed passive sources only. Names and narrative text never select mechanics. */
const PINNED_COMMIT = "295e858c1b6fee044a0261bf9f437636efeff2bf";
const source = (path, sha256, commit = PINNED_COMMIT) =>
  Object.freeze({ commit, path, sha256 });

export const PASSIVE_DEFENSE_DEFINITIONS = Object.freeze({
  "ability-wear-light-armor": Object.freeze({
    kind: "ability",
    source: source(
      "design/cards/wear-light-armor.md",
      "31528bc37c4e4e19233b05ae374d5f50f2818a7967da13f178b1d6ae80a028c3",
    ),
  }),
  "item-ordinary-light-armor": Object.freeze({
    kind: "equipment",
    source: source(
      "design/equipment/ordinary-light-armor.md",
      "a26fc198de266b1f568079cea8333c2178bc40dabbf16a28fc8adf4a340af26a",
    ),
  }),
  "ability-wear-medium-armor": Object.freeze({
    kind: "ability",
    source: source(
      "design/cards/wear-medium-armor.md",
      "b27ceb2e48c3b53e4c35f02444d093d664af1a90d092e984108027bfef9f641b",
    ),
    // Previously committed world items retain their reviewed resistance.
    legacySources: Object.freeze([
      source(
        "design/cards/wear-medium-armor.md",
        "2a042d1c36030ae7c5b2c648e380a7147ac0575e591019c89d264a9c99434ecc",
        "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
      ),
    ]),
  }),
  "item-ordinary-medium-armor": Object.freeze({
    kind: "equipment",
    source: source(
      "design/equipment/ordinary-medium-armor.md",
      "a1e8320933f4d2a76805fa30546eef9ffef115a1bf410f3ae3af4418bf91525f",
    ),
    // Previously committed world items retain their reviewed resistance.
    legacySources: Object.freeze([
      source(
        "design/equipment/ordinary-medium-armor.md",
        "7050f7573563be9a52f12c746e67b31035782055296cce1d043e37bd860aad65",
        "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
      ),
    ]),
  }),
  "ability-wear-heavy-armor": Object.freeze({
    kind: "ability",
    source: source(
      "design/cards/wear-heavy-armor.md",
      "ef2ad8f5e77167bbecab905a9baad19b28ae0ce93d8e8953aa92824a8a48e864",
    ),
    // Previously committed world items retain their reviewed resistance.
    legacySources: Object.freeze([
      source(
        "design/cards/wear-heavy-armor.md",
        "0e894eed3c2e6522f08d5f5cbb133d3d0c2c85c21e6a9b9828ae1c1780da888f",
        "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
      ),
    ]),
  }),
  "item-ordinary-heavy-armor": Object.freeze({
    kind: "equipment",
    source: source(
      "design/equipment/ordinary-heavy-armor.md",
      "b3563ec47aaf8e91bfdfa1cbb637434b82f06700345b883f19eec6f7d49a5447",
    ),
    // Previously committed world items retain their reviewed resistance.
    legacySources: Object.freeze([
      source(
        "design/equipment/ordinary-heavy-armor.md",
        "288b57d9bc293cd2aa2c792b13a02f9a3eaefe6c899bb81979e46c62a1923d6f",
        "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
      ),
    ]),
  }),
  "item-winter-lining": Object.freeze({
    kind: "equipment",
    source: source(
      "design/equipment/winter-lining.md",
      "4834218c2ea801166992f2a64aaac68f94ec0645364c592283f80d7f909f5bde",
    ),
  }),
  "item-gravebound-brooch": Object.freeze({
    kind: "equipment",
    source: source(
      "design/equipment/gravebound-brooch.md",
      "261ba1de92ca5ce990992ad8e7975c9620454d30038ac8e1a78b53efb29fcf8e",
    ),
  }),
});

const ARMOR_RULES = Object.freeze([
  Object.freeze({
    abilityId: "ability-wear-light-armor",
    itemId: "item-ordinary-light-armor",
    sourceId: "passive-wear-light-armor",
    type: "physical",
    value: 1,
    label: "Wear Light Armor with ordinary light armor",
  }),
  Object.freeze({
    abilityId: "ability-wear-medium-armor",
    itemId: "item-ordinary-medium-armor",
    sourceId: "passive-wear-medium-armor",
    type: "physical",
    value: 2,
    label: "Wear Medium Armor with ordinary medium armor",
  }),
  Object.freeze({
    abilityId: "ability-wear-heavy-armor",
    itemId: "item-ordinary-heavy-armor",
    sourceId: "passive-wear-heavy-armor",
    type: "physical",
    value: 3,
    label: "Wear Heavy Armor with ordinary heavy armor",
  }),
]);

const ITEM_RULES = Object.freeze({
  "item-winter-lining": Object.freeze({
    sourceId: "passive-item-winter-lining",
    type: "cold",
    value: 1,
    label: "Winter Lining",
  }),
  "item-gravebound-brooch": Object.freeze({
    sourceId: "passive-item-gravebound-brooch",
    type: "life",
    value: 1,
    label: "Gravebound Brooch",
  }),
});

function recordId(kind, record, index) {
  if (
    typeof record?.catalogId !== "string" ||
    typeof record.instanceId !== "string" ||
    !record.instanceId.trim()
  )
    throw new TypeError(
      `Passive ${kind} record ${index} needs a stable instance ID and catalog ID text.`,
    );
  return record.catalogId;
}

function validateProvenance(kind, catalogId, provenance) {
  const definition = PASSIVE_DEFENSE_DEFINITIONS[catalogId];
  if (!definition) return null;
  if (definition.kind !== kind)
    throw new Error(`Reviewed source ${catalogId} has the wrong record kind.`);
  const reviewedSource = [
    definition.source,
    ...(definition.legacySources ?? []),
  ].find(
    (candidate) =>
      provenance?.path === candidate.path &&
      provenance?.sha256 === candidate.sha256,
  );
  if (!reviewedSource)
    throw new Error(
      `${catalogId} source changed; its passive automation needs review.`,
    );
  return {
    kind,
    catalogId,
    commit: reviewedSource.commit,
    path: reviewedSource.path,
    sha256: reviewedSource.sha256,
  };
}

function sourceRecord(rule, equipment, provenance) {
  return Object.freeze({
    sourceId: `${rule.sourceId}:${equipment.instanceId}`,
    type: rule.type,
    value: rule.value,
    label: rule.label,
    automatic: true,
    provenance: Object.freeze(provenance),
  });
}

/**
 * Resolve only reviewed passive catalog records.
 * Unknown IDs remain narrative data and never become mechanics.
 */
export function passiveDefenseSources({ abilities = [], equipment = [] } = {}) {
  if (!Array.isArray(abilities) || !Array.isArray(equipment))
    throw new TypeError("Passive ability and equipment inputs must be arrays.");

  const learned = new Set(),
    ignored = [],
    resistances = [],
    seenEquipment = new Set(),
    provenanceByCatalog = new Map();

  for (const [index, ability] of abilities.entries()) {
    const catalogId = recordId("ability", ability, index);
    if (!catalogId) continue;
    const provenance = validateProvenance("ability", catalogId, ability.source);
    if (!provenance) {
      ignored.push({
        kind: "ability",
        catalogId,
        reason: "No reviewed passive defense definition.",
      });
      continue;
    }
    provenanceByCatalog.set(catalogId, provenance);
    learned.add(catalogId);
  }

  for (const [index, item] of equipment.entries()) {
    const catalogId = recordId("equipment", item, index);
    if (seenEquipment.has(item.instanceId))
      throw new Error("Passive equipment instance IDs must be unique.");
    seenEquipment.add(item.instanceId);
    if (typeof item.worn !== "boolean")
      throw new TypeError("Passive equipment needs a boolean worn state.");
    if (!catalogId) continue;
    const provenance = validateProvenance("equipment", catalogId, item.source);
    if (!provenance) {
      ignored.push({
        kind: "equipment",
        catalogId,
        reason: "No reviewed passive defense definition.",
      });
      continue;
    }
    provenanceByCatalog.set(catalogId, provenance);
    if (!item.worn || item.quantity === 0) continue;

    const armor = ARMOR_RULES.find((rule) => rule.itemId === catalogId);
    if (armor) {
      if (!learned.has(armor.abilityId)) continue;
      const abilityProvenance = provenanceByCatalog.get(armor.abilityId);
      if (!abilityProvenance)
        throw new Error(
          `${armor.itemId} needs its matching learned Wear ability before it can provide a defense.`,
        );
      resistances.push(
        sourceRecord(armor, item, [abilityProvenance, provenance]),
      );
      continue;
    }

    const rule = ITEM_RULES[catalogId];
    if (rule) resistances.push(sourceRecord(rule, item, [provenance]));
  }

  resistances.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  ignored.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.catalogId.localeCompare(b.catalogId) ||
      a.reason.localeCompare(b.reason),
  );
  return {
    resistances,
    weaknesses: [],
    ignored,
  };
}
