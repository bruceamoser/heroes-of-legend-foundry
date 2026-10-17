import { WOUND_KEYS } from "../../src/rules/wounds.mjs";
const tables = {
  Physical: "physical",
  Elemental: "elemental",
  Mental: "mental",
  Radiant: "radiant",
  "Life/Necrotic": "life",
};
export function parseWoundEffects(text) {
  if (text === "Speech only; death at end of second following turn")
    return [{ kind: "lastWords" }];
  if (
    [
      "None",
      "No loss of function",
      "No movement penalty",
      "No physical penalty",
      "No required action",
      "No required positioning",
      "No required possession",
      "No speech penalty",
    ].includes(text)
  )
    return [];
  return text.split(";").map((part) => {
    const value = part.trim();
    let match;
    if (value === "Prone")
      return {
        kind: "condition",
        key: "prone",
        rating: 1,
        persistence: "binary",
      };
    if (
      (match = value.match(
        /^(Bleeding|Blinded|Deafened|Burning|Burning\/Freezing|Dazed|Frightened|Paralyzed) ([1-3])(\*)?$/,
      ))
    )
      return {
        kind: "condition",
        key:
          match[1] === "Burning/Freezing"
            ? "elemental-injury"
            : match[1].toLowerCase(),
        rating: Number(match[2]),
        persistence: match[3] ? "starred" : "temporary",
        ...(match[1] === "Frightened" ? { requiresSource: true } : {}),
      };
    if ((match = value.match(/^(Push|Pull) ([1-3]) squares?$/i)))
      return {
        kind: "forcedMovement",
        direction: match[1].toLowerCase(),
        distance: Number(match[2]),
        requiresDirection: true,
      };
    if ((match = value.match(/^−([1-4]) movement$/)))
      return { kind: "movementPenalty", amount: Number(match[1]) };
    if (
      (match = value.match(/^([12]) Banes? to (physical|mental) activities$/))
    )
      return {
        kind: "rollModifier",
        polarity: "bane",
        amount: Number(match[1]),
        context: match[2],
        printedContext: `${match[2]} activities`,
        requiresContext: true,
      };
    if (value === "1 Boon to intimidate")
      return {
        kind: "rollModifier",
        polarity: "boon",
        amount: 1,
        context: "intimidate",
        printedContext: "intimidate",
        requiresContext: true,
      };
    if (
      (match = value.match(
        /^1 Bane to persuade when (visible scar|scar|it) influences interaction$/,
      ))
    )
      return {
        kind: "rollModifier",
        polarity: "bane",
        amount: 1,
        context: "persuade",
        printedContext: `persuade when ${match[1]} influences interaction`,
        requiresContext: true,
      };
    throw new Error(`Unreviewed wound effect: ${value}`);
  });
}
export function parseWounds(text, source) {
  let table = null,
    band = null;
  const records = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      table = tables[line.slice(3)] ?? null;
      band = null;
      continue;
    }
    if (line.startsWith("### ") && table) {
      const match = line.match(/: ([1-6])00 band$/);
      if (!match) throw new Error(`Unknown wound band: ${line}`);
      band = Number(match[1]);
      continue;
    }
    if (!table || !band || !/^\| \d/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length !== 5)
      throw new Error("Wound entry must have five columns.");
    const [key, injury, effectText, remedy, rv] = cells;
    if (
      !WOUND_KEYS.includes(key) ||
      Number(key[0]) !== band ||
      !injury ||
      !remedy ||
      !(/^[1-9]$/.test(rv) || rv === "—")
    )
      throw new Error(`Malformed wound entry: ${line}`);
    const recoveryValue = rv === "—" ? null : Number(rv),
      capability = remedy.split(";")[0];
    if (
      recoveryValue !== null &&
      ![
        "Soft Tissue",
        "Bone",
        "Elemental",
        "Mental",
        "Radiant",
        "Life",
      ].includes(capability)
    )
      throw new Error(`Unreviewed treatment capability: ${capability}`);
    records.push({
      id: `wound-${table}-${key}`,
      table,
      key,
      injury,
      effects: parseWoundEffects(effectText),
      remedy,
      recoveryValue,
      capability: recoveryValue === null ? null : capability,
      source,
    });
  }
  for (const table of Object.values(tables)) {
    const keys = records.filter((r) => r.table === table).map((r) => r.key);
    if (JSON.stringify(keys) !== JSON.stringify(WOUND_KEYS))
      throw new Error(`Incomplete or unordered wound table: ${table}`);
  }
  return records;
}
