/** An empty number input is an unfinished edit, never an instruction to set HP to zero. */
export function hpInputValue(value, maximum) {
  const hp = String(value).trim() === "" ? NaN : Number(value);
  if (!Number.isSafeInteger(hp) || hp < 0 || hp > maximum)
    throw new Error(`Enter a whole number of HP from 0 to ${maximum}.`);
  return hp;
}
