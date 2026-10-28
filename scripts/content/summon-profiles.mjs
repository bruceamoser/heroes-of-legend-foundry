import assert from "node:assert/strict";
import { parseSummon, verifySourceHash } from "./summons.mjs";
import { validateStableCatalogIds } from "./item-packs.mjs";

export function validateSummonCatalogBasis({ catalog, lock }) {
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.equal(lock.repository, "https://github.com/bruceamoser/heroes-of-legend");
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.source.commit, lock.commit);
  assert.equal(catalog.source.repository, lock.repository);
  assert.equal(catalog.orientation.summonAttackTables, "attacker");
  assert.equal(catalog.records.length, 73);
  assert.equal(catalog.counts.profiles, 73);
  assert.equal(lock.summonLinks.length, 73);
  validateStableCatalogIds(catalog.records);
  const rules = lock.records.find(({ path }) => path === "design/rules/summoning.md");
  assert(rules, "Missing pinned summon rules");
  for (const record of catalog.records) {
    const source = lock.records.find(({ path }) => path === record.source.path);
    const link = lock.summonLinks.find(({ id }) => id === record.id);
    const creature = lock.records.find(({ id }) => id === link?.creatureId);
    assert(source && link && creature, `${record.id}: missing locked source/link`);
    assert.equal(record.source.sha256, source.sha256);
    verifySourceHash(source, Buffer.from(record.reference.sourceMarkdown));
    assert.deepEqual(record, parseSummon(source, record.reference.sourceMarkdown, {
      repository: lock.repository, commit: lock.commit, link, creature, rules,
    }), `${record.id}: catalog differs from pinned source`);
  }
  assert.deepEqual(
    catalog.records.map((record) => record.id).sort(),
    lock.summonLinks.map((record) => record.id).sort(),
  );
  return catalog.records;
}
