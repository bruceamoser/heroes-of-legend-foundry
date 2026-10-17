import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANGUAGES,
  languageGrants,
  creationIdentity,
} from "../src/rules/identity.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/choices.json", import.meta.url),
    "utf8",
  ),
).records;
const get = (id) => catalog.find((r) => r.id === id);
const draft = () => ({
  attributes: {
    brawn: 1,
    fortitude: 0,
    agility: 0,
    guile: 0,
    knowledge: 1,
    reason: 1,
  },
  ancestryId: "ancestry-human",
  traitIds: ["trait-human-weathered", "trait-human-far-walker"],
  culture: { id: "origin-culture-deep-halls", pair: 0 },
  background: { id: "origin-background-bridge-worker", pair: 0 },
  classId: "class-intellect",
  classDisciplines: ["discipline-craft", "discipline-scholarship"],
  signatureId: get("class-intellect").signatures[1][0],
  purchases: {
    0: [{ id: "ability-conditioned-body" }],
    1: [{ id: "ability-conditioned-body" }],
  },
  languages: { home: "dwarven", extraSpoken: [] },
});
test("creation identity freezes explicit HP/Speed benefits, pools and coin contributions", () => {
  const d = draft();
  const r = creationIdentity(d, catalog);
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.maximumHp, 19);
  assert.equal(r.summary.speedBase, 7);
  assert.equal(r.summary.capacity, 13);
  assert.equal(r.summary.gritGranted, 2);
  assert.equal(
    r.summary.startingCoins,
    40 +
      get(d.ancestryId).coins +
      get(d.classId).coins +
      get(d.culture.id).coins +
      get(d.background.id).coins,
  );
  d.attributes.fortitude = 2;
  assert.equal(r.summary.creationAttributes.fortitude, 0);
  assert.equal(r.summary.maximumHp, 19);
});
test("ancestry requires two distinct matching traits and remembered communities need a name", () => {
  const d = draft();
  d.traitIds = ["trait-human-weathered", "trait-human-weathered"];
  assert(!creationIdentity(d, catalog).valid);
  d.traitIds = ["trait-elf-age-of-memory", "trait-human-weathered"];
  assert(!creationIdentity(d, catalog).valid);
  d.ancestryId = "ancestry-elf";
  d.traitIds = ["trait-elf-age-of-memory", "trait-elf-unhurried-grace"];
  assert(
    creationIdentity(d, catalog).errors.some(
      (e) => e.code === "remembered-community",
    ),
  );
  d.rememberedCommunity = "Old Reedbank";
  assert(creationIdentity(d, catalog).valid);
});
test("spoken-only extra grants do not grant literacy, signing or duplicates", () => {
  const traits = ["trait-human-many-homes"];
  const r = languageGrants(
    { home: "elven", extraSpoken: ["dwarven", "harbor-cant"] },
    traits,
  );
  assert(r.valid);
  assert.equal(r.languages.length, 4);
  assert(r.languages[1].permissions.read);
  assert(!r.languages[2].permissions.read);
  assert(r.languages[2].permissions.speak);
  assert(
    !languageGrants(
      { home: "elven", extraSpoken: ["way-sign", "dwarven"] },
      traits,
    ).valid,
  );
  assert(
    !languageGrants(
      { home: "elven", extraSpoken: ["elven", "dwarven"] },
      traits,
    ).valid,
  );
  assert(
    !languageGrants({ home: "elven", extraSpoken: ["dwarven"] }, traits).valid,
  );
});
test("ordinary signed languages and campaign availability are independent of ancestry", () => {
  const r = languageGrants({ home: "way-sign" }, []);
  assert(r.valid);
  assert(r.languages[1].permissions.sign);
  assert(!r.languages[1].permissions.speak);
  assert(!languageGrants({ home: "draconic" }, []).valid);
  const campaign = DEFAULT_LANGUAGES.map((d) => ({
    ...d,
    ...(d.id === "draconic" ? { ordinary: true } : {}),
    ...(d.id === "common" ? { name: "Trade Speech" } : {}),
  }));
  const custom = languageGrants({ home: "draconic" }, [], campaign);
  assert(custom.valid);
  assert.equal(custom.languages[0].name, "Trade Speech");
  assert(!languageGrants({ home: "regional-language" }, []).valid);
});
test("no automatic extra languages or attribute-based grants and no malformed campaign identities", () => {
  assert(!languageGrants({ home: "common" }, []).valid);
  assert(
    !languageGrants({ home: "elven", extraSpoken: ["dwarven"] }, []).valid,
  );
  assert.throws(
    () =>
      languageGrants(
        { home: "elven" },
        [],
        [...DEFAULT_LANGUAGES, DEFAULT_LANGUAGES[0]],
      ),
    /definition/,
  );
});
