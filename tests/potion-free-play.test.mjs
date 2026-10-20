import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { startTurn } from '../src/rules/actions.mjs';
import { assertNoPendingActorPotion } from '../src/services/turn-lock.mjs';
import { selectPotionRecipient } from '../src/rules/potion-targets.mjs';

const ID = 'heroes-of-legend';
const catalog = JSON.parse(await readFile(new URL('../static/data/inventory.json', import.meta.url)));

async function fixture() {
  const documents = new Map(), messages = new Map(), writes = [];
  messages.find = (predicate) => [...messages.values()].find(predicate);
  const gm = { id: 'gm', isGM: true }, owner = { id: 'giver-owner', isGM: false }, recipientOwner = { id: 'recipient-owner', isGM: false };
  const users = [gm, owner, recipientOwner]; users.get = (id) => users.find((user) => user.id === id);
  function actor(id, ownerId) {
    const result = { id, uuid: `Actor.${id}`, name: id, documentName: 'Actor', type: 'character',
      system: { health: { value: 2 } }, flags: {}, items: [],
      getFlag(_id, key) { return this.flags[key]; }, validate() {},
      testUserPermission(user) { return user.id === ownerId; },
      toObject() { return { items: this.items.map((item) => item.toObject()) }; },
    };
    result.items.get = (id) => result.items.find((item) => item.id === id);
    documents.set(result.uuid, result); return result;
  }
  const giver = actor('giver', owner.id), recipient = actor('recipient', recipientOwner.id);
  const record = catalog.equipment.find((entry) => entry.id === 'item-lesser-healing-bottle');
  const bottle = { id: 'bottle', uuid: `${giver.uuid}.Item.bottle`, actor: giver, name: 'Bottle', documentName: 'Item', type: 'equipment',
    system: { catalogId: record.id, inventoryDie: 4, quantity: 1, hands: 0, held: false },
    getFlag(_id, key) { return key === 'source' ? record.source : null; },
    toObject() { return { _id: this.id, name: this.name, type: this.type, system: structuredClone(this.system), flags: { [ID]: { source: record.source } } }; },
  };
  giver.items.push(bottle); documents.set(bottle.uuid, bottle);
  const token = { uuid: 'Scene.test.Token.recipient', documentName: 'Token', actor: recipient };
  documents.set(token.uuid, token);
  const combats = []; combats.contents = combats;
  const game = { user: owner, users, actors: [giver, recipient], combats, scenes: [], messages,
    settings: { get() { return 'coordinator'; } } };
  let serial = 0, rolls = 0, failRoll = false;
  class Roll {
    constructor(formula) { this.formula = formula; this.total = 4; this.dice = [{ faces: 4, number: 1, results: [{ active: true, result: 4 }] }]; }
    async evaluate() { rolls++; if (failRoll) throw new Error('lost supply response'); return this; }
    toJSON() { return { formula: this.formula, evaluated: true }; }
    static fromData(data) { return new Roll(data.formula); }
  }
  const context = createContext({ structuredClone, game,
    fromUuid: async (uuid) => documents.get(uuid),
    foundry: { dice: { Roll }, utils: { escapeHTML: String, expandObject: (value) => value },
      applications: { handlebars: { renderTemplate: async () => 'Consent' } } },
    ChatMessage: { async create(data) { const id = `request${++serial}`, message = { id, author: game.user, ...data,
      getFlag(_id, key) { return this.flags?.[ID]?.[key]; }, async update() {} };
      messages.set(id, message); return message; } },
  });
  const url = new URL('../src/services/potions.mjs', import.meta.url);
  const module = new SourceTextModule(await readFile(url, 'utf8'), { context });
  const overrides = {
    './authority.mjs': {ensureAuthorityReady:async()=>{}, isCreationAuthority: () => true,
      enqueueCharacterOperation: async (run) => { if (game.user !== gm) throw new Error('coordinator required'); return run(); },
      writeAuthorityDocument: async (document, changes) => {
        writes.push({ uuid: document.uuid, changes: structuredClone(changes) });
        for (const [path, value] of Object.entries(changes)) {
          if (path === 'items') { for (const raw of value) document.items.get(raw._id).system = structuredClone(raw.system); continue; }
          const parts = path.startsWith(`flags.${ID}.`) ? ['flags', ...path.slice(`flags.${ID}.`.length).split('.')] : path.split('.');
          let node = document; for (const key of parts.slice(0, -1)) node = node[key] ??= {};
          node[parts.at(-1)] = structuredClone(value);
        }
      } },
    './catalog.mjs': { loadCatalogs: async () => ({ inventory: catalog }) },
    './damage.mjs': { damageBasis: (actor) => ({ hp: actor.system.health.value, maxHp: 20, gritAvailable: 0,
      revision: actor.flags.damageRevision ?? 0, equipmentRevision: 0, passiveDefenses: {}, survival: actor.flags.survival }) },
    './inventory.mjs': { validateEmbeddedItems() {}, inventoryBasis: (actor, item) => ({ actorUuid: actor.uuid,
      item: { itemId: item.id, itemUuid: item.uuid, name: item.name, catalogId: item.system.catalogId,
        inventoryDie: item.system.inventoryDie, quantity: item.system.quantity, source: record.source } }) },
    './turn-budget.mjs': { actionConditions: () => ({}) }, './turn-lock.mjs': { assertNoPendingTurn() {} },
    './native-adjacency.mjs': { nativeTokenAdjacency: (giver, recipient) => { if (giver.uuid === recipient.uuid) throw new Error('Native adjacency needs two different tokens.'); return { known: true, adjacent: false, distance: 9 }; } },
  };
  await module.link(async (specifier) => {
    const exports = overrides[specifier] ?? await import(new URL(specifier, url));
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return { service: module.namespace, giver, recipient, bottle, token, game, owner, recipientOwner, gm, writes,
    rolls: () => rolls, failRoll: (value) => { failRoll = value; } };
}

test('outside encounter self-use settles once, permits a fresh use and never invents action budgets', async () => {
  const f = await fixture();
  const request = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid });
  assert.equal(request.message.getFlag(ID, 'potionRequest').continuesAfterInterruption, true);
  f.game.user = f.gm;
  await f.service.resolvePotionRequest(request.message.id);
  assert.equal(f.giver.system.health.value, 8);
  assert.equal(f.rolls(), 1);
  const writes = f.writes.length;
  await f.service.resolvePotionRequest(request.message.id);
  assert.equal(f.writes.length, writes);
  assert.equal(f.rolls(), 1);
  assert.equal(f.giver.flags.potionOperations[request.message.id].giver.turnId, null);
  assert.ok(f.writes.every(({ changes }) => !Object.keys(changes).some((key) => key.includes('.encounter'))));
  f.game.user = f.owner;
  const fresh = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid });
  f.game.user = f.gm;
  await f.service.resolvePotionRequest(fresh.message.id);
  assert.equal(f.giver.system.health.value, 14);
  assert.equal(f.rolls(), 2);
});

