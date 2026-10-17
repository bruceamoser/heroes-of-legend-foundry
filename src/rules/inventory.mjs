/** Pure supply-die arithmetic. Applying a result belongs to a document service. */
export const INVENTORY_DIE_LADDER = Object.freeze([20, 12, 10, 8, 6, 4, 0]);

const activeDie = (die, label = "Inventory die") => {
  if (![20, 12, 10, 8, 6, 4].includes(die))
    throw new Error(`${label} must be d4, d6, d8, d10, d12 or d20.`);
  return die;
};

const whole = (value, label, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return value;
};

/** Check only after the supplied use succeeded. The final use still takes effect. */
export function inventoryCheck({ die, retained }) {
  activeDie(die);
  whole(retained, "Retained inventory face", 1);
  if (retained > die)
    throw new Error(`Retained inventory face ${retained} exceeds d${die}.`);
  const after =
    retained === 1
      ? INVENTORY_DIE_LADDER[INVENTORY_DIE_LADDER.indexOf(die) + 1]
      : die;
  return { before: die, retained, after, exhausted: after === 0 };
}

/**
 * Apply an explicit reviewed recipe step count to one existing supply.
 * This grants no recipe permission and never creates or splits containers.
 */
export function refillInventory({ die, steps, maximumDie }) {
  if (die !== 0) activeDie(die);
  activeDie(maximumDie, "Maximum inventory die");
  whole(steps, "Refill steps");
  if (die > maximumDie)
    throw new Error(`Current d${die} exceeds the d${maximumDie} refill cap.`);
  const ladder = [...INVENTORY_DIE_LADDER].reverse(),
    current = ladder.indexOf(die),
    maximum = ladder.indexOf(maximumDie),
    after = ladder[Math.min(maximum, current + steps)];
  return {
    before: die,
    steps,
    maximumDie,
    after,
    capReached: after === maximumDie,
  };
}
