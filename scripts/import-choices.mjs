import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  parseChoices,
  verifySourceHash,
} from "./content/choices.mjs";
function gitBlob(repository, commit, path) {
  const result = spawnSync(
    "git",
    ["-C", repository, "show", `${commit}:${path}`],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `Cannot read ${path} at ${commit}: ${result.error?.message ?? result.stderr?.toString() ?? "git failed"}`,
    );
  return result.stdout;
}
const repository = process.env.HOL_BOOK_REPOSITORY;
if (!repository) throw new Error("Set HOL_BOOK_REPOSITORY");
const lock = JSON.parse(
  await readFile(
    new URL("../content/source-lock.json", import.meta.url),
    "utf8",
  ),
);
const sources = lock.records
  .filter((r) =>
    /^design\/(cards|classes|origins|disciplines|ancestries)\//.test(r.path),
  )
  .map((r) => {
    const data = gitBlob(repository, lock.commit, r.path);
    return { ...r, text: verifySourceHash(r, data).toString() };
  });
const records = parseChoices(sources);
const catalog = {
  schemaVersion: 2,
  sourceCommit: lock.commit,
  scope:
    "ability reference text and learning metadata; action, acquisition and trait automation pending",
  records,
};
const output = new URL("../static/data/choices.json", import.meta.url);
const serialized = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check"))
  assert.equal(
    await readFile(output, "utf8"),
    serialized,
    "Choice catalog drift",
  );
else await writeFile(output, serialized);
console.info(
  "Verified choice records:",
  Object.fromEntries(
    [...new Set(records.map((r) => r.kind))].map((kind) => [
      kind,
      records.filter((r) => r.kind === kind).length,
    ]),
  ),
);
