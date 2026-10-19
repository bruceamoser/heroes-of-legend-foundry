import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const out = new URL("dist/workshop/", root);
const choices = JSON.parse(
  await readFile(new URL("static/data/choices.json", root)),
);
const inventory = JSON.parse(
  await readFile(new URL("static/data/inventory.json", root)),
);
const references = JSON.parse(
  await readFile(new URL("web/data/references.json", root)),
);
if (
  references.sourceCommit !== choices.sourceCommit ||
  inventory.sourceCommit !== choices.sourceCommit
)
  throw new Error(
    "Workshop references need to match the current catalog edition.",
  );
for (const record of [
  ...choices.records,
  ...inventory.equipment,
  ...inventory.recipes,
].filter((r) => !r.reference)) {
  const ref = references.records[record.id];
  if (
    !ref ||
    ref.source.path !== record.source.path ||
    ref.source.sha256 !== record.source.sha256 ||
    createHash("sha256").update(ref.markdown).digest("hex") !==
      record.source.sha256
  )
    throw new Error(
      `Workshop reference is missing or differs from its pinned source: ${record.id}`,
    );
}
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const [from, to] of [
  ["web/", ""],
  ["src/rules/", "rules/"],
  ["static/fonts/", "fonts/"],
])
  await cp(new URL(from, root), new URL(to, out), { recursive: true });
await mkdir(new URL("data/", out), { recursive: true });
for (const name of ["choices", "inventory", "wounds"])
  await cp(
    new URL(`static/data/${name}.json`, root),
    new URL(`data/${name}.json`, out),
  );
const fixtures = JSON.parse(
  await readFile(new URL("tests/fixtures/reference-heroes.json", root)),
);
// One book example with the default campaign languages, not users' character data.
await writeFile(
  new URL("data/example.json", out),
  JSON.stringify(fixtures.characters[0].draft),
);
await writeFile(new URL(".nojekyll", out), "");
console.info(
  "Built dist/workshop (shared rules and catalogs; no Foundry runtime).",
);
