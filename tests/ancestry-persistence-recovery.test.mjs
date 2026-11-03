import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRecovery, recoveryMaximum, payDebt, nextDawn } from "../src/rules/recovery.mjs";
import { currentCreationDraft, readPortableCharacter, writePortableCharacter } from "../src/rules/portable-character.mjs";
import { workshopCharacter } from "../src/rules/workshop-character.mjs";
import { workshopVitals } from "../src/rules/workshop-vitals.mjs";
import { workshopSpendGrit, workshopSupplyUse } from "../src/rules/workshop-resources.mjs";
import { normalizeWorkshopPlay } from "../src/rules/workshop-play.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const [choices, inventory, heroes] = await Promise.all([
  read("../static/data/choices.json"), read("../static/data/inventory.json"), read("./fixtures/reference-heroes.json"),
]);
const catalogs = { choices: choices.records, inventory, commit: choices.sourceCommit };
const debtTrait = "trait-oath-bound-the-debt-comes-due";

test("current ancestry aliases normalize narrowly, preserve published IDs, and never edit live play state", () => {
  for (const [ancestryId, expected] of [
    ["ancestry-elf", "ancestry-elf"], ["ancestry-dwarf", "ancestry-dwarf"],
    ["ancestry-wood-elf", "ancestry-elf"], ["ancestry-hill-dwarf", "ancestry-dwarf"],
  ]) {
    const input = { ...structuredClone(heroes.characters[0].draft), ancestryId,
      traitIds: ["trait-elf-fleet"],
      play: { hp: 3, gritSpent: 1, memorizedMessage: "Keep this note.",
        wounds: [{ id: "wound-kept", name: "Old scar", notes: "Retain the remedy." }],
        inventory: { added: [], removed: ["creation-outfit"] } },
      profile: { story: "Keep this history." },
    };
    const before = structuredClone(input);
    const normalized = currentCreationDraft(input, "previous-source");
    assert.equal(normalized.ancestryId, expected);
    assert.deepEqual(normalized.traitIds, before.traitIds);
    assert.deepEqual(normalized.play, before.play);
    assert.deepEqual(input, before);
    assert.deepEqual(currentCreationDraft(normalized), normalized);
    for (const schemaVersion of [1, 2, 3]) {
      const file = {format: "heroes-of-legend-character", schemaVersion, sourceCommit: "old", draft: input};
      const restored = readPortableCharacter(file, catalogs).draft;
      assert.equal(restored.ancestryId, expected);
      assert.deepEqual(restored.traitIds, before.traitIds);
      assert.equal(restored.play.hp, 3);
      assert.equal(restored.play.gritSpent, 1);
      assert.equal(restored.play.memorizedMessage, before.play.memorizedMessage);
      assert.deepEqual(restored.play.wounds, before.play.wounds);
      assert.deepEqual(restored.play.inventory.removed, before.play.inventory.removed);
      assert.deepEqual(restored.profile, before.profile);
    }
  }
});

test("Debt payment is a daily HP cost, leaves one HP and cannot be paid without the trait", () => {
  const input = { hp: 2, maxHp: 20, traitIds: [debtTrait] };
  const result = payDebt(input);
  assert.deepEqual(result, { hp: 1, recovery: { unavailableHp: 1, debtUsed: true } });
  assert.equal(input.hp, 2);
  assert.throws(() => payDebt({ ...input, hp: 1 }), /at least 1 HP/);
  assert.throws(() => payDebt({ ...input, traitIds: [] }), /requires its ancestry trait/);
  assert.throws(() => payDebt({ ...input, ...result }), /already been used/);
  assert.equal(recoveryMaximum(20, result.recovery), 19);
  const dawn = nextDawn(result);
  assert.deepEqual(dawn, { hp: 1, recovery: { unavailableHp: 0, debtUsed: false } });
  assert.equal(payDebt({ ...input, recovery: dawn.recovery }).hp, 1);
});

test("Debt accounting survives portable save, import and reload without changing HP, Grit, wounds or notes", () => {
  const draft = structuredClone(heroes.characters[0].draft);
  draft.play = { ...payDebt({ hp: 10, maxHp: 20, traitIds: [debtTrait] }),
    gritSpent: 1, memorizedMessage: "At dawn the missing HP can be healed.",
    wounds: [{ id: "wound-history", name: "Scar", notes: "Keep" }] };
  const first = writePortableCharacter(draft, catalogs);
  const loaded = readPortableCharacter(first, catalogs);
  const second = writePortableCharacter(loaded.draft, catalogs);
  assert.equal(second, first);
  assert.deepEqual(loaded.draft.play.recovery, { unavailableHp: 1, debtUsed: true });
  assert.equal(loaded.draft.play.hp, 9);
  assert.equal(loaded.draft.play.gritSpent, 1);
  assert.deepEqual(loaded.draft.play.wounds, draft.play.wounds);
  assert.equal(loaded.draft.play.memorizedMessage, draft.play.memorizedMessage);
  const v = workshopVitals(workshopCharacter(loaded.draft, catalogs), loaded.draft);
  assert.equal(v.hp, 9);
  assert.equal(v.recoveryMax, v.max - 1);
  assert.equal(workshopSpendGrit({ spent: 1, granted: 2, maxHp: v.max, recovery: v.recovery }).hp, v.max - 1);
  loaded.draft.play = { ...loaded.draft.play, ...nextDawn(loaded.draft.play) };
  const unlocked = workshopVitals(workshopCharacter(loaded.draft, catalogs), loaded.draft);
  assert.equal(unlocked.hp, 9);
  assert.equal(unlocked.recoveryMax, unlocked.max);
});

test("ordinary healing honors unavailable HP and dawn unlocks the final HP without autohealing", () => {
  const item = { catalogId: "item-lesser-healing-bottle", quantity: 1, inventoryDie: 4 };
  const recovery = { unavailableHp: 1, debtUsed: true };
  const use = extra => workshopSupplyUse({ item, face: 4, hp: 18, maxHp: 20, catalog: inventory, recovery, ...extra });
  assert.equal(use({}).hp, 19);
  assert.equal(use({hp: 19}).healed, 0);
  const dawn = nextDawn({hp: 19, recovery});
  assert.equal(dawn.hp, 19);
  assert.equal(use(dawn).hp, 20);
});

test("invalid recovery imports are rejected while historical saves default to ordinary recovery", () => {
  assert.deepEqual(normalizeRecovery(), { unavailableHp: 0, debtUsed: false });
  assert.equal(recoveryMaximum(20), 20);
  for (const recovery of [null, [], {unavailableHp: -1}, {unavailableHp: 2, debtUsed: true},
    {unavailableHp: 1, debtUsed: false}, {unavailableHp: 1.5, debtUsed: true}, {debtUsed: "yes"}]) {
    assert.throws(() => normalizeWorkshopPlay({recovery}, catalogs), /malformed play/);
  }
});
