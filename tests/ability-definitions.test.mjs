import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ABILITY_DEFINITIONS,
  abilityDefinition,
} from "../src/rules/ability-definitions.mjs";
test("every enabled adapter matches the pinned catalog source exactly", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../static/data/choices.json", import.meta.url),
      "utf8",
    ),
  );
  for (const d of Object.values(ABILITY_DEFINITIONS)) {
    const record = catalog.records.find((r) => r.id === d.id);
    assert.deepEqual(record.source, d.source);
    assert.equal(
      abilityDefinition(record.id, record.source).handler,
      d.handler,
    );
  }
  assert.equal(abilityDefinition("unknown", {}), null);
  assert.throws(
    () =>
      abilityDefinition("ability-defend", {
        path: "design/cards/defend.md",
        sha256: "changed",
      }),
    /needs review/,
  );
});

test("reviewed editorial-only Defend source remains usable on existing items", () => {
  const definition = ABILITY_DEFINITIONS["ability-defend"];
  assert.equal(
    abilityDefinition(definition.id, {
      ...definition.source,
      sha256: definition.equivalentSourceHashes[0],
    }),
    definition,
  );
});