for (const measured of [false, true]) test(`outside encounter preserves other-owner consent and truthful ${measured ? 'distant' : 'uncertain'} geometry`, async () => {
  const f = await fixture();
  if (measured) f.giver.token = { uuid: 'Scene.test.Token.giver' };
  const proposal = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid, recipientTokenUuid: f.token.uuid });
  assert.equal(proposal.status, 'proposal');
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.service.acceptPotionProposal(proposal.message.id), /owner|recipient/i);
  f.game.user = f.recipientOwner;
  const accepted = await f.service.acceptPotionProposal(proposal.message.id);
  f.game.user = f.gm;
  await f.service.resolvePotionRequest(accepted.message.id);
  assert.equal(f.recipient.system.health.value, 8);
  const operation = f.giver.flags.potionOperations[accepted.message.id];
  assert.equal(operation.geometry.known, measured);
  assert.equal(operation.geometry.adjacent, measured ? false : null);
  if (measured) assert.equal(operation.geometry.distance, 9);
  assert.equal(operation.recipient.tokenUuid, f.token.uuid);
  assert.equal(operation.plan.costs.recipient.reaction, 0);
});

test('outside encounter partial healing is not a final receipt and recovery does not heal or roll twice', async () => {
  const f = await fixture();
  const request = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid });
  f.game.user = f.gm; f.failRoll(true);
  await assert.rejects(f.service.resolvePotionRequest(request.message.id), /lost supply response/);
  assert.equal(f.giver.system.health.value, 8);
  assert.equal(f.giver.flags.operationReceipts?.[request.message.id], undefined);
  f.game.messages.delete(request.message.id);
  await assert.rejects(f.service.resolvePotionRequest(request.message.id), /observed result|recover/i);
  assert.equal(f.rolls(), 1);
  await f.service.recoverPotionSupplyOperation(request.message.id, 1);
  assert.equal(f.giver.system.health.value, 8);
  assert.equal(f.bottle.system.inventoryDie, 0);
  assert.equal(f.giver.flags.operationReceipts[request.message.id].kind, 'potion');
  await f.service.resolvePotionRequest(request.message.id);
  assert.equal(f.rolls(), 1);
  f.game.user = f.owner;
  await assert.rejects(f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid }), /unavailable|supply|die/i);
});

