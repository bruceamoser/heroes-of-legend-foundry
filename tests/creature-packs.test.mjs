import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  buildContentPackArtifacts,
  readContentPackCatalogs,
  verifyAuthoredContentPacks,
} from "../scripts/content/content-packs.mjs";
import {
  CREATURE_AUTOMATION_LABEL,
  CREATURE_FALLBACK_IMAGE,
  creatureReferenceMarkdown,
} from "../scripts/content/creature-packs.mjs";
import { stableFoundryId } from "../scripts/content/item-packs.mjs";
import { SYSTEM_ID } from "../src/rules/item-construction.mjs";
import {
  creatureReferenceHtml,
  creatureModifierLabel,
} from "../src/sheets/creature-reference.mjs";

const root = new URL("../", import.meta.url);
const catalogs = await readContentPackCatalogs(root);
const artifacts = buildContentPackArtifacts(catalogs);
const creatures = catalogs.creatures.creatures
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id, "en"));
const actorByCatalogId = new Map(
  artifacts.documents.creatures.map((document) => [
    document.flags[SYSTEM_ID].catalogId,
    document,
  ]),
);

test("all 192 creatures are deterministic native Actor documents with pinned provenance", () => {
  const documents = artifacts.documents.creatures;
  assert.equal(documents.length, 192);
  assert.equal(new Set(documents.map(({ _id }) => _id)).size, 192);
  assert.equal(artifacts.files.size, 659);
  assert.deepEqual(artifacts.index.catalogs, {
    choices: 2,
    inventory: 1,
    creatures: 1,
    summons: 1,
  });
  assert.deepEqual(
    artifacts.index.packs.map(({ name, type, count }) => [
      name,
      type,
      count,
    ]),
    [
      ["abilities", "Item", 350],
      ["equipment", "Item", 43],
      ["creatures", "Actor", 192],
      ["summons", "Actor", 73],
    ],
  );
  for (const document of documents) {
    const flags = document.flags[SYSTEM_ID];
    const record = creatures.find(({ id }) => id === flags.catalogId);
    assert(record, flags.catalogId);
    assert.equal(document._key, `!actors!${document._id}`);
    assert.equal(document._id, stableFoundryId(record.id));
    assert.equal(document._id, record.foundryId);
    assert.equal(document.type, "creature");
    assert.equal(document.name, record.name);
    assert.equal(document.img, CREATURE_FALLBACK_IMAGE);
    assert.deepEqual(flags.source, {
      path: record.source.path,
      sha256: record.source.sha256,
    });
    assert.equal(flags.sourceCommit, catalogs.lock.commit);
    assert.equal(flags.catalogAutomation, "pending");
    assert.equal(flags.automation, "pending");
    assert.equal(flags.automationLabel, CREATURE_AUTOMATION_LABEL);
    assert.equal(flags.specialtyAutomation, "pending");
    assert.equal(flags.classification.cv, record.cv);
    assert.equal(document.system.cv, record.cv);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(document.system.attributes).map(([key, value]) => [
          key,
          value.base,
        ]),
      ),
      record.attributes,
    );
    assert.equal(document.system.health.baseMax, record.hp.max);
    assert.equal(document.system.speed, record.speed.ordinary);
    assert.equal(document.system.speedSource, record.speed.sourceText);
    assert.equal(document.system.actions.orientation, "player-defense");
    assert.equal(document.system.basicMelee.orientation, "player-defense");
    assert.deepEqual(document.system.alternateSpeeds, record.speed.alternates);
    assert.equal(document.system.size, record.size.value);
    assert.equal(document.system.sizeLabel, record.size.label);
    assert.equal(document.system.sizeSource, record.size.sourceText);
    assert.deepEqual(
      document.system.footprint,
      record.size.footprint ?? {
        width: record.size.value,
        height: record.size.value,
      },
    );
    assert.deepEqual(document.prototypeToken, document.system.footprint);
    assert.equal(document.system.armor, record.armor.dr);
    assert.equal(document.system.armorMarker, record.armor.marker ?? "");
    assert.equal(document.system.armorSource, record.armor.sourceText);
    assert.equal(document.system.stability, record.defenses.stability);
    assert.deepEqual(document.system.evasion, record.defenses.evasion);
    assert.deepEqual(document.system.threat, record.defenses.threat);
    assert.deepEqual(document.system.weaknesses, record.weaknesses);
    assert.deepEqual(document.system.resistances, record.resistances);
    assert.deepEqual(document.system.immunities, record.immunities);
    const basic = record.actions.main.actions.find(
      ({ name }) => name === "Basic Melee",
    );
    assert.deepEqual(document.system.basicMelee, {
      weak: Number(basic.outcomes.weak),
      standard: Number(basic.outcomes.standard),
      strong: Number(basic.outcomes.strong),
      defenseAttribute: basic.defense.attribute,
      orientation: "player-defense",
    });
    assert.equal(flags.portrait, undefined);
    assert.equal(flags.artwork, undefined);
    assert.deepEqual(document.items, []);
    assert.deepEqual(document.effects, []);
    assert.equal(document.ownership.default, 0);
  }
});

