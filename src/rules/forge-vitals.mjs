import { classifyRoll } from "./roll.mjs";

const cap = (value, max) => Math.min(max, Math.max(0, value));
const integer = (value, fallback = 0) =>
  Number.isSafeInteger(value) ? value : fallback;

export function forgeMaximums({
  level = 0,
  ancestryHp = 0,
  classHp = 0,
  fortitude = 0,
  fixedHp = 0,
  capacitySp = 0,
  fixedSp = 0,
} = {}) {
  return {
    maxHp: 10 + (level === 0 ? ancestryHp : level * (ancestryHp + classHp)) + fortitude + fixedHp,
    maxSp: (level === 0 ? 3 : 6 + 2 * (level - 1)) + capacitySp + fixedSp,
    gritGranted: [1, 3, 7].filter((milestone) => level >= milestone).length,
  };
}

function recoveryLimit(limits) {
  return Math.max(0, limits.maxHp - Math.max(0, integer(limits.unavailableHp)));
}

export function forgeVitals(play = {}, limits) {
  const hp = cap(integer(play.hp, limits.maxHp), limits.maxHp);
  const dead = hp === 0 && Boolean(play.dead);
  const dying = hp === 0 && !dead && Boolean(play.dying ?? play.failedDeathRolls > 0);
  const failedDeathRolls = dying ? cap(integer(play.failedDeathRolls), 3) : 0;
  const gritSpent = Math.max(0, integer(play.gritSpent));
  return {
    ...play,
    hp,
    sp: cap(integer(play.sp, limits.maxSp), limits.maxSp),
    dying,
    dead,
    failedDeathRolls,
    successfulDeathRolls: dying ? cap(integer(play.successfulDeathRolls), 2) : 0,
    gritSpent,
    gritAvailable: Math.max(0, limits.gritGranted - gritSpent),
    gritTrigger: dying ? play.gritTrigger ?? null : hp === 0 && !dead ? "stable" : null,
    scars: Array.isArray(play.scars) ? play.scars.filter((scar) => typeof scar === "string" && scar.trim()) : [],
    firstAidUsed: Boolean(play.firstAidUsed),
    firstAidPending: Boolean(play.firstAidUsed && play.firstAidPending && !dead),
    spellcraftRecoveryUsed: Boolean(play.spellcraftRecoveryUsed),
  };
}

function clearDying(play) {
  return { ...play, dying: false, failedDeathRolls: 0, successfulDeathRolls: 0, gritTrigger: null };
}

function assertLiving(play) {
  if (play.dead) throw new Error("The hero has died.");
  if (play.failedDeathRolls === 3) throw new Error("Resolve the third failure first.");
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Use a whole, nonnegative amount.");
  return value;
}

export function advanceForgeVitals(play, beforeLimits, afterLimits) {
  const current = forgeVitals(play, beforeLimits);
  const hpGain = afterLimits.maxHp - beforeLimits.maxHp;
  return forgeVitals({
    ...current,
    hp: current.hp > 0 ? Math.max(1, current.hp + hpGain) : 0,
  }, afterLimits);
}

export function forgeDamage(play, limits, damage) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  amount(damage);
  if (!damage) return { play: current, deathRollRequired: false, gritTrigger: current.gritTrigger };
  const deathRollRequired = current.hp === 0;
  const hp = Math.max(0, current.hp - damage);
  const gritTrigger = hp === 0 && !deathRollRequired ? "fall" : null;
  return {
    play: { ...current, hp, dying: hp === 0, gritTrigger },
    deathRollRequired,
    gritTrigger,
  };
}

export function forgeDeathRoll(play, limits, { retained, fortitude }) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  if (!current.dying) throw new Error("Death rolls are for a Dying hero.");
  // Retained triples give the normal band with no extra death-roll effect.
  const { total } = classifyRoll(retained, fortitude);
  const tier = total <= 8 ? "weak" : total <= 14 ? "standard" : "strong";
  const next = {
    ...current,
    failedDeathRolls: current.failedDeathRolls + Number(tier === "weak"),
    successfulDeathRolls: current.successfulDeathRolls + Number(tier === "strong"),
    gritTrigger: tier === "weak" ? "failure" : null,
  };
  if (next.successfulDeathRolls === 3) {
    return { play: forgeStabilize(next, limits), tier, total, gritTrigger: "stable" };
  }
  return { play: next, tier, total, gritTrigger: next.gritTrigger };
}

