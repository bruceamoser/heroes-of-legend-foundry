import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseForge } from "./content/forge.mjs";

const repository = process.env.HOL_BOOK_REPOSITORY;
if (!repository)
  throw new Error("Set HOL_BOOK_REPOSITORY to the rulebook checkout");

const lockPath = new URL("../content/forge-source-lock.json", import.meta.url);
const outputPath = new URL("../static/data/forge.json", import.meta.url);
const { commit, records } = JSON.parse(await readFile(lockPath, "utf8"));
assert.match(commit, /^[a-f0-9]{40}$/);
const hashes = new Map();
const git = (...args) =>
  execFileSync("git", ["-C", repository, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
const read = (path) => {
  const blob = git("show", `${commit}:${path}`);
  hashes.set(path, createHash("sha256").update(blob).digest("hex"));
  return blob.toString("utf8").replaceAll("\r\n", "\n");
};
const list = (dir) =>
  git("ls-tree", "-r", "--name-only", commit, "--", `${dir}/`)
    .toString("utf8")
    .trim()
    .split("\n")
    .filter((path) => path.endsWith(".md"));
const catalog = parseForge(read, list, commit);
const sourceRecords = Object.fromEntries(
  [...hashes.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
const check = process.argv.includes("--check");
if (process.argv.includes("--refresh-lock")) {
  assert.ok(!check, "--refresh-lock cannot be combined with --check");
  await writeFile(
    lockPath,
    JSON.stringify({ commit, records: sourceRecords }, null, 2) + "\n",
  );
} else
  assert.deepEqual(sourceRecords, records, "Forge rulebook source lock drift");
const serialized = JSON.stringify(catalog, null, 2) + "\n";
if (check)
  assert.equal(
    await readFile(outputPath, "utf8"),
    serialized,
    "Forge catalog drift",
  );
else await writeFile(outputPath, serialized);
console.info(
  `Verified Forge catalog: ${catalog.disciplines.length} disciplines, ${catalog.spells.length} spells, and ${catalog.nodes.filter((node) => node.kind === "combined").length} combined abilities.`,
);
