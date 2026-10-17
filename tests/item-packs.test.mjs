import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  buildItemPackArtifacts,
  readItemPackCatalogs,
  stableFoundryId,
  validateCatalogBasis,
  validateStableCatalogIds,
  verifyAuthoredItemPacks,
} from "../scripts/content/item-packs.mjs";
import {
  abilityItemSource,
  abilityReferenceHtml,
  EQUIPMENT_AUTOMATION_LABEL,
  equipmentItemSource,
  escapeItemHtml,
  SYSTEM_ID,
} from "../src/rules/item-construction.mjs";

const root = new URL("../", import.meta.url);
const catalogs = await readItemPackCatalogs(root);
const artifacts = buildItemPackArtifacts(catalogs);
const abilityRecords = catalogs.choices.records
  .filter((record) => record.kind === "ability")
  .sort((a, b) => a.id.localeCompare(b.id, "en"));
const equipmentRecords = catalogs.inventory.equipment
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id, "en"));

function authoredStrings(reference) {
  return [
    ...reference.flavor,
    ...reference.rules.details.flatMap(({ label, value }) => [label, value]),
    ...reference.rules.body.flatMap((block) =>
      block.outcomes
        ? block.outcomes.flatMap(({ label, text }) => [label, text])
        : block.items
          ? block.items
          : [block.text],
    ),
    ...reference.rules.notes.flatMap(({ label, text }) => [
      ...(label ? [label] : []),
      text,
    ]),
  ];
}

test("all source-locked Items have deterministic namespaced IDs and exact provenance", () => {
  const { abilities, equipment } = artifacts.documents;
  assert.equal(abilities.length, 350);
  assert.equal(equipment.length, 43);
  assert.equal(artifacts.files.size, 394);
  assert.equal(artifacts.index.sourceCommit, catalogs.lock.commit);
  assert.deepEqual(artifacts.index.catalogs, {
    choices: 2,
    inventory: 1,
  });
  assert.deepEqual(
    artifacts.index.packs.map(({ name, count }) => [name, count]),
    [
      ["abilities", 350],
      ["equipment", 43],
    ],
  );
  const allIds = new Set();
  for (const [kind, documents, records] of [
    ["ability", abilities, abilityRecords],
    ["equipment", equipment, equipmentRecords],
  ]) {
    assert.equal(documents.length, records.length);
    for (const [index, document] of documents.entries()) {
      const record = records[index],
        flags = document.flags[SYSTEM_ID];
      assert.equal(document._key, `!items!${document._id}`);
      assert.equal(document._id, stableFoundryId(record.id));
      if (kind === "ability")
        assert.equal(document._id, record.foundryId);
      assert.equal(document.type, kind);
      assert.equal(document.name, record.name);
      assert.deepEqual(flags.source, record.source);
      assert.equal(flags.sourceCommit, catalogs.lock.commit);
      assert.equal(flags.catalogAutomation, "pending");
      assert.equal(flags.creationGrant, undefined);
      assert.equal(flags.grantKind, undefined);
      assert.equal(flags.acquisitionInstance, undefined);
      assert(
        document.system.description.startsWith(
          '<section class="hol-item-reference">',
        ),
      );
      assert(
        document.system.description.includes(
          `<strong>Automation:</strong> ${escapeItemHtml(flags.automationLabel)}`,
        ),
      );
      assert.deepEqual(document.effects, []);
      assert.equal(document.ownership.default, 0);
      assert(!allIds.has(document._id));
      allIds.add(document._id);
    }
  }
  assert.equal(allIds.size, 393);
  assert.deepEqual(
    abilities
      .filter(
        (document) =>
          abilityRecords.find(
            (record) =>
              record.id === document.flags[SYSTEM_ID].catalogId,
          ).universal,
      )
      .map((document) => document.flags[SYSTEM_ID].catalogId)
      .sort(),
    abilityRecords
      .filter((record) => record.universal)
      .map((record) => record.id)
      .sort(),
  );
});

