import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  reviewRulesUpdate,
  PREVIOUS_BOOK_SOURCE,
} from "../src/rules/source-edition.mjs";
import {
  readPortableCharacter,
  writePortableCharacter,
} from "../src/rules/portable-character.mjs";
const read = async (p) =>
  JSON.parse(await readFile(new URL(p, import.meta.url)));
const choices = await read("../static/data/choices.json"),
  inventory = await read("../static/data/inventory.json"),
  fixtures = await read("./fixtures/reference-heroes.json");
const catalogs = {
  choices: choices.records,
  inventory,
  commit: choices.sourceCommit,
};
const legacy = () => ({
  ...JSON.parse(writePortableCharacter(fixtures.characters[0].draft, catalogs)),
  sourceCommit: PREVIOUS_BOOK_SOURCE,
});
test("rules updates are explicit, preserve the original and transfer Walled armor arrangements", () => {
  const old = legacy();
  old.draft.loadout = {
    "grant:ability-wear-medium-armor:item-ordinary-medium-armor": {
      carried: true,
      worn: true,
      held: false,
    },
  };
  const before = structuredClone(old);
  assert.throws(
    () => readPortableCharacter(old, catalogs),
    /different rules edition/,
  );
  const result = reviewRulesUpdate(old, catalogs);
  assert.deepEqual(old, before);
  assert.deepEqual(result.original, before);
  assert.equal(result.preview.resistances.physical, 1);
  assert.equal(
    result.preview.inventory.items.filter(
      (i) => i.catalogId === "item-ordinary-light-armor",
    ).length,
    1,
  );
  assert(
    !result.preview.state.abilities.some((id) =>
      [
        "ability-another-tongue",
        "ability-a-party-piece",
        "ability-quick-exit",
      ].includes(id),
    ),
  );
  assert(result.changes.some((text) => text.includes("DR 1")));
});
test("removed grants stay removed and old purchases remain available for repair", () => {
  const old = legacy();
  old.draft.play = {
    inventory: {
      added: [],
      removed: ["grant:ability-wear-medium-armor:item-ordinary-medium-armor"],
    },
  };
  old.draft.purchases[0].push({ id: "ability-wear-heavy-armor" });
  const result = reviewRulesUpdate(old, catalogs);
  assert(
    !result.preview.inventory.items.some(
      (i) => i.catalogId === "item-ordinary-light-armor",
    ),
  );
  assert.deepEqual(result.draft.purchases, old.draft.purchases);
  assert(!result.preview.valid);
  assert(
    result.preview.errors.some((e) => e.id === "ability-wear-heavy-armor"),
  );
  assert.throws(
    () => reviewRulesUpdate({ ...old, sourceCommit: "unknown" }, catalogs),
    /No reviewed rules update/,
  );
});
