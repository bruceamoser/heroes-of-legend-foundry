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

test("expansion update preserves every previous origin pair and its grant ledger", async () => {
  const { ORIGIN_HISTORY, ORIGIN_HISTORY_SOURCE, originPairOptions } =
    await import("../src/rules/origin-history.mjs");
  const { workshopCharacter } = await import(
    "../src/rules/workshop-character.mjs"
  );
  for (const [id, history] of Object.entries(ORIGIN_HISTORY)) {
    const origin = catalogs.choices.find((record) => record.id === id);
    for (const [pair, previous] of history.pairs.entries()) {
      const draft = structuredClone(fixtures.characters[0].draft);
      draft[origin.originType] = { id, pair };
      draft.play = {
        memorizedMessage: "Keep our original promise.",
        inventory: { added: [], removed: [] },
      };
      const oldCatalog = catalogs.choices.map((record) =>
        record.id === id ? { ...record, pairs: history.pairs } : record,
      );
      const baseline = workshopCharacter(draft, {
        ...catalogs,
        choices: oldCatalog,
      });
      const input = {
        format: "heroes-of-legend-character",
        schemaVersion: 3,
        sourceCommit: ORIGIN_HISTORY_SOURCE,
        draft,
      };
      const result = reviewRulesUpdate(input, catalogs);
      assert.deepEqual(result.preview.state.ranks, baseline.state.ranks, id);
      assert.deepEqual(
        result.preview.state.abilities,
        baseline.state.abilities,
        id,
      );
      assert.deepEqual(result.preview.state.items, baseline.state.items, id);
      assert.deepEqual(result.preview.ledger, baseline.ledger, id);
      assert.deepEqual(result.draft.purchases, draft.purchases);
      assert.equal(
        result.draft.play.memorizedMessage,
        draft.play.memorizedMessage,
      );
      const changed =
        JSON.stringify(previous) !== JSON.stringify(origin.pairs[pair]);
      assert.equal(
        Boolean(result.draft[origin.originType].retainedFrom),
        changed,
        id,
      );
      const rows = originPairOptions(origin, result.draft[origin.originType]);
      assert.equal(rows.filter((row) => row.retained).length, changed ? 1 : 0);
      assert.equal(rows.filter((row) => row.selected).length, 1);
      const roundtrip = readPortableCharacter(
        writePortableCharacter(result.draft, catalogs),
        catalogs,
      );
      assert.deepEqual(
        roundtrip.draft[origin.originType],
        result.draft[origin.originType],
      );
      assert.equal(
        originPairOptions(origin, undefined).some((row) => row.retained),
        false,
      );
    }
  }
});

test("retained origins require a reviewed historical source and exact existing pair", () => {
  const input = JSON.parse(
    writePortableCharacter(fixtures.characters[0].draft, catalogs),
  );
  input.draft.culture = {
    id: "origin-culture-reed-villages",
    pair: 0,
    retainedFrom: "made-up",
  };
  assert.throws(() => readPortableCharacter(input, catalogs), /malformed/);
  input.draft.culture.retainedFrom = "64089a1c8961d7faff172f179448a8b6e57827ef";
  input.draft.culture.pair = 99;
  assert.throws(() => readPortableCharacter(input, catalogs), /malformed/);
});
