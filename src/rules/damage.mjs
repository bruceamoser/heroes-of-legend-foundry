/** Pure fixed-outcome arithmetic. Never mutates a document or rolls dice. */
export const DAMAGE_TYPE = Object.freeze({
  PHYSICAL: "physical",
  FIRE: "fire",
  COLD: "cold",
  LIGHTNING: "lightning",
  MENTAL: "mental",
  RADIANT: "radiant",
  LIFE: "life",
});
export const DAMAGE_TYPES = Object.freeze(Object.values(DAMAGE_TYPE));
export const DAMAGE_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    DAMAGE_TYPES.map((type) => [type, type[0].toUpperCase() + type.slice(1)]),
  ),
);
/** Normalize external printed labels; calculations and stored events use enum values. */
export function canonicalDamageType(value) {
  const canonical =
    typeof value === "string" ? value.trim().toLowerCase() : value;
  if (!DAMAGE_TYPES.includes(canonical))
    throw new TypeError(`Unknown damage type: ${value}`);
  return canonical;
}
export const WOUND_TABLES = Object.freeze({
  physical: "physical",
  fire: "elemental",
  cold: "elemental",
  lightning: "elemental",
  mental: "mental",
  radiant: "radiant",
  life: "life",
});
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  return value;
}
function type(value) {
  if (!DAMAGE_TYPES.includes(value))
    throw new TypeError(`Unknown damage type: ${value}`);
  return value;
}
function highestByType(sources) {
  const values = new Map();
  for (const source of sources) {
    const key = type(source.type),
      value = integer(source.value, "Defense value");
    values.set(key, Math.min(3, Math.max(values.get(key) ?? 0, value)));
  }
  return values;
}
export function damageEvent({ components, weaknesses = [], resistances = [] }) {
  if (!Array.isArray(components))
    throw new TypeError("Damage components must be an array");
  const original = new Map();
  for (const component of components) {
    const key = type(component.type),
      amount = integer(component.amount, "Damage");
    if (amount)
      original.set(
        key,
        integer((original.get(key) ?? 0) + amount, "Combined damage"),
      );
  }
  const weakness = highestByType(weaknesses),
    resistance = highestByType(resistances);
  const breakdown = [...original].map(([type, amount]) => {
    const added = weakness.get(type) ?? 0,
      reduced = resistance.get(type) ?? 0;
    const beforeResistance = integer(amount + added, "Damage after weakness");
    return {
      type,
      original: amount,
      weakness: added,
      beforeResistance,
      resistance: reduced,
      afterResistance: Math.max(0, beforeResistance - reduced),
    };
  });
  const subtotal = integer(
    breakdown.reduce((sum, c) => sum + c.afterResistance, 0),
    "Event damage",
  );
  const minimumApplied = breakdown.length > 0 && subtotal === 0;
  const total = minimumApplied ? 1 : subtotal;
  const highest = Math.max(0, ...breakdown.map((c) => c.afterResistance));
  const woundTypes = breakdown
    .filter((c) => minimumApplied || c.afterResistance === highest)
    .map((c) => c.type);
  return {
    breakdown,
    subtotal,
    minimumApplied,
    total,
    woundTypes,
    woundTables: [...new Set(woundTypes.map((t) => WOUND_TABLES[t]))],
  };
}
export function healingPlan({
  amount,
  current,
  max,
  lifeResistances = [],
  recipientKind = "character",
  healingHarmed = false,
}) {
  integer(amount, "Healing");
  integer(current, "Current HP");
  integer(max, "Maximum HP");
  if (max < 1 || current > max) throw new RangeError("Invalid HP range");
  if (!["character", "creature", "summon"].includes(recipientKind))
    throw new TypeError("Unknown recipient kind");
  const resistance = Math.min(
    3,
    Math.max(0, ...lifeResistances.map((v) => integer(v, "Life resistance"))),
  );
  if (recipientKind === "summon")
    return {
      allowed: false,
      reason: "summon-cannot-be-healed",
      restored: 0,
      after: current,
    };
  if (healingHarmed)
    return {
      allowed: false,
      reason: "use-printed-life-attack-outcome",
      restored: 0,
      after: current,
    };
  const missing = max - current;
  const restored =
    amount > 0 && missing > 0
      ? Math.min(missing, Math.max(1, amount - resistance))
      : 0;
  return {
    allowed: true,
    missing,
    resistance,
    restored,
    after: current + restored,
  };
}
export function upfrontHpCost(current, cost) {
  integer(current, "Current HP");
  integer(cost, "HP cost");
  const allowed = current - cost > 0;
  return {
    allowed,
    cost,
    before: current,
    after: allowed ? current - cost : current,
    ...(!allowed ? { reason: "payer-must-remain-above-zero" } : {}),
  };
}
