import { DAMAGE_TYPES, canonicalDamageType } from "./damage.mjs";
import { outcomeEffects } from "./outcome-effects.mjs";

const types = DAMAGE_TYPES.join("|");
/** Fixed numeric effects only. Movement/benefits remain explicit printed clauses. */
export function resolvedAttackEffects(text, { damageType } = {}) {
  if (typeof text !== "string" || !text.trim() || /\bor\b/i.test(text))
    return null;
  let normalized = text.trim().replace(/[.!]$/, "");
  // Shared trailing "damage" in authored mixed-type outcomes.
  normalized = normalized.replace(
    new RegExp(
      `(\\d+\\s+(?:${types}))\\s+and(?=\\s*\\d+\\s+(?:${types})\\s+damage)`,
      "gi",
    ),
    "$1 damage;",
  );
  const clauses = normalized
    .split(/\s*(?:;|,|\band\b|\bthen\b)\s*/i)
    .filter(Boolean);
  const components = [],
    conditions = [],
    manual = [];
  let manualRemainder = false;
  for (const [index, raw] of clauses.entries()) {
    if (manualRemainder || /\b(?:if|unless|when|whenever|otherwise|instead)\b/i.test(raw)) {
      if (index === 0) return null;
      manualRemainder = true;
      manual.push(raw.trim());
      continue;
    }
    let clause = raw.trim();
    const chosen =
      /^(?:Deal\s+)?(\d+)\s+damage(?:\s+of\s+(?:the chosen|that)\s+type)?(?:\s+to each(?: target)?)?$/i.exec(
        clause,
      );
    if (chosen && damageType)
      clause = `${chosen[1]} ${canonicalDamageType(damageType)} damage`;
    clause = clause.replace(/\s+to each(?: target)?$/i, "");
    clause = clause.replace(/^knock\s+(?:it\s+)?prone$/i, "Prone");
    clause = clause.replace(/^(Frightened\s+\d+)\s+of you$/i, "$1");
    const effect = outcomeEffects(clause);
    if (effect) {
      components.push(...effect.components);
      conditions.push(...effect.conditions);
    } else {
      // Never mine later numbers from an initially conditional or variable outcome.
      if (index === 0) return null;
      manual.push(raw.trim());
      if (!/^(?:push|pull|slide)\b/i.test(raw.trim())) manualRemainder = true;
    }
  }
  return components.length || conditions.length
    ? {
        components,
        conditions,
        ...(manual.length ? { manual: manual.join("; ") } : {}),
      }
    : null;
}

/** A printed pre-roll choice is part of the roll, never a later damage prompt. */
export function printedDamageChoices(record) {
  const body = (record?.reference?.rules?.body ?? [])
    .map((block) => block.text ?? "")
    .join(" ");
  const match = new RegExp(
    `\\bChoose\\s+(${types})\\s+or\\s+(${types})(?:\\s+and the area)?\\s+before rolling\\b`,
    "i",
  ).exec(body);
  return match ? [...new Set(match.slice(1).map(canonicalDamageType))] : [];
}
