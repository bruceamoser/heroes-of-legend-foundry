import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { abilityHeaderBadges } from "../src/rules/workshop-card-view.mjs";
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const choices = (await read("../static/data/choices.json")).records;
test("card header preserves all discipline ranks, including hybrid requirements", () => {
  for (const record of choices.filter((r) => r.kind === "ability")) {
    assert.deepEqual(
      abilityHeaderBadges(record).disciplines,
      (record.requirements ?? [])
        .filter((r) => r.kind === "discipline")
        .map((r) => ({ id: r.id, rank: r.rank })),
    );
  }
  assert(
    choices.some((r) =>
      abilityHeaderBadges(r).disciplines.some((d) => d.rank === 3),
    ),
  );
});
test("action letters distinguish Main Action, Maneuver, Reaction, Passive and mixed actions", () => {
  const card = (action) => ({
    reference: { rules: { details: [{ label: "Action", value: action }] } },
  });
  assert.deepEqual(abilityHeaderBadges(card("Main Action")).codes, ["A"]);
  assert.deepEqual(abilityHeaderBadges(card("Maneuver")).codes, ["M"]);
  assert.deepEqual(abilityHeaderBadges(card("Reaction")).codes, ["R"]);
  assert.deepEqual(abilityHeaderBadges(card("Passive")).codes, ["P"]);
  assert.deepEqual(abilityHeaderBadges(card("Main Action or Maneuver")).codes, [
    "A",
    "M",
  ]);
});
