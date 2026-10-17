import { damageEvent } from "./damage.mjs";
export const CONDITION_KINDS = Object.freeze({
  burning: "severity",
  freezing: "severity",
  bleeding: "severity",
  poisoned: "severity",
  frightened: "severity",
  slowed: "severity",
  dazed: "severity",
  grappled: "maintained",
  blinded: "duration",
  deafened: "duration",
  asleep: "duration",
  paralyzed: "duration",
  unconscious: "binary",
  petrified: "binary",
  prone: "binary",
  hidden: "binary",
  invisible: "binary",
});
const integer = (n, label) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`${label} must be a nonnegative safe integer.`);
  return n;
};
export function validateContributions(contributions) {
  if (!Array.isArray(contributions))
    throw new Error("Condition contributions must be an array.");
  const ids = new Set();
  for (const c of contributions) {
    if (
      typeof c.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(c.id) ||
      ids.has(c.id)
    )
      throw new Error("Condition contribution IDs must be unique.");
    ids.add(c.id);
    if (!Object.hasOwn(CONDITION_KINDS, c.key))
      throw new Error("Unknown condition.");
    if (typeof c.source !== "string" || !c.source.trim())
      throw new Error("A condition needs an identified source.");
    integer(c.rating, "Condition rating");
    integer(c.order ?? 0, "Contribution order");
    if (c.rating < 1) throw new Error("Remove a zero-rating contribution.");
    const kind = CONDITION_KINDS[c.key];
    const allowed =
      kind === "binary"
        ? ["binary"]
        : kind === "maintained"
          ? ["maintained"]
          : ["temporary", "starred"];
    if (
      !allowed.includes(c.persistence) ||
      (kind === "binary" && c.rating !== 1)
    )
      throw new Error("Invalid condition persistence or binary rating.");
  }
  return contributions;
}
export function conditionSummary(contributions) {
  validateContributions(contributions);
  const summary = {};
  for (const [key, kind] of Object.entries(CONDITION_KINDS)) {
    const sources = contributions.filter((c) => c.key === key);
    const temporary = integer(
      sources
        .filter((c) => c.persistence === "temporary")
        .reduce((n, c) => n + c.rating, 0),
      "Temporary rating",
    );
    const persistent = integer(
      sources
        .filter((c) => c.persistence !== "temporary")
        .reduce((n, c) => n + c.rating, 0),
      "Persistent rating",
    );
    const rating = integer(temporary + persistent, "Combined condition rating");
    summary[key] = {
      key,
      kind,
      active: rating > 0,
      temporary,
      persistent,
      rating: kind === "binary" ? Number(rating > 0) : rating,
      severity: ["binary", "duration"].includes(kind)
        ? Number(rating > 0)
        : rating,
      sourceIds: sources.map((c) => c.id),
    };
  }
  return summary;
}
export function conditionActionRestrictions(contributions) {
  const s = conditionSummary(contributions);
  return {
    dazed: s.dazed.rating,
    grappled: s.grappled.rating,
    slowed: s.slowed.rating,
    paralyzed: s.paralyzed.severity,
    asleep: s.asleep.severity,
    unconscious: s.unconscious.active,
    petrified: s.petrified.active,
  };
}
export function conditionRollSources(
  contributions,
  { mode, perceivedSources, targetContributions = [] } = {},
) {
  if (!["attribute", "attack", "defense", "death", "inventory"].includes(mode))
    throw new Error("Unknown roll context.");
  if (perceivedSources === undefined) {
    if (
      !["death", "inventory"].includes(mode) &&
      contributions.some((c) => c.key === "frightened")
    )
      throw new Error(
        "Confirm which fear sources are perceived before preparing this roll.",
      );
    perceivedSources = [];
  }
  if (
    !Array.isArray(perceivedSources) ||
    perceivedSources.some((id) => typeof id !== "string")
  )
    throw new Error("Perception requires explicit source identities.");
  const s = conditionSummary(contributions),
    target = conditionSummary(targetContributions),
    sources = [];
  const add = (id, kind, amount, label, sourceIds) => {
    if (amount)
      sources.push({ id, kind, amount, label, sourceIds, automatic: true });
  };
  if (mode === "inventory") return sources;
  add(
    "condition-poisoned",
    "bane",
    s.poisoned.rating,
    "Poisoned",
    s.poisoned.sourceIds,
  );
  if (mode !== "death") {
    const perceived = contributions.filter(
      (c) => c.key === "frightened" && perceivedSources.includes(c.source),
    );
    add(
      "condition-frightened",
      "bane",
      integer(
        perceived.reduce((n, c) => n + c.rating, 0),
        "Frightened Banes",
      ),
      "Perceived fear source",
      perceived.map((c) => c.id),
    );
  }
  if (mode === "defense") {
    const helpless = ["asleep", "paralyzed", "unconscious", "petrified"].filter(
      (k) => s[k].active,
    );
    add(
      "condition-helpless",
      "bane",
      helpless.length ? 3 : 0,
      "Helpless (overlapping states count once)",
      helpless.flatMap((k) => s[k].sourceIds),
    );
  }
  if (mode === "attack")
    add(
      "condition-target-grappled",
      "boon",
      target.grappled.rating,
      "Target is Grappled",
      target.grappled.sourceIds,
    );
  // For an NPC attack resolved through defense dice, the target's grapple advantage reverses direction.
  if (mode === "defense")
    add(
      "condition-defender-grappled",
      "bane",
      s.grappled.rating,
      "Defender is Grappled",
      s.grappled.sourceIds,
    );
  return sources;
}
function ordered(contributions, key) {
  return contributions
    .filter((c) => c.key === key && c.persistence === "temporary")
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
}
export function reduceTemporary(
  contributions,
  key,
  amount = 1,
  preferredIds = [],
) {
  validateContributions(contributions);
  integer(amount, "Reduction");
  if (!Object.hasOwn(CONDITION_KINDS, key))
    throw new Error("Unknown condition.");
  const next = structuredClone(contributions),
    candidates = ordered(next, key);
  if (
    !Array.isArray(preferredIds) ||
    new Set(preferredIds).size !== preferredIds.length ||
    preferredIds.some((id) => !candidates.some((c) => c.id === id))
  )
    throw new Error("Choose existing temporary sources for reduction.");
  const priority = (id) =>
    preferredIds.includes(id) ? preferredIds.indexOf(id) : preferredIds.length;
  candidates.sort((a, b) => priority(a.id) - priority(b.id));
  let remaining = amount;
  for (const c of candidates) {
    const removed = Math.min(remaining, c.rating);
    c.rating -= removed;
    remaining -= removed;
    if (!remaining) break;
  }
  return next.filter((c) => c.rating > 0);
}
export function removeConditionSource(contributions, source) {
  validateContributions(contributions);
  if (typeof source !== "string" || !source)
    throw new Error("Identify the source to remove.");
  return structuredClone(contributions.filter((c) => c.source !== source));
}
/** Pure proposed end event; caller supplies/persists a once-only receipt with its resulting writes. */
export function conditionEndPlan(
  contributions,
  {
    turnId,
    resistances = [],
    weaknesses = [],
    durationPolicies = {},
    decayPriority = {},
  } = {},
) {
  if (typeof turnId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(turnId))
    throw new Error("Identify the turn event.");
  const summary = conditionSummary(contributions),
    events = [],
    pendingChoices = [];
  let next = structuredClone(contributions);
  for (const [key, kind] of Object.entries(CONDITION_KINDS)) {
    const rating = summary[key].rating;
    if (rating && ["burning", "freezing", "bleeding"].includes(key)) {
      const type =
        key === "burning" ? "fire" : key === "freezing" ? "cold" : "physical";
      const bypass = key === "bleeding";
      events.push({
        id: `${turnId}-${key}`,
        condition: key,
        rating,
        bypassResistance: bypass,
        damage: bypass
          ? {
              total: rating,
            }
          : damageEvent({
              components: [{ type, amount: rating }],
              resistances,
              weaknesses,
            }),
      });
    }
    const temporary = ordered(next, key);
    if (kind === "duration" && temporary.length > 1) {
      const policy = durationPolicies[key];
      if (!["independent", "combined"].includes(policy)) {
        pendingChoices.push({
          key,
          reason:
            "Overlapping duration-only sources need a DA duration ruling.",
          choices: ["independent", "combined"],
        });
        continue;
      }
      if (policy === "independent") {
        for (const c of temporary) c.rating--;
        next = next.filter((c) => c.rating > 0);
        continue;
      }
    }
    if (temporary.length)
      next = reduceTemporary(next, key, 1, decayPriority[key] ?? []);
  }
  return {
    turnId,
    events,
    contributions: next,
    pendingChoices,
    ready: pendingChoices.length === 0,
  };
}
