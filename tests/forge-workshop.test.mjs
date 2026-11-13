import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { forgeEligibility, forgeLearning, learnForgeEntry } from "../src/rules/forge.mjs";
import { workshopCatalogs } from "../src/rules/workshop-forge-catalog.mjs";
import { workshopCharacter } from "../src/rules/workshop-character.mjs";
import { readPortableCharacter, writePortableCharacter } from "../src/rules/portable-character.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../static/data/${name}.json`, import.meta.url)));
const graph = read("forge");
const catalogs = workshopCatalogs(...["choices", "inventory", "wounds", "forge", "forge-references"].map(read));
const { party } = read("forge-party");

test("each Forge combination requires all the book's named endpoints", () => {
  for (const node of graph.nodes.filter(({ kind }) => kind === "combined")) {
    const state = { level: 7, dp: node.dp, learned: node.requires };
    assert.equal(node.dp, node.requires.length + 1, node.name);
    assert(forgeEligibility(graph, state, node.id).eligible, node.name);
    for (const omitted of node.requires)
      assert(!forgeEligibility(graph, { ...state, learned: state.learned.filter((id) => id !== omitted) }, node.id).eligible, omitted);
    assert(!forgeEligibility(graph, { ...state, level: 6 }, node.id).eligible);
    assert(!forgeEligibility(graph, { ...state, dp: node.dp - 1 }, node.id).eligible);
    const result = learnForgeEntry(graph, state, node.id);
    assert.equal(result.state.dp, 0);
    assert(!learnForgeEntry(graph, result.state, node.id).eligible);
    assert(!state.learned.includes(node.id));
  }
});

test("Forge keeps technique improvements on the same attack and teaches all capstone pages at once", () => {
  let state = { level: 0, dp: 20, learned: [] };
  const learn = (id) => {
    const result = learnForgeEntry(graph, state, id);
    assert(result.eligible, result.reasons.join(" "));
    state = result.state;
  };
  assert(!forgeEligibility(graph, state, "air:0").eligible);
  for (const id of ["elements", "air:0", "air:1", "air:2", "arms", "arms:impact:1", "arms:impact:2", "arms:impact:3"]) learn(id);
  assert(!forgeEligibility(graph, state, "air:3").eligible);
  state.level = 3;
  learn("air:3");
  const learning = forgeLearning(graph, state.learned);
  assert.deepEqual(learning.spells.map(({ page }) => page), ["1", "2", "3", "4", "5", "6", "7", "8", "A1", "A2", "A3"]);
  assert.equal(learning.spells[0].sp, 0);
  assert.deepEqual(learning.improvements.get("arms:impact:1").map(({ id }) => id), ["arms:impact:2", "arms:impact:3"]);
  assert.deepEqual(learning.abilities.map(({ id }) => id), ["arms:impact:1"]);
});

test("canonical example heroes match current book numbers and survive a portable round trip", () => {
  const printed = [
    [19, 6, 8, 8], [15, 6, 2, 8], [15, 13, 5, 7],
    [13, 6, 9, 8], [13, 6, 4, 7], [13, 20, 15, 7],
  ];
  for (const [{ draft, id }, expected] of party.map((entry, index) => [entry, printed[index]])) {
    const preview = workshopCharacter(draft, catalogs);
    assert(preview.valid, `${id}: ${JSON.stringify(preview.errors)}`);
    assert.deepEqual([
      preview.limits.maxHp, preview.limits.maxSp, preview.inventory.remainingCoins, preview.inventory.bulk,
    ], expected, id);
    assert.equal(preview.limits.gritGranted, 1);
    const loaded = readPortableCharacter(writePortableCharacter(draft, catalogs, { ready: true }), catalogs);
    assert.deepEqual(loaded.preview.state.learned, preview.state.learned);
    assert.deepEqual(loaded.preview.state.recipes, preview.state.recipes);
    assert.deepEqual(loaded.preview.ledger, preview.ledger);
  }
});

test("levels 3 and 7 grant one signature each and do not duplicate DP, Grit, or learning", () => {
  const draft = structuredClone(party[0].draft);
  const cls = graph.classes.find((record) => record.id === draft.classId);
  const withoutGrant = (tier) => cls.signatures[tier].find((id) => !/grants one/.test(graph.signatures.find((s) => s.id === id).equipment));
  draft.progression = { level: 7, levels: {
    3: { purchases: [{ id: "arms:impact:4" }], signatures: { 3: withoutGrant(3) } },
    7: { purchases: [], signatures: { 7: withoutGrant(7) } },
  } };
  draft.play = { hp: 5, sp: 2, gritSpent: 1, scars: ["A thin line over the brow."] };
  const once = workshopCharacter(draft, catalogs);
  assert(once.valid, JSON.stringify(once.errors));
  assert.equal(once.development.current, 72);
  assert.equal(once.limits.maxHp, 55);
  assert.equal(once.limits.maxSp, 18);
  assert.equal(once.limits.gritGranted, 3);
  assert.equal(once.state.abilities.filter((id) => id.startsWith("ability-signature")).length, 3);
  const twice = readPortableCharacter(writePortableCharacter(draft, catalogs, { ready: true }), catalogs);
  assert.deepEqual(twice.preview.advancementLedger, once.advancementLedger);
  assert.equal(twice.draft.play.sp, 2);
  assert.equal(twice.draft.play.gritSpent, 1);
});
