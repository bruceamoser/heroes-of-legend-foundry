import test from "node:test";
import assert from "node:assert/strict";
import { builderDropChoice, validateBuilderPurchase, acquisitionWeaponName, resolveBuilderDrop, bindBuilderDrop } from "../src/services/builder-drop.mjs";
const choice = { id: "ability-fixture", kind: "ability", source: { path: "fixture.md", sha256: "pinned" }, cost: 2, minimumLevel: 1, requirements: [], purchasePolicy: "once" };
const item = { documentName: "Item", type: "ability", getFlag: (_, key) => key === "catalogId" ? choice.id : choice.source };
const state = { level: 1, dp: 4, abilities: [], purchases: [] };

test("builder drops resolve exact catalog identity rather than copying dragged statistics", () => {
  assert.equal(builderDropChoice(item, [choice]), choice);
  assert.throws(() => builderDropChoice({ ...item, type: "equipment" }, [choice]), /ability card/);
  assert.throws(() => builderDropChoice({ ...item, getFlag: (_, key) => key === "catalogId" ? choice.id : { ...choice.source, sha256: "old" } }, [choice]), /does not match/);
});

test("drop validation captures only a temporary candidate and preserves live draft on eligible and ineligible choices", () => {
  const original = { purchases: [], acquisition: "original" };
  const wizard = { draft: original, catalogs: { choices: [choice] }, capture() { this.draft.acquisition = "edited form"; } };
  validateBuilderPurchase(wizard, choice, candidate => { assert.equal(candidate.acquisition, "edited form"); return state; });
  assert.equal(wizard.draft, original);
  assert.deepEqual(original, { purchases: [], acquisition: "original" });
  assert.throws(() => validateBuilderPurchase(wizard, choice, () => ({ ...state, dp: 0 })), /Requires 2 DP/);
  assert.equal(wizard.draft, original);
  assert.deepEqual(original, { purchases: [], acquisition: "original" });
  wizard.capture = () => { throw new Error("capture failed"); };
  assert.throws(() => validateBuilderPurchase(wizard, choice, () => state), /capture failed/);
  assert.equal(wizard.draft, original);
});

test("native asynchronous drop resolution requires current document read permission", async () => {
  globalThis.game = { user: { id: "owner" } };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item", uuid: "Compendium.abilities.fixture" }) } } } } };
  globalThis.fromUuid = async () => ({ ...item, testUserPermission: () => false });
  await assert.rejects(resolveBuilderDrop({}, [choice]), /unavailable/);
  globalThis.fromUuid = async () => ({ ...item, testUserPermission: () => true });
  assert.equal(await resolveBuilderDrop({}, [choice]), choice);
});

test("weapon labels remain readable while IDs stay stable", () => {
  const inventory = { equipment: [{ id: "item-ordinary-melee-weapon", name: "Ordinary Melee Weapon" }, { id: "item-ordinary-ranged-weapon", name: "Ordinary Ranged Weapon" }] };
  assert.equal(acquisitionWeaponName("unarmed", inventory), "Unarmed");
  assert.equal(acquisitionWeaponName("melee", inventory), "Ordinary Melee Weapon");
  assert.equal(acquisitionWeaponName("ranged", inventory), "Ordinary Ranged Weapon");
});


test("rerendering the same application shell binds one drop handler", () => {
  const listeners = new Map();
  let dropped = 0;
  const wizard = { element: { addEventListener(event, handler) { const current = listeners.get(event) ?? []; current.push(handler); listeners.set(event, current); } }, dropAbility() { dropped++; } };
  bindBuilderDrop(wizard); bindBuilderDrop(wizard);
  assert.equal(listeners.get("drop").length, 1);
  for (const listener of listeners.get("drop")) listener({ preventDefault() {}, stopPropagation() {} });
  assert.equal(dropped, 1);
});
