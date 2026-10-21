import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/services/authority.mjs', import.meta.url), 'utf8');
const stamp = '2026-10-18T00:00:00.000Z';
function state(values = {}) {
  return { values: new Map(Object.entries({ creationAuthorityClient: '', authorityMeta: {}, authorityWork: {}, authorityLease:{}, interruptedOperations:{}, ...values })),
    writes: [], lockHeld: false, now: Date.now() };
}
async function client(shared, { userId = 'gm', isGM = true, active = true, socketId = 'socket', browserId = 'browser', locks = true, secure = true, cryptoAvailable = true } = {}) {
  let ready;
  const warnings = [], events = [], timers = [];
  const context = createContext({ structuredClone, console,
    isSecureContext: secure, crypto: cryptoAvailable ? {subtle:{digest(){}}} : {},
    setInterval(callback) { timers.push(callback); return timers.length; }, clearInterval() {},
    setTimeout(callback) { shared.onTimeout?.(); callback(); },
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
      socket: { id: socketId, connected: true }, time:{get serverTime(){return shared.now;}}, world: { id: 'test', lastPlayed: stamp },
      messages: new Map(), settings: {
        register(_id, key, options) { if (!shared.values.has(key)) shared.values.set(key, structuredClone(options.default)); },
        get(_id, key) { return structuredClone(shared.values.get(key)); },
        async set(_id, key, value) { await shared.beforeSet?.(key, value); shared.writes.push([key, structuredClone(value)]); shared.values.set(key, structuredClone(value)); await shared.afterSet?.(key,value); },
      } },
    fromUuid: async (uuid) => shared.documents?.get(uuid) ?? null,
  });
  const module = new SourceTextModule(source, { context });
  await module.link(() => { throw new Error('Unexpected module dependency'); });
  await module.evaluate();
  module.namespace.registerAuthority();
  return { context, service: module.namespace, ready: () => ready(), warnings, events, heartbeat: () => timers.at(-1)?.() };
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
  assert.match(gm.warnings[0], /HTTPS or localhost/);
  assert.match(gm.warnings[0], /Web Locks/);
});

test('world relaunch automatically isolates interrupted work; current session never steals in-flight work', async () => {
  for (const previous of [true, false]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: previous ? '2026-10-17T00:00:00.000Z' : stamp },
      authorityWork: { clientId: 'former', busy: true, requestId: 'unknown' } }), gm = await client(shared);
    await gm.ready();
    assert.equal(gm.service.isCreationAuthority(), previous);
    if (previous) {
      assert.equal(shared.values.get('interruptedOperations').unknown.requestId, 'unknown');
      assert.equal(shared.values.get('authorityWork').busy, false);
      let ran = false;
      await gm.service.enqueueCharacterOperation(async () => { ran = true; }, {requestId:'unrelated',targetUuid:'Actor.other'});
      assert.equal(ran, true);
      await gm.service.releaseAuthority();
    } else {
      assert.equal(shared.values.get('creationAuthorityClient'), 'former');
      assert.equal(shared.values.get('authorityWork').requestId, 'unknown');
      assert.equal(shared.lockHeld, false);
    }
  }
});

test('settled idle relaunch auto-resumes in active GM even after browser changes', async () => {
  for (const options of [{}, { browserId: 'another' }, { active: false }]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: '2026-10-17T00:00:00.000Z' },
      authorityWork: { clientId: 'former', busy: false, uncertain: false }, authorityLease:{clientId:'former',expires:Date.now()+900000} }), gm = await client(shared, options);
    await gm.ready();
    const eligible = options.active !== false;
    assert.equal(gm.service.isCreationAuthority(), eligible);
    if (eligible) {
      assert.equal(shared.values.get('authorityMeta').launch, stamp);
      await gm.service.releaseAuthority();
    } else assert.equal(shared.values.get('creationAuthorityClient'), 'former');
  }
});

