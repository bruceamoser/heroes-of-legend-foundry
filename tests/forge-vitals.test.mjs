import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceForgeVitals,
  forgeBeginFirstAid,
  forgeDamage,
  forgeDeathRoll,
  forgeFinalizeDeath,
  forgeFinishFirstAid,
  forgeHeal,
  forgeInterruptFirstAid,
  forgeMaximums,
  forgeRecordScar,
  forgeRest,
  forgeSpellcraftRecovery,
  forgeSpendGrit,
  forgeSpendSp,
  forgeStabilize,
} from "../src/rules/forge-vitals.mjs";

const levelOne = forgeMaximums({ level: 1, ancestryHp: 3, classHp: 3, fortitude: 2, fixedHp: 1 });

test("HP and SP grow without reviving a hero at zero or refilling SP", () => {
  assert.deepEqual(levelOne, { maxHp: 19, maxSp: 6, gritGranted: 1 });
  const levelZero = forgeMaximums({ ancestryHp: 3, classHp: 3, fortitude: 2, fixedHp: 1 });
  assert.deepEqual(levelZero, { maxHp: 16, maxSp: 3, gritGranted: 0 });
  const levelSeven = forgeMaximums({ level: 7, ancestryHp: 3, classHp: 3, fortitude: 2, fixedHp: 1, capacitySp: 10 });
  assert.deepEqual(levelSeven, { maxHp: 55, maxSp: 28, gritGranted: 3 });
  assert.deepEqual(
    advanceForgeVitals({ hp: 3, sp: 1, gritSpent: 1 }, levelOne, levelSeven),
    { hp: 39, sp: 1, gritSpent: 1, dying: false, dead: false, failedDeathRolls: 0, successfulDeathRolls: 0, gritAvailable: 2, gritTrigger: null, scars: [], firstAidUsed: false, firstAidPending: false, spellcraftRecoveryUsed: false },
  );
  const advancedDying = advanceForgeVitals({ hp: 0, sp: 2, dying: true }, levelOne, levelSeven);
  assert.equal(advancedDying.hp, 0);
  assert.equal(advancedDying.dying, true);
  assert.equal(advancedDying.sp, 2);
});

test("death tracks separate tallies, uses one mark on triples, and allows Grit after the third failure", () => {
  const start = forgeDamage({ hp: 1 }, levelOne, 3);
  assert.equal(start.deathRollRequired, false);
  assert.equal(start.gritTrigger, "fall");
  assert.equal(forgeDamage(start.play, levelOne, 0).deathRollRequired, false);
  assert.equal(forgeDamage(start.play, levelOne, 1).deathRollRequired, true);
  const roll = (play, retained) => forgeDeathRoll(play, levelOne, { retained, fortitude: 2 }).play;
  const firstWeak = roll(start.play, [1, 1, 1]);
  const firstStrong = roll(firstWeak, [6, 6, 6]);
  const standard = roll(firstStrong, [3, 3, 3]);
  assert.equal(standard.failedDeathRolls, 1);
  assert.equal(standard.successfulDeathRolls, 1);
  const thirdWeak = roll(roll(standard, [1, 1, 1]), [1, 1, 1]);
  assert.equal(thirdWeak.failedDeathRolls, 3);
  assert.equal(forgeFinalizeDeath(thirdWeak, levelOne).dead, true);
  const rescued = forgeSpendGrit(thirdWeak, { ...levelOne, unavailableHp: 12 }, "failure");
  assert.equal(rescued.hp, 7);
  assert.equal(rescued.gritAvailable, 0);
  assert.equal(rescued.failedDeathRolls, 0);
  assert.equal(rescued.successfulDeathRolls, 0);

  const stable = roll(roll(standard, [6, 6, 6]), [6, 6, 6]);
  assert.equal(stable.hp, 0);
  assert.equal(stable.dying, false);
  assert.equal(stable.successfulDeathRolls, 0);
  assert.equal(stable.failedDeathRolls, 0);
  assert.equal(forgeDamage(stable, levelOne, 1).deathRollRequired, true);
});

test("recovery limits apply once per treatment and safe overnight rest restores both pools", () => {
  const stable = forgeStabilize({ hp: 0, dying: true }, levelOne);
  const treated = forgeFinishFirstAid(forgeBeginFirstAid(stable, levelOne), levelOne, "strong", { fieldDressing: 2 });
  assert.equal(treated.hp, 8);
  assert.throws(() => forgeBeginFirstAid(treated, levelOne), /already received/);
  assert.throws(() => forgeFinishFirstAid(treated, levelOne, "strong"), /Begin first aid/);
  const interrupted = forgeInterruptFirstAid(forgeBeginFirstAid(stable, levelOne), levelOne);
  assert.throws(() => forgeFinishFirstAid(interrupted, levelOne, "strong"), /Begin first aid/);
  assert.equal(interrupted.firstAidUsed, true);

  const withScar = forgeRecordScar({ ...treated, gritSpent: 1 }, levelOne, "  Silver hair  ");
  assert.equal(forgeHeal(withScar, levelOne, 2, { lifeResistance: 3 }).hp, 9);
  const paid = forgeSpendSp(withScar, levelOne, 4);
  assert.throws(() => forgeSpendSp(paid, levelOne, 3), /more SP/);
  const quiet = forgeSpellcraftRecovery(paid, levelOne, 2);
  assert.equal(quiet.sp, 4);
  assert.throws(() => forgeSpellcraftRecovery(quiet, levelOne, 4), /once/);
  const rested = forgeRest(quiet, levelOne, { hour: 8 });
  assert.throws(() => forgeRest(rested, levelOne, { hour: 31 }), /24 hours/);
  assert.equal(rested.hp, 19);
  assert.equal(rested.sp, 6);
  assert.equal(rested.gritAvailable, 0);
  assert.equal(rested.firstAidUsed, false);
  assert.equal(rested.spellcraftRecoveryUsed, false);
  assert.deepEqual(rested.scars, ["Silver hair"]);
});