test("Adder and Red Dragon retain exact printed statistics and defense orientation", () => {
  const adder = actorByCatalogId.get("creature-adder");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(adder.system.attributes).map(([key, value]) => [
        key,
        value.base,
      ]),
    ),
    {
      brawn: -2,
      fortitude: 0,
      agility: 2,
      guile: 0,
      knowledge: -2,
      reason: 0,
    },
  );
  assert.equal(adder.system.health.max, undefined);
  assert.equal(adder.system.health.baseMax, 5);
  assert.equal(adder.system.speed, 5);
  assert.deepEqual(adder.system.alternateSpeeds, [
    { mode: "swim", value: 4 },
  ]);
  assert.equal(adder.system.size, 1);
  assert.equal(adder.system.sizeLabel, "medium");
  assert.deepEqual(adder.system.footprint, { width: 1, height: 1 });
  assert.deepEqual(adder.system.basicMelee, {
    weak: 4,
    standard: 2,
    strong: 1,
    defenseAttribute: "agility",
    orientation: "player-defense",
  });

  const dragon = actorByCatalogId.get("creature-red-dragon");
  assert.equal(dragon.system.cv, 95);
  assert.equal(dragon.system.health.baseMax, 56);
  assert.equal(dragon.system.speed, 7);
  assert.deepEqual(dragon.system.alternateSpeeds, [
    { mode: "fly", value: 10 },
  ]);
  assert.equal(dragon.system.size, 3);
  assert.equal(dragon.system.sizeLabel, "3x3 squares");
  assert.deepEqual(dragon.system.footprint, { width: 3, height: 3 });
  assert.equal(dragon.system.armor, 3);
  assert.equal(dragon.system.armorMarker, "*");
  assert.equal(dragon.system.armorSource, "3\\*");
  assert.equal(dragon.system.stability, 2);
  assert.deepEqual(dragon.system.threat, {
    boons: 0,
    banes: 2,
    sourceText: "2 Banes",
  });
  assert.deepEqual(dragon.system.evasion, {
    boons: 0,
    banes: 0,
    sourceText: "None",
  });
  assert.deepEqual(dragon.system.resistances.numeric, [
    { type: "Physical", value: 3 },
    { type: "Fire", value: 3 },
  ]);
  assert.deepEqual(dragon.system.basicMelee, {
    weak: 5,
    standard: 3,
    strong: 2,
    defenseAttribute: "agility",
    orientation: "player-defense",
  });
  assert(
    dragon.system.details.specialtyMarkdown.includes(
      "Cannot use this attack on consecutive turns",
    ),
  );
  assert(
    dragon.system.actions.mainMarkdown.includes("Furnace breath"),
  );
});

test("constrained creature values retain legal blanks and exact mitigation shapes", () => {
  const armorMarkers = new Set();
  const speedModes = new Set();
  let numericEntries = 0;
  let specialEntries = 0;
  for (const document of artifacts.documents.creatures) {
    const { system } = document;
    armorMarkers.add(system.armorMarker);
    assert(["", "*"].includes(system.armorMarker));
    for (const { mode } of system.alternateSpeeds) {
      speedModes.add(mode);
      assert(["burrow", "climb", "fly", "swim"].includes(mode));
    }
    assert.equal(system.basicMelee.orientation, "player-defense");
    assert.equal(system.actions.orientation, "player-defense");
    assert(
      ["brawn", "fortitude", "agility", "guile", "knowledge", "reason"].includes(
        system.basicMelee.defenseAttribute,
      ),
    );
    for (const collection of [system.weaknesses, system.resistances]) {
      for (const entry of collection.numeric) {
        assert.deepEqual(Object.keys(entry).sort(), ["type", "value"]);
        numericEntries++;
      }
      for (const entry of collection.special) {
        assert.deepEqual(Object.keys(entry).sort(), ["reference", "type"]);
        specialEntries++;
      }
    }
  }
  assert.deepEqual([...armorMarkers].sort(), ["", "*"]);
  assert.deepEqual([...speedModes].sort(), ["burrow", "climb", "fly", "swim"]);
  assert(numericEntries > 0);
  assert(specialEntries > 0);
});

test("numeric and narrative mitigations stay separate and specialty automation stays pending", () => {
  const vampire = actorByCatalogId.get("creature-blood-courtier");
  assert.deepEqual(vampire.system.weaknesses, {
    numeric: [],
    special: [{ type: "Sunlight", reference: "see details" }],
    sourceText: "Sunlight (see details)",
  });
  assert(
    vampire.system.details.specialtyMarkdown.includes("sunlight"),
    "The narrative weakness remains readable in the authored detail text",
  );
  assert.equal(vampire.flags[SYSTEM_ID].automation, "pending");
  assert.equal(vampire.flags[SYSTEM_ID].specialtyAutomation, "pending");
  assert(!("handler" in vampire.flags[SYSTEM_ID]));
});

