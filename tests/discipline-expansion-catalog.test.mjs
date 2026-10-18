import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { acquireAbility } from "../src/rules/acquisition.mjs";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const [choices, inventory, lock, references] = await Promise.all([
  read("../static/data/choices.json"),
  read("../static/data/inventory.json"),
  read("../content/source-lock.json"),
  read("../web/data/references.json"),
]);
const abilities = choices.records.filter((record) => record.kind === "ability");
const byId = new Map(choices.records.map((record) => [record.id, record]));
const added =
  `bank-the-embers beacon-through-terror breakaway-rig breath-of-white call-their-name cast-off-the-venom catch-the-ledge catch-the-mechanism catch-the-root catch-them-falling clear-the-airway clear-the-smoke close-shot cold-cuirass crosswind cup-the-flame doors-for-the-host draw-the-tether duck-into-the-brush ease-the-spasm field-triage find-the-seam find-your-footing follow-my-leap high-guard hold-the-pulse hook-with-the-shield ironbound-advance keep-pressure last-light-of-the-watch lend-your-eyes name-what-is-real play-it-off press-and-bind quiet-conference read-the-ward recall-the-shape recast-the-footprint ride-the-furnace-breath rim-strike rime-footholds road-of-dawn road-of-rime set-the-wedge shade-the-eyes shatterguard shield-roof shielded-advance silent-cue slip-the-closing-door snare-the-missile spot-the-tell stay-with-my-voice steel-at-the-wrist still-the-avalanche the-forest-takes-the-blow thought-before-the-blow turn-the-fall wake-the-nerves whiteout wind-the-sight winter-store`
    .split(" ")
    .map((id) => `ability-${id}`);
const detail = (record, label) =>
  record.reference.rules.details.find((entry) => entry.label === label)?.value;

// Explicit IDs make a missing or substituted approved card fail even if totals still match.
test("all 62 approved cards occur once with exact tiers, actions, source and narrative", () => {
  assert.equal(lock.commit, "bdfd18ed535fbd0e1892b9344444abf6da644809");
  assert.equal(abilities.length, 419);
  assert.equal(inventory.equipment.length, 44);
  assert.equal(new Set(added).size, 62);
  assert.deepEqual(
    abilities
      .filter((record) => added.includes(record.id))
      .map((record) => record.id)
      .sort(),
    added.slice().sort(),
  );
  const tiers = { 1: 0, 3: 0, 7: 0 };
  const actions = { Maneuver: 0, Reaction: 0, "Main Action": 0 };
  for (const id of added) {
    const record = byId.get(id);
    tiers[record.minimumLevel]++;
    actions[detail(record, "Action")]++;
    assert.equal(record.cost, { 1: 2, 3: 4, 7: 8 }[record.minimumLevel], id);
    assert(record.reference.flavor.length > 0, id);
    assert(record.reference.rules.body.length > 0, id);
    for (const label of [
      "Attribute",
      "Target / range / shape",
      "Duration",
      "Equipment / acquisition",
      "Limits",
    ])
      assert(detail(record, label), `${id}: ${label}`);
    assert.equal(
      record.source.sha256,
      lock.records.find((source) => source.path === record.source.path)?.sha256,
    );
  }
  assert.deepEqual(tiers, { 1: 27, 3: 14, 7: 21 });
  assert.deepEqual(actions, { Maneuver: 27, Reaction: 31, "Main Action": 4 });
});

test("mixed requirements retain every rank and every discipline has meaningful maneuver and reaction access", () => {
  assert.deepEqual(byId.get("ability-shatterguard").requirements, [
    { kind: "discipline", id: "discipline-frost", rank: 2 },
    { kind: "discipline", id: "discipline-guard", rank: 1 },
  ]);
  assert.deepEqual(byId.get("ability-wind-the-sight").requirements, [
    { kind: "discipline", id: "discipline-craft", rank: 2 },
    { kind: "discipline", id: "discipline-marksmanship", rank: 2 },
  ]);
  const shared = abilities.filter(
    (record) => !record.classId && !record.universal,
  );
  for (const discipline of choices.records.filter(
    (record) => record.kind === "discipline",
  ))
    for (const [level, minimumRank] of [
      [1, 1],
      [3, 2],
      [7, 2],
    ])
      for (const action of ["Maneuver", "Reaction"])
        assert(
          shared.some(
            (record) =>
              record.minimumLevel === level &&
              detail(record, "Action") === action &&
              record.requirements.some(
                (requirement) =>
                  requirement.kind === "discipline" &&
                  requirement.id === discipline.id &&
                  requirement.rank >= minimumRank,
              ),
          ),
          `${discipline.name} level ${level} ${action}`,
        );
});

