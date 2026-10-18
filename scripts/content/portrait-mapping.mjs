import assert from "node:assert/strict";

/** Resolve installed-system URLs exclusively from the source-locked art manifest. */
export function resolvePortraitMappings({ art, lock, lockSha256 }) {
  assert.equal(art.schemaVersion, 1);
  assert.equal(art.source.commit, lock.commit);
  assert.equal(art.source.repository, lock.repository);
  assert.equal(art.source.lockSha256, lockSha256, "Portrait source-lock hash drift");
  assert.equal(art.rights.distributionLicense, "undecided");
  assert.equal(art.portraits.length, 192);
  assert.equal(art.assets.length, 192);
  const assets = new Map(art.assets.map(a => [a.runtimePath, a]));
  assert.equal(assets.size, art.assets.length, "Duplicate portrait asset");
  const mappings = new Map();
  for (const portrait of art.portraits) {
    const source = lock.assets.find(a => a.id === portrait.id);
    assert(source, `Portrait is not source-locked: ${portrait.id}`);
    assert(!mappings.has(portrait.id), `Duplicate portrait mapping: ${portrait.id}`);
    assert.equal(portrait.sourcePath, source.path);
    assert.equal(portrait.sourceSha256, source.sha256);
    assert.equal(portrait.provenance, source.provenance);
    assert.equal(portrait.width, source.width);
    assert.equal(portrait.height, source.height);
    assert.equal(portrait.alpha, source.alpha);
    assert.equal(portrait.asset, `assets/creatures/${source.sha256}.webp`);
    const asset = assets.get(portrait.asset);
    assert(asset, `Missing portrait asset mapping: ${portrait.id}`);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.equal(asset.width, source.width);
    assert.equal(asset.height, source.height);
    assert.equal(asset.hasAlpha, source.alpha);
    mappings.set(portrait.id, {
      img: `systems/heroes-of-legend/${portrait.asset}`,
      provenance: { creatureId: portrait.id, asset: portrait.asset, sha256: asset.sha256,
        sourceSha256: source.sha256, width: source.width, height: source.height,
        alpha: source.alpha, provenance: source.provenance },
    });
  }
  assert.deepEqual([...mappings.keys()].sort(), lock.assets.map(a => a.id).sort());
  return mappings;
}
