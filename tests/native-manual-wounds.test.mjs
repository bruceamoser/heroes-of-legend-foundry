import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { woundRoll, woundResult } from "../src/rules/wounds.mjs";
import { enterLastWords, validateSurvival, survivalState } from "../src/rules/survival.mjs";
import { DAMAGE_TYPES } from "../src/rules/damage.mjs";
const source = await readFile(new URL("../src/services/wounds.mjs", import.meta.url), "utf8");
const catalog = JSON.parse(await readFile(new URL("../static/data/wounds.json", import.meta.url)));
async function fixture({ owner = true, state = null } = {}) {
  const flags = { ...(state ? { survival: structuredClone(state) } : {}) };
  const items = new Map(), effects = new Map(), messages = new Map();
  let writes = 0, rolls = 0, gm = false;
  const actor = { type: "character", uuid: "Actor.hero", system: { health: { value: state?.hp ?? 12, max: state?.maxHp ?? 12 }, grit: { available: 2 } }, effects, items,
    getFlag: (_id, key) => flags[key], testUserPermission: () => owner,
    validate() {}, toObject: () => ({ effects: [...effects.values()] }) };
  const set = (key, value) => { const parts = key.split("."); if (parts[0] !== "flags") throw new Error(`Unexpected HP or system write ${key}`); let target = flags; for (const part of parts.slice(2,-1)) target = target[part] ??= {}; target[parts.at(-1)] = structuredClone(value); };
  const context = createContext({ structuredClone, Date, fetch: async () => ({ ok: true, json: async () => catalog }),
    fromUuid: async () => actor, foundry: { utils: { expandObject: value => value, randomID: () => "effectid" }, dice: { Roll: class {
      constructor(formula) { this.count = Number(formula.match(/^\d+/)[0]); this.dice = [{ results: Array.from({ length: this.count }, () => ({ result: 1 })) }]; }
      async evaluate() { rolls++; return this; } toJSON() { return {}; }
    } }, documents: { ActiveEffect: class { validate() {} } } },
    CONST: { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 1 } },
    game: { user: { id: "owner" }, settings: { get: () => "authority" }, users: [{ id: "owner" }], messages },
    ChatMessage: { create: async data => { const m = { id: `r${messages.size}`, author: { id: "owner", isGM: gm }, getFlag: (_id,key) => data.flags["heroes-of-legend"][key], update: async changes => Object.assign(m,changes) }; messages.set(m.id,m); return m; } },
  });
  const mocks = {
    "./turn-lock.mjs": { assertNoPendingTurn: () => {} },
    "../rules/wounds.mjs": { woundRoll, woundResult },
    "../rules/damage.mjs": { DAMAGE_TYPES },
    "../rules/survival.mjs": { enterLastWords, validateSurvival, survivalState },
    "./conditions.mjs": { conditionIcon: key => key },
    "./authority.mjs": { isCreationAuthority: () => true, enqueueCharacterOperation: fn => fn(), writeAuthorityDocument: async (_actor, changes) => { writes++; for (const [key,value] of Object.entries(changes)) if (key !== "effects") set(key,value); } },
  };
  const module = new SourceTextModule(source, { context });
  await module.link(name => { const values = mocks[name]; return new SyntheticModule(Object.keys(values), function() { for (const [key,value] of Object.entries(values)) this.setExport(key,value); }, { context }); });
  await module.evaluate();
  const service = module.namespace;
  const send = async (event, kind, payload = {}) => { const message = await service.requestWound(actor,event,kind,payload); const result = await service.resolveWoundRequest(message.id); return { message,result }; };
  return { service, send, actor, flags, messages, setGM(value) { gm=value; }, get writes() { return writes; }, get rolls() { return rolls; } };
}
test("explicit manual wound records one persistent pending event and count without changing HP/status", async () => {
  const f = await fixture({ state: survivalState({ hp: 8, maxHp: 12, wounds: 2, gritAvailable: 2 }) });
  const { message, result } = await f.send(null,"record");
  assert.equal(f.flags.survival.wounds, 3); assert.equal(f.flags.survival.hp,8); assert.equal(f.flags.survival.status,"active");
  const pending = f.flags.pendingWounds[result.eventId];
  assert.equal(pending.priorWounds,2); assert.equal(pending.status,"awaiting-roll");
  assert.deepEqual([...pending.types],DAMAGE_TYPES); assert.equal(f.rolls,0);
  await f.service.resolveWoundRequest(message.id);
  assert.equal(f.flags.survival.wounds,3); assert.equal(f.writes,1);
});
test("owner can roll and apply an ordinary manual wound once; no opening-side effect", async () => {
  const f = await fixture();
  assert.equal(f.flags.pendingWounds,undefined);
  const { result } = await f.send(null,"record");
  await f.send(result.eventId,"roll",{ damageType:"physical" });
  await f.send(result.eventId,"apply");
  assert.equal(f.rolls,1); assert.equal(f.flags.wounds[result.eventId].key,"111");
  assert.equal(f.flags.pendingWounds[result.eventId].status,"resolved");
  assert.equal(f.flags.survival.wounds,1); assert.equal(f.actor.system.health.value,12);
});
test("manual wounds reject unauthorized/stale requests and owners cannot recover dice or skip anatomy", async () => {
  const denied = await fixture({ owner:false });
  await assert.rejects(denied.send(null,"record"),/owner/);
  const f=await fixture();
  const stale=await f.service.requestWound(f.actor,null,"record");
  await f.send(null,"record");
  await assert.rejects(f.service.resolveWoundRequest(stale.id),/changed/);
  const eventId=Object.keys(f.flags.pendingWounds)[0];
  await assert.rejects(f.send(eventId,"recover",{ faces:[1,1,1] }),/Only the DA/);
  await assert.rejects(f.send(eventId,"apply",{ skipped:[{key:"111"}] }),/anatomy/);
});
