import test from "node:test";
import assert from "node:assert/strict";
import { creatureActionEntries, rewriteSourceLinks } from "../scripts/content/creature-packs.mjs";
import { incomingOutcome, validReferenceAttack } from "../src/rules/creature-actions.mjs";
import { readContentPackCatalogs, buildContentPackArtifacts } from "../scripts/content/content-packs.mjs";

import { verifiedIncomingAttackContext } from "../src/services/roll-preparation.mjs";

const catalogs = await readContentPackCatalogs(new URL("../", import.meta.url));
const artifacts = buildContentPackArtifacts(catalogs);
test("all 192 native profiles retain every typed source action and exact outcomes", () => {
  for (const record of catalogs.creatures.creatures) {
    const document = artifacts.documents.creatures.find(d => d.flags["heroes-of-legend"].catalogId === record.id);
    const entries = document.system.actions.entries;
    assert.deepEqual(entries, creatureActionEntries(record, catalogs.lock.commit));
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    for (const [category, section] of [["main", "main"], ["maneuver", "maneuvers"], ["reaction", "reactions"]]) {
      record.actions[section].actions.forEach((source, index) => {
        const entry = entries.find(entry => entry.id === `${category}-${index}`);
        assert.equal(entry.name, source.name);
        assert.equal(entry.attributeKey, source.defense?.attribute ?? "");
        assert.equal(entry.defenseSource, source.defense?.sourceText ?? "");
        assert.equal(entry.harmfulOnly, source.defense?.harmfulOnly ?? false);
        assert.equal(entry.hasOutcomes, Boolean(source.outcomes));
        assert.deepEqual(entry.outcomes, source.outcomes ?? { weak: "", standard: "", strong: "" });
        assert.equal(entry.effect, source.effect ?? source.damageSource);
        const detail = record.reference.specialtyDetails.find(d => d.title.toLowerCase() === source.name.toLowerCase());
        assert.equal(entry.referenceMarkdown, detail ? rewriteSourceLinks(detail.markdown, record, catalogs.lock.commit) : "");
      });
    }
  }
});
test("Red Dragon specialties keep defense orientation and never fabricate damage", () => {
  const dragon = artifacts.documents.creatures.find(d => d.flags["heroes-of-legend"].catalogId === "creature-red-dragon");
  const breath = dragon.system.actions.entries.find(a => a.name === "Furnace breath");
  const bite = dragon.system.actions.entries.find(a => a.name === "Crushing bite");
  assert.equal(breath.attributeKey, "agility");
  assert.equal(bite.attributeKey, "fortitude");
  for (const entry of [breath, bite]) {
    const reference = { ...entry, resolution: "reference" };
    assert(validReferenceAttack(reference));
    for (const tier of ["weak", "standard", "strong"]) {
      const result = incomingOutcome(reference, tier);
      assert.deepEqual(result, { resolution: "reference", text: entry.outcomes[tier], applied: false });
      assert.equal(Object.hasOwn(result, "damage"), false);
      assert.equal(Object.hasOwn(result, "type"), false);
    }
  }
  assert.match(breath.referenceMarkdown, /Cannot use this attack on consecutive turns/);
  const maneuver = dragon.system.actions.entries.find(a => a.name === "Wing Beat");
  assert.equal(maneuver.attributeKey, "");
  assert.equal(maneuver.hasOutcomes, false);
  assert.match(maneuver.effect, /no roll or damage/);
});
test("reference-only details and numeric Basic Melee remain distinct", () => {
  assert.deepEqual(incomingOutcome({ damage: { weak: 5, standard: 3, strong: 2 } }, "standard"),
    { damage: 3, type: "physical", applied: false });
  const reference = { resolution: "reference", attributeKey: "fortitude", outcomes: null,
    effect: "See details", referenceMarkdown: "Source rules" };
  assert.deepEqual(incomingOutcome(reference, "strong"), { resolution: "reference", text: "See details", applied: false });
  assert.equal(validReferenceAttack({ ...reference, outcomes: { weak: "12", strong: "6" } }), false);
  assert.equal(validReferenceAttack({ ...reference, attributeKey: "flavor" }), false);
  assert.throws(() => incomingOutcome(reference, "unknown"), /Unknown/);
  assert.equal(incomingOutcome(null, "weak"), null);
});

test("reference verification uses live GM source identity, not numeric Combat receipts", () => {
  const attack = { resolution: "reference", actorUuid: "Actor.dragon", attributeKey: "fortitude",
    effect: "12 + Bleeding 2 / 8 + Bleeding 1 / 6", referenceMarkdown: "Exact source",
    outcomes: { weak: "12 + Bleeding 2", standard: "8 + Bleeding 1", strong: "6" },
    combatId: "real-encounter", blockable: null, perspective: "defender" };
  let source = structuredClone(attack);
  const message = { author: { isGM: true }, isContentVisible: true,
    getFlag: (_, key) => key === "attackCard" ? attack : source };
  globalThis.game = { messages: new Map([["attack", message]]) };
  globalThis.fromUuidSync = uuid => uuid === "Actor.dragon" ? { uuid, type: "creature" } : null;
  try {
    assert.deepEqual(verifiedIncomingAttackContext("attack"), attack);
    source.title = "Changed source";
    assert.throws(() => verifiedIncomingAttackContext("attack"), /reference action could not be verified/);
    source = structuredClone(attack);
    message.author.isGM = false;
    assert.throws(() => verifiedIncomingAttackContext("attack"), /unavailable/);
  } finally { delete globalThis.game; delete globalThis.fromUuidSync; }
});
