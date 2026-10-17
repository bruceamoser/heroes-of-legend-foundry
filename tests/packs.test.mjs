import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
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
