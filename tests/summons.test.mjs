import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  foundryIdFor,
  parseSummon,
  summarizeSummonCatalog,
  verifySourceHash,
} from "../scripts/content/summons.mjs";

const lock = JSON.parse(
  await readFile(new URL("../content/source-lock.json", import.meta.url), "utf8"),
);
const catalog = JSON.parse(
  await readFile(new URL("../static/data/summons.json", import.meta.url), "utf8"),
);
const recordsByPath = new Map(lock.records.map((record) => [record.path, record]));
const linksByPath = new Map(
  lock.summonLinks.map((link) => [link.path, link]),
);
const fixtureDirectory = new URL("./fixtures/summons/", import.meta.url);
const fixtureNames = [
  "adder",
  "air-elemental",
  "emberling",
  "moon-hart",
  "skeleton-horse",
  "walking-furnace",
];

function lockedRecord(path) {
  const record = recordsByPath.get(path);
  assert(record, `Missing fixture source in lock: ${path}`);
  return record;
}

async function fixtureContext(name) {
  const path = `design/bestiary/summons/${name}.md`;
  const source = lockedRecord(path);
  const link = linksByPath.get(path);
  assert(link, `Missing fixture summon link: ${path}`);
  const creature = lockedRecord(
    `design/bestiary/creatures/${name}.md`,
  );
  assert.equal(creature.id, link.creatureId);
  const text = await readFile(new URL(`${name}.md`, fixtureDirectory), "utf8");
  return {
    source,
    text,
    context: {
      repository: lock.repository,
      commit: lock.commit,
      link,
      creature,
      rules: lockedRecord("design/rules/summoning.md"),
    },
  };
}

async function parseFixture(name) {
  const fixture = await fixtureContext(name);
  verifySourceHash(fixture.source, Buffer.from(fixture.text));
  return {
    ...fixture,
    record: parseSummon(fixture.source, fixture.text, fixture.context),
  };
}

const adder = await parseFixture("adder");
const air = await parseFixture("air-elemental");
const emberling = await parseFixture("emberling");
const moonHart = await parseFixture("moon-hart");
const skeletonHorse = await parseFixture("skeleton-horse");
const walkingFurnace = await parseFixture("walking-furnace");

test("six exact fixtures match their pinned hashes and full authored catalog text", () => {
  const parsed = new Map(
    [adder, air, emberling, moonHart, skeletonHorse, walkingFurnace].map(
      ({ record }) => [record.id, record],
    ),
  );
  for (const name of fixtureNames) {
    const path = `design/bestiary/summons/${name}.md`;
    const generated = catalog.records.find(
      ({ source }) => source.path === path,
    );
    assert(generated, `Missing generated fixture record: ${path}`);
    const record = parsed.get(generated.id);
    assert(record, `Fixture did not parse: ${path}`);
    assert.equal(generated.reference.sourceMarkdown, record.reference.sourceMarkdown);
    assert.equal(
      createHash("sha256")
        .update(generated.reference.sourceMarkdown)
        .digest("hex"),
      lockedRecord(path).sha256,
    );
  }
});

