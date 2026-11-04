/** Approved Halfling footprint (CHG-HAL-002), applied only at character creation.
 * A configured prototype is a table choice: never resize it or existing tokens.
 * Other Small ancestries have no approved footprint directive.
 */
export function ancestryTokenFootprint(ancestryId, prototype = {}) {
  if (ancestryId !== "ancestry-halfling") return {};
  const width = prototype.width ?? 1;
  const height = prototype.height ?? 1;
  return width === 1 && height === 1 ? { width: 0.5, height: 0.5 } : {};
}
