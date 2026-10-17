import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = "assets/creatures/manifest.json";
const ART_PATH = "assets/creatures";
const RUNTIME_PREFIX = "assets/creatures";
const REPOSITORY_PREFIX = "static/assets/creatures";
const COMMIT = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const MASTER_OR_REFERENCE = /\.(?:png|jpe?g|tiff?|psd|xcf|avif)$/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function asText(bytes, encoding = "utf8") {
  return Buffer.from(bytes).toString(encoding);
}

function u24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readVp8Info(data, payload, size) {
  if (size <= 10) throw new Error("Truncated lossy WebP image");
  if (
    data[payload + 3] !== 0x9d ||
    data[payload + 4] !== 0x01 ||
    data[payload + 5] !== 0x2a
  )
    throw new Error("Invalid lossy WebP header");
  const width = data.readUInt16LE(payload + 6) & 0x3fff;
  const height = data.readUInt16LE(payload + 8) & 0x3fff;
  if (!width || !height) throw new Error("Invalid lossy WebP dimensions");
  return { width, height, alpha: false };
}

function readVp8lInfo(data, payload, size) {
  if (size <= 5) throw new Error("Truncated lossless WebP image");
  if (data[payload] !== 0x2f) throw new Error("Invalid lossless WebP header");
  const bits = data.readUInt32LE(payload + 1);
  if ((bits >>> 29) !== 0) throw new Error("Unsupported lossless WebP version");
  return {
    // 14-bit width, 14-bit height, alpha hint, then a 3-bit version.
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
    // alpha_is_used is a decoder-allocation hint, not proof about pixels.
    alpha: Boolean(bits & 0x10000000),
  };
}

/**
 * Read the native canvas and best-available alpha metadata from a static
 * RIFF/WebP container. This validates container boundaries and image headers,
 * not compressed pixel data. For VP8L, alpha_is_used is only a header hint;
 * Pillow's full decode remains the authoritative alpha check.
 */
export function readWebpInfo(bytes) {
  const data = Buffer.from(bytes);
  if (
    data.length < 30 ||
    asText(data.subarray(0, 4), "ascii") !== "RIFF" ||
    data.readUInt32LE(4) !== data.length - 8 ||
    asText(data.subarray(8, 12), "ascii") !== "WEBP"
  )
    throw new Error("Invalid WebP container");
  let extended;
  let image;
  let offset = 12;
  while (offset < data.length) {
    if (offset + 8 > data.length) throw new Error("Truncated WebP chunk");
    const type = asText(data.subarray(offset, offset + 4), "ascii");
    const size = data.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const paddedEnd = payload + size + (size % 2);
    if (paddedEnd > data.length) throw new Error("Truncated WebP chunk");
    if (type === "VP8X") {
      if (extended || image)
        throw new Error("Invalid WebP extended header ordering");
      if (size < 10) throw new Error("Invalid WebP extended header");
      const flags = data[payload];
      if (flags & 0x02) throw new Error("Animated WebP is not supported");
      extended = {
        width: u24le(data, payload + 4) + 1,
        height: u24le(data, payload + 7) + 1,
        alpha: Boolean(flags & 0x10),
      };
    } else if (type === "VP8L" || type === "VP8 ") {
      if (image) throw new Error("Multiple WebP image chunks");
      image =
        type === "VP8L"
          ? readVp8lInfo(data, payload, size)
          : readVp8Info(data, payload, size);
      if (
        extended &&
        (extended.width !== image.width || extended.height !== image.height)
      )
        throw new Error("WebP canvas and image dimensions differ");
    }
    offset = paddedEnd;
  }
  if (!image) throw new Error("WebP image chunk is missing");
  return {
    width: extended?.width ?? image.width,
    height: extended?.height ?? image.height,
    alpha: extended?.alpha ?? image.alpha,
  };
}

function assertSorted(items, key, label) {
  const sorted = [...items].sort((a, b) =>
    String(a[key]).localeCompare(String(b[key]), "en"),
  );
  if (JSON.stringify(items) !== JSON.stringify(sorted))
    throw new Error(`${label} are not sorted`);
}

