import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseAbilityReference,
  parseChoices,
  verifySourceHash,
} from "../scripts/content/choices.mjs";
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
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.sourceCommit, lock.commit);
  assert.equal(records.length, 521);
  assert.deepEqual(
    Object.fromEntries(
      ["ability", "ancestry", "class", "discipline", "origin", "trait"].map(
        (k) => [k, records.filter((r) => r.kind === k).length],
      ),
    ),
    {
      ability: 419,
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
    if (r.kind === "ability") {
      assert(r.reference.flavor.length > 0);
      assert(
        r.reference.rules.details.every(
          ({ label, value }) =>
            typeof label === "string" &&
            label &&
            typeof value === "string" &&
            value,
        ),
      );
      assert.deepEqual(
        r.reference.rules.details
          .filter(({ label }) =>
            [
              "Action",
              "Attribute",
              "Target / range / shape",
              "Duration",
              "Equipment / acquisition",
              "Limits",
            ].includes(label),
          )
          .map(({ label }) => label),
        [
          "Action",
          "Attribute",
          "Target / range / shape",
          "Duration",
          "Equipment / acquisition",
          "Limits",
        ],
      );
    }
  }
  assert.equal(records.filter((r) => r.universal).length, 18);
  assert(records.filter((r) => r.universal).every((r) => r.cost === null));
  assert.equal(records.filter((r) => r.reference).length, 419);
  assert.equal(
    records.filter((r) =>
      r.reference?.rules.body.some((block) => block.outcomes),
    ).length,
    166,
  );
});
test("catalog references preserve exact acquisition details and outcomes", () => {
  const clever = get("ability-the-cleverest-mixture"),
    detail = (label) =>
      clever.reference.rules.details.find((entry) => entry.label === label)
        ?.value,
    outcomes = clever.reference.rules.body.find(
      (block) => block.outcomes,
    ).outcomes;
  assert.equal(detail("Action"), "Maneuver");
  assert.equal(detail("Attribute"), "Knowledge");
  assert.equal(
    detail("Target / range / shape"),
    "Self or one adjacent willing creature.",
  );
  assert.equal(
    detail("Duration"),
    "Condition reduction is immediate; crafted supplies persist until used.",
  );
  assert.equal(
    detail("Equipment / acquisition"),
    "One mixing kit, Bulk 1, if absent; both named recipes. No ingredients or finished tonic.",
  );
  assert.equal(
    detail("Limits"),
    "Repeatable; pay the action and any stated costs each use.",
  );
  assert.deepEqual(outcomes, [
    { label: "Weak", text: "Reduce temporary Poisoned by 1." },
    {
      label: "Standard",
      text: "Reduce temporary Poisoned by 2 or Dazed by 1.",
    },
    {
      label: "Strong",
      text: "Reduce temporary Poisoned by 3 or Dazed by 2.",
    },
  ]);
  assert(
    get("ability-a-bough-for-the-fallen").reference.rules.notes.some(
      ({ label }) => label === "Offensive healing — latest agreement",
    ),
  );
  const potion = get("ability-use-a-healing-potion").reference;
  assert(!/offensive healing|this spell/i.test(JSON.stringify(potion)));
});
test("reference templates use escaping Handlebars expressions", async () => {
  for (const template of ["creation", "advancement"]) {
    const text = await readFile(
      new URL(`../static/templates/${template}.hbs`, import.meta.url),
      "utf8",
    );
    assert(!/{{{[^}]*reference/.test(text));
    assert(!/{{{[^}]*text}}/.test(text));
  }
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
  text: `# ${title}

*A readable fixture.*

## Rules

**Action:** Main Action · **Attribute:** Reason

**Target / range / shape:** One adjacent creature.

Resolve the authored reference text.

- **Weak:** 1 damage.
- **Standard:** 2 damage.
- **Strong:** 3 damage.

**Duration:** Instant.

**Equipment / acquisition:** None.

---

**Tier / minimum level:** 1 · **DP:** 2 · **Requirements to learn:** ${requirements}

**Type:** Test

**Limits:** Purchase once.

**ID:** fixture`,
});
test("ability references preserve sections and authored outcomes separately from learning metadata", () => {
  const record = parseChoices([sample()])[0],
    reference = record.reference;
  assert.equal(record.minimumLevel, 1);
  assert.equal(record.cost, 2);
  assert.deepEqual(reference.flavor, ["A readable fixture."]);
  assert.deepEqual(
    reference.rules.details.map(({ label, value }) => [label, value]),
    [
      ["Action", "Main Action"],
      ["Attribute", "Reason"],
      ["Target / range / shape", "One adjacent creature."],
      ["Duration", "Instant."],
      ["Equipment / acquisition", "None."],
      ["Limits", "Purchase once."],
      ["Type", "Test"],
    ],
  );
  assert.deepEqual(reference.rules.body, [
    { text: "Resolve the authored reference text." },
    {
      outcomes: [
        { label: "Weak", text: "1 damage." },
        { label: "Standard", text: "2 damage." },
        { label: "Strong", text: "3 damage." },
      ],
    },
  ]);
  assert.equal(record.automation, "pending");
});
test("reference extraction keeps imported HTML as escaped text data", () => {
  const payload = '<script data-payload="1">alert("rules")</script>',
    fixture = sample();
  fixture.text = fixture.text.replace(
    "Resolve the authored reference text.",
    `Resolve ${payload}.`,
  );
  const reference = parseAbilityReference(fixture.text);
  assert.equal(reference.rules.body[0].text, `Resolve ${payload}.`);
  assert.equal(reference.rules.body[0].html, undefined);
});
test("pinned source bytes fail closed on a hash mismatch", () => {
  const source = {
    path: "design/cards/fixture.md",
    sha256: "a".repeat(64),
  };
  assert.throws(
    () => verifySourceHash(source, Buffer.from("changed source")),
    /Source hash mismatch design\/cards\/fixture\.md/,
  );
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

test("only the six approved shared cards use the one-DP exception", () => {
  const ids = [
    "a-party-piece",
    "another-tongue",
    "catch-that",
    "look-over-here",
    "message-by-heart",
    "quick-exit",
  ];
  assert.deepEqual(
    records
      .filter((r) => r.cost === 1)
      .map((r) => r.id)
      .sort(),
    ids.map((id) => `ability-${id}`),
  );
  for (const id of ids) {
    const record = get(`ability-${id}`);
    assert.equal(record.minimumLevel, 1);
    assert.equal(record.purchasePolicy, "once");
    assert.equal(record.universal, false);
    assert.deepEqual(record.requirements, []);
    const fixture = sample(record.name);
    fixture.path = record.source.path;
    fixture.text = fixture.text
      .replace("**DP:** 2", "**DP:** 1")
      .replace("**ID:** fixture", `**ID:** ${id}`)
      .replace(
        "**Limits:** Purchase once.",
        `**Limits:** ${record.reference.rules.details.find((d) => d.label === "Limits").value}`,
      );
    assert.equal(parseChoices([fixture])[0].cost, 1);
    const invalid = {
      ...fixture,
      text: fixture.text.replace("**DP:** 1", "**DP:** 2"),
    };
    assert.throws(() => parseChoices([invalid]), /tier cost/);
  }
  assert.throws(
    () =>
      parseChoices([
        { ...sample(), text: sample().text.replace("**DP:** 2", "**DP:** 1") },
      ]),
    /tier cost/,
  );
});

test("armor tiers require independent Armor ranks and Walled Communities grants light", () => {
  for (const [tier, rank, level, cost] of [
    ["light", 1, 1, 2],
    ["medium", 2, 3, 4],
    ["heavy", 3, 7, 8],
  ]) {
    const r = get(`ability-wear-${tier}-armor`);
    assert.equal(r.cost, cost);
    assert.equal(r.minimumLevel, level);
    assert.deepEqual(r.requirements, [
      { kind: "discipline", id: "discipline-armor", rank },
    ]);
  }
  assert.equal(
    get("origin-culture-walled-communities").pairs[0].abilityId,
    "ability-wear-light-armor",
  );
});