test("ability HTML preserves every authored reference section as escaped plain text", () => {
  const record = abilityRecords.find(
      (candidate) => candidate.id === "ability-a-bough-for-the-fallen",
    ),
    document = artifacts.documents.abilities.find(
      (candidate) =>
        candidate.flags[SYSTEM_ID].catalogId === record.id,
    ),
    html = document.system.description;
  for (const text of authoredStrings(record.reference))
    assert(html.includes(escapeItemHtml(text)), text);
  assert(
    html.includes(
      `<strong>Automation:</strong> ${escapeItemHtml("Rules reference · play automation in progress")}`,
    ),
  );
  assert(html.includes("<h2>Rules</h2>"));
  assert(html.includes("<h3>Additional rulings</h3>"));
  assert(html.includes(catalogs.lock.commit));

  const payload = '<script data-payload="1">alert("rules")</script>',
    fixture = structuredClone(record);
  fixture.id = "ability-fixture-escaped-html";
  fixture.name = "Fixture";
  fixture.reference.flavor[0] = `Flavor ${payload}`;
  fixture.reference.rules.details[0].value = `Detail ${payload}`;
  fixture.reference.rules.body[0].text = `Body ${payload}`;
  const escaped = abilityReferenceHtml(fixture.reference, {
    source: fixture.source,
    sourceCommit: catalogs.lock.commit,
    automationLabel: `Label ${payload}`,
  });
  assert(!escaped.includes("<script"));
  assert(escaped.includes("&lt;script data-payload=&quot;1&quot;&gt;"));
});

test("automation labels credit only reviewed handlers; prose never supplies a handler", () => {
  const documents = artifacts.documents.abilities;
  const reviewed = documents.filter(
    (document) => document.flags[SYSTEM_ID].handler,
  );
  assert.deepEqual(
    reviewed
      .map((document) => [
        document.flags[SYSTEM_ID].catalogId,
        document.flags[SYSTEM_ID].handler,
      ])
      .sort(),
    [
      ["ability-defend", "defend-v1"],
      ["ability-shield-block", "shield-block-v1"],
    ],
  );
  for (const document of reviewed) {
    assert.equal(document.flags[SYSTEM_ID].automation, "reviewed");
    assert.equal(
      document.flags[SYSTEM_ID].automationLabel,
      "Reviewed native action · rules reference",
    );
  }
  for (const document of documents.filter(
    (candidate) => !candidate.flags[SYSTEM_ID].handler,
  )) {
    assert.equal(document.flags[SYSTEM_ID].automation, "pending");
    assert.equal(
      document.flags[SYSTEM_ID].automationLabel,
      "Rules reference · play automation in progress",
    );
  }
  for (const document of artifacts.documents.equipment) {
    assert.equal(document.flags[SYSTEM_ID].automation, "pending");
    assert.equal(
      document.flags[SYSTEM_ID].automationLabel,
      EQUIPMENT_AUTOMATION_LABEL,
    );
  }
});

test("equipment prototypes default to one unheld, unworn unit and preserve supply dice", () => {
  for (const document of artifacts.documents.equipment) {
    const record = equipmentRecords.find(
      (candidate) => candidate.id === document.system.catalogId,
    );
    assert.equal(document.system.quantity, 1);
    assert.equal(document.system.bulk, record.bulk);
    assert.equal(document.system.hands, 0);
    assert.equal(document.system.inventoryDie, record.inventoryDie ?? 0);
    assert.equal(document.system.held, false);
    assert.equal(document.system.worn, false);
  }
  const ammunition = artifacts.documents.equipment.find(
    (document) =>
      document.system.catalogId === "item-ammunition-bundle",
  );
  assert.equal(ammunition.system.inventoryDie, 8);
  assert(
    ammunition.system.description.includes(
      "<strong>Normal supply die:</strong> d8.",
    ),
  );
});

test("shared creation constructor adds grant provenance only when explicitly requested", () => {
  const record = abilityRecords.find(
      (candidate) => candidate.id === "ability-defend",
    ),
    imported = abilityItemSource(record, {
      sourceCommit: catalogs.lock.commit,
    }),
    granted = abilityItemSource(record, {
      sourceCommit: catalogs.lock.commit,
      creationGrant: true,
      grantKind: "creation",
    });
  assert.equal(imported.flags[SYSTEM_ID].creationGrant, undefined);
  assert.equal(granted.flags[SYSTEM_ID].creationGrant, true);
  assert.equal(granted.flags[SYSTEM_ID].grantKind, "creation");
  assert.deepEqual(granted.flags[SYSTEM_ID].source, record.source);
  assert.equal(granted.flags[SYSTEM_ID].handler, "defend-v1");

  const equipment = equipmentRecords.find(
      (candidate) => candidate.id === "item-ammunition-bundle",
    ),
    authored = equipmentItemSource(equipment, {
      sourceCommit: catalogs.lock.commit,
    }),
    created = equipmentItemSource(equipment, {
      sourceCommit: catalogs.lock.commit,
      creationGrant: true,
      grantKind: "creation",
      acquisitionInstance: "fixture-acquisition",
      quantity: 3,
      hands: 1,
      inventoryDie: 4,
      held: true,
      worn: true,
    });
  const { description, ...authoredDefaults } = authored.system;
  assert(description.startsWith('<section class="hol-item-reference">'));
  assert.deepEqual(authoredDefaults, {
    schemaVersion: 1,
    catalogId: equipment.id,
    quantity: 1,
    bulk: equipment.bulk,
    hands: 0,
    inventoryDie: 8,
    held: false,
    worn: false,
  });
  assert.equal(created.system.quantity, 3);
  assert.equal(created.system.hands, 1);
  assert.equal(created.system.inventoryDie, 4);
  assert.equal(created.system.held, true);
  assert.equal(created.system.worn, true);
  assert.equal(created.flags[SYSTEM_ID].creationGrant, true);
  assert.equal(
    created.flags[SYSTEM_ID].acquisitionInstance,
    "fixture-acquisition",
  );
});

