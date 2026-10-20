import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { serveReleaseCandidates } from "../scripts/serve-release-candidate.mjs";
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
  assert.ok((await readFile(join(directory, "heroes-of-legend.zip"))).equals(first), "Rebuilt ZIP must be byte-identical");
  const manifest = JSON.parse(
    await readFile(join(directory, "system.json"), "utf8"),
  );
  assert.equal(manifest.version, metadata.version);
  assert.equal(manifest.download, releaseLinks(metadata.version).download);
  const service = await serveReleaseCandidates({ candidate: directory });
  try {
    const evidence = service.evidence[0];
    const localManifest = await fetch(evidence.manifest).then(response => response.json());
    assert.deepEqual({ ...localManifest, manifest: manifest.manifest, download: manifest.download }, manifest);
    assert.ok(Buffer.from(await fetch(localManifest.download).then(response => response.arrayBuffer())).equals(first), "Served ZIP must match packaged bytes");
    assert.equal(evidence.publicUrlsTested, false);
    assert.equal(evidence.zipBytes, first.length);
    assert.equal((await fetch(new URL("/candidate/../../package.json", evidence.manifest))).status, 404);
  } finally {
    await service.close();
  }
  await writeFile(join(directory, "SHA256SUMS"), "corrupted\n");
  await assert.rejects(serveReleaseCandidates({ candidate: directory }), /SHA256SUMS mismatch/);
  await assert.rejects(
    packageRelease({ ...opts, expectedVersion: "9.9.9" }),
    /versions differ/,
  );
});

test("release version stays synchronized across source metadata and lockfile", async () => {
  const files = await Promise.all(["package.json", "package-lock.json", "static/system.json"].map(path =>
    readFile(new URL(`../${path}`, import.meta.url), "utf8").then(JSON.parse)));
  const [metadata, lock, manifest] = files;
  assert.equal(lock.version, metadata.version);
  assert.equal(lock.packages[""].version, metadata.version);
  assert.equal(manifest.version, metadata.version);
  assert.equal(manifest.download, releaseLinks(metadata.version).download);
  assert.equal(manifest.manifest, releaseLinks(metadata.version).manifest);
});