const grants = {
  "catch-the-mechanism": ["item-craft-tools"],
  "close-shot": ["item-ordinary-ranged-weapon", "item-ammunition-bundle"],
  "high-guard": ["item-ordinary-shield"],
  "hook-with-the-shield": ["item-ordinary-shield"],
  "rim-strike": ["item-ordinary-shield"],
  "set-the-wedge": ["item-lever-and-wedges"],
  shatterguard: ["item-ordinary-shield"],
  "shield-roof": ["item-ordinary-shield"],
  "shielded-advance": ["item-ordinary-shield"],
  "snare-the-missile": ["item-craft-tools"],
  "steel-at-the-wrist": ["item-ordinary-melee-weapon"],
};
test("printed equipment grants are reviewed and acquisition reuses an owned copy", () => {
  for (const id of added) {
    const adapter = inventory.acquisitions.find((record) => record.id === id);
    assert(adapter, id);
    assert.deepEqual(adapter.items, grants[id.slice(8)] ?? [], id);
    assert.deepEqual(adapter.recipes, [], id);
    assert.deepEqual(adapter.source, byId.get(id).source, id);
  }
  const first = acquireAbility({}, "ability-high-guard", {}, inventory);
  assert(first.valid);
  assert.deepEqual(
    first.state.items.map((item) => item.catalogId),
    ["item-ordinary-shield"],
  );
  const second = acquireAbility(
    first.state,
    "ability-shield-roof",
    {},
    inventory,
  );
  assert(second.valid);
  assert.equal(second.state.items.length, 1);
  assert.equal(
    second.state.acquisitionReceipts.at(-1).grants[0].disposition,
    "already-owned",
  );
  const shot = acquireAbility({}, "ability-close-shot", {}, inventory);
  assert(shot.valid);
  assert.deepEqual(
    shot.state.items.map((item) => item.catalogId),
    grants["close-shot"],
  );
  assert.equal(shot.state.items[1].inventoryDie, 8);
});

const changedOrigins =
  `background-duelist-s-second background-oath-witness background-poacher culture-cloister-valleys culture-forest-communities culture-gathered-peoples culture-grass-sea-clans culture-highland-holds culture-reed-villages culture-river-settlements culture-terrace-towns culture-traveling-companies`.split(
    " ",
  );
test("twelve revised origins retain narrative and two valid paired grants", () => {
  assert.equal(references.sourceCommit, lock.commit);
  for (const slug of changedOrigins) {
    const record = byId.get(`origin-${slug}`);
    const reference = references.records[record.id];
    assert(reference.markdown.startsWith(`# ${record.name}\n\n*`), slug);
    assert.deepEqual(reference.source, record.source, slug);
    assert.equal(record.pairs.length, 2, slug);
    for (const pair of record.pairs) {
      assert.equal(pair.rank, 1, slug);
      assert.equal(byId.get(pair.abilityId)?.minimumLevel, 1, slug);
      assert(
        byId
          .get(pair.abilityId)
          .requirements.some(
            (requirement) =>
              requirement.id === pair.disciplineId && requirement.rank === 1,
          ),
        slug,
      );
    }
  }
  assert.deepEqual(
    byId.get("origin-background-poacher").pairs.map((pair) => pair.abilityId),
    ["ability-read-the-quarry", "ability-winter-store"],
  );
  assert.deepEqual(
    byId
      .get("origin-culture-highland-holds")
      .pairs.map((pair) => pair.abilityId),
    ["ability-winter-store", "ability-thunder-at-the-door"],
  );
});

test("universal actions, signatures, rank prices and six one-DP exceptions keep their catalog contracts", () => {
  assert.equal(abilities.filter((record) => record.universal).length, 18);
  assert(
    abilities
      .filter((record) => record.universal)
      .every((record) => record.cost === null),
  );
  assert.equal(abilities.filter((record) => record.classId).length, 90);
  for (const name of [
    "another-tongue",
    "a-party-piece",
    "catch-that",
    "look-over-here",
    "message-by-heart",
    "quick-exit",
  ])
    assert.equal(byId.get(`ability-${name}`).cost, 1);
  for (const cls of choices.records.filter(
    (record) => record.kind === "class",
  )) {
    assert.equal(Object.keys(cls.prices).length, 18);
    assert.deepEqual(
      Object.values(cls.signatures).map((ids) => ids.length),
      [3, 3, 3],
    );
  }
});
