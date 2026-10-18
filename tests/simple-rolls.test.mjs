import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  situationalRollDraft,
  situationalAdjustmentLabel,
  effectiveRollDraft,
} from "../src/rules/situational-adjustment.mjs";
import { prepareRoll } from "../src/services/roll-preparation.mjs";

const basis = {
  mode: "defense", attribute: 1, contributions: [], woundModifiers: [],
  benefits: [], incoming: null,
};
test("signed slider maps −3/0/+3 to exact dice without requiring reasons", () => {
  for (const [value, boons, banes, formula] of [
    [-3, 0, 3, "6d6kl3 + (1)"], [0, 0, 0, "3d6 + (1)"],
    [3, 3, 0, "6d6kh3 + (1)"],
  ]) {
    const draft = situationalRollDraft(value);
    assert.equal(draft.boons, boons);
    assert.equal(draft.banes, banes);
    assert.equal(prepareRoll(basis, draft).formula, formula);
    assert.match(situationalAdjustmentLabel(value), value === 0 ? /No adjustment/ : /3 (Boons|Banes)/);
  }
  for (const invalid of [-4, 4, 0.5, "bad", Infinity])
    assert.throws(() => situationalRollDraft(invalid), /−3 to \+3/);
});

test("slider joins automatic sources before one cancellation and cap", () => {
  const automatic = {
    ...basis, attackMessageId: "attack",
    incoming: { threat: { boons: 4, banes: 2 } },
  };
  const canceled = prepareRoll(automatic, situationalRollDraft(-3));
  assert.equal(canceled.boons, 4);
  assert.equal(canceled.banes, 5);
  assert.equal(canceled.canceled, 4);
  assert.equal(canceled.formula, "4d6kl3 + (1)");
  const capped = prepareRoll(automatic, situationalRollDraft(3));
  assert.equal(capped.boons, 7);
  assert.equal(capped.banes, 2);
  assert.equal(capped.canceled, 2);
  assert.equal(capped.net, 3);
  assert.equal(capped.formula, "6d6kh3 + (1)");
  assert.equal(capped.sources.filter(source => source.id === "situational-boons").length, 1);
});

test("attack follows one native target and unregisters its target hook", async () => {
  const handlers = new Map();
  globalThis.foundry = { applications: { api: {
    ApplicationV2: class { async _onClose() {} },
    HandlebarsApplicationMixin: base => base,
  } } };
  globalThis.Hooks = {
    on: (event, handler) => handlers.set(event, handler),
    off: (event, handler) => { if (handlers.get(event) === handler) handlers.delete(event); },
  };
  globalThis.game = { user: { id: "local", targets: new Set() } };
  const { BasicMeleeDialog } = await import("../src/dialogs/player-attack.mjs");
  const dialog = new BasicMeleeDialog({}, {}, "participant");
  assert.equal(dialog.selection().targetTokenUuid, null);
  game.user.targets = new Set([{ document: { uuid: "Scene.s.Token.first" } }]);
  assert.equal(dialog.selection().targetTokenUuid, "Scene.s.Token.first");
  assert.equal(dialog.selection().requireNativeTarget, true);
  game.user.targets.add({ document: { uuid: "Scene.s.Token.second" } });
  assert.equal(dialog.selection().targetTokenUuid, null);
  game.user.targets = new Set([{ document: { uuid: "Scene.s.Token.second" } }]);
  assert.equal(dialog.selection().targetTokenUuid, "Scene.s.Token.second");
  dialog.fears = [];
  dialog.basis = { woundModifiers: [] };
  dialog.draft.weaponItemUuid = "Actor.a.Item.only-weapon";
  dialog.element = { querySelector: () => null };
  dialog.readDraft();
  assert.equal(dialog.draft.weaponItemUuid, "Actor.a.Item.only-weapon");
  dialog.element = { querySelector: selector => selector === '[name="weaponItemUuid"]'
    ? { value: "Actor.a.Item.other-weapon" } : null };
  dialog.readDraft();
  assert.equal(dialog.draft.weaponItemUuid, "Actor.a.Item.other-weapon");
  const label = {}, slider = { setAttribute: (key, value) => { slider[key] = value; } };
  dialog.context = { basis: null, reasons: ["Use Foundry targeting."] };
  dialog.draft.adjustment = 3;
  dialog.element = { querySelector: selector => ({
    ".hol-roll-sources": { replaceChildren() {} },
    "output": {}, ".hol-roll-totals": {}, '[data-action="attack"]': {},
    "[data-adjustment-label]": label, "[name=adjustment]": slider,
  })[selector] };
  dialog.preview();
  assert.match(label.textContent, /\+3/);
  assert.match(slider["aria-valuetext"], /\+3/);
  let renders = 0;
  dialog.rendered = true;
  dialog.render = () => { renders++; };
  handlers.get("targetToken")({ id: "other" });
  assert.equal(renders, 0);
  handlers.get("targetToken")({ id: "local" });
  assert.equal(renders, 1);
  await dialog._onClose({});
  assert.equal(handlers.has("targetToken"), false);
  const { SharedRollDialog } = await import("../src/dialogs/attribute-roll.mjs");
  const shared = new SharedRollDialog({}, "agility");
  shared.fears = ["Ogre"];
  shared.basis = { ...basis, woundModifiers: [{ effectId: "injury" }] };
  shared.element = { querySelectorAll: () => [], querySelector: selector =>
    selector === '[name="adjustment"]' ? { value: "-3" } : { checked: false },
  };
  shared.readDraft();
  assert.equal(shared.draft.perception.Ogre, "no");
  assert.equal(shared.draft.woundApplicability.injury, "does-not-apply");
  assert.equal(shared.draft.adjustment, -3);
  assert.equal(shared.draft.adjustmentOverride, false);
  await shared._onClose({});
});

