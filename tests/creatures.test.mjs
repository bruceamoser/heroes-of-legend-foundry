import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  foundryIdFor,
  parseCreature,
  summarizeCreatureCatalog,
  verifySourceHash,
} from "../scripts/content/creatures.mjs";

const lock = JSON.parse(
  await readFile(new URL("../content/source-lock.json", import.meta.url), "utf8"),
);
const catalog = JSON.parse(
  await readFile(new URL("../static/data/creatures.json", import.meta.url), "utf8"),
);
const abilities = lock.records.filter(
  (record) =>
    record.path.startsWith("design/monster-abilities/") && record.id,
);

function lockedRecord(path) {
  const record = lock.records.find((candidate) => candidate.path === path);
  assert(record, `Missing fixture source in lock: ${path}`);
  return record;
}

function summonContext(creatureId) {
  const link = lock.summonLinks.find(
    (candidate) => candidate.creatureId === creatureId,
  );
  if (!link) return null;
  const source = lockedRecord(link.path);
  return {
    ...link,
    source: {
      commit: lock.commit,
      path: source.path,
      sha256: source.sha256,
    },
  };
}

const adderRecord = lockedRecord("design/bestiary/creatures/adder.md");
const adderText = await readFile(
  new URL("./fixtures/creatures/adder.md", import.meta.url),
  "utf8",
);
const adderContext = {
  commit: lock.commit,
  family: "Animal",
  portrait: {
    id: "creature-adder",
    name: "Adder",
    path: "design/player-book/art/interior/summon-adder.png",
    sha256:
      "b232e35496ee5169277e577bc41f89422be72c3373f3dd3550e5feedba345bc7",
    width: 1254,
    height: 1254,
    alpha: true,
    status: "existing",
    promptId: "creature-adder",
    provenance: "approved Player Book creature illustration",
  },
  summonLink: summonContext("creature-adder"),
  abilityRecords: abilities,
};
const adder = parseCreature(adderRecord, adderText, adderContext);

const dragonRecord = lockedRecord("design/bestiary/creatures/red-dragon.md");
const dragonText = await readFile(
  new URL("./fixtures/creatures/red-dragon.md", import.meta.url),
  "utf8",
);
const dragonContext = {
  commit: lock.commit,
  family: "Dragons, drakes and hydras",
  portrait: {
    id: "creature-red-dragon",
    name: "Red Dragon",
    path: "design/bestiary/art/creatures/red-dragon.png",
    sha256:
      "916ba7ba46f0e18f607f253d5256b9d6ff1d3630f3910148f9ff884334cb92b3",
    width: 1254,
    height: 1254,
    alpha: true,
    status: "generated",
    promptId: "creature-red-dragon",
    provenance: "built-in image_gen",
    generatedSource: "exec-fb610624-4066-4fb4-b396-3f68f8f0f38b.png",
  },
  summonLink: null,
  abilityRecords: abilities,
};
const dragon = parseCreature(dragonRecord, dragonText, dragonContext);

test("Adder fixture parses pinned stats, player-defense outcomes and detailed prose", () => {
  verifySourceHash(adderRecord, Buffer.from(adderText));
  assert.equal(adderRecord.sha256, adder.source.sha256);
  assert.equal(adder.id, "creature-adder");
  assert.equal(adder.foundryId, foundryIdFor("creature-adder"));
  assert.equal(adder.hp.max, 5);
  assert.deepEqual(adder.attributes, {
    brawn: -2,
    fortitude: 0,
    agility: 2,
    guile: 0,
    knowledge: -2,
    reason: 0,
  });
  assert.deepEqual(adder.speed, {
    ordinary: 5,
    alternates: [{ mode: "swim", value: 4 }],
    sourceText: "5; swim 4",
  });
  assert.deepEqual(adder.size, {
    value: 1,
    label: "medium",
    footprint: null,
    sourceText: "1 (medium)",
  });
  assert.equal(adder.armor.dr, 0);
  assert.deepEqual(adder.defenses.evasion, {
    boons: 0,
    banes: 1,
    sourceText: "1 Bane",
  });
  assert.equal(adder.actions.orientation, "player-defense");
  assert.deepEqual(
    adder.actions.main.actions.find(({ name }) => name === "Needle bite")
      .outcomes,
    {
      weak: "2 + Poisoned 2",
      standard: "1 + Poisoned 1",
      strong: "1",
    },
  );
  assert.equal(adder.summoning.summonId, "summon-adder");
  assert.equal(
    adder.reference.specialtyDetails[0].markdown,
    `### Needle bite

*A needle catches the skin, and a bitter numbness spreads from the puncture.*

**Target:** One adjacent creature. **Player defense:** Agility. **Damage type:** physical.

**Weak defense:** Poisoned 2. **Standard defense:** Poisoned 1.`,
  );
  assert(
    adder.reference.generalDetailsMarkdown.includes(
      "**Counterplay and conversation:** Use a long branch or walk around its basking place.",
    ),
  );
});

