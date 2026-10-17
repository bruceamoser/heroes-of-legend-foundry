/** Carried Bulk is independent of bags/containers and holding an item. */
export function movementProfile({ speedBase, agility, brawn, items = [] }) {
  for (const [key, value] of Object.entries({ speedBase, agility, brawn }))
    if (!Number.isSafeInteger(value) || (key === "speedBase" && value < 0))
      throw new Error(`A valid ${key} is required.`);
  let bulk = 0,
    wornOutfitExcluded = false;
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.bulk) ||
      item.bulk < 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    )
      throw new Error("Invalid carried item Bulk or quantity.");
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
    speed = Math.max(0, unencumbered - encumbrance);
  for (const n of [bulk, capacity, unencumbered, encumbrance, speed])
    if (!Number.isSafeInteger(n))
      throw new Error("Movement arithmetic overflow.");
  return { bulk, capacity, unencumbered, encumbrance, speed };
}
