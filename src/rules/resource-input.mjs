/** An empty number control is an unfinished edit, never an instruction to set zero HP. */
export function currentHpInput(value, maximum) {
  if(typeof value!=="string" || !value.trim()) throw new Error("Enter current HP; the field cannot be empty.");
  const hp=Number(value);
  if(!Number.isSafeInteger(hp)||hp<0||hp>maximum)throw new Error("Current HP must be a whole number within the character’s maximum.");
  return hp;
}