test("Red Dragon fixture preserves alternate flight, numeric mitigation and every outcome", () => {
  verifySourceHash(dragonRecord, Buffer.from(dragonText));
  assert.equal(dragonRecord.sha256, dragon.source.sha256);
  assert.equal(dragon.hp.max, 56);
  assert.deepEqual(dragon.speed.alternates, [{ mode: "fly", value: 10 }]);
  assert.deepEqual(dragon.size.footprint, { width: 3, height: 3 });
  assert.deepEqual(dragon.armor, {
    dr: 3,
    marker: "*",
    sourceText: "3\\*",
  });
  assert.deepEqual(dragon.defenses.threat, {
    boons: 0,
    banes: 2,
    sourceText: "2 Banes",
  });
  assert.deepEqual(dragon.resistances.numeric, [
    { type: "Physical", value: 3 },
    { type: "Fire", value: 3 },
  ]);
  assert.deepEqual(
    dragon.actions.main.actions.map(({ name, outcomes }) => ({
      name,
      outcomes,
    })),
    [
      {
        name: "Basic Melee",
        outcomes: { weak: "5", standard: "3", strong: "2" },
      },
      {
        name: "Claw sweep",
        outcomes: {
          weak: "10 + Push each 4",
          standard: "7 + Push each 2",
          strong: "5",
        },
      },
      {
        name: "Furnace breath",
        outcomes: {
          weak: "10 + Burning 2",
          standard: "7 + Burning 1",
          strong: "5",
        },
      },
      {
        name: "Crushing bite",
        outcomes: {
          weak: "12 + Bleeding 2",
          standard: "8 + Bleeding 1",
          strong: "6",
        },
      },
    ],
  );
  assert.equal(dragon.summoning.eligible, false);
  assert.equal(dragon.abilitySources.length, 5);
  assert(
    dragon.reference.specialtyDetails
      .find(({ title }) => title === "Furnace breath")
      .markdown.includes(
        "**Limit:** Cannot use this attack on consecutive turns, regardless of result.",
      ),
  );
});

test("required unknown stats and action-table shapes fail closed", () => {
  assert.throws(
    () =>
      parseCreature(
        adderRecord,
        adderText.replace("**HP:** 5", "**HP:** five"),
        adderContext,
      ),
    /Unknown or missing HP, Speed, Size, or Armor DR/,
  );
  assert.throws(
    () =>
      parseCreature(
        adderRecord,
        adderText.replace(
          "| Main Actions | Defense | Damage |",
          "| Main Actions | Attack | Damage |",
        ),
        adderContext,
      ),
    /Unknown Main Actions header/,
  );
  assert.throws(
    () =>
      parseCreature(
        adderRecord,
        adderText.replace(
          "| Needle bite | Agility | 2 + Poisoned 2 / 1 + Poisoned 1 / 1 |",
          "| Needle bite | Agility | 2 / 1 |",
        ),
        adderContext,
      ),
    /Unknown player-defense outcome format/,
  );
  assert.throws(
    () =>
      parseCreature(
        adderRecord,
        adderText.replace("**Speed:** 5; swim 4", "**Speed:** 5; phase 4"),
        adderContext,
      ),
    /Unknown alternate Speed format/,
  );
});

test("duplicate actions and missing source references fail closed", () => {
  const duplicateAction = adderText.replace(
    "| Basic Melee | Agility | 4/2/1 |\n| Needle bite | Agility | 2 + Poisoned 2 / 1 + Poisoned 1 / 1 |",
    "| Basic Melee | Agility | 4/2/1 |\n| Basic Melee | Agility | 4/2/1 |",
  );
  assert.throws(
    () => parseCreature(adderRecord, duplicateAction, adderContext),
    /Duplicate Main Actions action: Basic Melee/,
  );
  assert.throws(
    () =>
      parseCreature(adderRecord, adderText, {
        ...adderContext,
        abilityRecords: [],
      }),
    /Missing or unlocked monster ability: design\/monster-abilities\/venom\.md/,
  );
});

test("numeric weaknesses, numeric resistances and immunities stay distinct", () => {
  const mitigationText = adderText
    .replace("**Weaknesses:** None\\", "**Weaknesses:** Fire (2)\\")
    .replace("**Immunities:** None", "**Immunities:** Bleeding; Poisoned");
  const mitigation = parseCreature(
    adderRecord,
    mitigationText,
    adderContext,
  );
  assert.deepEqual(mitigation.weaknesses, {
    numeric: [{ type: "Fire", value: 2 }],
    special: [],
    sourceText: "Fire (2)",
  });
  assert.deepEqual(mitigation.resistances, {
    numeric: [],
    special: [],
    sourceText: "None",
  });
  assert.deepEqual(mitigation.immunities, ["Bleeding", "Poisoned"]);
});

