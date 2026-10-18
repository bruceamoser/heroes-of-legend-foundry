import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const baseline = await read("./fixtures/creature-action-baseline.json");
const lock = await read("../content/source-lock.json");
const creatures = await read("../static/data/creatures.json");
const summons = await read("../static/data/summons.json");
const choices = await read("../static/data/choices.json");
const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const core = (record) =>
  Object.fromEntries(
    [
      "attributes",
      "hp",
      "speed",
      "size",
      "armor",
      "defenses",
      "weaknesses",
      "resistances",
      "immunities",
    ].map((key) => [key, record[key]]),
  );

test("approved creature action delta keeps stable stats, Main Actions and source counts", () => {
  assert.equal(lock.previousCommit, baseline.sourceCommit);
  assert.equal(lock.records.length, 1022);
  assert.equal(creatures.creatures.length, 192);
  assert.equal(summons.records.length, 73);
  assert.deepEqual(lock.counts, {
    creatures: 192,
    monsterAbilities: 126,
    summons: 73,
    portraits: 192,
  });
  let changedCreatures = 0;
  for (const record of creatures.creatures) {
    const previous = baseline.creatures[record.id];
    assert(previous, record.id);
    changedCreatures += Number(record.source.sha256 !== previous.sourceSha256);
    assert.equal(
      sha(core(record)),
      previous.coreSha256,
      `${record.id} base stats changed`,
    );
    assert.equal(
      sha(record.actions.main),
      previous.mainSha256,
      `${record.id} Main Actions changed`,
    );
  }
  assert.equal(changedCreatures, 161);
  assert.equal(
    summons.records.filter(
      (record) => record.source.sha256 !== baseline.summons[record.id],
    ).length,
    55,
  );
});

test("33 reusable monster templates remain separate from character abilities", () => {
  const oldIds = new Set(baseline.monsterAbilityIds);
  const added = creatures.monsterAbilities.filter(
    (template) => !oldIds.has(template.id),
  );
  assert.equal(added.length, 33);
  assert.equal(
    added.filter((template) => template.action === "Maneuver").length,
    6,
  );
  assert.equal(
    added.filter((template) => template.action === "Reaction").length,
    27,
  );
  const characterIds = new Set(choices.records.map((record) => record.id));
  assert.equal(
    choices.records.filter((record) => record.kind === "ability").length,
    419,
  );
  for (const template of added) {
    assert.equal(template.source.commit, lock.commit);
    assert(
      template.flavorMarkdown &&
        template.rulesMarkdown &&
        template.referenceMarkdown,
    );
    assert(!characterIds.has(template.id), template.id);
    const users = creatures.creatures.filter((record) =>
      record.abilitySources.some((source) => source.id === template.id),
    );
    assert(users.length >= 2, `${template.id} lacks shared users`);
    for (const record of users) {
      const section =
        template.action === "Reaction" ? "reactions" : "maneuvers";
      assert(
        record.actions[section].actions.some(
          (action) => action.name.toLowerCase() === template.name.toLowerCase(),
        ),
        `${record.id} omits ${template.id} from its action table`,
      );
    }
  }
});

test("summon commands retain controller timing and exclude Reactions", () => {
  for (const record of summons.records) {
    assert.equal(
      record.command.limits.maxCommandsPerSummonPerControllerTurn,
      1,
    );
    assert.equal(record.command.limits.immediateSummoningCommandCounts, true);
    assert.equal(record.command.limits.activityWithoutCommand, false);
    assert.equal(record.command.limits.reactions, false);
    assert.equal(record.command.limits.opportunityAttacks, false);
    assert.equal(record.command.limits.turnTickAnchor, "controller");
    assert(!/\b## Reactions\b/.test(record.reference.sourceMarkdown));
  }
});
