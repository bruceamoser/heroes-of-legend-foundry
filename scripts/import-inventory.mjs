import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const lock = await read("content/source-lock.json");
const reviewed = await read("content/acquisition-adapters.json");
const repository = process.env.HOL_BOOK_REPOSITORY;
assert(repository, "Set HOL_BOOK_REPOSITORY");
assert.equal(reviewed.sourceCommit, lock.commit);
const generic = [
  "bound-torches",
  "fletched-ammunition",
  "travel-food",
  "twisted-cord",
  "wooden-brace",
  "simple-replacement-leg",
];
const workshops = [
  "trail-workshop",
  "make-something-useful",
  "enchanting-workshop",
];
const mixing = [
  "bottled-morning",
  "smoke-in-a-bottle",
  "the-cleverest-mixture",
];
const supplies = {
  "ammunition-bundle": 8,
  "food-bundle": 8,
  "lighting-bundle": 6,
  "material-bundle": 6,
  "small-necessities": 6,
  "writing-kit": 6,
  "lesser-healing-bottle": 4,
  "greater-healing-bottle": 4,
  "superior-healing-bottle": 4,
  "clearing-tonic": 4,
  "smoke-supply": 4,
};
const recipes = {
  "bound-torches": { maximumDie: 6, product: "item-lighting-bundle" },
  "fletched-ammunition": { maximumDie: 8, product: "item-ammunition-bundle" },
  "travel-food": { maximumDie: 8, product: "item-food-bundle" },
  "twisted-cord": { target: 4, product: "item-rope-coil" },
  "wooden-brace": { target: 4, product: null },
  "simple-replacement-leg": { target: 8, product: null },
  "camp-shelter": {
    target: 4,
    product: null,
    permissions: ["a-roof-before-nightfall"],
  },
  "lesser-healing-bottle": {
    maximumDie: 4,
    product: "item-lesser-healing-bottle",
    permissions: ["bottled-morning"],
  },
  "smoke-flask": {
    maximumDie: 6,
    product: "item-smoke-supply",
    permissions: ["smoke-in-a-bottle"],
  },
  "clearing-tonic": {
    maximumDie: 4,
    product: "item-clearing-tonic",
    permissions: ["the-cleverest-mixture"],
  },
};
const equipment = [],
  recipeRecords = [];
for (const source of lock.records.filter((r) =>
  /^design\/(equipment|recipes|cards)\//.test(r.path),
)) {
  const bytes = execFileSync("git", [
    "-C",
    repository,
    "show",
    `${lock.commit}:${source.path}`,
  ]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
  const text = bytes.toString();
  if (source.path.startsWith("design/cards/")) {
    const adapter = reviewed.adapters.find(
      (a) => a.source.path === source.path,
    );
    assert(adapter, `Unreviewed acquisition: ${source.path}`);
    assert.equal(
      adapter.source.sha256,
      source.sha256,
      `Acquisition needs review: ${source.path}`,
    );
    continue;
  }
  const id = text.match(/\*\*ID:\*\* ([a-z0-9-]+)/)?.[1];
  const name = text.match(/^# (.+)/)?.[1];
  assert(id && name, source.path);
  const record = {
    id,
    name,
    source: { path: source.path, sha256: source.sha256 },
  };
  if (source.path.startsWith("design/equipment/")) {
    const bulk = Number(text.match(/\*\*Bulk:\*\* (\d+)/)?.[1]);
    const price = Number(text.match(/\*\*Market price:\*\* (\d+) coins/)?.[1]);
    assert(Number.isInteger(bulk) && Number.isInteger(price), source.path);
    const key = id.slice(5);
    equipment.push({
      ...record,
      bulk,
      price,
      specialOrder: text.includes("special-order benchmark"),
      inventoryDie: supplies[key] ?? null,
      handChoices:
        key === "ordinary-melee-weapon"
          ? [1, 2]
          : key === "ordinary-ranged-weapon"
            ? [2]
            : key === "ordinary-shield"
              ? [1]
              : [],
      automation: "pending",
    });
  } else {
    const key = id.slice(7),
      adapter = recipes[key];
    assert(adapter, `Unreviewed recipe ${id}`);
    const permissions = adapter.permissions ?? [
      ...workshops,
      ...(key === "travel-food" ? mixing : []),
    ];
    recipeRecords.push({
      ...record,
      ...adapter,
      permissions: permissions.map((id) => "ability-" + id),
      ordinary: true,
      genericChoice: generic.includes(key),
      attemptMinutes: 60,
      automation: "pending",
    });
  }
}
assert.equal(equipment.length, 43);
assert.equal(recipeRecords.length, 10);
assert.equal(reviewed.adapters.length, 350);
const output = {
  schemaVersion: 1,
  sourceCommit: lock.commit,
  equipment,
  recipes: recipeRecords,
  acquisitions: reviewed.adapters,
};
const serialized = JSON.stringify(output, null, 2) + "\n";
const path = new URL("static/data/inventory.json", root);
if (process.argv.includes("--check"))
  assert.equal(
    await readFile(path, "utf8"),
    serialized,
    "Inventory catalog drift",
  );
else await writeFile(path, serialized);
console.info(
  "Verified 43 equipment records, 10 recipes, 350 acquisition adapters.",
);