test("signed CV is accepted by the pack projection without a roster-only clamp", async () => {
  const negativeCatalog = structuredClone(catalogs.creatures);
  const adder = negativeCatalog.creatures.find(
    ({ id }) => id === "creature-adder",
  );
  adder.cv = -5;
  adder.classification.cv = -5;
  const negative = buildContentPackArtifacts({
    ...structuredClone(catalogs),
    creatures: negativeCatalog,
  });
  const actor = negative.documents.creatures.find(
    (document) =>
      document.flags[SYSTEM_ID].catalogId === "creature-adder",
  );
  assert.equal(actor.system.cv, -5);
  assert.equal(actor.flags[SYSTEM_ID].classification.cv, -5);
  const model = await readFile(
    new URL("../src/models/creature.mjs", import.meta.url),
    "utf8",
  );
  assert.match(model, /cv: signedInteger\(0\),/);
  const template = await readFile(
    new URL("../static/templates/creature.hbs", import.meta.url),
    "utf8",
  );
  assert(!template.includes('name="system.cv" type="number" min='));
});

test("authored actions and details use pinned absolute source links", () => {
  const dragonRecord = creatures.find(
    ({ id }) => id === "creature-red-dragon",
  );
  const markdown = creatureReferenceMarkdown(
    dragonRecord,
    catalogs.lock.commit,
  );
  assert(markdown.includes("## Actions"));
  assert(markdown.includes("### Maneuvers"));
  assert(markdown.includes("### Reactions"));
  assert(markdown.includes("## Details"));
  assert(markdown.includes("Furnace breath"));
  assert(markdown.includes("Cannot use this attack on consecutive turns"));
  assert(
    markdown.includes(
      `https://github.com/bruceamoser/heroes-of-legend/blob/${catalogs.lock.commit}/design/bestiary/encounters.md`,
    ),
  );
  assert(!markdown.includes("](../"));
});

test("creature reference rendering produces readable safe HTML", () => {
  const dragon = actorByCatalogId.get("creature-red-dragon");
  const html = creatureReferenceHtml(dragon.system);
  assert.match(html, /<h2>Actions<\/h2>/);
  assert.match(html, /<h2>Details<\/h2>/);
  assert.match(html, /<h3>Main Actions<\/h3>/);
  assert.match(html, /<h3>Furnace breath<\/h3>/);
  assert.match(html, /<table><thead><tr><th scope="col">Main Actions<\/th>/);
  assert.match(html, /<td>Furnace breath<\/td>/);
  assert.match(
    html,
    /<p>Damage and effects are <strong>Weak \/ Standard \/ Strong player defense<\/strong>\./,
  );
  assert.match(html, /<p><em>An immense red-scaled dragon/);
  assert.match(html, /<p><strong>Target:<\/strong> Up to two creatures/);
  assert(
    html.includes(
      `<a href="https://github.com/bruceamoser/heroes-of-legend/blob/${catalogs.lock.commit}/design/bestiary/encounters.md" target="_blank" rel="noopener noreferrer">seed worksheet</a>`,
    ),
  );
  assert(!html.includes("|---|"));
  assert(!html.includes("**Target:**"));
  assert(!html.includes("### Main Actions"));
});