test('relaunch saves uncertain checkpoints for inspection and replaces malformed idle checkpoints', async () => {
  for (const work of [{ clientId: 'former', busy: false, uncertain: true },
    { clientId: 'different', busy: false }, { clientId: 'former', busy: true }]) {
    const shared = state({ creationAuthorityClient: 'former',
      authorityMeta: { clientId: 'former', userId: 'gm', browserId: 'browser', launch: '2026-10-17T00:00:00.000Z' },
      authorityWork: work }), gm = await client(shared);
    await gm.ready();
    assert.equal(gm.service.isCreationAuthority(), true);
    if (work.busy || work.uncertain) {
      const saved = Object.values(shared.values.get('interruptedOperations'))[0];
      assert.equal(saved.clientId, work.clientId);
      assert.equal(saved.uncertain, work.uncertain);
    }
    await gm.service.releaseAuthority();
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
  assert.match(gm.warnings[0], /Synchronization could not start/);
});

test('legacy idle binding migrates automatically even when the GM browser changed', async () => {
  const shared = state({ creationAuthorityClient: 'former', authorityMeta: {clientId:'former', userId:'gm', browserId:'old-browser', launch:stamp}, authorityWork:{clientId:'former',busy:false} });
  const gm = await client(shared);
  await gm.service.ensureAuthorityReady();
  assert.equal(gm.service.isCreationAuthority(),true);
  assert.equal(shared.values.get('authorityMeta').leaseVersion,1);
  await gm.service.releaseAuthority();
});

 test('a new browser automatically takes only an expired idle coordinator and fences the old client', async()=>{
  const shared=state(), old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();
  assert.equal(old.service.isCreationAuthority(),true);
  // Separate browsers have independent Web Locks, as in ordinary GM reconnects.
  shared.lockHeld=false;shared.now+=16000;
  assert.equal(old.service.isCreationAuthority(),false);
  const next=await client(shared,{socketId:'new',browserId:'second'});await next.ready();
  assert.equal(next.service.isCreationAuthority(),true);assert.equal(old.service.isCreationAuthority(),false);
  let wrote=false;await old.service.enqueueCharacterOperation(async()=>{wrote=true;});assert.equal(wrote,false);
  await next.service.releaseAuthority();
 });
 test('an unexpired lease or uncertain work is never stolen by a different browser',async()=>{
  for(const uncertain of [false,true]){
   const shared=state(),old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();shared.lockHeld=false;
   if(uncertain){shared.now+=16000;shared.values.set('authorityWork',{clientId:'old',busy:true,uncertain:true,requestId:'saved'});}
   const before=shared.writes.length,next=await client(shared,{socketId:'new',browserId:'second'});await next.ready();
   assert.equal(next.service.isCreationAuthority(),false);assert.equal(shared.writes.length,before);
  }
 });

test('expired takeover restores only its own incomplete metadata when renewal or busy work arrives', async () => {
  for (const change of ['renewal','work']) {
    const shared=state(),old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();
    shared.lockHeld=false;shared.now+=16000;
    const priorMeta=structuredClone(shared.values.get('authorityMeta'));
    shared.afterSet=(key,value)=>{
      if(key!=='authorityMeta'||value.clientId!=='new')return;
      if(change==='renewal')shared.values.set('authorityLease',{clientId:'old',expires:shared.now+15000});
      else shared.values.set('authorityWork',{clientId:'old',busy:true,uncertain:true,requestId:'saved'});
    };
    const next=await client(shared,{socketId:'new',browserId:'second'});await next.ready();
    assert.deepEqual(shared.values.get('authorityMeta'),priorMeta);
    assert.equal(shared.values.get('creationAuthorityClient'),'old');
    assert.equal(next.service.isCreationAuthority(),false);
    assert.equal(shared.lockHeld,false);
    if(change==='work')assert.deepEqual(shared.values.get('authorityWork'),{clientId:'old',busy:true,uncertain:true,requestId:'saved'});
    else assert.equal(old.service.isCreationAuthority(),true);
  }
});

test('rejected activation never rolls back a competing metadata claim',async()=>{
 const shared=state(),old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();shared.lockHeld=false;shared.now+=16000;
 const competitor={clientId:'competitor',userId:'gm',browserId:'third',launch:stamp,leaseVersion:1};
 shared.afterSet=(key,value)=>{if(key==='authorityMeta'&&value.clientId==='new')shared.values.set(key,competitor);};
 const next=await client(shared,{socketId:'new',browserId:'second'});await next.ready();
 assert.deepEqual(shared.values.get('authorityMeta'),competitor);assert.equal(shared.values.get('creationAuthorityClient'),'old');
 assert.equal(shared.writes.filter(([key])=>key==='authorityMeta').length,2);
});

test('heartbeat repairs delayed former lease only from the still-locked current binding',async()=>{
 const shared=state(),old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();
 let releaseRenewal, renewalEntered;
 const entered=new Promise(resolve=>renewalEntered=resolve);
 shared.beforeSet=async(key,value)=>{if(key==='authorityLease'&&value.clientId==='old'){renewalEntered();await new Promise(resolve=>releaseRenewal=resolve);}};
 const delayed=old.heartbeat();await entered;
 shared.lockHeld=false;shared.now+=16000;
 const next=await client(shared,{socketId:'new',browserId:'second'});await next.ready();assert.equal(next.service.isCreationAuthority(),true);
 releaseRenewal();await delayed;
 assert.equal(shared.values.get('authorityLease').clientId,'old');assert.equal(next.service.isCreationAuthority(),false);
 await next.heartbeat();assert.equal(next.service.isCreationAuthority(),true);assert.equal(shared.values.get('authorityLease').clientId,'new');
 const writes=shared.writes.length;await old.heartbeat();assert.equal(shared.writes.length,writes);assert.equal(old.service.isCreationAuthority(),false);
});

test('own expired busy uncertain lease cannot be revived by heartbeat or cleared',async()=>{
 const shared=state(),gm=await client(shared);await gm.ready();shared.now+=16000;
 const work={clientId:'socket',busy:true,uncertain:true,requestId:'saved'};shared.values.set('authorityWork',work);
 const writes=shared.writes.length;await gm.heartbeat();assert.equal(shared.writes.length,writes);assert.deepEqual(shared.values.get('authorityWork'),work);assert.equal(gm.service.isCreationAuthority(),false);
});

test('preflight observes renewal but rejects mixed metadata rather than accepting setting progress',async()=>{
 for(const mixed of [false,true]){
  const shared=state(),old=await client(shared,{socketId:'old',browserId:'first'});await old.ready();shared.lockHeld=false;
  const gm=await client(shared,{socketId:'new',browserId:'second'});
  shared.onTimeout=()=>{shared.now+=200;shared.values.set('authorityLease',{clientId:'old',expires:shared.now+20000});if(mixed)shared.values.set('authorityMeta',{clientId:'partial',userId:'gm',browserId:'third',launch:stamp,leaseVersion:1});};
  if(mixed)await assert.rejects(gm.service.ensureAuthorityReady(),/session is still synchronizing/);
  else await gm.service.ensureAuthorityReady();
  assert.equal(shared.values.get('creationAuthorityClient'),'old');
 }
});

test('player preflight rejects expired or foreign leases even with matching metadata',async()=>{
 for(const lease of [{clientId:'old',expires:0},{clientId:'foreign',expires:Date.now()+50000}]){
  const shared=state({creationAuthorityClient:'old',authorityMeta:{clientId:'old',userId:'gm',launch:stamp,leaseVersion:1},authorityLease:lease});
  const player=await client(shared,{isGM:false});await assert.rejects(player.service.ensureAuthorityReady(),/session is still synchronizing/);assert.equal(shared.writes.length,0);
 }
});

test('missing secure context, crypto or GM locks fails before coordinator writes with one startup notice', async()=>{
 for(const options of [{secure:false},{cryptoAvailable:false},{locks:false}]){
  const shared=state(),gm=await client(shared,options);await gm.ready();
  assert.equal(gm.warnings.length,1);assert.match(gm.warnings[0],/HTTPS or localhost/);
  assert.match(gm.warnings[0],new RegExp(options.secure===false?"secure browser context":options.cryptoAvailable===false?"Web Crypto":"Web Locks"));
  await assert.rejects(gm.service.ensureAuthorityReady(),/HTTPS or localhost/);
  assert.equal(shared.writes.length,0);
 }
 const shared=state(),player=await client(shared,{isGM:false,secure:false});await player.ready();assert.equal(player.warnings.length,0);
 await assert.rejects(player.service.ensureAuthorityReady(),/HTTPS or localhost/);assert.equal(shared.writes.length,0);
});

test('ordinary relaunch repairs legacy mixed metadata regardless of old checkpoint shape',async()=>{
 for(const work of [{clientId:'winner',busy:false,uncertain:false},{clientId:'winner',busy:true},{clientId:'winner',busy:false,uncertain:true},{clientId:'other',busy:false}]){
  const shared=state({creationAuthorityClient:'winner',authorityMeta:{clientId:'older',userId:'gm',browserId:'old',launch:'2026-10-17T00:00:00.000Z',leaseVersion:1},authorityLease:{clientId:'winner',expires:Date.now()+900000},authorityWork:work});
  const gm=await client(shared);await gm.ready();
  const eligible=true;
  assert.equal(gm.service.isCreationAuthority(),eligible);
  if(!eligible){assert.equal(shared.writes.length,0);assert.deepEqual(shared.values.get('authorityWork'),work);}
  else assert.equal(gm.events.filter(([event])=>event==='holAuthorityReady').length,1);
 }
});

test('late competing activation is detected before ready or checkpoint overwrite',async()=>{
 for(const phase of ['authorityLease','creationAuthorityClient','authorityWork']){
  const shared=state(),gm=await client(shared,{socketId:'new'});
  const winner={clientId:'winner',userId:'gm',browserId:'winnerBrowser',launch:stamp,leaseVersion:1};
  shared.afterSet=(key,value)=>{if(key!==phase||value?.clientId==='winner')return;shared.values.set('authorityMeta',winner);shared.values.set('creationAuthorityClient','winner');shared.values.set('authorityLease',{clientId:'winner',expires:shared.now+15000,owner:winner});shared.values.set('authorityWork',{clientId:'winner',busy:false});};
  await gm.ready();assert.equal(gm.service.isCreationAuthority(),false);assert.equal(gm.events.length,0);assert.equal(shared.values.get('authorityMeta').clientId,'winner');assert.deepEqual(shared.values.get('authorityWork'),{clientId:'winner',busy:false});
 }
});

test('current locked owner repairs metadata clobbered by delayed old rollback without changing work',async()=>{
 const shared=state(),gm=await client(shared,{socketId:'winner',browserId:'winnerBrowser'});await gm.ready();
 const owner=structuredClone(shared.values.get('authorityMeta')),work=structuredClone(shared.values.get('authorityWork'));
 // The old claim's metadata restoration arrived after all winner writes.
 shared.values.set('authorityMeta',{clientId:'old',userId:'gm',browserId:'oldBrowser',launch:stamp,leaseVersion:1});
 assert.equal(gm.service.isCreationAuthority(),false);await gm.heartbeat();
 assert.equal(gm.service.isCreationAuthority(),true);assert.deepEqual(shared.values.get('authorityMeta'),owner);assert.deepEqual(shared.values.get('authorityWork'),work);
});

test('metadata repair never clears busy or uncertain work or restores another owner',async()=>{
 for(const changed of ['busy','uncertain','foreignBinding','expiredLease']){
  const shared=state(),gm=await client(shared,{socketId:'winner'});await gm.ready();
  shared.values.set('authorityMeta',{clientId:'old',launch:stamp});
  if(changed==='foreignBinding')shared.values.set('creationAuthorityClient','other');
  else if(changed==='expiredLease')shared.now+=16000;
  else shared.values.set('authorityWork',{clientId:'winner',busy:changed==='busy',uncertain:changed==='uncertain',requestId:'saved'});
  const before=JSON.stringify([...shared.values]),writes=shared.writes.length;await gm.heartbeat();assert.equal(JSON.stringify([...shared.values]),before);assert.equal(shared.writes.length,writes);
 }
});

test('failure after lease commit before binding keeps an explicit recoverable checkpoint, never claims ready',async()=>{
 const shared=state(),old=await client(shared,{socketId:'old',browserId:'oldBrowser'});await old.ready();shared.lockHeld=false;shared.now+=16000;
 const beforeWork=structuredClone(shared.values.get('authorityWork'));
 shared.beforeSet=(key,value)=>{if(key==='creationAuthorityClient'&&value==='new')throw Error('Injected binding write failure');};
 const next=await client(shared,{socketId:'new',browserId:'newBrowser'});await next.ready();
 assert.equal(next.service.isCreationAuthority(),false);assert.equal(next.events.length,0);
 assert.equal(shared.values.get('creationAuthorityClient'),'old');assert.equal(shared.values.get('authorityLease').clientId,'new');assert.deepEqual(shared.values.get('authorityWork'),beforeWork);
 await assert.rejects(next.service.ensureAuthorityReady(),/could not synchronize/);
 assert.deepEqual(shared.values.get('authorityWork'),beforeWork);
});

test('prior-session pre-lease upgrade migrates all checkpoint shapes and preserves unsettled work',async()=>{
 for(const options of [{}, {busy:true}, {uncertain:true}, {foreign:true}, {lease:true}]){
  const work={clientId:'old',busy:!!options.busy,uncertain:!!options.uncertain};
  const shared=state({creationAuthorityClient:'old',authorityMeta:{clientId:'old',userId:'gm',browserId:options.foreign?'foreign':'browser',launch:'2026-10-17T00:00:00.000Z'},authorityWork:work,authorityLease:options.lease?{clientId:'partial'}:{}});
  const gm=await client(shared);await gm.ready();
  assert.equal(gm.service.isCreationAuthority(),true);
  if(work.busy || work.uncertain) assert.equal(Object.values(shared.values.get('interruptedOperations'))[0].clientId,'old');
 }
});

test('expired interrupted activation reclaims only an exact idle binding/work and meta/lease owner pair',async()=>{
 for(const variant of ['idle','live','busy','uncertain','work','owner']){
  const meta={clientId:'claim',userId:'gm',browserId:'closedBrowser',launch:stamp,leaseVersion:1};
  const shared=state();shared.values.set('creationAuthorityClient','old');shared.values.set('authorityMeta',meta);shared.values.set('authorityLease',{clientId:'claim',expires:shared.now+(variant==='live'?15000:-1),owner:variant==='owner'?{...meta,clientId:'foreign'}:meta});
  const work={clientId:variant==='work'?'foreign':'old',busy:variant==='busy',uncertain:variant==='uncertain'};shared.values.set('authorityWork',work);
  const gm=await client(shared);await gm.ready();assert.equal(gm.service.isCreationAuthority(),variant==='idle');
  if(variant!=='idle')assert.deepEqual(shared.values.get('authorityWork'),work);
 }
});

test('interrupted expired claim refuses checkpoint changes during activation',async()=>{
 const shared=state(),meta={clientId:'candidate',userId:'gm',browserId:'closed',launch:stamp,leaseVersion:1};
 shared.values.set('creationAuthorityClient','old');shared.values.set('authorityMeta',meta);shared.values.set('authorityLease',{clientId:'candidate',owner:meta,expires:shared.now-1});shared.values.set('authorityWork',{clientId:'old',busy:false,requestId:'before'});
 shared.afterSet=(key)=>{if(key==='authorityMeta')shared.values.set('authorityWork',{clientId:'old',busy:false,requestId:'changed'});};
 const gm=await client(shared);await gm.ready();assert.equal(gm.service.isCreationAuthority(),false);assert.equal(shared.values.get('authorityWork').requestId,'changed');assert.equal(gm.events.length,0);
});

test('clean restart recovers interrupted claims without comparing previous uptime expiry',async()=>{
 for(const variant of ['idle','busy','uncertain','owner','invalidLaunch']){
  const meta={clientId:'candidate',userId:'gm',browserId:'closed',launch:variant==='invalidLaunch'?'invalid':'2026-10-17T00:00:00.000Z',leaseVersion:1};
  const shared=state({creationAuthorityClient:'predecessor',authorityMeta:meta,authorityLease:{clientId:'candidate',owner:variant==='owner'?{...meta,clientId:'other'}:meta,expires:99999999999999},authorityWork:{clientId:'predecessor',busy:variant==='busy',uncertain:variant==='uncertain'}});
  const oldWork=structuredClone(shared.values.get('authorityWork'));
  const gm=await client(shared);await gm.ready();assert.equal(gm.service.isCreationAuthority(),variant!=='invalidLaunch');
  if(variant==='invalidLaunch'){assert.deepEqual(shared.values.get('authorityWork'),oldWork);assert.equal(gm.events.length,0);}
 }
});

test('prior-launch finalization recovers; a live current-session claim remains protected',async()=>{
 for(const variant of ['idle','busy','uncertain','missingClient','owner','currentLaunch']){
  const meta={clientId:'candidate',userId:'gm',browserId:'closed',launch:variant==='currentLaunch'?stamp:'2026-10-17T00:00:00.000Z',leaseVersion:1};
  const work={clientId:variant==='missingClient'?'':'predecessor',busy:variant==='busy',uncertain:variant==='uncertain',requestId:'settled'};
  const shared=state({creationAuthorityClient:'candidate',authorityMeta:meta,authorityLease:{clientId:'candidate',expires:99999999999999,owner:variant==='owner'?{...meta,userId:'foreign'}:meta},authorityWork:work});
  const gm=await client(shared);await gm.ready();assert.equal(gm.service.isCreationAuthority(),variant!=='currentLaunch');
  if(variant==='currentLaunch'){assert.deepEqual(shared.values.get('authorityWork'),work);assert.equal(gm.events.length,0);}
 }
});

test('interrupted request blocks only affected targets, retries original after restart and releases after receipt', async () => {
  const shared=state({creationAuthorityClient:'old',authorityMeta:{clientId:'old',userId:'gm',browserId:'old',launch:'2026-10-17T00:00:00.000Z'},authorityWork:{clientId:'old',busy:true,uncertain:true,requestId:'damage',targetUuid:'Actor.hero'}});
  const gm=await client(shared); await gm.ready();
  assert.equal(gm.service.isCreationAuthority(),true);
  assert.equal(gm.service.interruptedOperations().damage.targetUuid,'Actor.hero');
  let calls=0;
  await gm.service.enqueueCharacterOperation(async()=>{calls++;},{requestId:'other',targetUuid:'Actor.other'});
  await assert.rejects(gm.service.enqueueCharacterOperation(async()=>{calls++;},{requestId:'new',targetUuid:'Actor.hero'}),/earlier action on this document/);
  await gm.service.enqueueCharacterOperation(async()=>{calls++;},{requestId:'damage',targetUuid:'Actor.hero'});
  assert.equal(calls,2);
  shared.documents=new Map([['Actor.hero',{getFlag(_id,key){return key==='operationReceipts'?{damage:{applied:true}}:undefined;}}]]);
  await gm.service.enqueueCharacterOperation(async()=>{calls++;},{requestId:'new',targetUuid:'Actor.hero'});
  assert.equal(calls,3); assert.equal(Object.keys(gm.service.interruptedOperations()).length,0);
});

test('uncertain current write records its target and does not suspend unrelated actions', async()=>{
  const shared=state(),gm=await client(shared);await gm.ready();
  const actor={async update(){throw Error('Connection interrupted');}};
  await assert.rejects(gm.service.enqueueCharacterOperation(()=>gm.service.writeAuthorityDocument(actor,{}),{requestId:'saved',targetUuid:'Actor.hero'}),/Connection interrupted/);
  assert.equal(shared.values.get('authorityWork').busy,false);
  assert.equal(gm.service.interruptedOperations().saved.uncertain,true);
  let ran=false;
  await gm.service.enqueueCharacterOperation(async()=>{ran=true;},{requestId:'other',targetUuid:'Actor.other'});
  assert.equal(ran,true);
  await assert.rejects(gm.service.enqueueCharacterOperation(async()=>{}, {requestId:'saved',targetUuid:'Actor.hero'}),/lost its save confirmation/);
});

test('completed prior-session receipt automatically settles an old busy checkpoint',async()=>{
 const shared=state({creationAuthorityClient:'old',authorityMeta:{clientId:'old',launch:'2026-10-17T00:00:00.000Z'},authorityWork:{clientId:'old',busy:true,uncertain:true,requestId:'done',targetUuid:'Actor.hero'}});
 shared.documents=new Map([['Actor.hero',{getFlag(_id,key){return key==='operationReceipts'?{done:{applied:true}}:undefined;}}]]);
 const gm=await client(shared);await gm.ready();
 assert.equal(gm.service.isCreationAuthority(),true);assert.equal(Object.keys(gm.service.interruptedOperations()).length,0);
 assert.equal(gm.events[0][1].resumedRequest,'done');
});