export function forgeFinalizeDeath(play, limits) {
  const current = forgeVitals(play, limits);
  if (current.failedDeathRolls !== 3) throw new Error("Death follows a third failure.");
  return { ...clearDying(current), dead: true, firstAidPending: false };
}

export function forgeCanSpendGrit(play, limits, trigger) {
  const current = forgeVitals(play, limits);
  if (current.dead || !current.gritAvailable || current.hp > 0) return false;
  if (trigger === "turn-start") return current.dying && current.failedDeathRolls < 3;
  return ["fall", "failure", "stable"].includes(trigger) && trigger === current.gritTrigger;
}

export function forgeSpendGrit(play, limits, trigger) {
  const current = forgeVitals(play, limits);
  if (!forgeCanSpendGrit(current, limits, trigger)) {
    throw new Error("Grit can be spent at a fall, at the start of a Dying turn, after a failure, or while stabilized at 0 HP.");
  }
  return forgeVitals({
    ...clearDying(current),
    gritSpent: current.gritSpent + 1,
    hp: Math.min(Math.ceil(limits.maxHp / 2), recoveryLimit(limits)),
  }, limits);
}

export function forgeStabilize(play, limits) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  return forgeVitals(clearDying(current), limits);
}

export function forgeHeal(play, limits, healing, { lifeResistance = 0 } = {}) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  amount(healing);
  amount(lifeResistance);
  if (!healing) return current;
  const restored = Math.max(1, healing - lifeResistance);
  const hp = Math.max(current.hp, Math.min(current.hp + restored, recoveryLimit(limits)));
  return hp > 0 ? { ...clearDying(current), hp } : current;
}

export function forgeRest(play, limits, { hour } = {}) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  if (current.dying) throw new Error("Stabilize the hero before resting.");
  if (hour !== undefined) {
    amount(hour);
    if (Number.isSafeInteger(current.lastRestHour) && hour - current.lastRestHour < 24) {
      throw new Error("The next safe overnight rest must finish at least 24 hours after the last one.");
    }
  }
  return forgeVitals({
    ...clearDying(current),
    hp: Math.max(current.hp, recoveryLimit(limits)),
    sp: limits.maxSp,
    firstAidUsed: false,
    firstAidPending: false,
    spellcraftRecoveryUsed: false,
    lastRestHour: hour ?? current.lastRestHour,
  }, limits);
}

export function forgeBeginFirstAid(play, limits) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  if (current.firstAidUsed) throw new Error("This hero has already received first aid since their last safe overnight rest.");
  return { ...current, firstAidUsed: true, firstAidPending: true };
}

export function forgeFinishFirstAid(play, limits, tier, { trained = false, fieldDressing = trained ? 1 : 0 } = {}) {
  const current = forgeVitals(play, limits);
  if (!current.firstAidPending) throw new Error("Begin first aid before resolving the roll.");
  const healing = { weak: 2, standard: 4, strong: 6 }[tier];
  if (!Number.isSafeInteger(healing)) throw new Error("Choose a Weak, Standard, or Strong result.");
  return forgeHeal({ ...current, firstAidPending: false }, limits, healing + cap(integer(fieldDressing), 2));
}

export function forgeInterruptFirstAid(play, limits) {
  return { ...forgeVitals(play, limits), firstAidPending: false };
}

export function forgeFirstAid(play, limits, tier, options) {
  return forgeFinishFirstAid(forgeBeginFirstAid(play, limits), limits, tier, options);
}

export function forgeSpellcraftRecovery(play, limits, restored) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  if (current.dying) throw new Error("A Dying hero cannot rest or meditate.");
  if (current.spellcraftRecoveryUsed) throw new Error("Spellcraft Recovery is available once between safe overnight rests.");
  if (![1, 2, 3, 4].includes(restored)) throw new Error("Learn Spellcraft Recovery to use this benefit.");
  return { ...current, sp: Math.min(limits.maxSp, current.sp + restored), spellcraftRecoveryUsed: true };
}

export function forgeSpendSp(play, limits, cost) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  amount(cost);
  if (cost > current.sp) throw new Error("You need more SP.");
  return { ...current, sp: current.sp - cost };
}

export function forgeRecordScar(play, limits, description) {
  const current = forgeVitals(play, limits);
  assertLiving(current);
  if (current.dying) throw new Error("Record the scar when the danger has passed.");
  if (typeof description !== "string" || !description.trim() || description.trim().length > 500) {
    throw new Error("Describe the scar in up to 500 characters.");
  }
  return { ...current, scars: [...current.scars, description.trim()] };
}
