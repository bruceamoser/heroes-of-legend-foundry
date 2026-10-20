import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
test("all sheet portraits use small, traceable previews of the pinned creature art", async () => {
  const [art, source, creatures] = await Promise.all([
    read("../web/data/sheet-art.json"),
    read("../static/assets/creatures/manifest.json"),
    read("../static/data/creatures.json"),
  ]);
  assert.equal(art.sourceCommit, source.source.commit);
  assert.equal(art.sourceCommit, creatures.source.commit);
  assert.equal(art.records.length, creatures.creatures.length);
  assert.equal(new Set(art.records.map((r) => r.id)).size, art.records.length);
  assert(art.records.reduce((n, r) => n + r.bytes, 0) < 20_000_000);
  for (const r of art.records) {
    assert.equal(
      source.portraits.find((p) => p.id === r.id)?.sourceSha256,
      r.sourceSha256,
    );
    assert.match(r.asset, /^assets\/bestiary\/creature-[a-z0-9-]+\.webp$/);
    const bytes = await readFile(new URL("../web/" + r.asset, import.meta.url));
    assert.equal(bytes.length, r.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), r.sha256);
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
  }
});
