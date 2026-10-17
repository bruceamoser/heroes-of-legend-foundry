/** A held stack occupies the hands needed by one unit, not every carried unit. */
export function handLayout(items, capacity = 2) {
  if (!Number.isSafeInteger(capacity) || capacity < 0)
    throw new Error("Hand capacity must be a nonnegative whole number.");
  const ids = new Set();
  let occupied = 0;
  for (const item of items) {
    if (!item.id || ids.has(item.id))
      throw new Error("Equipment IDs must be unique.");
    ids.add(item.id);
    if (
      !Number.isSafeInteger(item.hands) ||
      item.hands < 0 ||
      item.hands > 2 ||
      typeof item.held !== "boolean"
    )
      throw new Error(
        "Each item needs a valid hand requirement and held state.",
      );
    if (item.held && !item.hands)
      throw new Error("A held item must occupy at least one hand.");
    if (item.held) occupied += item.hands;
  }
  if (occupied > capacity)
    throw new Error(
      `This arrangement needs ${occupied} hands; only ${capacity} are available.`,
    );
  return { capacity, occupied, free: capacity - occupied };
}
