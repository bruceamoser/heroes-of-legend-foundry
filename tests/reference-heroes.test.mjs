import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { creationPreview } from "../src/rules/creation.mjs";
import { DEFAULT_LANGUAGES } from "../src/rules/identity.mjs";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const fixture = await read("./fixtures/reference-heroes.json");
const lock = await read("../content/source-lock.json");
const choices = (await read("../static/data/choices.json")).records;
const inventory = await read("../static/data/inventory.json");
const languages = [...DEFAULT_LANGUAGES, ...fixture.campaignLanguages];
const permissionProfiles = {
  full: {
    understand: true,
    express: true,
    speak: true,
    sign: false,
    read: true,
    write: true,
  },
  "spoken-only": {
    understand: true,
    express: true,
    speak: true,
    sign: false,
    read: false,
    write: false,
  },
};
const sorted = (values) => [...values].sort();
const stageFacts = (preview) =>
  [0, 1].map((stage) => {
    const entries = preview.ledger.filter((entry) => entry.stage === stage);
    const pool = entries.find((entry) => entry.kind === "pool").delta;
    const compensation = entries
      .filter((entry) => entry.kind.startsWith("duplicate-"))
      .reduce((total, entry) => total + entry.delta, 0);
    const spent =
      -entries
        .filter((entry) => entry.kind === "purchase")
        .reduce((total, entry) => total + entry.delta, 0) || 0;
    const expired =
      -entries
        .filter((entry) => entry.kind === "expired-pool")
        .reduce((total, entry) => total + entry.delta, 0) || 0;
    return [pool, compensation, spent, expired];
  });
const heroPreview = (character) =>
  creationPreview(character.draft, choices, inventory, languages);
const check = (character, field, actual, expected) =>
  assert.deepEqual(
    actual,
    expected,
    `${character.name} ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );

test("reference fixtures pin all six complete source blobs offline", () => {
  assert.equal(
    fixture.provenance.commit,
    "64089a1c8961d7faff172f179448a8b6e57827ef",
    "reference fixture commit",
  );
  assert.equal(fixture.provenance.commit, lock.commit);
  for (const source of [
    fixture.provenance.index,
    ...Object.values(fixture.provenance.characters),
  ])
    assert.equal(
      source.sha256,
      lock.records.find((record) => record.path === source.path)?.sha256,
      source.path,
    );
  assert.equal(fixture.characters.length, 6, "reference character count");
  assert.match(fixture.provenance.index.sha256, /^[a-f0-9]{64}$/);
  for (const character of fixture.characters) {
    const provenance = fixture.provenance.characters[character.id];
    assert(provenance, `${character.name} source provenance missing`);
    assert.equal(provenance.path, `design/characters/${character.id}.md`);
    assert.match(provenance.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(
    new Set(
      Object.values(fixture.provenance.characters).map(
        (source) => source.sha256,
      ),
    ).size,
    6,
    "reference source hashes are distinct",
  );
});

for (const character of fixture.characters)
  test(`${character.name} matches transcribed level-1 source values`, () => {
    const expected = character.expected;
    const draft = character.draft;
    const preview = heroPreview(character);
    check(character, "validation", preview.errors, []);
    if (!preview.valid) return;

    const identity = {
      attributes: draft.attributes,
      ancestryId: draft.ancestryId,
      traitIds: draft.traitIds,
      classId: draft.classId,
      classDisciplines: draft.classDisciplines,
      signatureId: draft.signatureId,
    };
    check(character, "identity", identity, expected.identity);

    for (const [
      kind,
      id,
      pairIndex,
      disciplineId,
      abilityId,
    ] of expected.origins) {
      const selection = draft[kind];
      check(
        character,
        `${kind} origin selection`,
        [selection.id, selection.pair],
        [id, pairIndex],
      );
      const pair = choices.find((choice) => choice.id === id)?.pairs?.[
        pairIndex
      ];
      assert(
        pair,
        `${character.name} ${kind} origin pair ${pairIndex} missing`,
      );
      check(
        character,
        `${kind} origin discipline`,
        pair.disciplineId,
        disciplineId,
      );
      check(character, `${kind} origin ability`, pair.abilityId, abilityId);
    }

    check(
      character,
      "stage pools/spending/expiry",
      stageFacts(preview),
      expected.stages,
    );
    const unencumberedSpeed = preview.summary.unencumberedSpeed;
    const encumbrancePenalty = Math.max(
      0,
      preview.inventory.bulk - preview.summary.capacity,
    );
    check(character, "HP", preview.summary.maximumHp, expected.stats.hp);
    check(
      character,
      "Grit granted/spent",
      [preview.summary.gritGranted, preview.summary.gritSpent],
      [expected.stats.gritGranted, expected.stats.gritSpent],
    );
    check(
      character,
      "Stability",
      preview.summary.stability,
      expected.stats.stability,
    );
    check(
      character,
      "Speed",
      Math.max(0, unencumberedSpeed - encumbrancePenalty),
      expected.stats.speed,
    );
    check(
      character,
      "capacity",
      preview.summary.capacity,
      expected.stats.capacity,
    );
    check(
      character,
      "carried Bulk",
      preview.inventory.bulk,
      expected.stats.bulk,
    );
    check(
      character,
      "coins [starting, spent, remaining]",
      [
        preview.inventory.startingCoins,
        preview.inventory.spent,
        preview.inventory.remainingCoins,
      ],
      expected.stats.coins,
    );
    check(
      character,
      "learned abilities",
      sorted(preview.state.abilities),
      sorted(expected.abilities),
    );
    check(character, "discipline ranks", preview.state.ranks, expected.ranks);
    check(
      character,
      "language choices and permissions",
      preview.summary.languages.map(({ id, name, permissions }) => ({
        id,
        name,
        permissions,
      })),
      expected.languages.map(([id, name, profile]) => ({
        id,
        name,
        permissions: permissionProfiles[profile],
      })),
    );
    check(
      character,
      "inventory items and hands",
      preview.inventory.items
        .map((item) => [item.catalogId, item.hands ?? 0])
        .sort(([a], [b]) => a.localeCompare(b)),
      expected.items,
    );

    for (const [abilityId, selection] of Object.entries(draft.acquisitions)) {
      const receipt = preview.state.acquisitionReceipts.find(
        (entry) => entry.abilityId === abilityId,
      );
      assert(
        receipt,
        `${character.name} acquisition receipt missing: ${abilityId}`,
      );
      check(
        character,
        `acquisition selection ${abilityId}`,
        receipt.selection,
        selection,
      );
    }

    check(character, "recipe grants", preview.state.recipes, expected.recipes);
  });
