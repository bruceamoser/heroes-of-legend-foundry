/** Absolute HP or a signed correction relative to the current value. */
export function currentHpInput(value, maximum, current = null) {
  if(typeof value!=="string" || !value.trim()) throw new Error("Enter current HP; the field cannot be empty.");
  const text=value.trim();
  if(!/^[+-]?\d+$/.test(text))throw new Error("Enter whole HP, or a signed adjustment such as -3 or +2.");
  const amount=Number(text),relative=/^[+-]/.test(text);
  if(!Number.isSafeInteger(amount))throw new Error("Enter a whole HP value.");
  if(relative && Number.isSafeInteger(current))return Math.max(0,Math.min(maximum,current+amount));
  if(amount<0||amount>maximum)throw new Error("Current HP must be a whole number within the character’s maximum.");
  return amount;
}