test("creature reference rendering escapes hostile HTML and unsafe links", () => {
  const dragon = actorByCatalogId.get("creature-red-dragon");
  const system = structuredClone(dragon.system);
  const commit = catalogs.lock.commit;
  const script =
    '<script data-payload="reference">alert("hostile")</script>';
  system.details.flavorMarkdown =
    `${script} Plain <unknown> text with **strong prose** and *italic prose*.`;
  system.actions.mainMarkdown = [
    "| Action | Source |",
    "|---|---|",
    "| Kept prose | [unsafe](javascript:alert(1)) |",
    "| Data prose | [unsafe](data:text/html,hostile) |",
  ].join("\n");
  system.details.generalMarkdown = [
    `<img src=x onerror="alert(1)">`,
    `[safe source](https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/design/bestiary/roster.md)`,
    "[wrong host](https://example.com/creature)",
  ].join("\n\n");

  const html = creatureReferenceHtml(system);
  assert(!html.includes("<script"));
  assert(!html.includes("<img"));
  assert(
    html.includes(
      "&lt;script data-payload=&quot;reference&quot;&gt;alert(&quot;hostile&quot;)&lt;/script&gt;",
    ),
  );
  assert(html.includes("&lt;unknown&gt;"));
  assert(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert(html.includes("<strong>strong prose</strong>"));
  assert(html.includes("<em>italic prose</em>"));
  assert(html.includes("[unsafe](javascript:alert(1))"));
  assert(html.includes("[unsafe](data:text/html,hostile)"));
  assert(html.includes("[wrong host](https://example.com/creature)"));
  assert(!html.includes('href="javascript:'));
  assert(!html.includes('href="data:'));
  assert(!html.includes('href="https://example.com'));
  assert(
    html.includes(
      `<a href="https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/design/bestiary/roster.md" target="_blank" rel="noopener noreferrer">safe source</a>`,
    ),
  );
});

test("the sheet template has one root, one ApplicationV2 part and a read-only enriched reference", async () => {
  const template = await readFile(
    new URL("../static/templates/creature.hbs", import.meta.url),
    "utf8",
  );
  const sheet = await readFile(
    new URL("../src/sheets/creature.mjs", import.meta.url),
    "utf8",
  );
  const tags = template.match(/<\/?section\b[^>]*>/g) ?? [];
  let depth = 0;
  let roots = 0;
  for (const tag of tags) {
    if (tag.startsWith("</")) {
      depth--;
      assert(depth >= 0, "Unbalanced section closing tag");
    } else {
      if (depth === 0) roots++;
      depth++;
    }
  }
  assert.equal(depth, 0);
  assert.equal(roots, 1);
  assert(template.includes("{{{referenceHTML}}}"));
  assert(!template.includes("{{{system.details"));
  const reference = template.slice(
    template.indexOf('class="hol-creature-reference"'),
    template.indexOf('class="hol-creature-editor"'),
  );
  assert(!reference.includes("<input"));
  assert(!reference.includes("<textarea"));
  assert(sheet.includes("class CreatureSheet extends CharacterSheet"));
  assert.equal((sheet.match(/static PARTS\s*=\s*\{/g) ?? []).length, 1);
  assert(sheet.includes("creatureReferenceHtml(system)"));
  assert(sheet.includes("TextEditor.implementation.enrichHTML"));
  assert(sheet.includes("referenceHtml,"));
  assert(sheet.includes("links: false"));
  assert(!sheet.includes("referenceMarkdown(system)"));
});

test("authored Actor JSON is exact, deterministic and contains no compiled database", async () => {
  await verifyAuthoredContentPacks(root, artifacts);
  const rebuilt = buildContentPackArtifacts(structuredClone(catalogs));
  assert.deepEqual([...rebuilt.files], [...artifacts.files]);
  const directory = new URL("../content/packs/", import.meta.url);
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile());
  assert.equal(files.length, 659);
  assert(files.every((entry) => entry.name.endsWith(".json")));
  for (const forbidden of ["CURRENT", "LOCK", "LOG", "MANIFEST-000001"])
    assert(!files.some((entry) => entry.name === forbidden));
});

test("changed source-locked creature data fails closed", () => {
  const changedHash = structuredClone(catalogs);
  changedHash.creatures.creatures[0].source.sha256 = "0".repeat(64);
  assert.throws(
    () =>
      buildContentPackArtifacts(changedHash),
    /not the pinned locked record/,
  );
  const changedCommit = structuredClone(catalogs);
  changedCommit.creatures.source.commit = "f".repeat(40);
  assert.throws(
    () => buildContentPackArtifacts(changedCommit),
    /revisions differ/,
  );
  const reviewed = structuredClone(catalogs);
  reviewed.creatures.creatures[0].automation = "reviewed";
  assert.throws(
    () => buildContentPackArtifacts(reviewed),
    /must remain pending/,
  );
});

test("creature modifier summaries follow edits instead of stale pinned prose", () => {
  const dragon = actorByCatalogId.get("creature-red-dragon");
  const evasion = structuredClone(dragon.system.evasion);
  assert.equal(evasion.sourceText, "None");
  evasion.boons = 2;
  evasion.banes = 1;
  assert.equal(creatureModifierLabel(evasion), "2 Boons and 1 Bane");
  assert.equal(evasion.sourceText, "None");
  const threat = structuredClone(dragon.system.threat);
  assert.equal(threat.sourceText, "2 Banes");
  threat.boons = 0;
  threat.banes = 0;
  assert.equal(creatureModifierLabel(threat), "None");
  assert.equal(threat.sourceText, "2 Banes");
});


test("native token projection preserves rectangular source footprint orientation", () => {
  const changed = structuredClone(catalogs);
  changed.creatures.creatures[0].size.footprint = { width: 1, height: 3 };
  const projected = buildContentPackArtifacts(changed).documents.creatures.find(
    d => d.flags[SYSTEM_ID].catalogId === changed.creatures.creatures[0].id,
  );
  assert.deepEqual(projected.prototypeToken, { width: 1, height: 3 });
});
