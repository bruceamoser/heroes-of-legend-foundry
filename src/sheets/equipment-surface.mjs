const WEARABLE = new Set([
  "item-ordinary-light-armor", "item-ordinary-medium-armor", "item-ordinary-heavy-armor",
  "item-travel-clothes", "item-disguise-clothes", "item-weather-clothes", "item-travel-pack",
  "item-cincture-of-might", "item-gravebound-brooch", "item-winter-lining", "item-climbing-fittings",
]);
/** Show arrangement controls only for the printed equipment's supported usage. */
export function equipmentSurface(item, definition) {
  const catalogId = item.system.catalogId;
  return {
    canHold: Boolean(definition?.handChoices?.length || (!definition && (item.system.hands || item.system.held))),
    canWear: WEARABLE.has(catalogId) || (!definition && Boolean(item.system.worn)),
    ranged: catalogId === "item-ordinary-ranged-weapon",
  };
}
export function attackFirst(rows) {
  return [...rows].sort((a,b) => Number(Boolean(b.attack)) - Number(Boolean(a.attack)));
}