test("stable ID generation rejects duplicate identities, hash collisions and catalog drift", () => {
  assert.throws(
    () => validateStableCatalogIds([{ id: "item-one" }, { id: "item-one" }]),
    /Duplicate stable catalog ID/,
  );
  assert.throws(
    () =>
      validateStableCatalogIds(
        [{ id: "item-one" }, { id: "item-two" }],
        (id) => stableFoundryId(id === "item-two" ? "item-one" : id),
      ),
    /Stable Foundry ID collision/,
  );
  assert.throws(
    () =>
      validateStableCatalogIds([
        { id: "item-one", foundryId: "0000000000000000" },
      ]),
    /Catalog Foundry ID drift/,
  );
});

test("all catalog revisions must match the source lock and pinned record hashes", () => {
  const changedChoices = structuredClone(catalogs.choices);
  changedChoices.sourceCommit = "f".repeat(40);
  assert.throws(
    () =>
      validateCatalogBasis({
        choices: changedChoices,
        inventory: catalogs.inventory,
        lock: catalogs.lock,
      }),
    /revisions do not agree/,
  );
  const changedInventory = structuredClone(catalogs.inventory);
  changedInventory.equipment[0].source.sha256 = "0".repeat(64);
  assert.throws(
    () =>
      validateCatalogBasis({
        choices: catalogs.choices,
        inventory: changedInventory,
        lock: catalogs.lock,
      }),
    /not in the pinned lock/,
  );
});

test("authored pack JSON is complete, deterministic and contains no compiled database", async () => {
  await verifyAuthoredItemPacks(root, artifacts);
  const rebuilt = buildItemPackArtifacts(structuredClone(catalogs));
  assert.deepEqual([...rebuilt.files], [...artifacts.files]);
  const directory = new URL("../content/packs/", import.meta.url),
    entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    }),
    files = entries.filter((entry) => entry.isFile());
  assert.equal(files.length, 394);
  assert(files.every((entry) => entry.name.endsWith(".json")));
  for (const forbidden of ["CURRENT", "LOCK", "LOG", "MANIFEST-000001"])
    assert(!files.some((entry) => entry.name === forbidden));
});

test("manifest declares native Item packs and sanitizes their rich descriptions", async () => {
  const manifest = JSON.parse(
      await readFile(new URL("../static/system.json", import.meta.url), "utf8"),
    ),
    templates = await Promise.all(
      ["ability", "equipment"].map((name) =>
        readFile(
          new URL(`../static/templates/${name}.hbs`, import.meta.url),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(manifest.packs, [
    {
      name: "abilities",
      label: "Heroes of Legend Abilities",
      type: "Item",
      path: "packs/abilities",
      system: "heroes-of-legend",
    },
    {
      name: "equipment",
      label: "Heroes of Legend Equipment",
      type: "Item",
      path: "packs/equipment",
      system: "heroes-of-legend",
    },
  ]);
  assert.deepEqual(manifest.documentTypes.Item, {
    ability: { htmlFields: ["description"] },
    equipment: { htmlFields: ["description"] },
  });
  for (const template of templates) {
    assert(template.includes("{{{descriptionHTML}}}"));
    assert(!template.includes("{{{system.description}}}"));
  }
});

test("reviewed actions retain their actual category and avoid an invented outcome roll", () => {
  for (const [id, category] of [["ability-defend", "maneuver"], ["ability-shield-block", "reaction"]]) {
    const item = artifacts.documents.abilities.find(i => i.flags[SYSTEM_ID].catalogId === id);
    assert.equal(item.system.activity.action, category);
    assert.equal(item.system.activity.rollMode, "none");
  }
});
