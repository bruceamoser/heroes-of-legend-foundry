import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { verifySourceHash } from "./content/choices.mjs";

const root = new URL("../", import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const lock = await load("content/source-lock.json");
const choices = await load("static/data/choices.json");
const inventory = await load("static/data/inventory.json");
const repository = process.env.HOL_BOOK_REPOSITORY ?? process.env.HOL_RULES_REPO;
if (!repository) throw new Error("Set HOL_BOOK_REPOSITORY or HOL_RULES_REPO");
assert.equal(choices.sourceCommit, lock.commit);
assert.equal(inventory.sourceCommit, lock.commit);
const records = {};
// Keep complete Markdown for origin/inventory references and the ancestry brief
// text, including ancestry narratives that also have structured catalog prose.
for (const record of [...choices.records.filter(record => record.kind !== "ability"), ...inventory.equipment, ...inventory.recipes]) {
  const source = lock.records.find(source => source.path === record.source.path);
  assert(source && source.sha256 === record.source.sha256, `Unpinned reference ${record.id}`);
  const bytes = execFileSync("git", ["-C", repository, "show", `${lock.commit}:${source.path}`]);
  records[record.id] = { markdown: verifySourceHash(source, bytes).toString(), source: record.source };
}
for (const name of ["vision", "ancestry-procedures"]) {
  const source = lock.records.find(source => source.path === `design/rules/${name}.md`);
  assert(source, `Missing shared reference ${name}`);
  const bytes = execFileSync("git", ["-C", repository, "show", `${lock.commit}:${source.path}`]);
  records[`rule-${name}`] = { markdown: verifySourceHash(source, bytes).toString(), source: { path: source.path, sha256: source.sha256 } };
}
const serialized = JSON.stringify({ sourceCommit: lock.commit, records }, null, 2) + "\n";
const output = new URL("web/data/references.json", root);
if (process.argv.includes("--check")) assert.equal(await readFile(output, "utf8"), serialized, "Web reference drift");
else await writeFile(output, serialized);
console.info(`Verified ${Object.keys(records).length} pinned web references.`);
