/** Carried Bulk and lasting wound reductions are separate Speed penalties. */
export function movementProfile({
  speedBase,
  agility,
  brawn,
  items = [],
  woundPenalty = 0,
  woundSources = [],
}) {
  for (const [key, value] of Object.entries({ speedBase, agility, brawn }))
    if (!Number.isSafeInteger(value) || (key === "speedBase" && value < 0))
      throw new Error(`A valid ${key} is required.`);
  if (!Number.isSafeInteger(woundPenalty) || woundPenalty < 0)
    throw new Error("Wound movement penalty must be a nonnegative integer.");
  if (!Array.isArray(woundSources))
    throw new Error("Wound movement sources must be an array.");
  let bulk = 0,
    wornOutfitExcluded = false;
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.bulk) ||
      item.bulk < 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 0
    )
      throw new Error("Invalid carried item Bulk or quantity.");
    if (item.quantity === 0 || item.carried === false) continue;
    bulk += item.bulk * item.quantity;
    if (
      !wornOutfitExcluded &&
      item.worn &&
      item.catalogId === "item-travel-clothes"
    ) {
      bulk -= item.bulk;
      wornOutfitExcluded = true;
    }
  }
  const capacity = 10 + 3 * brawn,
    unencumbered = Math.max(0, speedBase + agility),
    encumbrance = Math.max(0, bulk - capacity),
    speedBeforeWounds = Math.max(0, unencumbered - encumbrance),
    speed = Math.max(0, speedBeforeWounds - woundPenalty);
  for (const n of [
    bulk,
    capacity,
    unencumbered,
    encumbrance,
    speedBeforeWounds,
    speed,
  ])
    if (!Number.isSafeInteger(n))
      throw new Error("Movement arithmetic overflow.");
  return {
    source: "actor-movement",
    speedBase,
    agility,
    bulk,
    capacity,
    unencumbered,
    encumbrance,
    speedBeforeWounds,
    woundPenalty,
    woundSources: structuredClone(woundSources),
    speed,
  };
}

export function movementBreakdown(profile) {
  if (!profile) throw new Error("A movement profile is required.");
  if (profile.source === "printed-creature-speed") {
    if (!Number.isSafeInteger(profile.speed) || profile.speed < 0)
      throw new Error("Invalid printed creature Speed.");
    return `Speed ${profile.speed} · printed creature profile`;
  }
  if (profile.source === "da-speed-override") {
    if (
      !Number.isSafeInteger(profile.speed) ||
      profile.speed < 0
    )
      throw new Error("Invalid DA Speed override breakdown.");
    return `Speed ${profile.speed} · manual setting${profile.reason?.trim() ? `: ${profile.reason.trim()}` : ""}`;
  }
  for (const key of [
    "speedBase",
    "agility",
    "encumbrance",
    "speedBeforeWounds",
    "woundPenalty",
    "speed",
  ])
    if (!Number.isSafeInteger(profile[key]))
      throw new Error("Invalid movement breakdown.");
  if (!Array.isArray(profile.woundSources))
    throw new Error("Invalid wound movement sources.");
  const wounds = profile.woundPenalty
      ? ` (${profile.woundSources
          .map((source) => `${source.label} −${source.amount}`)
          .join("; ")})`
      : "",
    agility =
      profile.agility < 0
        ? `− ${Math.abs(profile.agility)}`
        : `+ ${profile.agility}`;
  return `Speed ${profile.speed} = base ${profile.speedBase} ${agility} − encumbrance ${profile.encumbrance} − wounds ${profile.woundPenalty}${wounds}, floor 0`;
}
