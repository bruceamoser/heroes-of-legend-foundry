import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readPortableCharacter,
  writePortableCharacter,
} from "../src/rules/portable-character.mjs";
import { creationLedger } from "../src/rules/development.mjs";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const source = await read("../static/data/choices.json");
const inventory = await read("../static/data/inventory.json");
const fixtures = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: source.records,
  inventory,
  commit: source.sourceCommit,
};
const oldArmor = "grant:ability-wear-medium-armor:item-ordinary-medium-armor";
const lightArmor = "grant:ability-wear-light-armor:item-ordinary-light-armor";
const file = (commit, draft = fixtures.characters[0].draft) => ({
  ...JSON.parse(writePortableCharacter(draft, catalogs)),
  sourceCommit: commit,
  draft: structuredClone(draft),
});

test("the old Walled armor arrangement and removal follow its current light grant", () => {
  const input = file("9bc9b4fe3256e68880b92c45facf0f25b98a1ea3");
  input.draft.loadout = {
    [oldArmor]: { carried: true, worn: true },
    unrelated: { held: true },
  };
  input.draft.play = {
    inventory: { added: [], removed: [oldArmor, "shop-other"] },
    memorizedMessage: "Meet at dawn.",
  };
  const before = structuredClone(input);
  const result = readPortableCharacter(input, catalogs);
  assert.deepEqual(input, before);
  assert.equal(result.draft.loadout[oldArmor], undefined);
  assert.deepEqual(result.draft.loadout[lightArmor], {
    carried: true,
    worn: true,
  });
  assert.deepEqual(result.draft.loadout.unrelated, { held: true });
  assert.deepEqual(result.draft.play.inventory.removed, [
    lightArmor,
    "shop-other",
  ]);
  assert.equal(result.draft.play.memorizedMessage, "Meet at dawn.");
  assert.deepEqual(result.draft.purchases, input.draft.purchases);
  assert(
    !result.preview.inventory.items.some(
      (item) => item.catalogId === "item-ordinary-light-armor",
    ),
  );
});

test("retained markers and old source commits use only current origin pairs", () => {
  for (const commit of [
    "64089a1c8961d7faff172f179448a8b6e57827ef",
    "295e858c1b6fee044a0261bf9f437636efeff2bf",
    "arbitrary-old-source",
  ]) {
    const input = file(commit);
    input.draft.culture = {
      id: "origin-culture-cloister-valleys",
      pair: 0,
      retainedFrom: "64089a1c8961d7faff172f179448a8b6e57827ef",
    };
    input.draft.play = { memorizedMessage: "Keep our promise." };
    const result = readPortableCharacter(input, catalogs);
    const current = catalogs.choices.find(
      (record) => record.id === input.draft.culture.id,
    ).pairs[0];
    assert.deepEqual(result.draft.culture, {
      id: input.draft.culture.id,
      pair: 0,
    });
    assert(result.preview.state.abilities.includes(current.abilityId));
    assert.equal(result.draft.play.memorizedMessage, "Keep our promise.");
    assert.deepEqual(result.draft.purchases, input.draft.purchases);
    assert(
      !writePortableCharacter(result.draft, catalogs).includes("retainedFrom"),
    );
  }
});

test("out-of-range old origin choices stay unresolved instead of granting arbitrary history", () => {
  const input = file("64089a1c8961d7faff172f179448a8b6e57827ef");
  input.draft.culture = {
    id: "origin-culture-cloister-valleys",
    pair: 99,
    retainedFrom: "old",
  };
  const result = readPortableCharacter(input, catalogs);
  assert.equal(result.preview.valid, false);
  assert(result.preview.errors.some((error) => error.code === "culture"));
  assert.equal(result.draft.culture.retainedFrom, undefined);
  const ledger = creationLedger(result.draft, catalogs.choices, {
    inventoryCatalog: inventory,
  });
  assert(
    !ledger.ledger.some(
      (entry) =>
        entry.sourceId === input.draft.culture.id &&
        entry.kind === "ability-grant",
    ),
  );
});
