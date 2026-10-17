import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {
  parseSummon,
  summarizeSummonCatalog,
  verifySourceHash,
} from "./content/summons.mjs";

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

const summons = lock.records.filter((record) =>
  record.path.startsWith("design/bestiary/summons/"),
);
assert.equal(summons.length, lock.counts.summons, "Summon count drift");
assert.equal(summons.length, 73, "Unexpected summon roster size");
uniqueBy(summons, ({ path }) => path, "summon source path");
assert.deepEqual(
  gitPaths("design/bestiary/summons"),
  summons.map(({ path }) => path).sort(),
  "Git summon roster does not reconcile with source lock",
);

uniqueBy(lock.summonLinks, ({ id }) => id, "summon link ID");
uniqueBy(lock.summonLinks, ({ path }) => path, "summon link source path");
uniqueBy(
  lock.summonLinks,
  ({ creatureId }) => creatureId,
  "summon creature link",
);
assert.equal(lock.summonLinks.length, 73, "Unexpected summon-link roster size");

const creatures = lock.records.filter((record) =>
  record.path.startsWith("design/bestiary/creatures/"),
);
const creaturesById = new Map();
for (const creature of creatures) {
  assert(creature.id, `Creature has no stable ID: ${creature.path}`);
  assert(
    !creaturesById.has(creature.id),
    `Duplicate creature ID: ${creature.id}`,
  );
  creaturesById.set(creature.id, creature);
}

const rulesRecord = recordsByPath.get("design/rules/summoning.md");
assert(rulesRecord, "Missing locked summoning rules");
const rulesBytes = verifySourceHash(
  rulesRecord,
  gitBlob(rulesRecord.path),
);
assert(rulesBytes.length > 0, "Summoning rules source is empty");

const parsed = [];
for (const link of lock.summonLinks) {
  assert.equal(link.perspective, "attacker", `Unknown perspective: ${link.id}`);
  assert.match(link.eligibility, /^[A-Za-z]+ [137]$/);
  const source = recordsByPath.get(link.path);
  assert(source, `Missing locked summon source: ${link.path}`);
  const creature = creaturesById.get(link.creatureId);
  assert(creature, `Missing linked creature: ${link.creatureId}`);
  const bytes = verifySourceHash(source, gitBlob(source.path));
  verifySourceHash(creature, gitBlob(creature.path));
  parsed.push(
    parseSummon(source, bytes.toString("utf8"), {
      repository: lock.repository,
      commit: lock.commit,
      link,
      creature,
      rules: rulesRecord,
    }),
  );
}

parsed.sort(byStableId);
const summary = summarizeSummonCatalog(parsed);
assert.deepEqual(
  parsed.map(({ id }) => id).sort(),
  lock.summonLinks.map(({ id }) => id).sort(),
  "Parsed summon roster does not reconcile with source lock",
);
assert.deepEqual(
  parsed.map(({ source: { path } }) => path).sort(),
  summons.map(({ path }) => path).sort(),
  "Parsed summon sources do not reconcile with locked sources",
);
assert.deepEqual(
  parsed.map(({ creatureId }) => creatureId).sort(),
  lock.summonLinks.map(({ creatureId }) => creatureId).sort(),
  "Parsed summon creature links do not reconcile with source lock",
);

const catalog = {
  schemaVersion: 1,
  kind: "summon-profile-reference-catalog",
  source: {
    repository: lock.repository,
    commit: lock.commit,
    lockSchemaVersion: lock.schemaVersion,
    approval: lock.approval,
  },
  orientation: {
    summonAttackTables: "attacker",
    creatureAttackTables: "player-defense",
    rule: "preserve each source orientation; never reverse DA values heuristically",
  },
  rights: {
    distribution: "undecided",
    artwork:
      "no artwork is copied; profile records link to the pinned creature reference",
  },
  coverage: {
    sourceIntake: "complete",
    requiredStats: "structured",
    attackTables: "complete; attacker outcomes preserved",
    mitigation: "ordinary values typed; special prose preserved by reference",
    targetAndRiders: "complete authored prose; typed automation pending",
    commandControllerTetherHealing:
      "complete authored limitations and typed reference fields; native automation pending",
    nativeAutomation: "pending",
  },
  counts: {
    ...summary,
    summonSourcesVerified: summons.length,
    linkedCreatureSourcesVerified: parsed.length,
    summonRulesSourceVerified: 1,
  },
  records: parsed,
};

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
const output = new URL("static/data/summons.json", root);
if (process.argv.includes("--check")) {
  assert.equal(
    await readFile(output, "utf8"),
    serialized,
    "Summon catalog drift",
  );
} else {
  await writeFile(output, serialized);
}
console.info(
  `Verified ${summary.profiles} summon profiles, ${summary.attackRows} attacker attack rows, ${summary.attackDetails} target/rider details, ${summary.maneuvers} maneuvers, ${summary.passives} passives and ${summary.offensiveHealingReferences} offensive-healing references at ${lock.commit}`,
);
