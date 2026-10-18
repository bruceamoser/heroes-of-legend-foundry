import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readPortableCharacter,
  writePortableCharacter,
  MAX_CHARACTER_BYTES,
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
test("all six book heroes retain choices and recomputed results through portable JSON", () => {
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
  draft.acquisitions["ability-a-party-piece"] = { specialty: "juggling" };
  draft.progression = {
    level: 2,
    levels: {
      2: {
        purchases: [],
        signatures: {},
        acquisitions: {
          "ability-a-party-piece": { specialty: "singing" },
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
    result.draft.acquisitions["ability-a-party-piece"].specialty,
    "juggling",
  );
  assert.equal(
    result.draft.progression.levels[2].acquisitions["ability-a-party-piece"]
      .specialty,
    "singing",
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
