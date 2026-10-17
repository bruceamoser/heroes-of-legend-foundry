import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { parseWounds } from "./content/wounds.mjs";
const repository = process.env.HOL_BOOK_REPOSITORY;
if (!repository) throw new Error("Set HOL_BOOK_REPOSITORY.");
const lock = JSON.parse(
  await readFile(
    new URL("../content/source-lock.json", import.meta.url),
    "utf8",
  ),
);
const source = lock.records.find((r) => r.path === "design/rules/wounds.md");
const bytes = execFileSync("git", [
  "-C",
  repository,
  "show",
  `${lock.commit}:${source.path}`,
]);
assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
const records = parseWounds(bytes.toString(), source);
const serialized =
    JSON.stringify(
      { schemaVersion: 1, sourceCommit: lock.commit, records },
      null,
      2,
    ) + "\n",
  output = new URL("../static/data/wounds.json", import.meta.url);
if (process.argv.includes("--check"))
  assert.equal(
    await readFile(output, "utf8"),
    serialized,
    "Wound catalog drift",
  );
else await writeFile(output, serialized);
console.info(`Verified ${records.length} wound entries with typed effects.`);
