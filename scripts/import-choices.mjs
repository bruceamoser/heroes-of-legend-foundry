import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { parseChoices } from "./content/choices.mjs";
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
    const data = execFileSync("git", [
      "-C",
      repository,
      "show",
      `${lock.commit}:${r.path}`,
    ]);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      r.sha256,
      `Source hash mismatch ${r.path}`,
    );
    return { ...r, text: data.toString() };
  });
const records = parseChoices(sources);
const catalog = {
  schemaVersion: 1,
  sourceCommit: lock.commit,
  scope: "learning metadata; action, acquisition and trait automation pending",
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