test("generated catalog reconciles every locked creature, portrait and summon link", () => {
  const creatures = lock.records.filter((record) =>
    record.path.startsWith("design/bestiary/creatures/"),
  );
  assert.equal(catalog.source.commit, lock.commit);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.orientation.creatureActionTables, "player-defense");
  assert.equal(catalog.coverage.nativeAutomation, "pending");
  assert.equal(catalog.creatures.length, 192);
  assert.equal(new Set(catalog.creatures.map(({ id }) => id)).size, 192);
  assert.equal(
    new Set(catalog.creatures.map(({ foundryId }) => foundryId)).size,
    192,
  );
  assert.deepEqual(
    catalog.creatures.map(({ id }) => id).sort(),
    creatures.map(({ id }) => id).sort(),
  );

  const lockedByPath = new Map(lock.records.map((record) => [record.path, record]));
  const assetById = new Map(lock.assets.map((asset) => [asset.id, asset]));
  const summonByCreature = new Map(
    catalog.summonLinks.map((link) => [link.creatureId, link]),
  );
  assert.equal(new Set(catalog.summonLinks.map(({ id }) => id)).size, 73);
  for (const creature of catalog.creatures) {
    const source = lockedByPath.get(creature.source.path);
    assert(source, `Catalog source is not locked: ${creature.source.path}`);
    assert.equal(creature.id, source.id);
    assert.equal(creature.source.sha256, source.sha256);
    assert.equal(creature.source.commit, lock.commit);
    assert.equal(creature.foundryId, foundryIdFor(source.id));
    const portrait = assetById.get(source.id);
    assert(portrait, `Missing portrait lock: ${source.id}`);
    assert.equal(creature.portrait.path, portrait.path);
    assert.equal(creature.portrait.id, source.id);
    assert.equal(creature.portrait.sha256, portrait.sha256);
    assert.equal(creature.portrait.provenance, portrait.provenance);
    assert(!("license" in creature.portrait));
    assert(creature.family);
    assert.equal(creature.actions.orientation, "player-defense");
    assert.equal(
      creature.actions.main.actions.length,
      creature.actions.main.rows.length,
    );
    assert.equal(
      creature.actions.maneuvers.actions.length,
      creature.actions.maneuvers.rows.length,
    );
    assert.equal(
      creature.actions.reactions.actions.length,
      creature.actions.reactions.rows.length,
    );
    assert(
      [
        ...creature.actions.main.actions,
        ...creature.actions.maneuvers.actions,
        ...creature.actions.reactions.actions,
      ].every(({ automation }) => automation === "pending"),
    );
    assert(creature.actions.main.markdown);
    assert(creature.actions.maneuvers.markdown);
    assert(creature.actions.reactions.markdown);
    assert(creature.reference.specialtyDetails.length > 0);
    for (const detail of creature.reference.specialtyDetails) {
      assert(detail.markdown.startsWith(`### ${detail.title}\n`));
      assert.equal(
        detail.coverage,
        "prose-preserved; native automation pending",
      );
    }
    assert(creature.reference.generalDetailsMarkdown.startsWith("### General details\n"));
    assert(
      creature.reference.designNotesMarkdown.startsWith(
        "## Design notes — not needed during play\n",
      ),
    );
    for (const sourceRef of creature.abilitySources) {
      const ability = lockedByPath.get(sourceRef.path);
      assert(ability, `Missing monster ability ${sourceRef.path}`);
      assert.equal(sourceRef.id, ability.id);
      assert.equal(sourceRef.sha256, ability.sha256);
    }
    const summonLink = summonByCreature.get(creature.id);
    assert.equal(creature.summoning.eligible, Boolean(summonLink));
    if (summonLink) {
      assert.equal(creature.summoning.summonId, summonLink.id);
      assert.equal(summonLink.perspective, "attacker");
      assert.equal(summonLink.profileImported, true);
      assert.equal(
        summonLink.referenceCatalog,
        "static/data/summons.json",
      );
      assert(!("actions" in summonLink));
      const summonSource = lockedByPath.get(summonLink.source.path);
      assert(summonSource);
      assert.equal(summonLink.source.sha256, summonSource.sha256);
    }
  }
  assert.deepEqual(catalog.counts, {
    ...summarizeCreatureCatalog(catalog.creatures, catalog.summonLinks),
    monsterAbilitiesVerified: 93,
  });
});
