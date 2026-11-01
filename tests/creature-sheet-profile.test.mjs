import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  creatureSheetProfile,
  summonAttackConfiguration,
} from "../src/rules/creature-sheet-profile.mjs";
import { summonSystemFromRecord } from "../src/rules/summon-profile.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("static/data/summons.json", root)),
);
const adder = catalog.records.find((record) => record.id === "summon-adder");
const summonActor = (record) => ({
  type: "creature",
  system: {},
  getFlag: () => ({ record }),
});

test("summon profile projection keeps attacker outcomes on a standard creature", () => {
  const actor = summonActor(adder);
  const before = structuredClone(adder);
  const view = creatureSheetProfile(actor);
  assert.equal(view.evasion.banes, adder.defenseModifier.banes);
  assert.equal(view.threat.boons, 0);
  assert.equal(view.armor, 0);
  assert.equal(view.actions.entries[0].id, "summon-attack-0");
  assert.equal(view.basicMelee.orientation, "attacker");
  assert.deepEqual(adder, before);
});

test("normal creature projection is unchanged and summon attacks retain printed tiers", () => {
  const creature = { type: "creature", system: { custom: "unchanged" } };
  assert.equal(creatureSheetProfile(creature), creature.system);
  const summon = summonActor(adder);
  const basic = summonAttackConfiguration(summon);
  assert.equal(basic.attribute, adder.basicMelee.attribute);
  assert.equal(
    basic.outcomes.strong,
    `${adder.basicMelee.outcomes.strong.damage.amount} physical damage.`,
  );
  assert.equal(
    basic.attackModifier.boons,
    adder.basicMelee.attackModifier.boons,
  );
  const special = summonAttackConfiguration(summon, "summon-attack-0");
  assert.equal(special.attribute, adder.attacks.actions[0].attribute);
  assert.throws(
    () => summonAttackConfiguration(summon, "bad-id"),
    /unavailable/,
  );
});

test("all 73 shipped summon profiles project through the shared creature layout", () => {
  for (const record of catalog.records) {
    const source = summonSystemFromRecord(record);
    const actor = summonActor(record);
    const view = creatureSheetProfile(actor);
    assert.equal(view.actions.entries.length, source.attacks.length);
    assert.equal(view.basicMelee.orientation, "attacker");
    assert.equal(view.restrictions.canReceiveHealing, false);
  }
});

test("fixed summon special attacks retain period-separated damage and conditions", async () => {
  const { resolvedAttackEffects } = await import(
    "../src/rules/attack-outcomes.mjs"
  );
  assert.deepEqual(resolvedAttackEffects("1 physical damage. Poisoned 1."), {
    components: [{ type: "physical", amount: 1 }],
    conditions: [{ key: "poisoned", rating: 1 }],
  });
  assert.deepEqual(resolvedAttackEffects("No damage. Paralyzed 1."), {
    components: [],
    conditions: [{ key: "paralyzed", rating: 1 }],
  });
});

test("injured summon HP stays on its document across renders, commands and profile view changes",async()=>{
 const {recordSummonCommand}=await import("../src/rules/summon-lifecycle.mjs");
 const state={record:adder,lifecycle:null};
 const actor={type:"creature",system:{health:{value:2,baseMax:5,max:5}},getFlag:()=>state};
 const before=structuredClone(actor.system);
 for(const turnKey of ["turn1","turn2"]){
   state.lifecycle=recordSummonCommand(state.lifecycle,{controllerUuid:"Actor.controller",turnKey,operationId:turnKey,register:!state.lifecycle});
   assert.deepEqual(creatureSheetProfile(actor).health,{value:2,baseMax:5,max:5});
   assert.equal(creatureSheetProfile(actor).health.value,2);
 }
 assert.deepEqual(actor.system,before);
 actor.getFlag=()=>null;
 assert.equal(creatureSheetProfile(actor).health.value,2);
 // A durable unlinked token also reads its synthetic Actor's retained resource.
 actor.isToken=true;actor.token={actorLink:false,getFlag:()=>state};
 assert.equal(creatureSheetProfile(actor).health.value,2);
 actor.system.health.value=0;
 assert.equal(creatureSheetProfile(actor).health.value,0);
});

test("all 73 summon profiles share underlying creature HP and numeric mitigation",async()=>{
 const creatures=JSON.parse(await readFile(new URL("static/data/creatures.json",root))).creatures;
 const normalize=entries=>entries.map(entry=>({type:entry.type.toLowerCase(),value:entry.value})).sort((a,b)=>a.type.localeCompare(b.type));
 assert.equal(catalog.records.length,73);
 for(const profile of catalog.records){
   const creature=creatures.find(record=>record.id===profile.creatureId);
   assert.equal(profile.hp.maximum,creature.hp.max,profile.id);
   assert.deepEqual(normalize(profile.mitigation.resistances.ordinary),normalize(creature.resistances.numeric),profile.id);
   assert.deepEqual(normalize(profile.mitigation.weakness.ordinary),normalize(creature.weaknesses.numeric),profile.id);
   // Creature armor and its physical resistance share the same highest-value
   // rule, so damageBasis need not substitute or mutate the actor defenses.
   if(creature.armor.dr) assert(creature.resistances.numeric.some(resistance=>resistance.type.toLowerCase()==="physical"&&resistance.value>=creature.armor.dr),profile.id);
 }
});
