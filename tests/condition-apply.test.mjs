import test from "node:test";
import assert from "node:assert/strict";
import { conditionApplication } from "../src/services/condition-apply.mjs";
import { damagePreview } from "../src/services/damage.mjs";
const makeActor = (key, ratings = [1, 2]) => ({
  type: "creature", system: { resistances: { numeric: [{ type: "fire", value: 3 }] }, weaknesses: { numeric: [{ type: "fire", value: 1 }] } },
  effects: ratings.map((rating, i) => ({ id: `source${i}`, active: true, getFlag: (_id, flag) => flag === "condition" ? { key, rating, persistence: i ? "starred" : "temporary", source: `source${i}`, order: i } : undefined })),
});
const basis = { hp: 10, maxHp: 10, printedArmor: 3, passiveDefenses: { resistances: [], weaknesses: [] } };
test("manual Burning combines all sources into one resisted event without decay", () => {
  const actor = makeActor("burning"), draft = conditionApplication(actor, "burning");
  assert.equal(draft.components[0].amount, 3);
  const plan = damagePreview(actor, basis, draft);
  assert.equal(plan.event.total, 1);
  assert.equal(plan.after, 9);
  assert.equal(draft.conditionSnapshot[0].rating, 1);
  assert.equal(draft.conditionSnapshot[1].rating, 2);
});
test("manual Bleeding bypasses armor, resistance and weakness only through trusted application option", () => {
  const actor = makeActor("bleeding"), draft = conditionApplication(actor, "bleeding");
  assert.equal(damagePreview(actor, basis, draft, { bypassResistance: true }).event.total, 3);
  assert.equal(damagePreview(actor, basis, { ...draft, bypassResistance: true }).event.total, 1);
});
test("condition application rejects unsupported or inactive conditions", () => {
  assert.throws(() => conditionApplication(makeActor("burning"), "poisoned"), /Burning/);
  assert.throws(() => conditionApplication(makeActor("freezing", []), "freezing"), /not active/);
});
