import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const lock = JSON.parse(
  await readFile(
    new URL("../content/source-lock.json", import.meta.url),
    "utf8",
  ),
);
test("completed book lock accounts for every creature, portrait and summon", () => {
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.deepEqual(lock.counts, {
    creatures: 192,
    monsterAbilities: 126,
    summons: 73,
    portraits: 192,
  });
  const creatures = lock.records.filter((r) =>
    r.path.startsWith("design/bestiary/creatures/"),
  );
  assert.equal(creatures.length, 192);
  assert.equal(
    new Set(lock.records.map((r) => r.path)).size,
    lock.records.length,
  );
  assert.equal(new Set(lock.assets.map((r) => r.path)).size, 192);
  assert.deepEqual(
    new Set(creatures.map((r) => r.id)),
    new Set(lock.assets.map((r) => r.id)),
  );
  assert.equal(new Set(lock.summonLinks.map((r) => r.id)).size, 73);
  for (const summon of lock.summonLinks) {
    assert(creatures.some((r) => r.id === summon.creatureId));
    assert.equal(summon.perspective, "attacker");
    assert.match(summon.eligibility, /\S+ [137]/);
  }
  for (const record of [...lock.records, ...lock.assets])
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
});
