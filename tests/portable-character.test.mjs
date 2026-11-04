import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readPortableCharacter,
  writePortableCharacter,
  MAX_CHARACTER_BYTES,
  currentCreationDraft,
} from "../src/rules/portable-character.mjs";
import { DEFAULT_LANGUAGES } from "../src/rules/languages.mjs";
import { newCreationDraft } from "../src/rules/creation.mjs";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const source = await read("../static/data/choices.json"),
  inventory = await read("../static/data/inventory.json"),
  fixtures = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: source.records,
  inventory,
  commit: source.sourceCommit,
};
const languages = [...DEFAULT_LANGUAGES, ...fixtures.campaignLanguages];
test("all six complete book heroes retain choices through portable JSON", () => {
  for (const hero of fixtures.characters) {
    const text = writePortableCharacter(hero.draft, catalogs, {
      ready: true,
      languages,
    });
    const restored = readPortableCharacter(text, catalogs, languages);
    assert.equal(restored.preview.valid, true, hero.name);
    assert.equal(restored.draft.name, hero.draft.name);
    assert.deepEqual(restored.draft.purchases, hero.draft.purchases);
    assert.deepEqual(restored.draft.acquisitions, hero.draft.acquisitions);
    assert.equal(
      writePortableCharacter(restored.draft, catalogs, { languages }),
      text,
    );
  }
});
test("incomplete drafts round trip without masquerading as ready characters", () => {
  const d = newCreationDraft();
  const text = writePortableCharacter(d, catalogs);
  assert.equal(JSON.parse(text).status, "draft");
  assert.equal(readPortableCharacter(text, catalogs).preview.valid, false);
  assert.throws(
    () => writePortableCharacter(d, catalogs, { ready: true }),
    /Finish the choices/,
  );
});
test("derived Actor state and unsafe fields are never accepted from an imported file", () => {
  const value = JSON.parse(
    writePortableCharacter(fixtures.characters[0].draft, catalogs),
  );
  value.system = { health: { value: 9999 } };
  value.draft.attributes.cheat = 9999;
  value.draft.items = [{ name: "Free sword" }];
  value.draft.profile = {
    story: "<script>alert(1)</script>",
    player: "Reader",
    ownership: { default: 3 },
  };
  const { draft, preview } = readPortableCharacter(value, catalogs);
  assert.equal(draft.items, undefined);
  assert.equal(draft.attributes.cheat, undefined);
  assert.equal(draft.profile.ownership, undefined);
  assert.equal(preview.valid, true);
  assert(preview.summary.maximumHp < 9999);
});
test("malformed and excessive files fail before mutation", () => {
  const source = JSON.parse(
    writePortableCharacter(newCreationDraft(), catalogs),
  );
  for (const edit of [
    (v) => (v.schemaVersion = 4),
    (v) => (v.draft.purchases[0] = null),
    (v) => (v.draft.languages.home = []),
    (v) => (v.draft.attributes.brawn = 99),
    (v) => (v.draft.shopping = [{ id: "x", quantity: -1 }]),
  ]) {
    const v = structuredClone(source);
    edit(v);
    assert.throws(() => readPortableCharacter(v, catalogs));
  }
  const old = structuredClone(source);
  old.sourceCommit = "old";
  assert.deepEqual(
    readPortableCharacter(old, catalogs).draft,
    readPortableCharacter(source, catalogs).draft,
  );
  assert.throws(
    () => readPortableCharacter(" ".repeat(MAX_CHARACTER_BYTES + 1), catalogs),
    /too large/,
  );
});
test("campaign language differences become repairable review errors, never world setting changes", () => {
  const hero = fixtures.characters.find(
    (h) => h.draft.languages.home === "reed-speech",
  );
  assert(hero);
  const text = writePortableCharacter(hero.draft, catalogs, {
    ready: true,
    languages,
  });
  const result = readPortableCharacter(text, catalogs);
  assert.equal(result.draft.languages.home, "reed-speech");
  assert.equal(result.preview.valid, false);
  assert(result.preview.errors.some((e) => e.code === "language-availability"));
});

