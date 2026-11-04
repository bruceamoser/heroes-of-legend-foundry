import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAbilityReference } from "../scripts/content/choices.mjs";
import { printedAbilityRoll, abilityRollConfiguration } from "../src/rules/ability-roll.mjs";
import { resolvedAttackEffects } from "../src/rules/attack-outcomes.mjs";
const fixtures = JSON.parse(await readFile(new URL("./fixtures/decision-rule-rendering.json", import.meta.url)));
const records = fixtures.records.filter(row => row.inlineTriad);
const reference = name => parseAbilityReference(records.find(row => row.name === name).sourceMarkdown);
const roll = name => printedAbilityRoll({reference:reference(name)}).outcomes;

test("all 36 reviewed inline profiles preserve nonempty tier metadata independently of lossless body prose", () => {
  assert.equal(records.length, 36);
  for (const row of records) {
    const parsed = parseAbilityReference(row.sourceMarkdown);
    const outcomes = printedAbilityRoll({reference:parsed}).outcomes;
    for (const tier of ["weak", "standard", "strong"]) assert(outcomes[tier]?.trim(), `${row.name}/${tier}`);
    assert(!parsed.rules.body.some(block=>block.outcomes), row.name);
    assert.throws(()=>parseAbilityReference(row.sourceMarkdown + '\n'), /Review inline roll profile/);
  }
});

test("numeric postfix profiles associate exact Triage and Twin Strike values with their tiers", () => {
  assert.deepEqual(roll("Triage"), {weak:"One ally: restore 6 HP. Two allies: restore 4 HP each.",standard:"One ally: restore 11 HP. Two allies: restore 7 HP each.",strong:"One ally: restore 16 HP. Two allies: restore 10 HP each."});
  assert.deepEqual(roll("Twin Strike"), {weak:"Each attack: 1 physical damage.",standard:"Each attack: 2 physical damage.",strong:"Each attack: 3 physical damage."});
});

test("reviewed profiles exclude common procedures from Strong while preserving true Strong-specific clauses", () => {
  for (const [name,common] of [["Reckless Charge","Take 1 Bane"],["Shatter the Guard","loses 1 resistance"],["Mend","Life resistance"],["Mend the Wound","one treatment attempt"],["Radiant Threshold","1 square wide"],["Volley","Roll once"],["Earthbreaker","double damage"]]) {
    assert(!roll(name).strong.includes(common), name);
    assert(JSON.stringify(reference(name).rules.body).includes(common), name);
  }
  assert.match(roll("The Half-Second").strong,/triggering action is interrupted and lost/);
  assert.match(roll("Mend").strong,/stand without spending movement/);
});

test("existing fixed attack damage and conditions remain available to native roll effects", () => {
  assert.deepEqual(resolvedAttackEffects(roll("Angle of Attack").weak), {components:[{type:"physical",amount:3}],conditions:[]});
  const blade=resolvedAttackEffects(roll("Blade in the Back").strong);
  assert.equal(blade.components[0].amount,6);
  assert.match(blade.manual, /Bleeding 2/);
  const config=abilityRollConfiguration({uuid:"Actor.test.Item.test",name:"Angle of Attack",system:{}},{reference:reference("Angle of Attack")});
  assert.equal(config.outcomes.strong,"deal 7 physical damage.");
});
