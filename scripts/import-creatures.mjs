import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {
  parseCreature,
  parseMonsterAbility,
  summarizeCreatureCatalog,
  verifySourceHash,
} from "./content/creatures.mjs";

const root = new URL("../", import.meta.url);
const repository = process.env.HOL_BOOK_REPOSITORY;
if (!repository)
  throw new Error("Set HOL_BOOK_REPOSITORY to the local book repository");

const lock = JSON.parse(
  await readFile(new URL("content/source-lock.json", root), "utf8"),
);
assert.equal(lock.schemaVersion, 1, "Unsupported source-lock schema");
assert.match(lock.commit, /^[a-f0-9]{40}$/);

function gitBlob(path) {
  const result = spawnSync(
    "git",
    ["-C", repository, "show", `${lock.commit}:${path}`],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `Cannot read ${path} at ${lock.commit}: ${
        result.error?.message ??
        result.stderr?.toString() ??
        "git show failed"
      }`,
    );
  return result.stdout;
}

function gitPaths(prefix) {
  const result = spawnSync(
    "git",
    [
      "-C",
      repository,
      "ls-tree",
      "-r",
      "--name-only",
      lock.commit,
      "--",
      prefix,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `Cannot list ${prefix} at ${lock.commit}: ${
        result.error?.message ??
        result.stderr?.toString() ??
        "git ls-tree failed"
      }`,
    );
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
}

function uniqueBy(values, key, label) {
  const seen = new Set();
  for (const value of values) {
    const id = key(value);
    assert(id, `Missing ${label}`);
    assert(!seen.has(id), `Duplicate ${label}: ${id}`);
    seen.add(id);
  }
  return seen;
}

function byStableId(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

const recordsByPath = new Map();
for (const record of lock.records) {
  assert(!recordsByPath.has(record.path), `Duplicate lock path: ${record.path}`);
  recordsByPath.set(record.path, record);
}

const creatures = lock.records.filter((record) =>
  record.path.startsWith("design/bestiary/creatures/"),
);
const monsters = lock.records.filter(
  (record) =>
    record.path.startsWith("design/monster-abilities/") && record.id,
);
const summons = lock.records.filter((record) =>
  record.path.startsWith("design/bestiary/summons/"),
);
const lockedMonsterPaths = lock.records
  .filter((record) => record.path.startsWith("design/monster-abilities/"))
  .map(({ path }) => path)
  .sort();
assert.equal(creatures.length, lock.counts.creatures, "Creature count drift");
assert.equal(
  monsters.length,
  lock.counts.monsterAbilities,
  "Monster ability count drift",
);
assert.equal(summons.length, lock.counts.summons, "Summon count drift");
assert.equal(lock.assets.length, lock.counts.portraits, "Portrait count drift");
assert.equal(creatures.length, 192, "Unexpected creature roster size");
uniqueBy(creatures, ({ id }) => id, "creature ID");
uniqueBy(creatures, ({ path }) => path, "creature source path");
uniqueBy(monsters, ({ id }) => id, "monster ability ID");
uniqueBy(summons, ({ path }) => path, "summon source path");
assert.deepEqual(
  gitPaths("design/bestiary/creatures"),
  creatures.map(({ path }) => path).sort(),
  "Git creature roster does not reconcile with source lock",
);
assert.deepEqual(
  gitPaths("design/bestiary/summons"),
  summons.map(({ path }) => path).sort(),
  "Git summon roster does not reconcile with source lock",
);
assert.deepEqual(
  gitPaths("design/monster-abilities"),
  lockedMonsterPaths,
  "Git monster-ability roster does not reconcile with source lock",
);

const artManifestRecord = recordsByPath.get(
  "design/bestiary/art/manifest.json",
);
const promptsRecord = recordsByPath.get("design/bestiary/art/prompts.json");
const sourceManifestRecord = recordsByPath.get(
  "design/da-book/source-manifest.json",
);
assert(artManifestRecord, "Missing locked art manifest");
assert(promptsRecord, "Missing locked prompt registry");
assert(sourceManifestRecord, "Missing locked DA source manifest");

const artManifestBytes = verifySourceHash(
  artManifestRecord,
  gitBlob(artManifestRecord.path),
);
verifySourceHash(promptsRecord, gitBlob(promptsRecord.path));
const sourceManifestBytes = verifySourceHash(
  sourceManifestRecord,
  gitBlob(sourceManifestRecord.path),
);
const artManifest = JSON.parse(artManifestBytes.toString("utf8"));
const sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
assert.equal(artManifest.schema_version, 1, "Unknown art manifest schema");
assert.equal(artManifest.entries.length, 192, "Art roster size drift");

const creatureByPath = new Map(
  creatures.map((creature) => [creature.path, creature]),
);
const creatureById = new Map(creatures.map((creature) => [creature.id, creature]));
const artSources = sourceManifest.families.flatMap((family) =>
  family.sources.map((path) => ({ family: family.name, path: `design/${path}` })),
);
assert.equal(artSources.length, 192, "DA source-manifest roster size drift");
uniqueBy(artSources, ({ path }) => path, "DA source-manifest creature path");
assert.deepEqual(
  [...artSources].map(({ path }) => path).sort(),
  [...creatureByPath.keys()].sort(),
  "DA source manifest does not reconcile with creature lock",
);
const familyByPath = new Map(
  artSources.map(({ family, path }) => [path, family]),
);

const lockedAssets = new Map();
uniqueBy(lock.assets, ({ id }) => id, "portrait ID");
uniqueBy(lock.assets, ({ path }) => path, "portrait path");
for (const asset of lock.assets) lockedAssets.set(asset.id, asset);
uniqueBy(artManifest.entries, ({ id }) => id, "art-manifest portrait ID");
uniqueBy(
  artManifest.entries,
  ({ illustration }) => illustration,
  "art-manifest illustration path",
);
const portraitsById = new Map();
for (const entry of artManifest.entries) {
  const creature = creatureById.get(entry.id);
  assert(creature, `Artwork has no locked creature: ${entry.id}`);
  assert.equal(entry.source, creature.path, `Artwork source drift: ${entry.id}`);
  assert(entry.provenance, `Missing artwork provenance: ${entry.id}`);
  assert(entry.prompt_id, `Missing artwork prompt ID: ${entry.id}`);
  assert(
    entry.status === "existing" || entry.status === "generated",
    `Unknown artwork status: ${entry.id}`,
  );
  assert(entry.width > 0 && entry.height > 0, `Invalid artwork dimensions: ${entry.id}`);
  assert.equal(typeof entry.alpha, "boolean", `Invalid artwork alpha: ${entry.id}`);
  const lockedAsset = lockedAssets.get(entry.id);
  assert(lockedAsset, `Artwork is absent from source lock: ${entry.id}`);
  assert.deepEqual(
    {
      path: entry.illustration,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      alpha: entry.alpha,
      provenance: entry.provenance,
    },
    {
      path: lockedAsset.path,
      sha256: lockedAsset.sha256,
      width: lockedAsset.width,
      height: lockedAsset.height,
      alpha: lockedAsset.alpha,
      provenance: lockedAsset.provenance,
    },
    `Artwork metadata drift: ${entry.id}`,
  );
  verifySourceHash(
    { path: entry.illustration, sha256: entry.sha256 },
    gitBlob(entry.illustration),
  );
  portraitsById.set(entry.id, {
    id: entry.id,
    name: entry.name,
    path: entry.illustration,
    sha256: entry.sha256,
    width: entry.width,
    height: entry.height,
    alpha: entry.alpha,
    status: entry.status,
    promptId: entry.prompt_id,
    provenance: entry.provenance,
    generatedSource: entry.generated_source,
  });
}
assert.equal(portraitsById.size, creatures.length, "Portrait/creature mismatch");

const summonRecordsByPath = new Map();
for (const summon of summons) {
  const text = verifySourceHash(summon, gitBlob(summon.path)).toString("utf8");
  assert.match(text, /Weak attack/, `Missing attacker Weak outcome: ${summon.path}`);
  assert.match(
    text,
    /Strong attack/,
    `Missing attacker Strong outcome: ${summon.path}`,
  );
  assert.match(text, /cannot be healed/, `Missing healing limit: ${summon.path}`);
  assert.match(text, /no Reactions/i, `Missing Reaction limit: ${summon.path}`);
  const links = [...text.matchAll(/\[DA creature card\]\(\.\.\/creatures\/([^)]+)\)/g)];
  assert.equal(links.length, 1, `Missing or duplicate creature link: ${summon.path}`);
  const creaturePath = `design/bestiary/creatures/${links[0][1]}`;
  const creature = creatureByPath.get(creaturePath);
  assert(creature, `Summon profile has missing creature: ${summon.path}`);
  summonRecordsByPath.set(summon.path, {
    ...summon,
    creatureId: creature.id,
  });
}

uniqueBy(lock.summonLinks, ({ id }) => id, "summon link ID");
uniqueBy(lock.summonLinks, ({ path }) => path, "summon link source path");
uniqueBy(lock.summonLinks, ({ creatureId }) => creatureId, "summon creature link");
const summonLinkByCreature = new Map();
const summonLinks = lock.summonLinks
  .map((link) => {
    assert(creatureById.has(link.creatureId), `Missing summon creature: ${link.id}`);
    assert.equal(link.perspective, "attacker", `Unknown summon perspective: ${link.id}`);
    assert.match(link.eligibility, /^[A-Za-z]+ [137]$/);
    const source = summonRecordsByPath.get(link.path);
    assert(source, `Missing locked summon source: ${link.path}`);
    assert.equal(
      source.creatureId,
      link.creatureId,
      `Summon source/link creature mismatch: ${link.id}`,
    );
    const enriched = {
      id: link.id,
      kind: "summon-link",
      creatureId: link.creatureId,
      eligibility: link.eligibility,
      perspective: link.perspective,
      profileImported: true,
      referenceCatalog: "static/data/summons.json",
      source: {
        commit: lock.commit,
        path: link.path,
        sha256: source.sha256,
      },
    };
    summonLinkByCreature.set(link.creatureId, enriched);
    return enriched;
  })
  .sort(byStableId);

const abilityRecords = monsters.map((monster) => {
  const text = verifySourceHash(monster, gitBlob(monster.path)).toString("utf8");
  return parseMonsterAbility(monster, text, lock.commit);
});

const creatureTexts = new Map();
for (const creature of creatures) {
  creatureTexts.set(
    creature.path,
    verifySourceHash(creature, gitBlob(creature.path)).toString("utf8"),
  );
}

const parsedCreatures = creatures
  .map((creature) =>
    parseCreature(creature, creatureTexts.get(creature.path), {
      commit: lock.commit,
      family: familyByPath.get(creature.path),
      portrait: portraitsById.get(creature.id),
      summonLink: summonLinkByCreature.get(creature.id),
      abilityRecords,
    }),
  )
  .sort(byStableId);

uniqueBy(parsedCreatures, ({ id }) => id, "catalog creature ID");
uniqueBy(parsedCreatures, ({ foundryId }) => foundryId, "catalog Foundry ID");
assert.deepEqual(
  parsedCreatures.map(({ id }) => id).sort(),
  creatures.map(({ id }) => id).sort(),
  "Parsed creature roster does not reconcile with source lock",
);

const summary = summarizeCreatureCatalog(parsedCreatures, summonLinks);
const catalog = {
  schemaVersion: 1,
  source: {
    repository: lock.repository,
    commit: lock.commit,
    lockSchemaVersion: lock.schemaVersion,
    approval: lock.approval,
  },
  orientation: {
    creatureActionTables: "player-defense",
    summonProfiles: "attacker; referenced separately and not imported",
  },
  rights: {
    distribution: "undecided",
    artwork:
      "reference metadata and provenance only; no artwork binary or license is inferred",
  },
  coverage: {
    sourceIntake: "complete",
    requiredStats: "structured",
    actionTables: "complete; player-defense columns preserved",
    detailProse: "complete authored Markdown preserved",
    specialtyMechanics: "reference-only; native automation pending",
    nativeAutomation: "pending",
  },
  counts: {
    ...summary,
    monsterAbilitiesVerified: abilityRecords.length,
  },
  summonLinks,
  monsterAbilities: abilityRecords,
  creatures: parsedCreatures,
};

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
const output = new URL("static/data/creatures.json", root);
if (process.argv.includes("--check")) {
  assert.equal(
    await readFile(output, "utf8"),
    serialized,
    "Creature catalog drift",
  );
} else {
  await writeFile(output, serialized);
}
console.info(
  `Verified ${summary.creatures} creatures, ${summary.mainActions} main actions, ${summary.portraits} portraits, ${summary.summonLinks} summon links and ${abilityRecords.length} monster abilities at ${lock.commit}`,
);
