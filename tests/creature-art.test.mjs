import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  formatCreatureArtReport,
  readWebpInfo,
  validateCreatureArt,
} from "../scripts/creature-art.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const artRoot = new URL("../static/", import.meta.url);
const artDirectory = new URL("../static/assets/creatures/", import.meta.url);
// Independent 2x1 lossless fixtures, embedded so tests never touch runtime art.
const losslessFixtures = [
  {
    encoded: "UklGRiAAAABXRUJQVlA4TBQAAAAvAQAAAA9wCo8reNRj/oNDBSL6Hw==",
    alpha: false,
    mode: "RGB",
    decodedAlpha: null,
  },
  {
    encoded: "UklGRh4AAABXRUJQVlA4TBIAAAAvAQAAEA8wFKMwHvMf8MiI/gc=",
    alpha: true,
    mode: "RGBA",
    decodedAlpha: [0, 255],
  },
];

function webpChunk(type, payload) {
  const bytes = Buffer.from(payload);
  const chunk = Buffer.alloc(8 + bytes.length + (bytes.length % 2));
  chunk.write(type, 0, "ascii");
  chunk.writeUInt32LE(bytes.length, 4);
  bytes.copy(chunk, 8);
  return chunk;
}

function riffWebp(...chunks) {
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hol-creature-art-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(artDirectory, join(directory, "assets/creatures"), {
    recursive: true,
  });
  return new URL(`file://${directory}/`);
}

