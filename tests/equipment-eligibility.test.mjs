import test from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT_TRAINING,
  equipmentEligibility,
  isUniversalAbility,
} from "../src/rules/equipment-eligibility.mjs";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(new URL("../static/data/choices.json", import.meta.url)),
).records;
const references = JSON.parse(
  await readFile(new URL("../web/data/references.json", import.meta.url)),
).records;
test("equipment training requirements match printed source and require the specific ability", () => {
  for (const [item, ability] of Object.entries(EQUIPMENT_TRAINING)) {
    const name = catalog.find((r) => r.id === ability).name;
    assert(references[item].markdown.includes(name));
    assert.equal(equipmentEligibility(item, []).eligible, false);
    assert.equal(equipmentEligibility(item, [ability]).eligible, true);
    assert.equal(
      equipmentEligibility(item, ["ability-unrelated"]).eligible,
      false,
    );
  }
  assert.equal(equipmentEligibility("item-small-tent", []).eligible, true);
});
test("Universal filter includes purchasable no-discipline abilities and free basic actions, excluding trained abilities", () => {
  assert(
    isUniversalAbility(catalog.find((r) => r.id === "ability-another-tongue")),
  );
  assert(isUniversalAbility(catalog.find((r) => r.universal)));
  assert(!isUniversalAbility(catalog.find((r) => r.classId)));
  assert(
    !isUniversalAbility(catalog.find((r) => r.id === "ability-hook-and-drive")),
  );
  assert(!isUniversalAbility(catalog.find((r) => r.kind === "discipline")));
});