function pathParts(path) {
  if (
    typeof path !== "string" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[%?#]/.test(path)
  )
    throw new Error(`Unsafe creature-art path: ${path}`);
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error(`Unsafe creature-art path: ${path}`);
  return parts;
}

async function collectArtFiles(root) {
  const directory = new URL(`${ART_PATH}/`, root);
  let entries;
  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`Creature art directory is missing: ${ART_PATH}`);
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = join(entry.parentPath, entry.name);
    const directoryPath = fileURLToPath(directory);
    const relative = absolute
      .slice(directoryPath.length)
      .replace(/^\/+/, "")
      .split("/")
      .join("/");
    if (entry.isSymbolicLink())
      throw new Error(`Symlink is not allowed in creature art: ${relative}`);
    if (entry.isDirectory()) continue;
    if (!entry.isFile())
      throw new Error(`Unsupported creature-art entry: ${relative}`);
    files.push(relative);
  }
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

export async function validateCreatureArt(root) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(new URL(MANIFEST_PATH, root), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`Creature art manifest is missing: ${MANIFEST_PATH}`);
    if (error instanceof SyntaxError)
      throw new Error(`Invalid creature-art manifest JSON: ${error.message}`);
    throw error;
  }

  if (manifest.schemaVersion !== 1)
    throw new Error("Unsupported creature-art manifest schema");
  if (!COMMIT.test(manifest.source?.commit ?? ""))
    throw new Error("Creature art source commit is invalid");
  if (!HASH.test(manifest.source?.lockSha256 ?? ""))
    throw new Error("Creature art source-lock hash is invalid");
  if (
    manifest.source?.access !== "git-blob" ||
    manifest.source?.lockPath !== "content/source-lock.json" ||
    manifest.source?.repository !==
      "https://github.com/bruceamoser/heroes-of-legend"
  )
    throw new Error("Creature art source provenance is invalid");
  if (manifest.rights?.distributionLicense !== "undecided")
    throw new Error("Creature-art rights status must remain undecided");
  const expectedEncoding = {
    format: "webp",
    quality: 85,
    method: 6,
    lossless: false,
    exact: true,
    alphaQuality: 100,
    nativeDimensions: true,
  };
  for (const [key, value] of Object.entries(expectedEncoding))
    if (manifest.encoding?.[key] !== value)
      throw new Error(`Unexpected creature-art encoding setting: ${key}`);
  if (
    manifest.encoding?.libraries?.pillow !== "12.1.1" ||
    manifest.encoding?.libraries?.webp !== "1.5.0"
  )
    throw new Error("Creature-art encoder versions are not pinned");

  const portraits = manifest.portraits;
  const assets = manifest.assets;
  if (!Array.isArray(portraits) || !Array.isArray(assets))
    throw new Error("Creature-art manifest is incomplete");
  assertSorted(portraits, "id", "Creature portrait mappings");
  assertSorted(assets, "runtimePath", "Creature art assets");

  const portraitIds = new Set();
  const assetPaths = new Set();
  const actualFiles = await collectArtFiles(root);
  const expectedFiles = ["manifest.json"];
  for (const asset of assets) {
    pathParts(asset.runtimePath);
    if (asset.runtimePath !==
      `${RUNTIME_PREFIX}/${asset.sourceSha256}.webp`)
      throw new Error(`Unstable creature asset path: ${asset.runtimePath}`);
    if (!HASH.test(asset.sourceSha256 ?? "") || !HASH.test(asset.sha256 ?? ""))
      throw new Error(`Invalid creature asset hash: ${asset.runtimePath}`);
    if (!Number.isInteger(asset.sourceBytes) || asset.sourceBytes <= 0)
      throw new Error(`Invalid creature source byte count: ${asset.runtimePath}`);
    if (
      asset.repositoryPath !==
      `static/${asset.runtimePath}`
    )
      throw new Error(`Repository/runtime path mismatch: ${asset.runtimePath}`);
    if (assetPaths.has(asset.runtimePath))
      throw new Error(`Duplicate creature asset: ${asset.runtimePath}`);
    assetPaths.add(asset.runtimePath);
    expectedFiles.push(asset.runtimePath.slice(`${RUNTIME_PREFIX}/`.length));
  }
  expectedFiles.sort((a, b) => a.localeCompare(b, "en"));
  const missing = expectedFiles.filter((path) => !actualFiles.includes(path));
  const extra = actualFiles.filter((path) => !expectedFiles.includes(path));
  for (const path of actualFiles)
    if (MASTER_OR_REFERENCE.test(path))
      throw new Error(`Master or reference image must not ship: ${path}`);
  if (missing.length)
    throw new Error(`Missing creature art asset: ${missing.join(", ")}`);
  if (extra.length)
    throw new Error(`Unexpected creature art asset: ${extra.join(", ")}`);

  const mappedAssets = new Map();
  for (const portrait of portraits) {
    if (portraitIds.has(portrait.id))
      throw new Error(`Duplicate portrait mapping: ${portrait.id}`);
    portraitIds.add(portrait.id);
    if (!assetPaths.has(portrait.asset))
      throw new Error(`Portrait references missing asset: ${portrait.id}`);
    const expectedAsset = `${RUNTIME_PREFIX}/${portrait.sourceSha256}.webp`;
    if (portrait.asset !== expectedAsset)
      throw new Error(`Portrait uses unstable asset path: ${portrait.id}`);
    if (
      !Number.isInteger(portrait.width) ||
      portrait.width <= 0 ||
      !Number.isInteger(portrait.height) ||
      portrait.height <= 0 ||
      typeof portrait.alpha !== "boolean" ||
      typeof portrait.provenance !== "string" ||
      !portrait.provenance
    )
      throw new Error(`Invalid portrait mapping: ${portrait.id}`);
    const list = mappedAssets.get(portrait.asset) ?? [];
    list.push(portrait);
    mappedAssets.set(portrait.asset, list);
  }

  let sourceBytes = 0;
  let totalBytes = 0;
  for (const asset of assets) {
    const file = new URL(`${asset.runtimePath}`, root);
    const info = await lstat(file);
    if (!info.isFile()) throw new Error(`Invalid creature asset: ${asset.runtimePath}`);
    const bytes = await readFile(file);
    if (bytes.length !== asset.bytes)
      throw new Error(`Derived asset byte count mismatch: ${asset.runtimePath}`);
    if (sha256(bytes) !== asset.sha256)
      throw new Error(`Derived asset hash mismatch: ${asset.runtimePath}`);
    const decoded = readWebpInfo(bytes);
    if (
      decoded.width !== asset.width ||
      decoded.height !== asset.height ||
      decoded.alpha !== asset.hasAlpha
    )
      throw new Error(`Derived asset metadata mismatch: ${asset.runtimePath}`);
    const mapped = mappedAssets.get(asset.runtimePath);
    if (!mapped?.length)
      throw new Error(`Unreferenced creature-art asset: ${asset.runtimePath}`);
    for (const portrait of mapped)
      if (
        portrait.width !== decoded.width ||
        portrait.height !== decoded.height ||
        portrait.alpha !== decoded.alpha
      )
        throw new Error(`Source/output dimensions differ: ${portrait.id}`);
    sourceBytes += asset.sourceBytes;
    totalBytes += bytes.length;
  }

  if (manifest.summary?.portraitMappings !== portraits.length)
    throw new Error("Creature-art portrait count is stale");
  if (manifest.summary?.uniqueAssets !== assets.length)
    throw new Error("Creature-art asset count is stale");
  if (manifest.report?.totalBytes !== totalBytes)
    throw new Error("Creature-art total byte report is stale");
  if (manifest.report?.sourceBytes !== sourceBytes)
    throw new Error("Creature-art source byte report is stale");
  const provenance = {};
  for (const portrait of portraits)
    provenance[portrait.provenance] =
      (provenance[portrait.provenance] ?? 0) + 1;
  const sortedProvenance = Object.fromEntries(
    Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b, "en")),
  );
  if (
    JSON.stringify(manifest.report?.mappingCountsByProvenance) !==
    JSON.stringify(sortedProvenance)
  )
    throw new Error("Creature-art provenance report is stale");

  return {
    mappings: portraits.length,
    assets: assets.length,
    totalBytes,
    sourceBytes: manifest.report.sourceBytes,
  };
}

export function formatCreatureArtReport(report) {
  return `${report.mappings} portrait mappings -> ${report.assets} unique WebP assets; ${report.totalBytes} runtime bytes from ${report.sourceBytes} pinned unique source bytes.`;
}
