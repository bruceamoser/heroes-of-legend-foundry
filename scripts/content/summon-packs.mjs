import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseSummon, verifySourceHash } from "./summons.mjs";
import { stableFoundryId, validateStableCatalogIds } from "./item-packs.mjs";
import { rewriteSourceLinks } from "./creature-packs.mjs";

export const SUMMON_PACK_DEFINITION = Object.freeze({
  name: "summons", label: "Heroes of Legend Summon Profiles", type: "Actor",
  path: "packs/summons", directory: "summons",
});
export const SUMMON_AUTOMATION_LABEL = "Summon reference · command, spawn and tether automation pending";
export const SUMMON_FALLBACK_IMAGE = "icons/svg/mystery-man.svg";
const ID = "heroes-of-legend";

export function validateSummonCatalogBasis({ catalog, lock }) {
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.equal(lock.repository, "https://github.com/bruceamoser/heroes-of-legend");
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.source.commit, lock.commit);
  assert.equal(catalog.source.repository, lock.repository);
  assert.equal(catalog.orientation.summonAttackTables, "attacker");
  assert.equal(catalog.records.length, 73);
  assert.equal(catalog.counts.profiles, 73);
  assert.equal(lock.summonLinks.length, 73);
  validateStableCatalogIds(catalog.records);
  const rules = lock.records.find(({ path }) => path === "design/rules/summoning.md");
  assert(rules, "Missing pinned summon rules");
  for (const record of catalog.records) {
    const source = lock.records.find(({ path }) => path === record.source.path);
    const link = lock.summonLinks.find(({ id }) => id === record.id);
    const creature = lock.records.find(({ id }) => id === link?.creatureId);
    assert(source && link && creature, `${record.id}: missing locked source/link`);
    assert.equal(record.source.sha256, source.sha256);
    verifySourceHash(source, Buffer.from(record.reference.sourceMarkdown));
    // Reparse the complete hash-verified source, rather than trusting a typed
    // catalog field which may have drifted independently of its provenance.
    assert.deepEqual(record, parseSummon(source, record.reference.sourceMarkdown, {
      repository: lock.repository, commit: lock.commit, link, creature, rules,
    }), `${record.id}: catalog differs from pinned source`);
  }
  assert.deepEqual(catalog.records.map(r => r.id).sort(), lock.summonLinks.map(r => r.id).sort());
  return catalog.records;
}

export function summonActorSource(record, { sourceCommit }) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  const modifier = value => ({ boons: value.boons, banes: value.banes, sourceText: value.sourceText });
  const mitigation = value => ({
    numeric: value.ordinary.map(({ type, value }) => ({ type, value })),
    special: value.special.map(entry => ({ type: entry.type ?? entry.reference, reference: entry.sourceText ?? entry.reference ?? "see source" })),
    sourceText: value.sourceText,
  });
  const source = structuredClone(record.source);
  const footprint = { width: record.footprint.width, height: record.footprint.height };
  return {
    name: record.name, type: "summon", img: SUMMON_FALLBACK_IMAGE,
    prototypeToken: { name: record.name, actorLink: false, ...footprint, texture: { src: SUMMON_FALLBACK_IMAGE } },
    system: {
      schemaVersion: 1,
      attributes: Object.fromEntries(Object.entries(record.attributes).map(([key, base]) => [key, { base }])),
      health: { value: record.hp.maximum, baseMax: record.hp.maximum },
      cv: record.cv, eligibility: record.eligibility,
      speed: record.speed.ordinary.value, speedSource: record.speed.sourceText,
      alternateSpeeds: record.speed.alternates.map(({ mode, value }) => ({ mode, value })),
      footprint, defenseModifier: modifier(record.defenseModifier),
      stability: record.stability.value, stabilitySource: record.stability.sourceText,
      resistances: mitigation(record.mitigation.resistances),
      weaknesses: mitigation(record.mitigation.weakness),
      immunities: structuredClone(record.mitigation.conditionImmunities),
      senses: record.senses, communication: record.communication,
      basicMelee: {
        orientation: "attacker", attribute: record.basicMelee.attribute,
        attackModifier: modifier(record.basicMelee.attackModifier),
        weak: record.basicMelee.outcomes.weak.damage.amount,
        standard: record.basicMelee.outcomes.standard.damage.amount,
        strong: record.basicMelee.outcomes.strong.damage.amount,
      },
      attacks: record.attacks.actions.map(action => ({
        name: action.name, attribute: action.attribute, orientation: "attacker",
        attackModifier: modifier(action.attackModifier), ...action.outcomes,
      })),
      commandSource: record.command.sourceText, healingSource: record.healing.sourceText,
      restrictions: {
        canReceiveHealing: false, reactions: false, opportunityAttacks: false,
        independentTurns: false, turnAnchor: "controller", maximumCommandsPerTurn: 1,
        tetherSquares: record.command.tether.maximumSquares,
        disappearsAtHp: record.healing.disappearsAtHp,
        permanentLoot: false,
      },
      sourceMarkdown: record.reference.sourceMarkdown,
      referenceMarkdown: `${rewriteSourceLinks(record.reference.sourceMarkdown, record, sourceCommit)}\n\n[Source profile](https://github.com/bruceamoser/heroes-of-legend/blob/${sourceCommit}/${record.source.path})`,
    },
    flags: { [ID]: {
      catalogId: record.id, source: { path: source.path, sha256: source.sha256 },
      sourceCommit, creatureId: record.creatureId, references: structuredClone(record.references),
      automation: "pending", automationLabel: SUMMON_AUTOMATION_LABEL,
      lifecycleAutomation: "pending",
    } },
  };
}

export function buildSummonPackArtifacts({ catalog, lock }) {
  const records = validateSummonCatalogBasis({ catalog, lock }).slice().sort((a, b) => a.id.localeCompare(b.id, "en"));
  const documents = records.map(record => {
    const id = stableFoundryId(record.id);
    assert.equal(id, record.foundryId);
    return { _key: `!actors!${id}`, _id: id, ...summonActorSource(record, { sourceCommit: lock.commit }),
      items: [], effects: [], folder: null, sort: 0, ownership: { default: 0 } };
  });
  return {
    files: new Map(documents.map(document => [`summons/${document.flags[ID].catalogId}.json`, `${JSON.stringify(document, null, 2)}\n`])),
    pack: { name: "summons", type: "Actor", path: "packs/summons", count: documents.length,
      semanticSha256: createHash("sha256").update(JSON.stringify(documents)).digest("hex") },
    documents: { summons: documents },
  };
}
