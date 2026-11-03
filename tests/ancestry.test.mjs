import { test } from "node:test";
import assert from "node:assert/strict";
import { ancestryBenefits, currentAncestryId, ANCESTRY_SOURCE_COMMIT } from "../src/rules/ancestry.mjs";
import { passiveAncestryDefenseSources } from "../src/rules/passive-defenses.mjs";
import { sourceRollPlan } from "../src/rules/roll-sources.mjs";

test("descriptive ancestry aliases preserve published identities and unknown IDs", () => {
  assert.equal(currentAncestryId("ancestry-wood-elf"), "ancestry-elf");
  assert.equal(currentAncestryId("ancestry-hill-dwarf"), "ancestry-dwarf");
  for (const id of ["ancestry-elf", "ancestry-dwarf", "ancestry-high-elf", "ancestry-deep-dwarf", "__proto__", "", undefined])
    assert.equal(currentAncestryId(id), id);
});

test("permanent ancestry grants use stable IDs without repeating benefits", () => {
  const tallfolk = ancestryBenefits(["trait-tallfolk-broad-back", "trait-tallfolk-you-take-the-blow", "trait-tallfolk-broad-back"]);
  assert.equal(tallfolk.capacityBonus, 3);
  assert.equal(tallfolk.speedBaseBonus, 1);
  assert.equal(ancestryBenefits(["trait-goblin-run-away-better"]).speedBaseBonus, 1);
  assert.equal(ancestryBenefits(["trait-elf-unhurried-grace"]).speedBaseBonus, 1);
  assert.equal(ancestryBenefits(["trait-human-far-walker"]).speedBaseBonus, 0);
  const halfling = ancestryBenefits(["trait-halfling-resilient", "trait-halfling-stout-heart"]);
  assert.equal(halfling.maximumHpBonus, 1);
  assert.equal(halfling.capacityBonus, 1);
  assert.equal(ancestryBenefits(["trait-dwarf-low-center"]).stability, 1);
  assert.equal(ancestryBenefits(["trait-dwarf-deep-constitution"]).maximumHpBonus, 1);
  assert.equal(ancestryBenefits(["trait-human-weathered"]).maximumHpBonus, 1);
});

test("vision and reach are explicit facts with shared references, without darkness sight", () => {
  const starlight = ancestryBenefits(["trait-high-elf-starlight-eyes"]);
  assert.equal(starlight.lowLightVision, 1);
  assert.equal(starlight.seismicVisionRange, 0);
  const deep = ancestryBenefits(["trait-deep-dwarf-eyes-for-the-dark", "trait-deep-dwarf-stone-tells-you"]);
  assert.equal(deep.lowLightVision, 2);
  assert.equal(deep.seismicVisionRange, 6);
  assert.equal(deep.ruleReferences[0].commit, ANCESTRY_SOURCE_COMMIT);
  assert.equal(deep.ruleReferences[0].path, "design/rules/vision.md");
  assert.equal("darkvision" in deep, false);
  const reach = ancestryBenefits(["trait-tallfolk-long-reach"]);
  assert.equal(reach.interactionRange, 2);
  assert.equal(reach.nonAttackTouchRange, 2);
  assert.equal(reach.ruleReferences[0].path, "design/rules/ancestry-procedures.md");
  assert.equal("attackRange" in reach, false);
  deep.ruleReferences[0].path = "snapshot-only";
  assert.equal(ancestryBenefits(["trait-deep-dwarf-stone-tells-you"]).ruleReferences[0].path, "design/rules/vision.md");
});

test("Small Target is one unconditional defense Boon and one Bane when the attacker rolls", () => {
  const traits = ["trait-gnome-small-target", "trait-gnome-small-target"];
  const sources = passiveAncestryDefenseSources(traits);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].provenance.length, 2);
  assert.equal(sources[0].provenance[0].commit, ANCESTRY_SOURCE_COMMIT);
  assert.equal(sourceRollPlan(0, sources).boons, 1);
  const attack = sourceRollPlan(0, passiveAncestryDefenseSources(traits, { attackerRolls: true }));
  assert.equal(attack.banes, 1);
  assert.equal(attack.boons, 0);
  assert.deepEqual(passiveAncestryDefenseSources([]), []);
});

test("contextual ancestry traits and narrative lookalikes do not grant permanent statistics", () => {
  assert.deepEqual(ancestryBenefits([
    "trait-elf-light-tread", "trait-goblin-more-of-us-than-you",
    "trait-high-elf-name-that-opens-doors", "trait-gnome-bright-idea",
    "narrative-Small Target", "trait-tallfolk-long-stride",
  ]), ancestryBenefits([]));
  assert.throws(() => ancestryBenefits("trait-gnome-small-target"), /stable IDs/);
});

test("native roll preparation applies Small Target once and reverses it for player attacks", async () => {
  const { prepareRoll } = await import("../src/services/roll-preparation.mjs");
  const basis = {attribute: 2, contributions: [], woundModifiers: [], incoming: null};
  const defense = prepareRoll({...basis, mode: "defense", benefits: passiveAncestryDefenseSources(["trait-gnome-small-target"])});
  assert.equal(defense.net, 1);
  const attack = prepareRoll({...basis, mode: "attack", benefits: [], targetAncestryDefenseSources: passiveAncestryDefenseSources(["trait-gnome-small-target"], {attackerRolls: true})});
  assert.equal(attack.net, -1);
  assert.equal(prepareRoll({...basis, mode: "attack", benefits: [], targetAncestryDefenseSources: attack.sources}, {boons:1}).net, 0);
});
test("native movement reads borrowed Broad Back while preserving committed Speed and resource history", async()=>{
  const {actorMovement}=await import("../src/services/turn-budget.mjs");
  const development={creationSummary:{speedBase:6},creation:{ancestryId:"ancestry-human",traitIds:["trait-human-many-homes","trait-human-weathered"],borrowedAncestryId:"ancestry-tallfolk",borrowedTraitId:"trait-tallfolk-broad-back"},ledger:[{kind:"purchase",delta:-2}]};
  const actor={type:"character",effects:[],items:[{type:"equipment",system:{bulk:16,quantity:1}}],system:{attributes:{agility:{effective:0},brawn:{effective:1}},health:{value:3},grit:{spent:1}},getFlag:(_id,key)=>key==="development"?development:undefined};
  const before=JSON.stringify({development,system:actor.system});
  const movement=actorMovement(actor);
  assert.equal(movement.capacity,16);
  assert.equal(movement.encumbrance,0);
  assert.equal(movement.speed,6);
  assert.equal(JSON.stringify({development,system:actor.system}),before);
});
