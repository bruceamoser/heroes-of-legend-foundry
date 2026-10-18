import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReferenceDrops, readReferenceSelection } from '../src/services/reference-play.mjs';

function fixture() {
  const actor = { uuid: 'Actor.hero', testUserPermission: () => true, items: [] };
  const item = { documentName: 'Item', type: 'ability', id: 'ability', uuid: 'Actor.hero.Item.ability',
    actor, name: 'Winter Hold', getFlag: () => null };
  actor.items.push(item); actor.items.get = (id) => actor.items.find((entry) => entry.id === id);
  const classes = () => ({ values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); },
    toggle(value, enabled) { enabled ? this.add(value) : this.remove(value); } });
  const picker = { open: false }, input = { dataset: { referenceId: item.id }, checked: false, closest: () => picker },
    status = { textContent: '', classList: classes() }, listeners = new Map();
  const root = { classList: classes(), inputs: [input], contains: () => false,
    addEventListener(name, run) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(run); },
    querySelector: () => status,
    querySelectorAll(selector) { return selector.includes(':checked') ? this.inputs.filter((entry) => entry.checked) : this.inputs; },
  };
  const documents = new Map([[item.uuid, item]]), draft = { referenceItemIds: [] };
  let selections = 0;
  const context = { actor, options: {} }, choose = () => { selections++; draft.referenceItemIds = readReferenceSelection(root); };
  globalThis.game = { user: { id: 'owner' }, scenes: { viewed: { tokens: [] } } };
  globalThis.fromUuid = async (uuid) => documents.get(uuid);
  function bind() { bindReferenceDrops(root, () => context, choose); }
  async function drop(data) {
    const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => typeof data === 'string' ? data : JSON.stringify(data) } };
    for (const run of listeners.get('drop')) await run(event);
  }
  return { actor, item, root, input, status, picker, listeners, documents, draft, context, bind, drop, selections: () => selections };
}

test('reference drops bind once on persistent shells and select the same inert draft as clicking', async () => {
  const f = fixture();
  f.actor.system = { hp: 10, remaining: { main: 1, reaction: 1 } };
  f.item.system = { cost: 2 };
  const snapshot = () => JSON.stringify({ actor: f.actor.system, item: f.item.system, ids: f.actor.items.map(item => item.id) }), before = snapshot();
  for (let render = 0; render < 6; render++) f.bind();
  assert.equal(f.listeners.get('drop').length, 1);
  assert.equal(f.listeners.get('dragover').length, 1);
  await f.drop({ type: 'Item', uuid: f.item.uuid, actorId: 'forged', system: { freeBonus: 999 } });
  assert.equal(f.selections(), 1);
  assert.deepEqual(f.draft.referenceItemIds, [f.item.id]);
  assert.equal(f.picker.open, true);
  assert.match(f.status.textContent, /Winter Hold.*reference only/);
  await f.drop({ type: 'Item', uuid: f.item.uuid });
  assert.equal(f.selections(), 2);
  assert.deepEqual(f.draft.referenceItemIds, [f.item.id]);
  assert.equal(snapshot(), before);
});

test('foreign, compendium, deleted and wrong-type drops reject without selecting or changing the actor', async () => {
  for (const kind of ['foreign', 'compendium', 'deleted', 'equipment', 'malformed']) {
    const f = fixture(); f.bind();
    const item = { ...f.item, uuid: 'Item.invalid' };
    if (kind === 'foreign') item.actor = { uuid: 'Actor.other' };
    if (kind === 'compendium') item.actor = null;
    if (kind === 'equipment') item.type = 'equipment';
    if (kind !== 'deleted') f.documents.set(item.uuid, item);
    await f.drop(kind === 'malformed' ? 'not a native UUID payload' : { type: 'Item', uuid: item.uuid });
    assert.equal(f.selections(), 0);
    assert.equal(f.input.checked, false);
    assert.equal(f.context.actor, f.actor);
    assert.ok(f.status.classList.values.has('hol-error'));
  }
});

test('drop uses refreshed context after rerender and refuses an actor change during UUID resolution', async () => {
  const f = fixture(); f.bind();
  let resolve;
  globalThis.fromUuid = () => new Promise((done) => { resolve = done; });
  const dropping = f.drop({ type: 'Item', uuid: f.item.uuid });
  const next = { ...f.actor, uuid: 'Actor.next' };
  bindReferenceDrops(f.root, () => ({ actor: next, options: {} }), () => { throw new Error('Must not select'); });
  resolve(f.item); await dropping;
  assert.equal(f.input.checked, false);
  assert.equal(f.listeners.get('drop').length, 1);
  assert.match(f.status.textContent, /dialog's character/);
});

test('drop rechecks current visibility and preserves legitimate any-player defense reference selection', async () => {
  const f = fixture(); f.bind(); f.actor.testUserPermission = () => false;
  await f.drop({ type: 'Item', uuid: f.item.uuid });
  assert.equal(f.input.checked, false);
  f.context.options.mode = 'defense';
  game.scenes.viewed.tokens.push({ actor: f.actor, hidden: false });
  await f.drop({ type: 'Item', uuid: f.item.uuid });
  assert.equal(f.input.checked, true);
});
