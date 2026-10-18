import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  abilityItemSource,
  authoredItemDocument,
  equipmentItemSource,
  SYSTEM_ID,
} from "../../src/rules/item-construction.mjs";

export const ITEM_PACK_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: "abilities",
    label: "Heroes of Legend Abilities",
    type: "Item",
    path: "packs/abilities",
    directory: "abilities",
  }),
  Object.freeze({
    name: "equipment",
    label: "Heroes of Legend Equipment",
    type: "Item",
    path: "packs/equipment",
    directory: "equipment",
  }),
]);

export function stableFoundryId(catalogId, namespace = SYSTEM_ID) {
  if (
    typeof catalogId !== "string" ||
    !catalogId ||
    typeof namespace !== "string" ||
    !namespace
  )
    throw new Error("Stable content identity is invalid.");
  const id = createHash("sha256")
    .update(`${namespace}:${catalogId}`)
    .digest("hex")
    .slice(0, 16);
  if (!/^[a-f0-9]{16}$/.test(id))
    throw new Error(`Stable Foundry ID is invalid: ${id}`);
  return id;
}

export function validateStableCatalogIds(records, deriveId = stableFoundryId) {
  const byCatalog = new Set();
  const byFoundry = new Map();
  return records.map((record) => {
    if (typeof record?.id !== "string" || !record.id)
      throw new Error("Content record has no stable catalog ID.");
    if (byCatalog.has(record.id))
      throw new Error(`Duplicate stable catalog ID: ${record.id}`);
    byCatalog.add(record.id);
    const foundryId = deriveId(record.id);
    if (!/^[a-f0-9]{16}$/.test(foundryId))
      throw new Error(`Invalid stable Foundry ID for ${record.id}`);
    const collision = byFoundry.get(foundryId);
    if (collision)
      throw new Error(
        `Stable Foundry ID collision: ${collision} and ${record.id} both map to ${foundryId}`,
      );
    byFoundry.set(foundryId, record.id);
    if (record.foundryId !== undefined && record.foundryId !== foundryId)
      throw new Error(
        `Catalog Foundry ID drift for ${record.id}: expected ${foundryId}, found ${record.foundryId}`,
      );
    return { id: record.id, foundryId };
  });
}

function lockedSource(lock, record) {
  const source = lock.records.find(
    (candidate) => candidate.path === record.source?.path,
  );
  const lockedId =
    record.kind === "ability" ? record.id.slice("ability-".length) : record.id;
  if (
    !source ||
    source.id !== lockedId ||
    source.sha256 !== record.source?.sha256 ||
    typeof record.source.path !== "string"
  )
    throw new Error(`Content source is not in the pinned lock: ${record.id}`);
}

export function validateCatalogBasis({ choices, inventory, lock }) {
  if (lock?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(lock.commit))
    throw new Error("Content source lock is invalid.");
  if (choices?.schemaVersion !== 2 || inventory?.schemaVersion !== 1)
    throw new Error("Unsupported content catalog schema.");
  if (
    choices.sourceCommit !== lock.commit ||
    inventory.sourceCommit !== lock.commit
  )
    throw new Error(
      "Ability, equipment and source-lock revisions do not agree.",
    );
  const abilities = choices.records?.filter(
      (record) => record.kind === "ability",
    ),
    equipment = inventory.equipment;
  if (abilities?.length !== 419 || equipment?.length !== 44)
    throw new Error(
      `Expected 419 abilities and 44 equipment records; found ${abilities?.length ?? 0} and ${equipment?.length ?? 0}.`,
    );
  if (abilities.filter((record) => record.universal).length !== 18)
    throw new Error("Expected 18 universal ability references.");
  for (const record of [...abilities, ...equipment]) {
    if (
      typeof record.id !== "string" ||
      typeof record.name !== "string" ||
      !record.name ||
      record.automation !== "pending"
    )
      throw new Error(`Incomplete source-locked record: ${record.id}`);
    lockedSource(lock, record);
  }
  for (const record of abilities) {
    if (
      !Array.isArray(record.reference?.flavor) ||
      !record.reference.flavor.length ||
      !Array.isArray(record.reference.rules?.details) ||
      !Array.isArray(record.reference.rules?.body) ||
      !Array.isArray(record.reference.rules?.notes)
    )
      throw new Error(`Incomplete ability reference: ${record.id}`);
  }
  return { abilities, equipment };
}