test("choice fields survive portable parsing at creation and later levels without derived grants", () => {
  const draft = structuredClone(fixtures.characters[0].draft);
  draft.acquisitions["ability-another-tongue"] = { languageId: "goblin" };
  draft.acquisitions["ability-a-party-piece"] = { instrument: "lute" };
  draft.progression = {
    level: 2,
    levels: {
      2: {
        purchases: [],
        signatures: {},
        acquisitions: {
          "ability-a-party-piece": { instrument: "flute" },
          "ability-another-tongue": { languageId: "orc" },
        },
      },
    },
  };
  draft.play = { memorizedMessage: "Meet at dawn." };
  const result = readPortableCharacter(
    writePortableCharacter(draft, catalogs, { languages }),
    catalogs,
    languages,
  );
  assert.equal(
    result.draft.acquisitions["ability-another-tongue"].languageId,
    "goblin",
  );
  assert.equal(
    result.draft.acquisitions["ability-a-party-piece"].instrument,
    "lute",
  );
  assert.equal(
    result.draft.progression.levels[2].acquisitions["ability-a-party-piece"]
      .instrument,
    "flute",
  );
  assert.equal(
    result.draft.progression.levels[2].acquisitions["ability-another-tongue"]
      .languageId,
    "orc",
  );
  assert.equal(result.draft.play.memorizedMessage, "Meet at dawn.");
  assert.equal(
    result.preview.state.languages.some(
      (entry) => entry.source === "ability-another-tongue",
    ),
    false,
  );
});

test("retired Turn the Crowd choices normalize narrowly and immutably across creation and later levels", () => {
  const old = "ability-turn-the-crowd", current = "ability-a-common-tongue";
  const input = {
    purchases: {0: [{id: old}, {id: "ability-conditioned-body"}], 1: [{id: current}]},
    acquisitions: {[old]: {instrument: "preserved"}, "ability-another-tongue": {languageId: "orc"}},
    progression: {level: 7, levels: {7: {purchases: [{id: old}], acquisitions: {[old]: {specialty: "history"}}}}},
    play: {hp: 0, gritSpent: 2, wounds: [{id: "wound-1", name: "Scar", notes: "Keep"}]},
  };
  const before = structuredClone(input);
  const normalized = currentCreationDraft(input, "old-source");
  assert.deepEqual(input, before);
  assert.deepEqual(normalized.purchases, {0: [{id: current}, {id: "ability-conditioned-body"}], 1: []});
  assert.deepEqual(normalized.progression.levels[7].purchases, []);
  assert.deepEqual(normalized.acquisitions[current], {instrument: "preserved"});
  assert.deepEqual(normalized.progression.levels[7].acquisitions[current], {specialty: "history"});
  assert(!Object.hasOwn(normalized.acquisitions, old));
  assert.deepEqual(normalized.play, before.play);
  assert.deepEqual(currentCreationDraft(normalized), normalized);
});

test("old portable level-seven purchase becomes exactly one current ability at the same eight DP cost", () => {
  const old = "ability-turn-the-crowd", current = "ability-a-common-tongue";
  const d = structuredClone(fixtures.characters[0].draft);
  d.progression = {level: 7, levels: {
    2: {purchases: [{id: "discipline-influence", rank: 1}]},
    3: {purchases: [{id: "discipline-influence", rank: 2}], signatures: {3: "ability-signature-protector-break-their-advance"}},
    4: {purchases: [{id: "discipline-influence", rank: 3}]},
    7: {purchases: [{id: old}], acquisitions: {[old]: {}}, signatures: {7: "ability-signature-protector-unbroken-passage"}},
  }};
  const file = {format: "heroes-of-legend-character", schemaVersion: 3, sourceCommit: "old-source", draft: d};
  const before = structuredClone(file);
  const result = readPortableCharacter(file, catalogs, languages);
  assert.deepEqual(file, before);
  assert.equal(result.preview.valid, true, JSON.stringify(result.preview.errors));
  assert.deepEqual(result.draft.progression.levels[7].purchases, [{id: current}]);
  assert.equal(result.preview.state.abilities.filter(id => id === current).length, 1);
  assert(!result.preview.state.abilities.includes(old));
  const paid = result.preview.advancementLedger.filter(entry => entry.id === current);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].delta, -8);
  const canonical = structuredClone(file);
  canonical.draft.progression.levels[7].purchases[0].id = current;
  canonical.draft.progression.levels[7].acquisitions = {[current]: {}};
  assert.equal(readPortableCharacter(canonical, catalogs, languages).preview.state.dp, result.preview.state.dp);
  const duplicate = structuredClone(file);
  duplicate.draft.progression.levels[7].purchases.push({id: current});
  const once = readPortableCharacter(duplicate, catalogs, languages);
  assert.equal(once.preview.valid, true, JSON.stringify(once.preview.errors));
  assert.deepEqual(once.draft.progression.levels[7].purchases, [{id: current}]);
  assert.equal(once.preview.state.dp, result.preview.state.dp);
  assert.equal(once.preview.advancementLedger.filter(entry => entry.id === current).length, 1);
  const missingRank = structuredClone(file);
  missingRank.draft.progression.levels[4].purchases = [];
  const ineligible = readPortableCharacter(missingRank, catalogs, languages);
  assert.equal(ineligible.preview.valid, false);
  assert(!ineligible.preview.state.abilities.includes(current));
});
