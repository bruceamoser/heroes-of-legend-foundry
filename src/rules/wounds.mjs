import { WOUND_TABLES } from "./damage.mjs";
export const WOUND_KEYS = Object.freeze(
  Array.from({ length: 6 }, (_, a) =>
    Array.from({ length: 6 - a }, (_, b) =>
      Array.from(
        { length: 6 - a - b },
        (_, c) => `${a + 1}${a + b + 1}${a + b + c + 1}`,
      ),
    ),
  ).flat(2),
);
export function woundRoll(priorWounds, faces) {
  if (!Number.isSafeInteger(priorWounds) || priorWounds < 0)
    throw new Error("Prior wound count must be a nonnegative whole number.");
  const count = Math.min(5, 3 + priorWounds);
  if (
    !Array.isArray(faces) ||
    faces.length !== count ||
    faces.some((f) => !Number.isInteger(f) || f < 1 || f > 6)
  )
    throw new Error(`Wound roll requires ${count} d6 faces.`);
  const retained = [...faces]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .sort((a, b) => a - b);
  return { count, retained, key: retained.join("") };
}
/** Anatomy applicability is a recorded DA decision, never inferred from an illustration. */
export function woundResult(catalog, damageType, key, skipped = []) {
  const table = WOUND_TABLES[damageType];
  if (!table || !WOUND_KEYS.includes(key))
    throw new Error("Unknown wound table or result.");
  if (!Array.isArray(skipped))
    throw new Error("Anatomy rulings must be a list.");
  let index = WOUND_KEYS.indexOf(key);
  for (const ruling of skipped) {
    if (
      ruling?.key !== WOUND_KEYS[index] ||
      typeof ruling.reason !== "string" ||
      !ruling.reason.trim() ||
      ruling.key === "666"
    )
      throw new Error(
        "Skip only the current inapplicable entry, with a reason; Last Words is terminal.",
      );
    index++;
  }
  const record = catalog.records.find(
    (r) => r.table === table && r.key === WOUND_KEYS[index],
  );
  if (!record) throw new Error("The approved wound entry is missing.");
  const effects = structuredClone(record.effects).map((e) =>
    e.key === "elemental-injury"
      ? { ...e, key: damageType === "cold" ? "freezing" : "burning" }
      : e,
  );
  return {
    record: structuredClone(record),
    effects,
    originalKey: key,
    skipped: structuredClone(skipped),
  };
}
