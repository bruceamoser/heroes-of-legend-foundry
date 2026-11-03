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
  assert.equal(r.summary.speedBase, 6);
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
test("ancestry requires two distinct matching traits without an invented remembered-community requirement", () => {
  const d = draft();
  d.traitIds = ["trait-human-weathered", "trait-human-weathered"];
  assert(!creationIdentity(d, catalog).valid);
  d.traitIds = ["trait-elf-age-of-memory", "trait-human-weathered"];
  assert(!creationIdentity(d, catalog).valid);
  d.ancestryId = "ancestry-elf";
  d.traitIds = ["trait-elf-age-of-memory", "trait-elf-unhurried-grace"];
  assert(creationIdentity(d, catalog).valid);
});
test("all ten ancestries use their released HP, Speed and selected permanent benefits", () => {
  const cases = [
    ["ancestry-human", 2, 6, ["trait-human-weathered", "trait-human-far-walker"], 1, 0, 0, 0],
    ["ancestry-high-elf", 3, 6, ["trait-high-elf-starlight-eyes", "trait-high-elf-practised-hand"], 0, 0, 0, 0],
    ["ancestry-elf", 2, 6, ["trait-elf-age-of-memory", "trait-elf-unhurried-grace"], 0, 1, 0, 0],
    ["ancestry-dwarf", 4, 5, ["trait-dwarf-deep-constitution", "trait-dwarf-low-center"], 1, 0, 0, 1],
    ["ancestry-deep-dwarf", 2, 5, ["trait-deep-dwarf-eyes-for-the-dark", "trait-deep-dwarf-stone-tells-you"], 0, 0, 0, 0],
    ["ancestry-halfling", 1, 5, ["trait-halfling-stout-heart", "trait-halfling-resilient"], 1, 0, 1, 0],
    ["ancestry-tallfolk", 5, 6, ["trait-tallfolk-you-take-the-blow", "trait-tallfolk-broad-back"], 0, 1, 3, 0],
    ["ancestry-gnome", 1, 6, ["trait-gnome-small-target", "trait-gnome-whats-it-made-of"], 0, 0, 0, 0],
    ["ancestry-goblin", 1, 6, ["trait-goblin-run-away-better", "trait-goblin-never-where-you-aim"], 0, 1, 0, 0],
    ["ancestry-oath-bound", 2, 6, ["trait-oath-bound-the-mark", "trait-oath-bound-the-debt-comes-due"], 0, 0, 0, 0],
  ];
  for (const [id, hp, speed, traits, hpBonus, speedBonus, capacityBonus, stability] of cases) {
    const d = {...draft(), ancestryId: id, traitIds: traits, rememberedCommunity: "Old Reedbank"};
    const before = structuredClone(d);
    const result = creationIdentity(d, catalog);
    assert.deepEqual(result.errors, [], id);
    assert.equal(get(id).hp, hp, id);
    assert.equal(get(id).speed, speed, id);
    assert.equal(result.summary.maximumHp, 12 + hp + get(d.classId).hp + d.attributes.fortitude + 2 + hpBonus, id);
    assert.equal(result.summary.speedBase, speed + speedBonus, id);
    assert.equal(result.summary.capacity, 13 + capacityBonus, id);
    assert.equal(result.summary.stability, stability, id);
    assert.deepEqual(d, before, "Derivation preserves choices and ledgers.");
  }
});
test("A Foot in Two Worlds grants one DA-approved ordinary language with its normal permissions", () => {
  const traits = ["trait-human-many-homes"];
  const r = languageGrants(
    { home: "elven", ancestry:"dwarven" },
    traits,
  );
  assert(r.valid);
  assert.equal(r.languages.length, 3);
  assert(r.languages[1].permissions.read);
  assert(r.languages[2].permissions.read);
  assert(r.languages[2].permissions.speak);
  const signed=languageGrants({home:"elven",ancestry:"way-sign"},traits);
  assert(signed.valid);
  assert(signed.languages[2].permissions.sign);
  assert(!signed.languages[2].permissions.speak);
  assert(
    !languageGrants(
      { home: "elven", ancestry: "elven" },
      traits,
    ).valid,
  );
  assert(
    !languageGrants({ home: "elven", extraSpoken: ["dwarven", "harbor-cant"] }, traits).valid,
  );
  assert(!languageGrants({home:"elven"},traits).valid);
});
test("A Foot in Two Worlds grants one chosen other-ancestry trait while keeping Human HP and Speed",()=>{
  const d={...draft(),traitIds:["trait-human-many-homes","trait-human-far-walker"],borrowedAncestryId:"ancestry-tallfolk",borrowedTraitId:"trait-tallfolk-broad-back",languages:{home:"elven",ancestry:"dwarven"}};
  const result=creationIdentity(d,catalog);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.summary.capacity,16);
  assert.equal(result.summary.speedBase,6);
  assert.equal(result.summary.maximumHp,18);
  assert.equal(result.summary.ancestryTraitIds.length,3);
  assert.equal(result.summary.languages.length,3);
  assert.equal(creationIdentity({...d,borrowedAncestryId:"ancestry-human",borrowedTraitId:"trait-human-weathered"},catalog).valid,false);
  assert.equal(creationIdentity({...d,borrowedTraitId:"trait-gnome-small-target"},catalog).valid,false);
  assert.equal(creationIdentity({...d,borrowedTraitId:undefined},catalog).valid,false);
  const longStride=creationIdentity({...d,borrowedTraitId:"trait-tallfolk-you-take-the-blow"},catalog);
  assert.equal(longStride.summary.speedBase,7);
  assert.equal(longStride.summary.capacity,13);
  const smallTarget=creationIdentity({...d,borrowedAncestryId:"ancestry-gnome",borrowedTraitId:"trait-gnome-small-target"},catalog);
  assert.equal(smallTarget.summary.defenseBoons,1);
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
