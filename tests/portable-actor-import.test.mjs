import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { PORTABLE_FORMAT, MAX_CHARACTER_BYTES, readPortableCharacter, writePortableCharacter } from "../src/rules/portable-character.mjs";
import { nativePlayEffects } from "../src/rules/native-play-import.mjs";
import { importedCharacterState } from "../src/rules/native-character-state.mjs";
import { abilityItemSource, equipmentItemSource } from "../src/rules/item-construction.mjs";
import { DEFAULT_LANGUAGES } from "../src/rules/languages.mjs";
import { newCreationDraft } from "../src/rules/creation.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const choices = await read("../static/data/choices.json");
const inventory = await read("../static/data/inventory.json");
const fixtures = await read("./fixtures/reference-heroes.json");
const catalogs = { choices: choices.records, inventory, commit: choices.sourceCommit };
const languages = { definitions: [...DEFAULT_LANGUAGES, ...fixtures.campaignLanguages], basis: "campaign-language-basis" };
let nextId = 0;
const expandObject = changes => {
  const expanded = {};
  for (const [key, value] of Object.entries(changes)) {
    const path = key.split("."); let target = expanded;
    for (const part of path.slice(0, -1)) target = target[part] ??= {};
    target[path.at(-1)] = value;
  }
  return expanded;
};
const utils = { randomID: () => String(++nextId).padStart(16, "0"), expandObject };
async function load(path, exports, globals = {}) {
  const context = createContext({ structuredClone, TextEncoder, Date, ...globals });
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
  await module.link(async () => {
    const dependency = new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
    await dependency.link(() => {}); await dependency.evaluate(); return dependency;
  });
  await module.evaluate(); return module.namespace;
}
const creation = await load("../src/services/creation.mjs", {
  createActionMessage() {}, shouldProcessRequest() {}, registerAuthority() {}, ensureAuthorityReady() {},
  writeCharacterActor() {}, isCreationAuthority() {}, bindCreationAuthority() {}, enqueueCharacterOperation() {},
  loadCatalogs() {}, getCampaignLanguageConfiguration() {}, workshopCharacter() {},
  nativePlayEffects, importedCharacterState, abilityItemSource, equipmentItemSource,
}, { foundry: { utils } });
const importer = await load("../src/services/portable-actor-import.mjs", {
  readPortableCharacter, nativePlayEffects, importedCharacterState,
  buildCharacterItems: creation.buildCharacterItems,
  loadCatalogs: async () => catalogs, getCampaignLanguageConfiguration: () => languages,
}, { foundry: { utils } });

function portable(draft = fixtures.characters[0].draft) {
  return JSON.parse(writePortableCharacter(draft, catalogs, { languages: languages.definitions }));
}

test("all six portable book heroes construct complete current native character sources", () => {
  for (const hero of fixtures.characters) {
    const source = portable(hero.draft);
    source._id = "untrusted"; source.ownership = { default: 3 }; source.system = { health: { baseMax: 9999 } };
    const result = importer.buildPortableActorSource(source, catalogs, languages);
    const { preview } = readPortableCharacter(source, catalogs, languages.definitions);
    assert.equal(result.name, hero.draft.name);
    assert.equal(result.type, "character");
    assert.equal(result.prototypeToken.name, hero.draft.name);
    assert.equal(result.prototypeToken.actorLink, true);
    assert.equal(result.system.health.baseMax, preview.summary.maximumHp);
    assert.equal(result.system.health.value, preview.summary.maximumHp);
    assert.equal(result.flags["heroes-of-legend"].creationReceipt.status, "complete");
    assert.equal(result.flags["heroes-of-legend"].development.sourceCommit, catalogs.commit);
    assert.equal(result.items.filter(item => item.type === "equipment").length, preview.inventory.items.length);
    const ids = result.items.map(item => item._id);
    assert.equal(new Set(ids).size, ids.length);
    for (const ability of catalogs.choices.filter(record => record.kind === "ability" && record.universal))
      assert(result.items.some(item => item.flags?.["heroes-of-legend"]?.catalogId === ability.id));
    assert.equal(result._id, undefined); assert.equal(result.ownership, undefined);
  }
});

