import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSummonCatalogBasis } from "../scripts/content/summon-profiles.mjs";
import { summonSystemFromRecord } from "../src/rules/summon-profile.mjs";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root)));
const catalog = await read("static/data/summons.json");
const lock = await read("content/source-lock.json");
const manifest = await read("static/system.json");
const records = validateSummonCatalogBasis({ catalog, lock });

test("73 summon profiles remain pinned metadata, not duplicate Actors", () => {
  assert.equal(records.length, 73);
  assert.equal(new Set(records.map((record) => record.creatureId)).size, 73);
  assert.equal(manifest.documentTypes.Actor.summon, undefined);
  assert(!manifest.packs.some((pack) => pack.name === "summons"));
  for (const record of records) {
    assert.match(record.id, /^summon-/);
    assert.match(record.creatureId, /^creature-/);
    assert(record.reference.sourceMarkdown);
  }
});

test("summon profiles project attacker outcomes and restrictions onto standard creatures", () => {
  for (const record of records) {
    const system = summonSystemFromRecord(record);
    assert.equal(system.basicMelee.orientation, "attacker");
    assert.equal(system.attacks.length, record.attacks.actions.length);
    assert.equal(system.restrictions.canReceiveHealing, false);
    assert.equal(system.restrictions.reactions, false);
    assert.equal(system.restrictions.opportunityAttacks, false);
    assert.equal(system.restrictions.independentTurns, false);
  }
});

test("summon profiles keep exact source hashes and creature links", () => {
  for (const record of records) {
    const locked = lock.records.find((entry) => entry.path === record.source.path);
    const link = lock.summonLinks.find((entry) => entry.id === record.id);
    assert(locked, record.source.path);
    assert.equal(record.source.sha256, locked.sha256);
    assert.equal(link.creatureId, record.creatureId);
  }
});
