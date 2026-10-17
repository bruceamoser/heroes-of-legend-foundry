import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseChoices } from "../scripts/content/choices.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/choices.json", import.meta.url),
    "utf8",
  ),
);
const lock = JSON.parse(
  await readFile(
    new URL("../content/source-lock.json", import.meta.url),
    "utf8",
  ),
);
const records = catalog.records;
const get = (id) => records.find((r) => r.id === id);
test("complete learning catalog has stable unique IDs and exact pinned sources", () => {
  assert.equal(catalog.sourceCommit, lock.commit);
  assert.equal(records.length, 452);
  assert.deepEqual(
    Object.fromEntries(
      ["ability", "ancestry", "class", "discipline", "origin", "trait"].map(
        (k) => [k, records.filter((r) => r.kind === k).length],
      ),
    ),
    {
      ability: 350,
      ancestry: 4,
      class: 10,
      discipline: 18,
      origin: 50,
      trait: 20,
    },
  );
  assert.equal(new Set(records.map((r) => r.foundryId)).size, records.length);
  for (const r of records) {
    assert.match(r.foundryId, /^[a-f0-9]{16}$/);
    assert.equal(
      r.source.sha256,
      lock.records.find((s) => s.path === r.source.path)?.sha256,
    );
    assert.equal(r.automation, "pending");
  }
  assert.equal(records.filter((r) => r.universal).length, 18);
  assert(records.filter((r) => r.universal).every((r) => r.cost === null));
});
test("origin pairs and class signatures resolve and grant exactly printed rank/card choices", () => {
  for (const origin of records.filter((r) => r.kind === "origin")) {
    assert.equal(origin.pairs.length, 2);
    for (const p of origin.pairs) {
      assert.equal(get(p.disciplineId)?.kind, "discipline");
      const card = get(p.abilityId);
      assert.equal(card?.minimumLevel, 1);
      assert.equal(p.rank, 1);
      assert(
        card.requirements.every(
          (r) =>
            r.kind === "discipline" && r.id === p.disciplineId && r.rank === 1,
        ),
      );
    }
  }
  for (const cls of records.filter((r) => r.kind === "class"))
    for (const level of [1, 3, 7]) {
      assert.equal(cls.signatures[level].length, 3);
      for (const id of cls.signatures[level]) {
        assert.equal(get(id).classId, cls.id);
        assert.equal(get(id).minimumLevel, level);
      }
    }
  for (const ancestry of records.filter((r) => r.kind === "ancestry")) {
    assert.equal(ancestry.traits.length, 5);
    for (const id of ancestry.traits)
      assert.equal(get(id).ancestryId, ancestry.id);
  }
});
test("class rank prices and prerequisites preserve approved distinctions", () => {
  const blade = get("class-blade");
  assert.deepEqual(blade.minimumAttributes, ["agility", "brawn"]);
  assert.deepEqual(blade.prices["discipline-arms"], [1, 2, 4]);
  assert.deepEqual(blade.prices["discipline-athletics"], [2, 4, 8]);
  assert.deepEqual(blade.prices["discipline-life"], [3, 6, 12]);
  const odd = get("class-odd");
  assert.deepEqual(odd.minimumAttributes, []);
  assert(
    Object.values(odd.prices).every((p) => JSON.stringify(p) === "[2,4,8]"),
  );
  assert.deepEqual(get("class-warden").minimumAttributes, [
    "fortitude",
    "knowledge",
  ]);
});
const sample = (title = "Fixture", requirements = "None") => ({
  path: "design/cards/fixture.md",
  sha256: "a".repeat(64),
  text: `# ${title}\n**ID:** fixture\n**Tier / minimum level:** 1 · **DP:** 2 · **Requirements to learn:** ${requirements}\n**Limits:** Purchase once.`,
});
test("parser fails unknown requirements and keeps IDs stable across display-name edits", () => {
  assert.throws(
    () => parseChoices([sample("Fixture", "Mystery 4")]),
    /rank requirement/,
  );
  assert.throws(
    () => parseChoices([sample("Fixture", "Unknown 1")]),
    /Unknown discipline/,
  );
  const a = parseChoices([sample()])[0],
    b = parseChoices([sample("Renamed")])[0];
  assert.equal(a.foundryId, b.foundryId);
  assert.equal(a.id, b.id);
  assert.throws(
    () => parseChoices([sample(), sample()]),
    /Duplicate choice identity/,
  );
  assert.throws(
    () =>
      parseChoices([
        { ...sample(), text: sample().text.replace("**DP:** 2", "**DP:** 8") },
      ]),
    /tier cost/,
  );
});
