import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTES, characterSummary, validateCharacter } from "../src/rules/character.mjs";
const fixture = () => ({ attributes: Object.fromEntries(ATTRIBUTES.map(key => [key, { base: 0 }])), health: { value: 9, baseMax: 12 }, grit: { granted: 2, spent: 1 } });
test("resource summary does not refill spent HP/Grit or infer HP from current Fortitude", () => {
  const data = fixture(); data.attributes.fortitude.base = 2; data.attributes.agility.base = 1;
  assert.deepEqual(characterSummary(data), { attributeTotal: 3, healthMax: 12, gritAvailable: 1 });
  assert.equal(data.health.value, 9);
});
test("overspent Grit and HP beyond maximum fail cross-field validation", () => {
  const data = fixture(); data.grit.spent = 3;
  assert.throws(() => validateCharacter(data), /Grit/);
  data.grit.spent = 1; data.health.value = 13;
  assert.throws(() => validateCharacter(data), /HP/);
});