test("Adder preserves attacker outcomes, distinct stats, command limits, tether and Basic Melee", () => {
  const record = adder.record;
  assert.equal(record.id, "summon-adder");
  assert.equal(record.foundryId, foundryIdFor("summon-adder"));
  assert.equal(record.kind, "summon-profile-reference");
  assert.equal(record.actionOrientation, "attacker");
  assert.equal(record.eligibility, "Animal 1");
  assert.deepEqual(record.attributes, {
    brawn: -2,
    fortitude: 0,
    agility: 2,
    guile: 0,
    knowledge: -2,
    reason: 0,
  });
  assert.equal(record.hp.maximum, 5);
  assert.deepEqual(record.speed, {
    ordinary: { mode: "ground", value: 5, sourceText: "Ground 5" },
    alternates: [{ mode: "swim", value: 4, sourceText: "swim 4" }],
    sourceText: "Ground 5; swim 4",
  });
  assert.deepEqual(record.footprint, {
    width: 1,
    height: 1,
    sourceText: "1x1",
  });
  assert.deepEqual(record.defenseModifier, {
    boons: 1,
    banes: 0,
    sourceText: "1 Boon",
  });
  assert.equal(record.stability.value, 0);
  assert.deepEqual(record.mitigation, {
    resistances: { ordinary: [], special: [], sourceText: "None" },
    conditionImmunities: [],
    weakness: { ordinary: [], special: [], sourceText: "None" },
  });
  assert.equal(record.healing.restoresHp, false);
  assert.equal(record.healing.disappearsAtHp, 0);
  assert.equal(record.healing.leavesBody, false);
  assert.equal(
    record.command.limits.maxCommandsPerSummonPerControllerTurn,
    1,
  );
  assert.equal(record.command.limits.turnTickAnchor, "controller");
  assert.equal(record.command.tether.maximumSquares, 6);
  assert.equal(record.command.tether.whenBeyondMaximum, "disappears");
  assert.equal(record.command.controller.whenUnconsciousOrDead, "disappears");
  assert.deepEqual(record.command.chains, {
    coverage: "not-stated-in-profile",
  });
  assert.equal(record.attacks.orientation, "attacker");
  assert.deepEqual(record.attacks.actions[0].outcomes, {
    weak: "1 physical damage.",
    standard: "1 physical damage. Poisoned 1.",
    strong: "2 physical damage. Poisoned 2.",
  });
  assert.equal(
    record.reference.attackDetails[0].targetAndRidersMarkdown,
    "One adjacent creature.",
  );
  assert.deepEqual(record.basicMelee.outcomes, {
    weak: { damage: { amount: 1, type: "physical" } },
    standard: { damage: { amount: 2, type: "physical" } },
    strong: { damage: { amount: 4, type: "physical" } },
  });
  assert.equal(record.basicMelee.id, "ability-basic-melee");
  assert.equal(record.defend.id, "ability-defend");
  assert.equal(record.documentMapping.actor, false);
  assert.equal(record.source.commit, lock.commit);
  assert.equal(record.references.creature.id, "creature-adder");
  assert.equal(
    record.references.summonRules.path,
    "design/rules/summoning.md",
  );
});

test("attribute-first, speed-mode and Maneuvers variants remain typed and source-specific", () => {
  const record = air.record;
  assert.deepEqual(record.speed.ordinary, {
    mode: "ground",
    value: 6,
    sourceText: "6",
  });
  assert.deepEqual(record.speed.alternates, [
    { mode: "fly", value: 9, sourceText: "fly 9" },
  ]);
  assert.deepEqual(record.basicMelee.outcomes, {
    weak: { damage: { amount: 2, type: "physical" } },
    standard: { damage: { amount: 3, type: "physical" } },
    strong: { damage: { amount: 5, type: "physical" } },
  });
  assert.equal(record.basicMelee.opportunityAttack, null);
  assert.equal(record.defend.duration.expiry, "until-controller-next-turn");
  assert.deepEqual(
    record.reference.maneuvers.map(({ name, category, style }) => ({
      name,
      category,
      style,
    })),
    [
      {
        name: "Wind Step",
        category: "maneuver",
        style: "inline-field",
      },
    ],
  );
  assert.equal(record.command.chains.allowed, false);
});

test("two-row attacks, passives and printed attack modifiers preserve authored prose", () => {
  const record = walkingFurnace.record;
  assert.deepEqual(
    record.attacks.actions.map(
      ({ name, attribute, attackModifier, outcomes }) => ({
        name,
        attribute,
        attackModifier,
        outcomes,
      }),
    ),
    [
      {
        name: "Iron ram",
        attribute: "brawn",
        attackModifier: {
          boons: 1,
          banes: 0,
          sourceText: "1 Boon",
        },
        outcomes: {
          weak: "3 physical damage.",
          standard: "5 physical damage.",
          strong: "7 physical damage.",
        },
      },
      {
        name: "Furnace breath",
        attribute: "brawn",
        attackModifier: {
          boons: 1,
          banes: 0,
          sourceText: "1 Boon",
        },
        outcomes: {
          weak: "4 fire damage.",
          standard: "6 fire damage. Burning 1.",
          strong: "8 fire damage. Burning 2.",
        },
      },
    ],
  );
  assert(
    record.reference.attackDetails[1].targetAndRidersMarkdown.includes(
      "Cannot use this attack on consecutive turns",
    ),
  );
  assert.deepEqual(
    record.reference.passives.map(({ name }) => name),
    ["Lifeless Body"],
  );
  assert.deepEqual(
    record.mitigation.resistances.ordinary.map(({ kind, type, value }) => ({
      kind,
      type,
      value,
    })),
    [
      { kind: "ordinary", type: "Physical", value: 2 },
      { kind: "ordinary", type: "fire", value: 3 },
    ],
  );
  assert.equal(record.basicMelee.outcomes.strong.damage.amount, 5);
});

