import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolvedAttackEffects,
  printedDamageChoices,
} from "../src/rules/attack-outcomes.mjs";
import { DAMAGE_TYPE, DAMAGE_TYPES } from "../src/rules/damage.mjs";
const records = JSON.parse(
  await readFile(new URL("../static/data/choices.json", import.meta.url)),
).records;
test("all 251 damage-first catalog tiers resolve canonical fixed damage without a later prompt", () => {
  let count = 0;
  for (const record of records.filter((r) => r.kind === "ability"))
    for (const outcome of record.reference?.rules?.body?.flatMap(
      (b) => b.outcomes ?? [],
    ) ?? []) {
      if (!/^(?:Deal\s+)?\d+\s+(?:[a-z]+\s+)?damage\b/i.test(outcome.text)) continue;
      if (/\b(?:chosen|that) type\b/i.test(outcome.text)) continue;
      for (const damageType of printedDamageChoices(record).length
        ? printedDamageChoices(record)
        : [undefined]) {
        const effects = resolvedAttackEffects(outcome.text, { damageType });
        assert(
          effects?.components.length,
          `${record.id} ${outcome.label}: ${outcome.text}`,
        );
        assert(
          effects.components.every(
            (c) =>
              DAMAGE_TYPES.includes(c.type) && Number.isSafeInteger(c.amount),
          ),
        );
      }
      count++;
    }
  assert.equal(count, 251);
});
test("every damage enum produces a fixed typed outcome with conditions", () => {
  for (const type of DAMAGE_TYPES)
    assert.deepEqual(resolvedAttackEffects(`3 ${type} damage + Slowed 1`), {
      components: [{ type, amount: 3 }],
      conditions: [{ key: "slowed", rating: 1 }],
    });
});
test("mixed damage, area effects and conditions after movement retain their own typed values", () => {
  assert.deepEqual(
    resolvedAttackEffects("2 physical and 1 fire damage; Burning 1."),
    {
      components: [
        { type: DAMAGE_TYPE.PHYSICAL, amount: 2 },
        { type: DAMAGE_TYPE.FIRE, amount: 1 },
      ],
      conditions: [{ key: "burning", rating: 1 }],
    },
  );
  assert.deepEqual(
    resolvedAttackEffects(
      "6 physical damage, push 2, knock prone and apply Dazed 1.",
    ),
    {
      components: [{ type: "physical", amount: 6 }],
      conditions: [
        { key: "prone", rating: 1 },
        { key: "dazed", rating: 1 },
      ],
      manual: "push 2",
    },
  );
  assert.equal(
    resolvedAttackEffects("4 lightning damage to each; Burning 1.")
      .components[0].amount,
    4,
  );
});
test("printed element choices resolve in the initial roll and ambiguous conditionals never invent damage", () => {
  assert.deepEqual(
    printedDamageChoices(
      records.find((r) => r.id === "ability-let-the-spark-decide"),
    ),
    ["fire", "cold"],
  );
  assert.deepEqual(
    printedDamageChoices(
      records.find((r) => r.id === "ability-a-splendid-mistake"),
    ),
    ["fire", "lightning"],
  );
  assert.deepEqual(
    resolvedAttackEffects("Deal 4 damage to each, then push each 1 square.", {
      damageType: "lightning",
    }),
    {
      components: [{ type: "lightning", amount: 4 }],
      conditions: [],
      manual: "push each 1 square",
    },
  );
  for (const text of [
    "If adjacent, 5 fire damage; Slowed 1.",
    "5 fire damage or Prone",
    "Deal double damage.",
    "Add 1 progress and learn whether the lock shows damage or tampering.",
  ])
    assert.equal(resolvedAttackEffects(text), null);
});

test("conditional and optional suffixes never apply their later effects unconditionally",()=>{
 for(const text of ['3 fire damage; if the target is wet, Freezing 1.','3 fire damage; if the target is wet, then 5 cold damage.','3 fire damage; you may choose an additional effect, Prone.']){
  const result=resolvedAttackEffects(text);
  assert.deepEqual(result.components,[{type:'fire',amount:3}]);
  assert.deepEqual(result.conditions,[]);
  assert(result.manual);
 }
});
