import assert from 'node:assert/strict';
import test from 'node:test';
import { copyEquipmentToActor, equipmentCopyOptions } from '../src/services/item-import.mjs';

function fixture({ compendium = false } = {}) {
  const actor = { id: 'hero', uuid: 'Actor.hero', documentName: 'Actor', owner: true,
    testUserPermission() { return this.owner; } };
  const data = { _id: 'original', parent: 'old-parent', folder: 'old-folder', ownership: { other: 3 },
    name: 'Lesser bottle', type: 'equipment', system: { quantity: 3, inventoryDie: 4, held: false },
    flags: { 'heroes-of-legend': { source: { path: 'design/equipment/bottle.md', sha256: 'pinned' } } } };
  const source = { id: 'original', uuid: compendium ? 'Compendium.heroes-of-legend.equipment.Item.original' : 'Item.original',
    documentName: 'Item', type: 'equipment', name: data.name, inCompendium: compendium,
    readable: true, testUserPermission() { return this.readable; }, toObject: () => structuredClone(data) };
  const documents = new Map([[source.uuid, source]]), creates = [], items = [source];
  items.fromCompendium = (item, options) => { assert.equal(item, source); assert.equal(options.keepId, false); return item.toObject(); };
  globalThis.game = { user: { id: 'owner', isGM: false }, items, packs: new Map() };
  globalThis.fromUuid = async (uuid) => documents.get(uuid);
  globalThis.Item = { implementation: { async create(copy, options) {
    creates.push({ data: structuredClone(copy), options });
    return { id: 'new', actor: options.parent, system: copy.system, flags: copy.flags };
  } } };
  return { actor, source, data, creates, documents };
}

for (const compendium of [false, true]) test(`native ${compendium ? 'compendium' : 'world'} equipment copy retains quantity, supply and exact source without sharing ownership`, async () => {
  const f = fixture({ compendium }), before = JSON.stringify(f.data);
  const created = await copyEquipmentToActor(f.actor, f.source.uuid);
  assert.equal(created.actor, f.actor);
  assert.equal(f.creates.length, 1);
  const { data, options } = f.creates[0];
  assert.equal(options.parent, f.actor);
  assert.equal(data._id, undefined); assert.equal(data.parent, undefined);
  assert.equal(data.ownership, undefined); assert.equal(data.folder, undefined);
  assert.equal(data.system.quantity, 3); assert.equal(data.system.inventoryDie, 4);
  assert.deepEqual(data.flags['heroes-of-legend'].source, f.data.flags['heroes-of-legend'].source);
  assert.equal(data.flags['heroes-of-legend'].copySourceUuid, f.source.uuid);
  assert.equal(JSON.stringify(f.data), before);
});

test('equipment copy refuses unreadable, unowned destination, Actor-owned transfer and wrong-type sources before creation', async () => {
  for (const kind of ['unreadable', 'destination', 'transfer', 'ability', 'deleted']) {
    const f = fixture();
    if (kind === 'unreadable') f.source.readable = false;
    if (kind === 'destination') f.actor.owner = false;
    if (kind === 'transfer') f.source.actor = { uuid: 'Actor.other' };
    if (kind === 'ability') f.source.type = 'ability';
    if (kind === 'deleted') f.documents.clear();
    await assert.rejects(copyEquipmentToActor(f.actor, f.source.uuid));
    assert.equal(f.creates.length, 0);
  }
});

test('native copy preserves a synthetic destination and rechecks ownership after resolving the source', async () => {
  const f = fixture(); f.actor.uuid = 'Scene.s.Token.t.Actor.hero';
  assert.equal((await copyEquipmentToActor(f.actor, f.source.uuid)).actor.uuid, f.actor.uuid);
  f.creates.length = 0;
  globalThis.fromUuid = async () => { f.actor.owner = false; return f.source; };
  await assert.rejects(copyEquipmentToActor(f.actor, f.source.uuid), /owner/);
  assert.equal(f.creates.length, 0);
});

test('click equipment choices expose readable world/catalog equipment rather than Actor inventory or abilities', async () => {
  const f = fixture();
  game.items.push({ ...f.source, uuid: 'Item.secret', readable: false }, { ...f.source, uuid: 'Item.ability', type: 'ability' });
  game.packs.set('heroes-of-legend.equipment', { visible: true,
    getIndex: async () => [{ _id: 'bottle', uuid: 'Compendium.heroes-of-legend.equipment.Item.bottle', type: 'equipment', name: 'Bottle' }],
  });
  const choices = await equipmentCopyOptions();
  assert.equal(choices.length, 2);
  assert.ok(choices.some((entry) => entry.uuid === f.source.uuid));
  assert.ok(choices.some((entry) => entry.uuid.includes('Compendium.')));
});