test("healing-harm, offensive-healing, special weakness and potion prohibitions remain explicit", () => {
  assert.deepEqual(skeletonHorse.record.healing.healingHarmed, {
    ordinaryHealing: "life-damage",
    beneficialRiders: false,
    sourceText:
      "Healing-harmed: ordinary healing resolves as Life damage instead; no beneficial riders.",
  });
  assert.equal(
    skeletonHorse.record.reference.offensiveHealing[0].attribute,
    "fortitude",
  );
  assert(
    skeletonHorse.record.reference.offensiveHealing[0].sourceText.includes(
      "ordinary player attacks still use the defense attribute",
    ),
  );
  assert.equal(emberling.record.healing.canSwallowPotions, false);
  assert.deepEqual(
    emberling.record.mitigation.weakness.ordinary,
    [],
  );
  assert.equal(
    emberling.record.mitigation.weakness.special[0].kind,
    "special",
  );
  assert(
    emberling.record.mitigation.weakness.special[0].sourceText.includes(
      "Does not stack with itself.",
    ),
  );
});

test("special Main Action prose remains complete and unautomated", () => {
  const action = moonHart.record.reference.specialActions[0];
  assert.equal(action.name, "Battle Mending");
  assert.equal(action.category, "main-action");
  assert.equal(action.automation, "pending");
  assert(action.markdown.startsWith("### Battle Mending — Main Action\n"));
  assert(action.text.includes("The controller pays 3 HP first"));
  assert(action.text.includes("The hart does not also pay this cost."));
  assert(action.text.includes("Life resistance reduces healing, minimum 1."));
  assert(
    action.text.includes(
      "Against a healing-harmed target, roll the same Reason attack",
    ),
  );
  assert.equal(moonHart.record.specialActions, undefined);
});

test("source hashes and schema/reference variants fail closed", () => {
  const { source, text, context } = adder;
  assert.throws(
    () =>
      verifySourceHash(
        { ...source, sha256: "0".repeat(64) },
        Buffer.from(text),
      ),
    /Source hash mismatch/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace("**HP:** 5", "**HP:** five"),
        context,
      ),
    /Unknown or missing HP/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "| Attack | Attribute | Attack modifier | Weak attack | Standard attack | Strong attack |",
          "| Attack | Attribute | Modifier | Weak attack | Standard attack | Strong attack |",
        ),
        context,
      ),
    /Unknown attack-table header/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "| Needle bite | Agility | None | 1 physical damage. | 1 physical damage. Poisoned 1. | 2 physical damage. Poisoned 2. |",
          "| Needle bite | Presence | None | 1 physical damage. | 1 physical damage. Poisoned 1. | 2 physical damage. Poisoned 2. |",
        ),
        context,
      ),
    /Unknown attack attribute/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "**Needle bite:** One adjacent creature.\n\n",
          "",
        ),
        context,
      ),
    /Expected one authored detail for Needle bite/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "**Senses:** Ordinary sight and hearing.",
          "**Senses:** Ordinary sight and hearing.\n\n**Senses:** Ordinary hearing.",
        ),
        context,
      ),
    /Expected one Senses field, found 2/,
  );
  assert.throws(
    () =>
      parseSummon(source, text.replace("**Communication:** None\n\n", ""), {
        ...context,
      }),
    /Expected one Communication field, found 0/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "**Defend — Maneuver:** gain 1 Boon",
          "**Unlisted maneuver:** gain 1 Boon",
        ),
        context,
      ),
    /Unrecognized summon structure: \*\*Unlisted maneuver:/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "Weak attack 1, Standard 2, Strong 4",
          "Weak attack 1, Standard 2, Strong 3",
        ),
        context,
      ),
    /Unknown Basic Melee/,
  );
  assert.throws(
    () =>
      parseSummon(source, text, {
        ...context,
        link: { ...context.link, eligibility: "Animal 3" },
      }),
    /Eligibility Animal 1 differs from source lock Animal 3/,
  );
  assert.throws(
    () =>
      parseSummon(source, text, {
        ...context,
        creature: { ...context.creature, id: "creature-wolf" },
      }),
    /Linked creature ID differs from source lock/,
  );
});

