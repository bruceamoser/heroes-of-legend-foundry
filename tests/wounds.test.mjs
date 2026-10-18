import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WOUND_KEYS, woundRoll, woundResult } from "../src/rules/wounds.mjs";
import { parseWoundEffects, parseWounds } from "../scripts/content/wounds.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/wounds.json", import.meta.url),
    "utf8",
  ),
);
test("all 280 keyed wound records match all sorted outcomes and pinned source", async () => {
  assert.equal(WOUND_KEYS.length, 56);
  assert.equal(catalog.records.length, 280);
  assert.equal(new Set(catalog.records.map((r) => r.id)).size, 280);
  const lock = JSON.parse(
    await readFile(
      new URL("../content/source-lock.json", import.meta.url),
      "utf8",
    ),
  );
  for (const record of catalog.records)
    assert.deepEqual(
      record.source,
      lock.records.find((r) => r.path === "design/rules/wounds.md"),
    );
  for (const effect of catalog.records.flatMap((record) => record.effects))
    if (effect.kind === "rollModifier")
      assert.equal(typeof effect.printedContext, "string");
  const seen = new Set();
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) {
        const roll = woundRoll(0, [a, b, c]);
        seen.add(roll.key);
        for (const type of [
          "physical",
          "fire",
          "cold",
          "lightning",
          "mental",
          "radiant",
          "life",
        ])
          assert.equal(
            woundResult(catalog, type, roll.key).record.key,
            roll.key,
          );
      }
  assert.deepEqual([...seen].sort(), WOUND_KEYS);
});
test("prior wounds add capped dice, keep highest three and never change the input", () => {
  const faces = [6, 1, 2, 6, 5];
  assert.deepEqual(woundRoll(20, faces), {
    count: 5,
    retained: [5, 6, 6],
    key: "566",
  });
  assert.deepEqual(faces, [6, 1, 2, 6, 5]);
  assert.equal(woundRoll(1, [1, 2, 3, 4]).key, "234");
  assert.throws(() => woundRoll(1, [1, 2, 3]), /4 d6/);
  assert.throws(() => woundRoll(-1, [1, 1, 1]));
});
test("anatomy rulings advance consecutive results, never skip Last Words", () => {
  const result = woundResult(catalog, "physical", "116", [
    { key: "116" },
  ]);
  assert.equal(result.record.key, "122");
  assert.equal(result.originalKey, "116");
  assert.throws(() =>
    woundResult(catalog, "physical", "116", [
      { key: "122", reason: "Wrong entry" },
    ]),
  );
  assert.throws(() =>
    woundResult(catalog, "physical", "666", [
      { key: "666", reason: "Not applicable" },
    ]),
  );
  for (const type of ["physical", "fire", "mental", "radiant", "life"])
    assert.deepEqual(woundResult(catalog, type, "666").effects, [
      { kind: "lastWords" },
    ]);
});
test("elemental and immediate effects preserve conditions, duration and DA choices", () => {
  for (const [type, key] of [
    ["cold", "freezing"],
    ["fire", "burning"],
    ["lightning", "burning"],
  ])
    assert.equal(woundResult(catalog, type, "156").effects[0].key, key);
  const physical = woundResult(catalog, "physical", "335");
  assert.deepEqual(
    physical.effects.map((e) => e.kind),
    ["forcedMovement", "condition", "rollModifier"],
  );
  assert.equal(physical.effects[0].requiresDirection, true);
  assert.equal(
    woundResult(catalog, "physical", "366").effects[0].persistence,
    "starred",
  );
  assert.deepEqual(parseWoundEffects("Frightened 2"), [
    {
      kind: "condition",
      key: "frightened",
      rating: 2,
      persistence: "temporary",
      requiresSource: true,
    },
  ]);
  assert.equal(physical.effects[2].printedContext, "physical activities");
  assert.deepEqual(
    parseWoundEffects(
      "1 Bane to persuade when visible scar influences interaction",
    ),
    [
      {
        kind: "rollModifier",
        polarity: "bane",
        amount: 1,
        context: "persuade",
        printedContext: "persuade when visible scar influences interaction",
        requiresContext: true,
      },
    ],
  );
  assert.throws(() => parseWoundEffects("Bleeding 9"), /Unreviewed/);
  assert.throws(() => parseWoundEffects("Gain a free attack"), /Unreviewed/);
});

test("table importer rejects missing results and unreviewed effect syntax", () => {
  const source = { path: "fixture", sha256: "fixture" };
  const headings = [
    "Physical",
    "Elemental",
    "Mental",
    "Radiant",
    "Life/Necrotic",
  ];
  const text = headings
    .map(
      (table) =>
        `## ${table}\n` +
        WOUND_KEYS.map(
          (key) =>
            `### ${table}: ${key[0]}00 band\n| ${key} | Mark | None | — | — |`,
        ).join("\n"),
    )
    .join("\n");
  assert.equal(parseWounds(text, source).length, 280);
  assert.throws(
    () =>
      parseWounds(text.replace("| 111 | Mark | None | — | — |", ""), source),
    /Incomplete/,
  );
  assert.throws(
    () =>
      parseWounds(
        text.replace("Mark | None", "Mark | Unknown mechanic"),
        source,
      ),
    /Unreviewed/,
  );
});
