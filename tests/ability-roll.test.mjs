import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {abilityCatalogRecord,printedAbilityRoll, abilityRollConfiguration, assertAbilityConfiguration} from '../src/rules/ability-roll.mjs';
const catalog=JSON.parse(await readFile(new URL('../static/data/choices.json',import.meta.url))).records;
test('all explicitly printed attribute abilities retain roll configuration independent of automation adapters',()=>{
  const records=catalog.filter(record=>record.kind==='ability');
  let rollable=0;
  for(const record of records){
    const result=printedAbilityRoll(record);
    const printed=record.reference.rules.details.find(detail=>detail.label==='Attribute')?.value;
    assert.equal(Boolean(result.attribute),['Brawn','Fortitude','Agility','Guile','Knowledge','Reason'].includes(printed));
    if(result.attribute)rollable++;
  }
  assert.equal(rollable,166);
});
test('existing 2.0 reference-only Basic Ranged gets Agility and printed tier outcomes',()=>{
  const record=catalog.find(record=>record.id==='ability-basic-ranged');
  const result=abilityRollConfiguration({uuid:'Actor.a.Item.b',name:'Basic Ranged',system:{activity:{rollMode:'none',attribute:'brawn'},outcomes:{}}},record);
  assert.equal(result.attribute,'agility');assert.equal(result.outcomes.strong,'5 physical damage.');
});
test('explicit configured custom attribute and outcomes win over printed defaults',()=>{
  const record=catalog.find(record=>record.id==='ability-basic-ranged');
  const result=abilityRollConfiguration({system:{activity:{rollMode:'attribute',attribute:'reason'},outcomes:{strong:'Custom result'}}},record);
  assert.equal(result.attribute,'reason');assert.equal(result.outcomes.strong,'Custom result');assert.equal(result.outcomes.weak,'2 physical damage.');
});
test('no-roll and delegated follow-up cards do not invent an attribute roll',()=>{
  for(const record of catalog.filter(record=>record.reference?.rules.details.some(detail=>detail.label==='Attribute'&&detail.value.startsWith('None'))))assert.equal(printedAbilityRoll(record).attribute,null);
});

test('an open ability roll rejects changed attribute or outcomes before dice evaluation',()=>{
  const opened={attribute:'agility',name:'Basic Ranged',outcomes:{strong:'5 physical damage.'}};
  assert.doesNotThrow(()=>assertAbilityConfiguration(structuredClone(opened),opened));
  assert.throws(()=>assertAbilityConfiguration({...opened,attribute:'reason'},opened),/Reopen/);
  assert.throws(()=>assertAbilityConfiguration({...opened,outcomes:{strong:'7 physical damage.'}},opened),/Reopen/);
});

test('attack rolls recognize composite Type and signature Tags metadata',()=>{
 for(const rules of [{details:[{label:'Type',value:'Magic / Attack'}]},{details:[{label:'Type',value:'Signature'}],notes:[{label:'Tags',text:'Magic / Attack'}]}]){
  assert.equal(abilityRollConfiguration({system:{activity:{rollMode:'attribute',attribute:'agility'}}},{reference:{rules}}).attack,true);
 }
});

const legacyItem = (flags = {}, system = {}) => ({
  uuid: "Actor.a.Item.legacy",
  name: "Renamed weapon attack",
  getFlag: (_namespace, key) => flags[key],
  system: {
    activity: { rollMode: "delegated", attribute: "reason" },
    outcomes: {},
    ...system,
  },
});
test("legacy Basic Melee resolves exact provenance and opens a Brawn attack configuration", () => {
  const record = catalog.find((record) => record.id === "ability-basic-melee");
  for (const source of [
    { path: record.source.path },
    structuredClone(record.source),
  ]) {
    const item = legacyItem({ source });
    assert.equal(abilityCatalogRecord(item, catalog), record);
    const configuration = abilityRollConfiguration(
      item,
      abilityCatalogRecord(item, catalog),
    );
    assert.equal(configuration.attribute, "brawn");
    assert.equal(configuration.attack, true);
    assert.equal(configuration.outcomes.strong, "5 physical damage.");
  }
});
test("explicit catalog identity wins and invalid explicit flags never fall back", () => {
  const melee = catalog.find((record) => record.id === "ability-basic-melee");
  const ranged = catalog.find((record) => record.id === "ability-basic-ranged");
  assert.equal(
    abilityCatalogRecord(
      legacyItem(
        { catalogId: ranged.id, source: melee.source },
        { catalogId: melee.id },
      ),
      catalog,
    ),
    ranged,
  );
  for (const catalogId of ["missing-id", "", false])
    assert.equal(
      abilityCatalogRecord(
        legacyItem(
          { catalogId, source: melee.source },
          { catalogId: melee.id },
        ),
        catalog,
      ),
      undefined,
    );
});
test("legacy identity accepts valid system IDs but rejects names, foreign paths and mismatched hashes", () => {
  const record = catalog.find((record) => record.id === "ability-basic-melee");
  assert.equal(
    abilityCatalogRecord(legacyItem({}, { catalogId: record.id }), catalog),
    record,
  );
  for (const source of [
    undefined,
    { path: "other/basic-melee.md" },
    { path: record.source.path, sha256: "changed" },
  ]) {
    const item = legacyItem({ source });
    item.name = "Basic Melee";
    assert.equal(abilityCatalogRecord(item, catalog), undefined);
  }
  assert.equal(
    abilityCatalogRecord(legacyItem({ source: record.source }), [
      record,
      { ...record, id: "ambiguous" },
    ]),
    undefined,
  );
});
test("provenance lookup preserves user configured attributes and outcomes", () => {
  const record = catalog.find((record) => record.id === "ability-basic-melee");
  const item = legacyItem(
    { source: record.source },
    {
      activity: { rollMode: "attribute", attribute: "reason" },
      outcomes: { strong: "Custom outcome" },
    },
  );
  const configuration = abilityRollConfiguration(
    item,
    abilityCatalogRecord(item, catalog),
  );
  assert.equal(configuration.attribute, "reason");
  assert.equal(configuration.outcomes.strong, "Custom outcome");
});
