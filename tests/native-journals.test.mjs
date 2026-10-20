import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import { stableFoundryId } from "../scripts/content/item-packs.mjs";
import { openLocalRule, importRuleJournals, ruleIndex, searchLocalRules } from "../src/services/journals.mjs";
const root = new URL("../", import.meta.url);
const index = JSON.parse(await readFile(new URL("static/data/journal-index.json", root)));
const lock = JSON.parse(await readFile(new URL("content/source-lock.json", root)));
test("official journal pack compilation retains every document and embedded page", async t => {
  const directory = await mkdtemp(join(tmpdir(), "hol-native-journals-"));
  t.after(() => rm(directory, {recursive:true,force:true}));
  for (const name of ["player-rules", "da-rules"]) {
    await compilePack(fileURLToPath(new URL(`content/journals/${name}/`, root)), join(directory,name));
    await extractPack(join(directory,name),join(directory,`${name}-unpacked`));
    const files = (await readdir(join(directory,`${name}-unpacked`))).filter(name=>name.endsWith(".json"));
    assert.equal(files.length,index.records.filter(record=>record.pack===name).length);
    for (const file of files) {
      const document = JSON.parse(await readFile(join(directory,`${name}-unpacked`,file)));
      const expected = JSON.parse(await readFile(new URL(`content/journals/${name}/${document._id}.json`,root)));
      assert.deepEqual(document,expected);
    }
  }
});
test("native rule journals cover every pinned Markdown source with stable identity and separated access", async () => {
  const expected = lock.records.filter(record => record.path.endsWith(".md"));
  assert.equal(index.sourceCommit, lock.commit); assert.equal(index.records.length, expected.length);
  const ids = new Set();
  for (const record of index.records) {
    assert.equal(expected.find(source => source.path === record.path)?.sha256, record.sha256);
    assert.equal(record.id, stableFoundryId(record.path, "native-rule-journal"));
    assert.ok(!ids.has(record.id)); ids.add(record.id);
    const entry = JSON.parse(await readFile(new URL(`content/journals/${record.pack}/${record.id}.json`, root)));
    const da = /^design\/(da-book|bestiary|monster-abilities)\//.test(record.path);
    assert.equal(entry.ownership.default, da ? 0 : 2);
    assert.equal(entry.pages[0]._id, record.pageId); assert.equal(entry.flags["heroes-of-legend"].ruleSource.commit, lock.commit);
    assert.ok(!/<script|onerror=|href="https:\/\/github/i.test(entry.pages[0].text.content));
    if (!da) assert.ok(!entry.pages[0].text.content.includes("Compendium.heroes-of-legend.da-rules"));
  }
});
test("native local references enforce read permission and preserve renamed/edited imported rules", async () => {
  const previous = { game: globalThis.game, fetch: globalThis.fetch, fromUuid: globalThis.fromUuid, JournalEntry: globalThis.JournalEntry };
  const small = index.records.filter(record => record.path === "design/rules/languages.md" || record.path.startsWith("design/da-book/")).slice(0, 2);
  const shared = index.records.find(record => record.path === "design/rules/languages.md");
  small.push(shared);
  const records = [...new Map(small.map(record => [record.id, record])).values()];
  const edited = { name: "Our renamed language rules", getFlag: () => ({ path: shared.path }), testUserPermission: () => true, pages: { find: () => ({ id: shared.pageId, testUserPermission: () => true, parent: { sheet: { render: async () => {} } } }) } };
  const journal = [edited], created = [];
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ records }) });
    globalThis.game = { user: { isGM: true }, journal, packs: { get: () => ({ getDocuments: async () => records.map(record => ({ id: record.id, testUserPermission: () => record.pack === "player-rules" || game.user.isGM, pages: [{text:{content:"<p>Unusual fulltext needle</p>"}}], toObject: () => ({ _id: record.id, ownership: {}, flags: { "heroes-of-legend": { ruleSource: { path: record.path } } } }) })) }) } };
    globalThis.JournalEntry = { createDocuments: async (batch, options) => { assert.equal(options.keepId, true); for (const data of batch) { created.push(data); journal.push({ id: data._id, getFlag: () => data.flags["heroes-of-legend"].ruleSource }); } return batch; } };
    const result = await importRuleJournals(); assert.equal(result.retained, 1); assert.equal(edited.name, "Our renamed language rules");
    assert.ok(created.every(data => data.ownership.default === 0));
    assert.equal((await importRuleJournals()).created, 0);
    game.user.isGM = false;
    assert.ok((await ruleIndex()).every(record => record.pack === "player-rules"));
    await assert.rejects(importRuleJournals(), /Dungeon Architect/);
    await openLocalRule(shared.path);
    await assert.rejects(openLocalRule(records.find(record => record.pack === "da-rules").path), /unavailable/);
    assert.deepEqual([...(await searchLocalRules("unusual fulltext", "design/rules/"))], [shared.path]);
    game.user.isGM = true;
    journal.length = 0;
    JournalEntry.createDocuments = async batch => {
      for (const data of batch) journal.push({id:data._id,getFlag:()=>data.flags["heroes-of-legend"].ruleSource});
      throw new Error("Another GM created these same IDs.");
    };
    const raced = await importRuleJournals();
    assert.equal(raced.created, 0); assert.equal(raced.retained, records.length);
    journal.length = 0;
    journal.push({id:shared.id,getFlag:()=>({path:"unrelated-local-notes"})});
    await assert.rejects(importRuleJournals(), /unrelated world journal/);
  } finally { Object.assign(globalThis, previous); }
});
