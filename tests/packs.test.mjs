import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import {
  buildContentPackArtifacts,
  readContentPackCatalogs,
} from "../scripts/content/content-packs.mjs";
for (const [kind, filename] of [
  ["actors", "hero.json"],
  ["journal", "reference.json"],
]) {
  test(`official CLI preserves ${kind} document and embedded IDs through two round trips`, async (t) => {
    const temp = await mkdtemp(join(tmpdir(), "hol-pack-"));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const source = fileURLToPath(
      new URL(`./fixtures/packs/${kind}/`, import.meta.url),
    );
    const original = JSON.parse(await readFile(join(source, filename), "utf8"));
    await compilePack(source, join(temp, "pack"));
    await extractPack(join(temp, "pack"), join(temp, "unpacked"));
    const files = (await readdir(join(temp, "unpacked"))).filter((name) =>
      name.endsWith(".json"),
    );
    assert.equal(files.length, 1);
    assert.deepEqual(
      JSON.parse(await readFile(join(temp, "unpacked", files[0]), "utf8")),
      original,
    );
    await compilePack(join(temp, "unpacked"), join(temp, "repacked"));
    await extractPack(join(temp, "repacked"), join(temp, "again"));
    const again = (await readdir(join(temp, "again"))).filter((name) =>
      name.endsWith(".json"),
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(temp, "again", again[0]), "utf8")),
      original,
    );
  });
}

const root = new URL("../", import.meta.url);
const artifacts = buildContentPackArtifacts(
  await readContentPackCatalogs(root),
);

async function semanticPackDocuments(source) {
  const files = (await readdir(source)).filter((name) =>
    name.endsWith(".json"),
  );
  const documents = await Promise.all(
    files.map((name) => readFile(join(source, name), "utf8")),
  );
  return {
    count: files.length,
    documents: documents
      .map((text) => JSON.parse(text))
      .sort((a, b) => a._id.localeCompare(b._id)),
  };
}

for (const [name, documents] of Object.entries(artifacts.documents)) {
  test(`official CLI preserves all authored ${name} documents through two semantic round trips`, async (t) => {
    const temp = await mkdtemp(join(tmpdir(), `hol-${name}-pack-`));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const source = fileURLToPath(
        new URL(`../content/packs/${name}/`, import.meta.url),
      ),
      expected = documents
        .slice()
        .sort((a, b) => a._id.localeCompare(b._id));
    assert.equal(
      expected.length,
      { abilities: 350, equipment: 43, creatures: 192, summons: 73 }[name],
    );

    await compilePack(source, join(temp, "pack"));
    await extractPack(join(temp, "pack"), join(temp, "unpacked"));
    const first = await semanticPackDocuments(join(temp, "unpacked"));
    assert.equal(first.count, expected.length);
    assert.deepEqual(first.documents, expected);

    await compilePack(join(temp, "unpacked"), join(temp, "repacked"));
    await extractPack(join(temp, "repacked"), join(temp, "again"));
    const second = await semanticPackDocuments(join(temp, "again"));
    assert.equal(second.count, expected.length);
    assert.deepEqual(second.documents, expected);
  });
}
