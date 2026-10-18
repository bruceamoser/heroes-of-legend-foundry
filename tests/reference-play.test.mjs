import test from "node:test";
import assert from "node:assert/strict";
import { referenceAbilities, selectedReferences, postAbilityReference } from "../src/services/reference-play.mjs";
import { renderRollSummary, evaluatePreparedRoll } from "../src/services/roll.mjs";

function fixture() {
  const user = { id: "owner", isGM: false };
  const actor = { uuid: "Actor.hero", name: "Hero", testUserPermission: () => true };
  const source = { path: "design/cards/winter-hold.md", sha256: "abc" };
  const item = { documentName: "Item", type: "ability", id: "winter", uuid: "Actor.hero.Item.winter",
    name: "Winter Hold", actor, getFlag: (_, key) => key === "source" ? source : "pinned",
    testUserPermission: () => true };
  actor.items = [item]; actor.items.get = id => actor.items.find(item => item.id === id);
  globalThis.game = { user, users: new Map([[user.id, user]]), scenes: { viewed: { tokens: [] } } };
  return { actor, item, source, user };
}

test("references snapshot exact live owned Item identity and provenance without mechanics", () => {
  const { actor, source } = fixture();
  const references = selectedReferences(actor, { referenceItemIds: ["winter", "winter"] });
  assert.deepEqual(references, [{ itemUuid: "Actor.hero.Item.winter", name: "Winter Hold", source, sourceCommit: "pinned" }]);
  references[0].source.sha256 = "changed";
  assert.equal(source.sha256, "abc");
  assert.throws(() => selectedReferences(actor, { referenceItemIds: ["missing"] }), /no longer visible/);
  assert.throws(() => selectedReferences(actor, { referenceItemIds: "winter" }), /available/);
});

test("defense references follow visible-token policy without granting observer access to hidden Actors", () => {
  const { actor } = fixture(); actor.testUserPermission = () => false;
  assert.equal(referenceAbilities(actor).length, 0);
  game.scenes.viewed.tokens = [{ actor, hidden: false }];
  assert.equal(referenceAbilities(actor, { mode: "defense" }).length, 1);
  assert.equal(referenceAbilities(actor).length, 0);
  game.scenes.viewed.tokens[0].hidden = true;
  assert.equal(referenceAbilities(actor, { mode: "defense" }).length, 0);
  assert.deepEqual(selectedReferences(actor, {}), []);
});

test("posting rejects compendium/unowned references before generating or creating chat", async () => {
  const { item } = fixture(); item.testUserPermission = () => false;
  await assert.rejects(postAbilityReference(item), /owned ability/);
  item.testUserPermission = () => true; item.actor.items = [];
  await assert.rejects(postAbilityReference(item), /owned ability/);
});

test("reference selection leaves evaluated dice, modifier sources and action state unchanged", async () => {
  const { actor } = fixture();
  globalThis.foundry = { dice: { Roll: class {
    constructor(formula) { this.formula = formula; this.dice = [{ results: [3, 4, 5].map(result => ({ result, active: true })) }]; }
    async evaluate() { return this; }
  } } };
  const basis = { mode: "attribute", attributeKey: "knowledge", attribute: 2, contributions: [], woundModifiers: [], benefits: [], incoming: null };
  const plain = await evaluatePreparedRoll(actor, basis, {});
  const attached = await evaluatePreparedRoll(actor, basis, { referenceItemIds: ["winter"] });
  assert.equal(attached.roll.formula, plain.roll.formula);
  const { references, ...snapshot } = attached.snapshot;
  const { references: plainReferences, ...plainSnapshot } = plain.snapshot;
  assert.deepEqual(snapshot, plainSnapshot);
  assert.equal(references.length, 1);
  assert.equal(plainReferences.length, 0);
});


test("private roll content guard prevents rendering reference names and links", () => {
  const message = { isContentVisible: false, getFlag: () => ({ references: [{ itemUuid: "Actor.secret.Item.secret", name: "Secret ability" }] }) };
  renderRollSummary(message, { querySelector() { throw new Error("Hidden content must not inspect or populate chat DOM"); } });
});
