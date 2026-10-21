import { CONDITION_KINDS } from "./conditions.mjs";
const TYPES = "physical|fire|cold|lightning|mental|radiant|life";
/** Parse only complete fixed damage/condition outcomes. Conditional prose stays at the table. */
export function outcomeEffects(text, {defaultType = "physical", numeric = false} = {}) {
  if (typeof text !== "string" || !text.trim()) return null;
  const parts = text.trim().replace(/[.!]$/, "").split(/\s*(?:\+|;|\band\b)\s*/i);
  const components = [], conditions = [];
  for (let part of parts) {
    part = part.trim().replace(/[.!]$/, "");
    let match = new RegExp(`^(?:Deal\\s+)?(\\d+)\\s+(${TYPES})\\s+damage$`, "i").exec(part);
    if (match) { components.push({type:match[2].toLowerCase(),amount:Number(match[1])}); continue; }
    if (numeric && /^\d+$/.test(part)) { components.push({type:defaultType,amount:Number(part)}); continue; }
    match = /^(?:Apply\s+)?([a-z]+)(?:\s+(\d+))?(\*)?$/i.exec(part);
    const key = match?.[1].toLowerCase();
    if (!key || !Object.hasOwn(CONDITION_KINDS,key)) return null;
    const kind = CONDITION_KINDS[key];
    const rating = match[2] ? Number(match[2]) : kind === "binary" ? 1 : NaN;
    if (!Number.isSafeInteger(rating) || rating < 1 || (kind === "binary" && rating !== 1)) return null;
    conditions.push({key,rating,...(match[3] ? {persistence:"starred"} : {})});
  }
  if (components.some(c => !Number.isSafeInteger(c.amount) || c.amount < 0)) return null;
  if (!["physical","fire","cold","lightning","mental","radiant","life"].includes(defaultType)) return null;
  return {components,conditions};
}
