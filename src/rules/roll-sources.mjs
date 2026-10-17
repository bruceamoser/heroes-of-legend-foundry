import { rollPlan } from "./roll.mjs";
/** Source totals retain their uncapped values; only the net dice pool is capped. */
export function sourceRollPlan(attribute, sources) {
  if (!Array.isArray(sources))
    throw new Error("Roll sources must be an array.");
  const ids = new Set();
  let boons = 0,
    banes = 0;
  for (const source of sources) {
    if (typeof source.id !== "string" || !source.id || ids.has(source.id))
      throw new Error("Each roll source needs a unique identity.");
    ids.add(source.id);
    if (
      !["boon", "bane"].includes(source.kind) ||
      !Number.isSafeInteger(source.amount) ||
      source.amount < 1 ||
      typeof source.label !== "string" ||
      !source.label.trim()
    )
      throw new Error(
        "Identify each positive whole-number Boon or Bane source.",
      );
    if (source.kind === "boon") boons += source.amount;
    else banes += source.amount;
    if (!Number.isSafeInteger(boons) || !Number.isSafeInteger(banes))
      throw new Error("Roll source totals exceed the supported range.");
  }
  return {
    ...rollPlan({ attribute, boons, banes }),
    sources: structuredClone(sources),
  };
}