test("roll surfaces expose one accessible slider and no modifier reason fields", async () => {
  for (const file of ["attribute-roll.hbs", "player-attack.hbs"]) {
    const template = await readFile(new URL(`../static/templates/${file}`, import.meta.url), "utf8");
    assert.equal((template.match(/type="range"/g) ?? []).length, 1);
    assert.match(template, /name="adjustment" min="-3" max="3" step="1"/);
    assert.match(template, /aria-label="Boons or Banes"/);
    assert.doesNotMatch(template, /name="(?:boons|banes|boonsLabel|banesLabel|additionalAttempt|attemptReason)"/);
    assert.doesNotMatch(template, /select name="(?:fear-|wound-|targetTokenUuid)/);
  }
});


test("effective slider prefills sources and a manual value replaces the final net", () => {
  const autoBasis = { ...basis, benefits: [{
    id: "ability", kind: "boon", amount: 2, label: "Ability", automatic: true,
  }] };
  const baseline = prepareRoll(autoBasis);
  const initial = effectiveRollDraft(baseline);
  assert.equal(initial.adjustment, 2);
  assert.equal(initial.boons, 0);
  assert.equal(prepareRoll(autoBasis, initial).net, 2);
  const manual = effectiveRollDraft(baseline, -1, true);
  assert.equal(manual.banes, 3);
  assert.equal(prepareRoll(autoBasis, manual).net, -1);
  const changedBasis = { ...autoBasis, benefits: [{
    ...autoBasis.benefits[0], amount: 3,
  }] };
  const changed = prepareRoll(changedBasis);
  assert.equal(effectiveRollDraft(changed, initial.adjustment).adjustment, 3);
  assert.equal(prepareRoll(changedBasis, effectiveRollDraft(changed, -1, true)).net, -1);
  const opposing = { ...basis, benefits: [
    { id: "boons", kind: "boon", amount: 5, label: "Boons", automatic: true },
    { id: "banes", kind: "bane", amount: 1, label: "Banes", automatic: true },
  ] };
  const opposingPlan = prepareRoll(opposing);
  assert.equal(effectiveRollDraft(opposingPlan).adjustment, 3);
  assert.equal(prepareRoll(opposing, effectiveRollDraft(opposingPlan, 0, true)).net, 0);
  const cappedBasis = { ...basis, benefits: [
    { id: "boons", kind: "boon", amount: 7, label: "Boons", automatic: true },
    { id: "banes", kind: "bane", amount: 2, label: "Banes", automatic: true },
  ] };
  const capped = prepareRoll(cappedBasis);
  assert.equal(effectiveRollDraft(capped).adjustment, 3);
  assert.equal(prepareRoll(cappedBasis, effectiveRollDraft(capped, -1, true)).formula, "4d6kl3 + (1)");
});