function canonicalHash(documents) {
  return createHash("sha256").update(JSON.stringify(documents)).digest("hex");
}

function serializedDocument(document) {
  return JSON.stringify(document, null, 2) + "\n";
}

export function buildItemPackArtifacts({ choices, inventory, lock }) {
  const { abilities, equipment } = validateCatalogBasis({
    choices,
    inventory,
    lock,
  });
  const identities = validateStableCatalogIds([...abilities, ...equipment]);
  const identityByCatalog = new Map(
    identities.map(({ id, foundryId }) => [id, foundryId]),
  );
  const abilityDocuments = abilities
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map((record) =>
      authoredItemDocument(
        abilityItemSource(record, { sourceCommit: lock.commit }),
        identityByCatalog.get(record.id),
      ),
    );
  const equipmentDocuments = equipment
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map((record) =>
      authoredItemDocument(
        equipmentItemSource(record, { sourceCommit: lock.commit }),
        identityByCatalog.get(record.id),
      ),
    );
  const files = new Map();
  for (const document of abilityDocuments)
    files.set(
      `abilities/${document.flags[SYSTEM_ID].catalogId}.json`,
      serializedDocument(document),
    );
  for (const document of equipmentDocuments)
    files.set(
      `equipment/${document.system.catalogId}.json`,
      serializedDocument(document),
    );
  const index = {
    schemaVersion: 1,
    sourceCommit: lock.commit,
    catalogs: {
      choices: choices.schemaVersion,
      inventory: inventory.schemaVersion,
    },
    packs: [
      {
        name: "abilities",
        type: "Item",
        path: ITEM_PACK_DEFINITIONS[0].path,
        count: abilityDocuments.length,
        semanticSha256: canonicalHash(abilityDocuments),
      },
      {
        name: "equipment",
        type: "Item",
        path: ITEM_PACK_DEFINITIONS[1].path,
        count: equipmentDocuments.length,
        semanticSha256: canonicalHash(equipmentDocuments),
      },
    ],
  };
  files.set("index.json", serializedDocument(index));
  return {
    files,
    index,
    documents: {
      abilities: abilityDocuments,
      equipment: equipmentDocuments,
    },
  };
}

export async function readItemPackCatalogs(root) {
  const read = async (path) =>
    JSON.parse(await readFile(new URL(path, root), "utf8"));
  return {
    choices: await read("static/data/choices.json"),
    inventory: await read("static/data/inventory.json"),
    lock: await read("content/source-lock.json"),
  };
}

export async function verifyAuthoredItemPacks(root, artifacts) {
  const directory = new URL("content/packs/", root);
  const base = fileURLToPath(directory);
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const actual = new Set();
  const itemFiles = new Set(
    [...artifacts.files.keys()].filter(
      (path) => path.startsWith("abilities/") || path.startsWith("equipment/"),
    ),
  );
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const path = relative(base, entry.parentPath)
      .split("\\")
      .filter(Boolean)
      .concat(entry.name)
      .join("/");
    if (!path.startsWith("abilities/") && !path.startsWith("equipment/"))
      continue;
    if (!entry.name.endsWith(".json"))
      throw new Error(
        `Unexpected non-JSON authored pack file: ${entry.parentPath}/${entry.name}`,
      );
    actual.add(path);
  }
  for (const path of itemFiles) {
    const expected = artifacts.files.get(path);
    if (!actual.has(path))
      throw new Error(`Missing authored Item pack source: ${path}`);
    const content = await readFile(new URL(path, directory), "utf8");
    if (content !== expected)
      throw new Error(`Authored Item pack drift: ${path}`);
    actual.delete(path);
  }
  if (actual.size)
    throw new Error(
      `Unexpected authored Item pack sources: ${[...actual].sort().join(", ")}`,
    );
}
