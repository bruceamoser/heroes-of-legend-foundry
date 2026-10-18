import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { builderDropChoice } from '../src/services/builder-drop.mjs';

async function fixture({ learning = false, shopping = false } = {}) {
  const actor = { id: 'hero', uuid: 'Actor.hero', isOwner: true, getFlag: () => null },
    source = { documentName: 'Item', type: 'ability', uuid: 'Compendium.abilities.Item.ability',
      testUserPermission: () => true, getFlag: (_id, key) => key === 'catalogId' ? 'ability' : { path: 'card.md', sha256: 'hash' } },
    choice = { id: 'ability', kind: 'ability', name: 'Reviewed ability', source: { path: 'card.md', sha256: 'hash' } },
    search = { value: '', dispatchEvent() {}, focus() {} };
  class Wizard {
    constructor() { this.actor = actor; this.draft = { purchases: [] }; this.step = learning ? 3 : shopping ? 6 : 2; this.rendered = true; }
    capture() { this.draft.unsavedName = 'Typed but unsaved'; }
    async render() { return this; }
    get element() { return { querySelector: () => learning || shopping ? search : null }; }
  }
  const wizard = new Wizard(), instances = new Map([['wizard', wizard]]), warnings = [], infos = [];
  let copies = 0, sorts = 0;
  const exports = { builderDropChoice, loadCatalogs: async () => ({ choices: [choice] }),
    copyEquipmentToActor: async () => { copies++; }, equipmentCopyOptions: async () => [],
    CreationWizard: Wizard, AdvancementWizard: class {}, ATTRIBUTES: [],
    postAbilityReference() {}, WoundPanel: class {}, RecoveryPanel: class {}, DamagePanel: class {},
    EquipmentPanel: class {}, ConditionPanel: class {}, SharedRollDialog: class {}, promptAttributeRoll() {},
    updateOwnedDocument() {}, addHotbarShortcut() {}, openItemShortcut() {} };
  class Sheet { constructor() { this.actor = actor; } async _onDropDocument() { sorts++; } }
  const context = createContext({
    Event: class {}, ui: { notifications: { warn: (message) => warnings.push(message), info: (message) => infos.push(message) } },
    foundry: { applications: { api: { HandlebarsApplicationMixin: (base) => base }, sheets: { ActorSheetV2: Sheet }, instances } },
    game: { user: {} },
  });
  const module = new SourceTextModule(await readFile(new URL('../src/sheets/character.mjs', import.meta.url), 'utf8'), { context });
  await module.link(() => new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  const sheet = new module.namespace.CharacterSheet();
  return { actor, source, wizard, search, warnings, infos, sheet, copies: () => copies, sorts: () => sorts };
}

for (const learning of [false, true]) test(`ability sheet drop preserves ${learning ? 'learning' : 'earlier creation'} stage and unsaved draft without buying`, async () => {
  const f = await fixture({ learning });
  await f.sheet._onDropDocument({}, f.source);
  assert.equal(f.wizard.step, learning ? 3 : 2);
  assert.equal(f.wizard.draft.unsavedName, 'Typed but unsaved');
  assert.equal(f.wizard.draft.purchases.length, 0);
  assert.equal(f.copies(), 0); assert.equal(f.sorts(), 0);
  assert.equal(f.search.value, learning ? 'Reviewed ability' : '');
  assert.equal(f.warnings.length, 0);
  assert.equal(f.infos.length, learning ? 0 : 1);
});

test('Character sheet routes equipment through copy service and retains native same-Actor sorting', async () => {
  const f = await fixture();
  await f.sheet._onDropDocument({}, { ...f.source, type: 'equipment' });
  assert.equal(f.copies(), 1);
  await f.sheet._onDropDocument({}, { ...f.source, parent: f.actor });
  assert.equal(f.sorts(), 1);
});

test("ability drop does not repurpose the shopping search or leave the current stage", async () => {
  const f = await fixture({ shopping: true });
  await f.sheet._onDropDocument({}, f.source);
  assert.equal(f.wizard.step, 6);
  assert.equal(f.search.value, "");
  assert.equal(f.wizard.draft.unsavedName, "Typed but unsaved");
  assert.equal(f.copies(), 0);
  assert.equal(f.infos.length, 1);
});
