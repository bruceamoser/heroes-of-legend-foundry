import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { movementProfile } from "../src/rules/movement-budget.mjs";
import { handLayout } from "../src/rules/hands.mjs";
import { passiveDefenseSources } from "../src/rules/passive-defenses.mjs";
import { recoveryPreview } from "../src/services/recovery.mjs";
import { woundTreatmentPlan } from "../src/services/wound-treatment.mjs";
const inventory = JSON.parse(await readFile(new URL("../static/data/inventory.json", import.meta.url)));
const choices = JSON.parse(await readFile(new URL("../static/data/choices.json", import.meta.url)));
test("zero-quantity native stacks contribute no Bulk, hand occupancy or passive benefit", () => {
  const items = [{ id: "empty", catalogId: "item-travel-clothes", bulk: 2, quantity: 0, held: true, hands: 2, worn: true }];
  assert.equal(movementProfile({ speedBase: 6, agility: 0, brawn: 0, items }).bulk, 0);
  assert.equal(handLayout(items).occupied, 0);
  const equipment = inventory.equipment.find(record => record.id === "item-ordinary-light-armor");
  const ability = choices.records.find(record => record.id === "ability-wear-light-armor");
  assert.equal(passiveDefenseSources({ abilities: [{ instanceId: "training", catalogId: ability.id, source: ability.source }], equipment: [{ instanceId: "armor", catalogId: equipment.id, source: equipment.source, worn: true, quantity: 0 }] }).resistances.length, 0);
});
test("native Grit restores full HP and clears marks while retaining wounds and turn history", () => {
  const actor = { type: "character", getFlag: () => undefined };
  const basis = { hp: 0, maxHp: 15, gritAvailable: 2, survival: { status: "dying", hp: 0, maxHp: 15, marks: 2, wounds: 4, gritAvailable: 2, ownTurn: 3, due: 3, choice: null } };
  const result = recoveryPreview(actor, basis, { kind: "grit" });
  assert.equal(result.after, 15); assert.equal(result.state.gritAvailable, 1);
  assert.equal(result.state.marks, 0); assert.equal(result.state.wounds, 4); assert.equal(result.state.ownTurn, 3);
  assert.throws(() => recoveryPreview(actor, { ...basis, gritAvailable: 0 }, { kind: "grit" }), /No Grit/);
  assert.throws(() => recoveryPreview({ ...actor, getFlag: () => ({ pending: { status: "rolled" } }) }, basis, { kind: "grit" }), /pending wound/);
});
test("treatment reaching the printed value clears only this wound's effects and retains scar", () => {
  const flags = data => ({ "heroes-of-legend": data });
  const basis = { eventId: "w", wound: { id: "scar", recoveryProgress: 1, recoveryValue: 3, effectIds: ["move", "star", "temp", "other"] }, effects: [
    { _id: "move", flags: flags({ woundEvent: "w", woundModifier: { kind: "movementPenalty" } }) },
    { _id: "star", flags: flags({ woundEvent: "w", condition: { persistence: "starred" } }) },
    { _id: "temp", flags: flags({ woundEvent: "w", condition: { persistence: "temporary" } }) },
    { _id: "other", flags: flags({ woundEvent: "different", woundModifier: { kind: "rollModifier" } }) },
  ] };
  assert.equal(woundTreatmentPlan(basis, 1).complete, false);
  const result = woundTreatmentPlan(basis, 2);
  assert.equal(result.complete, true); assert.equal(result.wound.id, "scar");
  assert.deepEqual(result.removeEffectIds, ["move", "star", "temp"]); assert.deepEqual(result.wound.effectIds, ["other"]);
  assert.equal(basis.wound.recoveryProgress, 1);
  assert.throws(() => woundTreatmentPlan({ ...basis, wound: { recoveryValue: null } }, 1), /no treatment track/);
});
