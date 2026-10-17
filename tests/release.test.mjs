import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { releaseLinks, packageRelease } from "../scripts/package-release.mjs";
test("release tag and version must agree; ZIP URL is immutable per version", () => {
  assert.throws(() => releaseLinks("1.2.3", "v1.2.4"), /tag/);
  assert.throws(() => releaseLinks("../bad"), /tag/);
  assert.equal(
    releaseLinks("1.2.3").download,
    "https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.2.3/heroes-of-legend.zip",
  );
});
test("release package round-trips and rebuilds byte-identically", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hol-release-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const metadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const opts = {
    source: fileURLToPath(new URL("../dist/heroes-of-legend", import.meta.url)),
    destination: directory,
    tag: `v${metadata.version}`,
    expectedVersion: metadata.version,
  };
  await packageRelease(opts);
  const first = await readFile(join(directory, "heroes-of-legend.zip"));
  await packageRelease(opts);
  assert.deepEqual(
    await readFile(join(directory, "heroes-of-legend.zip")),
    first,
  );
  const manifest = JSON.parse(
    await readFile(join(directory, "system.json"), "utf8"),
  );
  assert.equal(manifest.version, metadata.version);
  assert.equal(manifest.download, releaseLinks(metadata.version).download);
  await assert.rejects(
    packageRelease({ ...opts, expectedVersion: "9.9.9" }),
    /versions differ/,
  );
});
