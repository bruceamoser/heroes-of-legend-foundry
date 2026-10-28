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
