import { createHash } from "node:crypto";
import { resolvePortraitMappings } from "./portrait-mapping.mjs";
import { buildSummonPackArtifacts, SUMMON_PACK_DEFINITION } from "./summon-packs.mjs";
import { readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCreaturePackArtifacts,
  CREATURE_PACK_DEFINITION,
} from "./creature-packs.mjs";
import {
  buildItemPackArtifacts,
  ITEM_PACK_DEFINITIONS,
} from "./item-packs.mjs";

export const CONTENT_PACK_DEFINITIONS = Object.freeze([
  ...ITEM_PACK_DEFINITIONS,
  CREATURE_PACK_DEFINITION,
  SUMMON_PACK_DEFINITION,
]);

function serializedDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function buildContentPackArtifacts({
  choices,
  inventory,
  creatures,
  summons,
  lock,
  art,
  lockSha256,
}) {
  const portraits = resolvePortraitMappings({ art, lock, lockSha256 });
  const items = buildItemPackArtifacts({ choices, inventory, lock });
  const actorArtifacts = buildCreaturePackArtifacts({
    catalog: creatures,
    lock,
    portraits,
  });
  const summonArtifacts = buildSummonPackArtifacts({ catalog: summons, lock, portraits });
  const files = new Map(
    [...items.files].filter(([path]) => path !== "index.json"),
  );
  for (const [path, content] of actorArtifacts.files) files.set(path, content);
  for (const [path, content] of summonArtifacts.files) files.set(path, content);
  const index = {
    schemaVersion: 1,
    sourceCommit: lock.commit,
    catalogs: {
      choices: choices.schemaVersion,
      inventory: inventory.schemaVersion,
      creatures: creatures.schemaVersion,
      summons: summons.schemaVersion,
    },
    packs: [...items.index.packs, actorArtifacts.pack, summonArtifacts.pack],
  };
  files.set("index.json", serializedDocument(index));
  return {
    files,
    index,
    documents: {
      ...items.documents,
      ...actorArtifacts.documents,
      ...summonArtifacts.documents,
    },
  };
}

export async function readContentPackCatalogs(root) {
  const read = async (path) =>
    JSON.parse(await readFile(new URL(path, root), "utf8"));
  const lockBytes = await readFile(new URL("content/source-lock.json", root));
  return {
    lockSha256: createHash("sha256").update(lockBytes).digest("hex"),
    art: await read("static/assets/creatures/manifest.json"),
    choices: await read("static/data/choices.json"),
    inventory: await read("static/data/inventory.json"),
    creatures: await read("static/data/creatures.json"),
    summons: await read("static/data/summons.json"),
    lock: await read("content/source-lock.json"),
  };
}

export async function verifyAuthoredContentPacks(root, artifacts) {
  const directory = new URL("content/packs/", root);
  const base = fileURLToPath(directory);
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const actual = new Set();
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith(".json"))
      throw new Error(
        `Unexpected non-JSON authored pack file: ${entry.parentPath}/${entry.name}`,
      );
    const path = relative(base, entry.parentPath)
      .split("\\")
      .filter(Boolean)
      .concat(entry.name)
      .join("/");
    actual.add(path);
  }
  for (const [path, expected] of artifacts.files) {
    if (!actual.has(path))
      throw new Error(`Missing authored content pack source: ${path}`);
    const content = await readFile(new URL(path, directory), "utf8");
    if (content !== expected)
      throw new Error(`Authored content pack drift: ${path}`);
    actual.delete(path);
  }
  if (actual.size)
    throw new Error(
      `Unexpected authored content pack sources: ${[...actual]
        .sort()
        .join(", ")}`,
    );
}
