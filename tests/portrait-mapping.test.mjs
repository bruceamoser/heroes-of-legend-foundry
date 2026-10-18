import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { readContentPackCatalogs, buildContentPackArtifacts } from "../scripts/content/content-packs.mjs";
const root = new URL("../", import.meta.url);
const catalogs = await readContentPackCatalogs(root);
const artifacts = buildContentPackArtifacts(catalogs);
const creatures = new Map(artifacts.documents.creatures.map(d => [d.flags['heroes-of-legend'].catalogId,d]));

test("all creature and linked summon portraits use installed shared assets without changing identities or footprints", () => {
  assert.equal(creatures.size, 192);
  assert.equal(artifacts.documents.summons.length, 73);
  for (const actor of [...creatures.values(), ...artifacts.documents.summons]) {
    const flags = actor.flags['heroes-of-legend'];
    const portrait = catalogs.art.portraits.find(p => p.id === flags.portrait.creatureId);
    assert.equal(actor.img, `systems/heroes-of-legend/${portrait.asset}`);
    assert.equal(actor.prototypeToken.texture.src, actor.img);
    const footprint = actor.system.footprint;
    assert.equal(actor.prototypeToken.width, footprint.width);
    assert.equal(actor.prototypeToken.height, footprint.height);
    assert.equal(flags.portrait.sourceSha256, portrait.sourceSha256);
    assert.equal(flags.portrait.width, portrait.width);
    assert.equal(flags.portrait.height, portrait.height);
    assert.equal(flags.portrait.alpha, portrait.alpha);
    if (actor.type === 'summon') {
      const link = catalogs.lock.summonLinks.find(l => l.id === flags.catalogId);
      assert.equal(actor.img, creatures.get(link.creatureId).img);
    }
  }
  assert.equal(new Set([...creatures.values()].map(a=>a.img)).size,192);
});

test("missing, unsafe or stale source portrait mappings fail generation and encoded hash changes require regeneration", () => {
  for (const mutate of [
    c => c.art.portraits.pop(), c => c.art.portraits[0].asset='../outside.webp',
    c => c.art.portraits[0].sourceSha256='0'.repeat(64),
    c => c.art.portraits[0].sourcePath='guessed.png', c => c.art.source.lockSha256='0'.repeat(64),
    c => c.art.assets.pop(),
  ]) {
    const changed=structuredClone(catalogs); mutate(changed);
    assert.throws(()=>buildContentPackArtifacts(changed));
  }
  const changed=structuredClone(catalogs);
  changed.art.assets[0].sha256='0'.repeat(64);
  assert.notEqual(buildContentPackArtifacts(changed).index.packs.find(p=>p.name==='creatures').semanticSha256,
    artifacts.index.packs.find(p=>p.name==='creatures').semanticSha256);
});

test("release retains actual runtime catalogs and omits build-only creature and summon intake data", async () => {
  for (const name of ['choices','inventory','wounds'])
    await access(new URL(`dist/heroes-of-legend/data/${name}.json`,root));
  for (const name of ['creatures','summons'])
    await assert.rejects(access(new URL(`dist/heroes-of-legend/data/${name}.json`,root)),{code:'ENOENT'});
  const runtime=await readFile(new URL('src/services/catalog.mjs',root),'utf8');
  assert(runtime.includes('["choices", "inventory"]'));
});