test('free-play native target selection preserves token and synthetic Actor identity', () => {
  const target = { tokenUuid: 'Scene.s.Token.t', actorUuid: 'Scene.s.Token.t.Actor.a', name: 'Target' };
  const result = selectPotionRecipient({ giver: { id: 'giver', actorUuid: 'Actor.giver' }, participants: null, targets: [target] });
  assert.equal(result.tokenUuid, target.tokenUuid);
  assert.equal(result.participantId, target.actorUuid);
});

test('Actor-host partial operation blocks encounter admission for giver or recipient without mutation', () => {
  const previous = globalThis.game;
  const operation = { giver: { actorUuid: 'Actor.giver' }, recipient: { actorUuid: 'Actor.recipient' } };
  const host = { uuid: 'Actor.giver', getFlag(_id, key) {
    return ({ pendingPotion: 'request', potionOperations: { request: operation } })[key];
  } };
  globalThis.game = { actors: [host], scenes: [] };
  try {
    for (const uuid of ['Actor.giver', 'Actor.recipient']) {
      const combat = { combatants: [{ actor: { uuid, getFlag: () => null } }] };
      const before = JSON.stringify(operation);
      assert.throws(() => assertNoPendingActorPotion(combat), /pending healing-potion/);
      assert.equal(JSON.stringify(operation), before);
    }
    assert.doesNotThrow(() => assertNoPendingActorPotion({ combatants: [{ actor: { uuid: 'Actor.unrelated', getFlag: () => null } }] }));
  } finally { globalThis.game = previous; }
});

test('inactive encounter history does not prevent ordinary free play', async () => {
  const f = await fixture();
  f.game.combats.push({ active: false, combatants: [{ id: 'old', actor: f.giver }],
    getFlag() { return { current: 'old' }; } });
  const result = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid });
  assert.equal(result.message.getFlag(ID, 'potionRequest').outsideCombat, true);
});

for (const pendingFlag of ['pendingAbility', 'pendingTurnPhase']) test(`free-play potion refuses recipient's ${pendingFlag} reservation before healing or supply`, async () => {
  const f = await fixture();
  f.game.combats.push({ uuid: 'Combat.pending', documentName: 'Combat', active: false,
    combatants: [{ actor: f.recipient }],
    getFlag(_id, key) { return key === pendingFlag ? 'pending' : null; } });
  f.game.user = f.gm;
  const request = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid,
    recipientTokenUuid: f.token.uuid, daWillingness: true });
  await assert.rejects(f.service.resolvePotionRequest(request.message.id), /pending encounter action/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.recipient.system.health.value, 2);
  assert.equal(f.rolls(), 0);
});

test('native encounter self preview never sends the same token to two-token adjacency', async () => {
  const f = await fixture(), token = { uuid: 'Scene.test.Token.giver' },
    budget = startTurn({ turnId: 'turn', speed: 5 }),
    combatants = [{ id: 'giver', actor: f.giver, token }];
  combatants.get = (id) => combatants.find((participant) => participant.id === id);
  f.game.combats.push({ uuid: 'Combat.self', active: true, combatants,
    getFlag() { return { current: 'giver', budgets: { giver: budget }, revision: 1 }; } });
  const preview = await f.service.previewPotionUse({ sourceItemUuid: f.bottle.uuid });
  assert.equal(preview.canDeclare, true);
  assert.equal(preview.geometry.adjacent, true);
  assert.equal(preview.geometry.distance, 0);
});

test('malformed outsideCombat modes are refused before reserving or mutating documents', async () => {
  for (const value of ['true', 1, {}, [], null]) {
    const f = await fixture();
    const request = await f.service.requestPotionUse({ sourceItemUuid: f.bottle.uuid });
    request.message.flags[ID].potionRequest.outsideCombat = value;
    f.game.user = f.gm;
    await assert.rejects(f.service.resolvePotionRequest(request.message.id), /encounter mode must be boolean/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.giver.system.health.value, 2);
    assert.equal(f.giver.flags.pendingPotion, undefined);
    assert.equal(f.rolls(), 0);
  }
});
