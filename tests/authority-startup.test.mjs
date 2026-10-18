import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/services/authority.mjs', import.meta.url), 'utf8');
const stamp = '2026-10-18T00:00:00.000Z';
function state(values = {}) {
  return { values: new Map(Object.entries({ creationAuthorityClient: '', authorityMeta: {}, authorityWork: {}, ...values })),
    writes: [], lockHeld: false };
}
async function client(shared, { userId = 'gm', isGM = true, active = true, socketId = 'socket', browserId = 'browser', locks = true } = {}) {
  let ready;
  const warnings = [], events = [];
  const context = createContext({ structuredClone,
    localStorage: { getItem: () => browserId },
    navigator: locks ? { locks: { async request(_name, _options, run) {
      if (shared.lockHeld) return run(null);
      shared.lockHeld = true;
      try { return await run({}); } finally { shared.lockHeld = false; }
    } } } : {},
    foundry: { utils: { randomID: () => browserId } },
    ui: { notifications: { warn(message) { warnings.push(message); } } },
    Hooks: { once(event, callback) { assert.equal(event, 'ready'); ready = callback; },
      callAll(event, data) { events.push([event, data]); } },
    game: { user: { id: userId, isGM }, users: { activeGM: { isSelf: active } },
      socket: { id: socketId, connected: true }, world: { id: 'test', lastPlayed: stamp },
      messages: new Map(), settings: {
        register(_id, key, options) { if (!shared.values.has(key)) shared.values.set(key, structuredClone(options.default)); },
        get(_id, key) { return structuredClone(shared.values.get(key)); },
        async set(_id, key, value) { shared.beforeSet?.(key, value); shared.writes.push([key, structuredClone(value)]); shared.values.set(key, structuredClone(value)); },
      } },
    fromUuid: async () => null,
  });
  const module = new SourceTextModule(source, { context });
  await module.link(() => { throw new Error('Unexpected module dependency'); });
  await module.evaluate();
  module.namespace.registerAuthority();
  return { service: module.namespace, ready: () => ready(), warnings, events };
}

test('pristine world auto-starts existing authority path in active GM window', async () => {
  const shared = state(), gm = await client(shared);
  await gm.ready();
  assert.equal(gm.service.isCreationAuthority(), true);
  assert.equal(shared.values.get('creationAuthorityClient'), 'socket');
  assert.equal(shared.values.get('authorityWork').busy, false);
  assert.equal(gm.events[0][0], 'holAuthorityReady');
  assert.equal(gm.warnings.length, 0);
  await gm.service.releaseAuthority();
  assert.equal(shared.lockHeld, false);
});

test('fresh-world players and non-active GMs cannot auto-claim', async () => {
  for (const options of [{ isGM: false }, { active: false }]) {
    const shared = state(), other = await client(shared, options);
    await other.ready();
    assert.equal(shared.writes.length, 0);
    assert.equal(other.service.isCreationAuthority(), false);
  }
});

test('duplicate tabs race through existing exclusive lock and claim only once', async () => {
  const shared = state(), a = await client(shared, { socketId: 'a' }), b = await client(shared, { socketId: 'b' });
  await Promise.all([a.ready(), b.ready()]);
  const authorities = [a, b].filter((entry) => entry.service.isCreationAuthority());
  assert.equal(authorities.length, 1);
  assert.equal(shared.writes.filter(([key]) => key === 'creationAuthorityClient').length, 1);
  assert.equal(a.warnings.length + b.warnings.length, 0);
  await authorities[0].service.releaseAuthority();
});

test('initial claim does not take existing assignments or partial work checkpoints', async () => {
  for (const values of [
    { authorityMeta: { clientId: 'former' } },
    { authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: stamp } },
    { creationAuthorityClient: 'former', authorityMeta: { clientId: 'different', userId: 'gm', browserId: 'browser', launch: stamp } },
    { authorityWork: { busy: true, requestId: 'unknown' } },
    { authorityWork: { busy: false, clientId: 'former' } },
    { creationAuthorityClient: 'former', authorityMeta: { clientId: 'former', userId: 'another', browserId: 'another', launch: stamp } },
  ]) {
    const shared = state(values), before = JSON.stringify([...shared.values]), gm = await client(shared);
    await gm.ready();
    assert.equal(shared.writes.length, 0);
    assert.equal(JSON.stringify([...shared.values]), before);
    assert.equal(gm.service.isCreationAuthority(), false);
  }
});

test('existing same-browser idle resume remains available', async () => {
  const shared = state({ creationAuthorityClient: 'former',
    authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: stamp },
    authorityWork: { clientId: 'former', busy: false } }), gm = await client(shared);
  await gm.ready();
  assert.equal(gm.service.isCreationAuthority(), true);
  await gm.service.releaseAuthority();
});

test('fresh-world setup failure gives one actionable notice without a wizard or writes', async () => {
  const shared = state(), gm = await client(shared, { locks: false });
  await gm.ready();
  assert.equal(shared.writes.length, 0);
  assert.equal(gm.warnings.length, 1);
  assert.match(gm.warnings[0], /Game Settings → Manage automation/);
  assert.match(gm.warnings[0], /HTTPS or localhost/);
});

test('world relaunch and uncertain old work retain explicit recovery checks', async () => {
  for (const changed of [{ launch: '2026-10-17T00:00:00.000Z' }, {}]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: stamp, ...changed },
      authorityWork: { clientId: 'former', busy: true, requestId: 'unknown' } }), gm = await client(shared);
    await gm.ready();
    assert.equal(gm.service.isCreationAuthority(), false);
    assert.equal(shared.values.get('creationAuthorityClient'), 'former');
    assert.equal(shared.values.get('authorityWork').requestId, 'unknown');
    assert.equal(shared.lockHeld, false);
  }
});

test('settled idle relaunch auto-resumes only in the active GM same browser', async () => {
  for (const options of [{}, { browserId: 'another' }, { active: false }]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: '2026-10-17T00:00:00.000Z' },
      authorityWork: { clientId: 'former', busy: false, uncertain: false } }), gm = await client(shared, options);
    await gm.ready();
    const eligible = !options.browserId && options.active !== false;
    assert.equal(gm.service.isCreationAuthority(), eligible);
    if (eligible) {
      assert.equal(shared.values.get('authorityMeta').launch, stamp);
      await gm.service.releaseAuthority();
    } else assert.equal(shared.values.get('creationAuthorityClient'), 'former');
  }
});

test('idle relaunch refuses uncertain or mismatched work instead of resetting it', async () => {
  for (const work of [{ clientId: 'former', busy: false, uncertain: true },
    { clientId: 'different', busy: false }, { clientId: 'former', busy: true }]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: '2026-10-17T00:00:00.000Z' },
      authorityWork: work }), gm = await client(shared);
    await gm.ready();
    assert.equal(gm.service.isCreationAuthority(), false);
    assert.equal(shared.writes.length, 0);
    assert.deepEqual(shared.values.get('authorityWork'), work);
  }
});

test('partial initial-claim failure reports recovery without clearing its saved binding', async () => {
  const shared = state();
  shared.beforeSet = (key) => { if (key === 'authorityWork') throw new Error('Injected setup checkpoint failure'); };
  const gm = await client(shared);
  await gm.ready();
  assert.equal(gm.service.isCreationAuthority(), false);
  assert.equal(shared.lockHeld, false);
  assert.equal(shared.values.get('creationAuthorityClient'), 'socket');
  assert.equal(gm.warnings.length, 1);
  assert.match(gm.warnings[0], /Manage automation/);
});