test("native source preserves portable play resources, inventory choices, conditions, scars and mapped favorites", () => {
  const draft = structuredClone(fixtures.characters[0].draft);
  draft.profile = { story: "Imported story", pronouns: "they" };
  draft.play = {
    hp: 2, gritSpent: 1, memorizedMessage: "Remember the bridge",
    favorites: { abilities: [draft.signatureId], items: ["inventory-import-food"] },
    inventory: { added: [{ id: "item-food-bundle", quantity: 3, instanceId: "inventory-import-food" }], removed: [] },
    conditions: [{ id: "slow", key: "slowed", rating: 1, persistence: "starred", source: "Saved condition" }],
    wounds: [{ id: "scar", name: "Old bridge scar", notes: "Local remedy", progress: 2 }],
  };
  draft.loadout = { "inventory-import-food": { carried: false, held: false, worn: false } };
  const result = importer.buildPortableActorSource(portable(draft), catalogs, languages);
  assert.equal(result.system.health.value, 2); assert.equal(result.system.grit.spent, 1);
  assert.equal(result.system.biography, "Imported story");
  assert.equal(result.system.memorizedMessage, "Remember the bridge");
  const food = result.items.find(item => item.flags?.["heroes-of-legend"]?.acquisitionInstance === "inventory-import-food");
  assert.equal(food.system.quantity, 3); assert.equal(food.system.carried, false);
  assert(result.flags["heroes-of-legend"].characterSheet.favorites.includes(food._id));
  assert.equal(result.effects[0].flags["heroes-of-legend"].condition.rating, 1);
  assert.equal(Object.values(result.flags["heroes-of-legend"].wounds)[0].injury, "Old bridge scar");
});

test("incomplete and malformed portable characters fail without allocating native documents", () => {
  const before = nextId;
  assert.throws(() => importer.buildPortableActorSource(portable(newCreationDraft()), catalogs, languages), /unresolved choices/);
  const invalid = portable(); invalid.draft.attributes.brawn = 999;
  assert.throws(() => importer.buildPortableActorSource(invalid, catalogs, languages), /malformed/);
  assert.equal(nextId, before);
});

async function actorApi() {
  const calls = [];
  class NativeActor {
    static async fromImport(source, context) { calls.push(["native-fromImport", source, context]); return source; }
    static fromSource(source, context) { calls.push(["fromSource", context]); return source; }
    async importFromJSON(json) {
      calls.push(["native-importFromJSON"]);
      const data = await this.constructor.fromImport(JSON.parse(json));
      // Native V14 removes preserveOnImport fields before its replacement update.
      for (const key of ["_id", "sort", "ownership", "folder"]) delete data[key];
      Object.assign(this, data); calls.push(["update"]); return this;
    }
  }
  const { HOLActor } = await load("../src/documents/actor.mjs", {
    ConditionPanel: class {}, PORTABLE_FORMAT, MAX_CHARACTER_BYTES,
    portableActorSource: importer.portableActorSource,
  }, { foundry: { documents: { Actor: NativeActor } }, game: { user: {} } });
  const actor = new HOLActor();
  Object.assign(actor, { type: "character", name: "Prior hero", ownership: { owner: 3 }, _id: "destination", testUserPermission: () => true });
  return { HOLActor, actor, calls };
}

test("native Import Data actually replaces a completed Actor while retaining destination identity and ownership", async () => {
  const { actor, calls } = await actorApi();
  actor.items = [{ name: "Old campaign item" }]; actor.flags = { "heroes-of-legend": { creationReceipt: { status: "complete" } } };
  const result = await actor.importFromJSON(JSON.stringify(portable()));
  assert.equal(result, actor); assert.equal(actor.name, fixtures.characters[0].draft.name);
  assert.equal(actor._id, "destination"); assert.equal(actor.ownership.owner, 3);
  assert(!actor.items.some(item => item.name === "Old campaign item"));
  assert.equal(calls.filter(([kind]) => kind === "update").length, 1);
  const options = calls.find(([kind]) => kind === "fromSource")[1];
  assert.equal(options.strict, true); assert.equal(options.dropInvalidEmbedded, false);
  assert(!calls.some(([kind]) => kind === "native-fromImport"));
});

test("ordinary Foundry JSON retains its native migration path and construction context", async () => {
  const { HOLActor, actor, calls } = await actorApi();
  const source = { name: "Native actor", type: "character", _stats: { coreVersion: "14.367" } };
  const context = { strict: false };
  await HOLActor.fromImport(source, context);
  assert.equal(calls[0][0], "native-fromImport"); assert.equal(calls[0][2], context);
  await actor.importFromJSON(JSON.stringify(source));
  assert.equal(actor.name, "Native actor");
});

test("portable import rejects unauthorized, noncharacter, token and oversized inputs before mutation", async () => {
  for (const changes of [{ testUserPermission: () => false }, { type: "creature" }, { isToken: true }, { pack: "pack" }]) {
    const { actor, calls } = await actorApi(); Object.assign(actor, changes);
    await assert.rejects(actor.importFromJSON(JSON.stringify(portable())), /own|world character/);
    assert.equal(calls.length, 0);
  }
  const { actor, calls } = await actorApi();
  const oversized = portable(); oversized.padding = "x".repeat(MAX_CHARACTER_BYTES);
  await assert.rejects(actor.importFromJSON(JSON.stringify(oversized)), /too large/);
  assert.equal(calls.length, 0);
});