test("unknown headings, duplicate actions and duplicate catalog identities fail closed", () => {
  const { source, text, context } = walkingFurnace;
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "| Furnace breath |",
          "| Iron ram |",
        ),
        context,
      ),
    /Duplicate attack-table action: Iron ram/,
  );
  assert.throws(
    () =>
      parseSummon(
        source,
        text.replace(
          "## Attacks — Main Action",
          "## Special Attacks",
        ),
        context,
      ),
    /Unknown summon section: ## Special Attacks/,
  );
  assert.throws(
    () =>
      summarizeSummonCatalog([adder.record, adder.record]),
    /Duplicate record ID: summon-adder/,
  );
  const changedId = {
    ...adder.record,
    id: "summon-adder-copy",
    foundryId: foundryIdFor("summon-adder-copy"),
  };
  assert.throws(
    () =>
      summarizeSummonCatalog([adder.record, changedId]),
    /Duplicate source path: design\/bestiary\/summons\/adder.md/,
  );
});

test("offline catalog reconciles all 73 locked profiles, full sources and typed references", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.kind, "summon-profile-reference-catalog");
  assert.equal(catalog.source.commit, lock.commit);
  assert.equal(catalog.orientation.summonAttackTables, "attacker");
  assert.equal(catalog.orientation.creatureAttackTables, "player-defense");
  assert.equal(catalog.records.length, 73);
  assert.equal(catalog.records.length, lock.summonLinks.length);
  assert.deepEqual(
    summarizeSummonCatalog(catalog.records),
    {
      profiles: 73,
      linkedCreatures: 73,
      attackRows: 85,
      attackDetails: 85,
      maneuvers: 64,
      passives: 50,
      specialActions: 1,
      offensiveHealingReferences: 18,
    },
  );
  assert.deepEqual(catalog.counts, {
    ...summarizeSummonCatalog(catalog.records),
    summonSourcesVerified: 73,
    linkedCreatureSourcesVerified: 73,
    summonRulesSourceVerified: 1,
  });
  assert.equal(
    new Set(catalog.records.map(({ foundryId }) => foundryId)).size,
    73,
  );

  const linkById = new Map(lock.summonLinks.map((link) => [link.id, link]));
  for (const record of catalog.records) {
    const lockSource = lockedRecord(record.source.path);
    const link = linkById.get(record.id);
    assert(link, `Catalog record has no lock link: ${record.id}`);
    assert.equal(record.kind, "summon-profile-reference");
    assert.equal(record.source.commit, lock.commit);
    assert.equal(record.source.sha256, lockSource.sha256);
    assert.equal(record.creatureId, link.creatureId);
    assert.equal(record.eligibility, link.eligibility);
    assert.equal(record.actionOrientation, "attacker");
    assert.equal(record.attacks.orientation, "attacker");
    assert.equal(record.foundryId, foundryIdFor(record.id));
    assert.equal(record.documentMapping.actor, false);
    assert.equal(
      createHash("sha256")
        .update(record.reference.sourceMarkdown)
        .digest("hex"),
      lockSource.sha256,
    );
    assert(
      record.reference.sourceMarkdown.endsWith(
        "[Summon rules](../../rules/summoning.md)\n",
      ),
    );
    const creatureSource = lockedRecord(record.references.creature.path);
    assert.equal(record.references.creature.id, link.creatureId);
    assert.equal(
      record.references.creature.sha256,
      creatureSource.sha256,
    );
    const rulesSource = lockedRecord("design/rules/summoning.md");
    assert.equal(
      record.references.summonRules.sha256,
      rulesSource.sha256,
    );
    assert.deepEqual(
      record.attacks.actions.map(({ name }) => name),
      record.reference.attackDetails.map(({ name }) => name),
    );
    assert(
      record.attacks.actions.every(
        (action) =>
          action.orientation === "attacker" &&
          action.automation === "pending" &&
          action.outcomes.weak &&
          action.outcomes.standard &&
          action.outcomes.strong,
      ),
    );
    assert.equal(record.basicMelee.id, "ability-basic-melee");
    assert.equal(record.defend.id, "ability-defend");
    assert.equal(record.command.tether.maximumSquares, 6);
    assert.equal(record.healing.restoresHp, false);
    assert.equal(record.coverage.nativeAutomation, "pending");
  }

  assert.deepEqual(
    [
      ...new Set(
        catalog.records.map(
          (record) => record.basicMelee.outcomes.strong.damage.amount,
        ),
      ),
    ].sort(),
    [2, 4, 5],
  );
  const basicSignatures = {};
  for (const { basicMelee } of catalog.records) {
    const signature = ["weak", "standard", "strong"]
      .map((outcome) => basicMelee.outcomes[outcome].damage.amount)
      .join("/");
    basicSignatures[signature] = (basicSignatures[signature] ?? 0) + 1;
  }
  assert.deepEqual(basicSignatures, {
    "1/1/2": 2,
    "1/2/4": 10,
    "2/3/5": 61,
  });
});
