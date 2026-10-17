import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Read immutable Git objects, never the author's potentially changing checkout.
const repository = process.env.HOL_BOOK_REPOSITORY;
if (!repository)
  throw new Error("Set HOL_BOOK_REPOSITORY to the local book repository");
const commit = "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3";
const git = (...args) =>
  execFileSync("git", ["-C", repository, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
const read = (path) => git("show", `${commit}:${path}`);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const paths = git("ls-tree", "-r", "--name-only", commit)
  .toString()
  .trim()
  .split("\n");
const families = [
  "rules",
  "cards",
  "classes",
  "ancestries",
  "origins",
  "disciplines",
  "equipment",
  "recipes",
  "characters",
  "bestiary/creatures",
  "bestiary/summons",
  "monster-abilities",
  "player-book/manuscript",
  "da-book/manuscript",
];
const selected = paths.filter(
  (path) =>
    families.some((f) => path.startsWith(`design/${f}/`)) &&
    path.endsWith(".md"),
);
selected.push(
  ...[
    "development.md",
    "card-conventions.md",
    "market.md",
    "starting-coins.md",
    "player-book/decision-log.md",
    "player-book/recipe-presentation.json",
    "da-book/source-manifest.json",
    "bestiary/art/manifest.json",
    "bestiary/art/prompts.json",
  ].map((path) => `design/${path}`),
);
const texts = new Map();
const records = [...new Set(selected)].sort().map((path) => {
  const bytes = read(path);
  const text = bytes.toString();
  texts.set(path, text);
  const id = text.match(/\*\*ID:\*\*\s*([\w-]+)/)?.[1];
  return { path, sha256: hash(bytes), ...(id ? { id } : {}) };
});
const creatures = records.filter((r) =>
  r.path.startsWith("design/bestiary/creatures/"),
);
const summons = records.filter((r) =>
  r.path.startsWith("design/bestiary/summons/"),
);
const monsters = records.filter(
  (r) => r.path.startsWith("design/monster-abilities/") && r.id,
);
assert.equal(creatures.length, 192);
assert.equal(summons.length, 73);
assert.equal(monsters.length, 93);
assert(creatures.every((r) => r.id));
for (const creature of creatures)
  assert(
    texts
      .get(creature.path)
      .includes("Weak / Standard / Strong player defense"),
    `Unknown creature orientation ${creature.path}`,
  );
const book = JSON.parse(read("design/da-book/source-manifest.json"));
assert.deepEqual(
  new Set(book.families.flatMap((f) => f.sources).map((p) => `design/${p}`)),
  new Set(creatures.map((c) => c.path)),
  "DA roster mismatch",
);
const ids = records.filter((r) => r.id).map((r) => r.id);
assert.equal(new Set(ids).size, ids.length, "Duplicate authored IDs");
const manifest = JSON.parse(read("design/bestiary/art/manifest.json"));
assert.equal(manifest.entries.length, creatures.length);
assert.equal(new Set(manifest.entries.map((e) => e.id)).size, creatures.length);
assert.equal(
  new Set(manifest.entries.map((e) => e.illustration)).size,
  creatures.length,
);
const assets = manifest.entries
  .map((entry) => {
    assert(creatures.some((c) => c.id === entry.id && c.path === entry.source));
    assert.equal(
      hash(read(entry.illustration)),
      entry.sha256,
      `Artwork hash mismatch: ${entry.id}`,
    );
    assert(entry.alpha && entry.width > 0 && entry.height > 0);
    return {
      id: entry.id,
      path: entry.illustration,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      alpha: entry.alpha,
      provenance: entry.provenance,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id, "en"));
const summonLinks = summons.map((record) => {
  const text = texts.get(record.path);
  const filename = text.match(
    /\[DA creature card\]\(\.\.\/creatures\/([^)]*)\)/,
  )?.[1];
  const creature = creatures.find(
    (c) => c.path === `design/bestiary/creatures/${filename}`,
  );
  assert(creature, `Missing summon source ${record.path}`);
  const eligibility = text.match(/\*\*Eligibility:\*\* ([^\n]+)/)?.[1];
  assert(eligibility, `Missing eligibility ${record.path}`);
  assert(
    text.includes("Weak attack") && text.includes("Strong attack"),
    `Unknown summon orientation ${record.path}`,
  );
  assert(
    text.includes("cannot be healed") && /no Reactions/i.test(text),
    `Missing summon restrictions ${record.path}`,
  );
  assert(
    texts
      .get(creature.path)
      .includes("Weak / Standard / Strong player defense"),
    `Unknown creature orientation ${creature.path}`,
  );
  return {
    id: `summon-${creature.id.slice("creature-".length)}`,
    path: record.path,
    creatureId: creature.id,
    eligibility,
    perspective: "attacker",
  };
});
const lock = {
  schemaVersion: 1,
  repository: "https://github.com/bruceamoser/heroes-of-legend",
  commit,
  previousCommit: "9f1663f774164a014edcb879c50fcf02989d791b",
  approval:
    "Current approved two-book v16.1.0 baseline, 2026-10-17; source reconciliation in #72. Distribution licensing remains undecided.",
  counts: {
    creatures: creatures.length,
    monsterAbilities: monsters.length,
    summons: summons.length,
    portraits: assets.length,
  },
  records,
  assets,
  summonLinks,
};
const output = new URL("../content/source-lock.json", import.meta.url);
const serialized = JSON.stringify(lock, null, 2) + "\n";
if (process.argv.includes("--check"))
  assert.equal(await readFile(output, "utf8"), serialized, "Source lock drift");
else await writeFile(output, serialized);
console.info(
  `Verified ${records.length} source hashes, ${assets.length} portraits and ${summonLinks.length} summon links at ${commit}`,
);