test("pinned source lock and runtime manifest cover every portrait deterministically", async () => {
  const lock = JSON.parse(
    await readFile(new URL("content/source-lock.json", root), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", artDirectory), "utf8"),
  );
  assert.equal(manifest.source.commit, lock.commit);
  assert.equal(manifest.source.lockSha256, createHash("sha256")
    .update(await readFile(new URL("content/source-lock.json", root)))
    .digest("hex"));
  assert.deepEqual(manifest.summary, {
    portraitMappings: 192,
    uniqueAssets: 192,
  });
  assert.deepEqual(
    manifest.portraits.map(({ id, sourcePath, sourceSha256, width, height, alpha }) => ({
      id,
      sourcePath,
      sourceSha256,
      width,
      height,
      alpha,
    })),
    [...lock.assets]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .map(({ id, path: sourcePath, sha256: sourceSha256, width, height, alpha }) => ({
        id,
        sourcePath,
        sourceSha256,
        width,
        height,
        alpha,
      })),
  );
  for (const portrait of manifest.portraits)
    assert.equal(
      portrait.asset,
      `assets/creatures/${portrait.sourceSha256}.webp`,
    );
  assert.deepEqual(
    new Set(manifest.portraits.map((portrait) => portrait.asset)),
    new Set(manifest.assets.map((asset) => asset.runtimePath)),
  );
  assert.equal(manifest.rights.distributionLicense, "undecided");
  const report = await validateCreatureArt(artRoot);
  assert.equal(report.mappings, 192);
  assert.equal(report.assets, 192);
  assert.equal(report.totalBytes, manifest.report.totalBytes);
  assert.match(formatCreatureArtReport(report), /192 portrait mappings/);
});

test("Pillow decodes every derivative and preserves native dimensions and alpha", async () => {
  const python = process.env.PYTHON ?? "python3";
  const { stdout } = await execFileAsync(
    python,
    [fileURLToPath(new URL("scripts/build-creature-art.py", root)), "--check"],
    { cwd: fileURLToPath(root) },
  );
  assert.match(stdout, /Built|Validated creature art/);
  assert.match(stdout, /192 portrait mappings -> 192 unique WebP assets/);
});

test("Pillow decoder version may differ from immutable encoder provenance", async () => {
  const python = process.env.PYTHON ?? "python3";
  const verifier = `
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

script = Path(sys.argv[1])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("build_creature_art", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

manifest = json.loads(module.MANIFEST_PATH.read_text(encoding="utf-8"))
assert manifest["encoding"]["libraries"] == {
    "pillow": "12.1.1",
    "webp": "1.5.0",
}

module.Image.__version__ = "99.0.0"
real_check = module.features.check
real_version = module.features.version
module.features.check = lambda feature: (
    True if feature == "webp" else real_check(feature)
)
module.features.version = lambda feature: (
    "1.6.0" if feature == "webp" else real_version(feature)
)

report = module.validate_artifacts()
assert report["mappings"] == 192
assert report["assets"] == 192
assert module.features.version("webp") == "1.6.0"


def assert_rejected(libraries, expected_error):
    drifted = json.loads(module.MANIFEST_PATH.read_text(encoding="utf-8"))
    drifted["encoding"]["libraries"] = libraries
    drifted_path = Path(directory) / "manifest.json"
    drifted_path.write_bytes(module.manifest_bytes(drifted))
    module.MANIFEST_PATH = drifted_path
    try:
        module.validate_artifacts()
    except module.ArtError as error:
        assert str(error) == expected_error, error
    else:
        raise AssertionError(f"invalid encoder provenance was accepted: {libraries}")


with tempfile.TemporaryDirectory() as directory:
    assert_rejected(
        {"pillow": "12.1.1", "webp": "1.6.0"},
        "WebP encoder version is not pinned",
    )
    assert_rejected(
        {"pillow": "99.0.0", "webp": "1.5.0"},
        "Pillow encoder version is not pinned",
    )
    assert_rejected(
        {"pillow": "12.1.1", "webp": "1.5.0", "extra": "unexpected"},
        "Creature-art encoder provenance is invalid",
    )
    assert_rejected(
        {"pillow": "12.1.1"},
        "Creature-art encoder provenance is invalid",
    )

print("validated with WebP decoder 1.6.0; encoder provenance remains 1.5.0")
`.trim();

  const { stdout } = await execFileAsync(python, [
    "-c",
    verifier,
    fileURLToPath(new URL("scripts/build-creature-art.py", root)),
  ]);
  assert.match(
    stdout,
    /WebP decoder 1\.6\.0; encoder provenance remains 1\.5\.0/,
  );
});

test("VP8L header metadata and Pillow decoding cover opaque and alpha images", async () => {
  const python = process.env.PYTHON ?? "python3";
  const decoder = `
import json
import sys
from base64 import b64decode
from io import BytesIO
from PIL import Image

facts = []
for encoded in sys.argv[1:]:
    with Image.open(BytesIO(b64decode(encoded))) as image:
        image.load()
        alpha = (
            list(image.getchannel("A").getextrema())
            if "A" in image.getbands()
            else None
        )
        facts.append({
            "format": image.format,
            "size": list(image.size),
            "mode": image.mode,
            "alpha": alpha,
        })
print(json.dumps(facts))
`.trim();

  for (const fixture of losslessFixtures) {
    const bytes = Buffer.from(fixture.encoded, "base64");
    assert.deepEqual(readWebpInfo(bytes), {
      width: 2,
      height: 1,
      alpha: fixture.alpha,
    });
  }

  const { stdout } = await execFileAsync(python, [
    "-c",
    decoder,
    ...losslessFixtures.map(({ encoded }) => encoded),
  ]);
  assert.deepEqual(
    JSON.parse(stdout),
    losslessFixtures.map((fixture) => ({
      format: "WEBP",
      size: [2, 1],
      mode: fixture.mode,
      alpha: fixture.decodedAlpha,
    })),
  );
});

test("WebP metadata requires an image payload beyond feature headers", () => {
  const featureHeaderOnly = riffWebp(
    webpChunk("VP8X", Buffer.from("10000000000000000000", "hex")),
  );
  assert.throws(
    () => readWebpInfo(featureHeaderOnly),
    /WebP image chunk is missing/,
  );

  const losslessHeaderOnly = riffWebp(
    webpChunk("VP8L", Buffer.from("2f01000000", "hex")),
    webpChunk("JUNK", Buffer.alloc(4)),
  );
  assert.throws(
    () => readWebpInfo(losslessHeaderOnly),
    /Truncated lossless WebP image/,
  );
});

test("release validator rejects hash drift, missing assets, extras and masters", async (t) => {
  const directory = await fixture(t);
  const manifest = JSON.parse(
    await readFile(new URL("assets/creatures/manifest.json", directory), "utf8"),
  );
  const first = manifest.assets[0].runtimePath;
  const firstPath = new URL(first, directory);
  const original = await readFile(firstPath);

  await t.test("hash mismatch", async () => {
    const changed = Buffer.from(original);
    changed[changed.length - 1] ^= 0xff;
    await writeFile(firstPath, changed);
    await assert.rejects(
      validateCreatureArt(directory),
      /Derived asset hash mismatch/,
    );
    await writeFile(firstPath, original);
  });

  await t.test("missing asset", async () => {
    const moved = new URL(`${first}.missing`, directory);
    await rename(firstPath, moved);
    await assert.rejects(
      validateCreatureArt(directory),
      /Missing creature art asset/,
    );
    await rename(moved, firstPath);
  });

  await t.test("extra asset", async () => {
    const orphan = new URL("assets/creatures/orphan.webp", directory);
    await writeFile(orphan, original);
    await assert.rejects(
      validateCreatureArt(directory),
      /Unexpected creature art asset/,
    );
    await rm(orphan);
  });

  await t.test("master exclusion", async () => {
    const master = new URL("assets/creatures/master.png", directory);
    await writeFile(master, original);
    await assert.rejects(
      validateCreatureArt(directory),
      /Master or reference image must not ship/,
    );
    await rm(master);
  });
});
