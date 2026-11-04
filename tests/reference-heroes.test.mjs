import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
    const ancestry = entries.filter(entry => entry.kind === "trait-grant").reduce((total, entry) => total + entry.delta, 0);
    return [pool + ancestry, compensation, spent, expired];
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
    lock.commit,
    "reference fixture commit",
  );
  assert.equal(fixture.provenance.commit, lock.commit);
  for (const source of [
    fixture.provenance.index,
    ...Object.values(fixture.provenance.characters),
  ]) {
    assert.equal(createHash("sha256").update(source.text).digest("hex"), source.sha256, `${source.path} full text`);
    assert.equal(source.sha256, lock.records.find((record) => record.path === source.path)?.sha256, source.path);
  }
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
  test(`${character.name} matches the complete current authored example`, () => {
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
      ...(draft.borrowedAncestryId ? {borrowedAncestryId: draft.borrowedAncestryId, borrowedTraitId: draft.borrowedTraitId} : {}),
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


// Parse the authored tables independently of fixture expectations and engine ledgers.
// This prevents a matching fixture/engine pair from hiding stale printed examples.
for (const character of fixture.characters)
  test(`${character.name} authored purchases, prices, running balances and identity match the engine`, () => {
    const text = fixture.provenance.characters[character.id].text;
    const preview = heroPreview(character);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    const stats = text.match(/HP (\d+)\/\d+ · Grit (\d+)\/\d+ · Speed (\d+) squares · Bulk (\d+)\/(\d+)/);
    assert(stats, `${character.name} printed statistics`);
    assert.deepEqual(stats.slice(1).map(Number), [preview.summary.maximumHp, preview.summary.gritGranted, preview.summary.unencumberedSpeed, preview.inventory.bulk, preview.summary.capacity]);
    const sections = [...text.matchAll(/^## Level ([01]) —[^\n]+\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
    assert.equal(sections.length, 2);
    for (const [, stageText, section] of sections) {
      const stage = Number(stageText);
      const printed = [...section.matchAll(/^\| (.+?) \| ([^\n]+) \| (\d+) \| (\d+) \|$/gm)].map(([, purchase, , cost, remaining]) => {
        const link = purchase.match(/\]\(\.\.\/cards\/([^)]+)\)/);
        let id;
        if (link) id = choices.find(record => record.source.path === `design/cards/${link[1]}`)?.id;
        else {
          const rank = purchase.match(/\*\*(.+) ([123])\*\*/);
          assert(rank, purchase);
          id = choices.find(record => record.kind === "discipline" && record.name === rank[1])?.id;
        }
        assert(id, purchase);
        return [id, Number(cost), Number(remaining)];
      });
      const actual = preview.ledger.filter(entry => entry.stage === stage && entry.kind === "purchase").map(entry => [entry.sourceId, -entry.delta, entry.balance]);
      assert.deepEqual(actual, printed, `${character.name} level ${stage} exact printed purchase order, cost and running balance`);
    }
    for (const [, label, path] of text.matchAll(/\[([^\]]+)\]\(\.\.\/cards\/([^)]+)\)/g)) {
      const record = choices.find(record => record.source.path === `design/cards/${path}`);
      assert.equal(record?.name, label, `${character.name} current printed ability name`);
    }
    const printedLanguages = text.match(/^\*\*Languages:\*\* ([^\n]+)/m)?.[1];
    for (const language of preview.summary.languages) assert(printedLanguages?.includes(language.name), `${character.name} printed language ${language.name}`);
    if (character.draft.borrowedAncestryId) {
      assert(text.includes(`../ancestries/${character.draft.borrowedTraitId}.md`), `${character.name} printed borrowed trait`);
      assert(preview.summary.ancestryTraitIds.includes(character.draft.borrowedTraitId));
      assert.equal(choices.find(record => record.id === character.draft.borrowedAncestryId)?.name, "Hill Dwarf");
      assert.equal(character.draft.languages.ancestry, "dwarven");
    }
  });
