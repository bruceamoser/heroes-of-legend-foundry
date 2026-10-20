const ROOT = "systems/heroes-of-legend/assets/";
const MARKS = new Set(["armor", "arms", "athletics", "calling", "craft", "flame", "frost", "guard", "influence", "life", "marksmanship", "medicine", "mind", "radiance", "scholarship", "storm", "subterfuge", "wilderness"]);
const equipment = {
  "ammunition-bundle": "arrows", "book-of-quiet-doors": "book", "chain-coil": "chain", "cincture-of-might": "belt", "clearing-tonic": "potion", "climbing-fittings": "tools", "craft-tools": "tools", "digging-tools": "pick", "disguise-clothes": "mask", "ember-edge": "sword", "food-bundle": "food", "glass-of-fine-detail": "lens", "gravebound-brooch": "jewel", "greater-healing-bottle": "potion", "lesser-healing-bottle": "potion", "lever-and-wedges": "tools", "lighting-bundle": "torch", "local-map": "map", "lock-tools": "key", "material-bundle": "materials", "mixing-kit": "potion", "musical-instrument": "lute", "ordinary-heavy-armor": "armor", "ordinary-light-armor": "armor", "ordinary-medium-armor": "armor", "ordinary-melee-weapon": "sword", "ordinary-ranged-weapon": "bow", "ordinary-shield": "shield", "padlock": "lock", "restraints": "chain", "rope-coil": "rope", "signal-kit": "horn", "sleeping-roll": "bedroll", "small-necessities": "pouch", "small-tent": "tent", "smoke-supply": "smoke", "superior-healing-bottle": "potion", "trade-sack": "pouch", "travel-clothes": "clothes", "travel-pack": "pack", "water-flask": "flask", "weather-clothes": "cloak", "winter-lining": "cloak", "writing-kit": "quill",
};
const universal = {
  "a-party-piece": "lute", "another-tongue": "quill", "catch-a-falling-friend": "hands", "catch-that": "hands", "conditioned-body": "fist", "hold-a-conversation": "hands", "keep-your-bearings": "map", "look-over-here": "horn", "message-by-heart": "book", "notice-the-human-detail": "lens", "one-more-dawn": "bandage", "pack-with-purpose": "pack", "quick-exit": "step", "tell-a-worthy-story": "book",
  aid: "hands", "basic-melee": "sword", "basic-ranged": "bow", "basic-throw": "arrow", "basic-unarmed": "fist", "command-a-summon": "summon", "convert-an-action": "exchange", defend: "shield", disengage: "step", force: "fist", "handle-an-item": "hands", move: "step", "opportunity-attack": "sword", "reduce-a-condition": "bandage", "shield-block": "shield", stabilize: "bandage", stand: "step", "use-a-healing-potion": "potion",
};
const signatures = { arcanist: "scholarship", blade: "arms", intellect: "mind", leader: "influence", odd: "calling", protector: "guard", shadow: "subterfuge", shepherd: "life", unbalanced: "athletics", warden: "wilderness" };
export const DEFAULT_ABILITY_ICON = `${ROOT}marks/crest.webp`;
export const DEFAULT_EQUIPMENT_ICON = `${ROOT}icons/materials.svg`;
/** Select a reviewed discipline mark or a small ink illustration; never infer mechanics. */
export function catalogItemIcon(record, type = record?.kind === "ability" ? "ability" : "equipment") {
  if (type === "ability") {
    const discipline = record?.requirements?.find(r => r.kind === "discipline")?.id?.replace(/^discipline-/, "");
    if (MARKS.has(discipline)) return `${ROOT}marks/${discipline}.webp`;
    const id = String(record?.id ?? "").replace(/^ability-/, "");
    if (universal[id]) return `${ROOT}icons/${universal[id]}.svg`;
    const signature = id.match(/^signature-([a-z]+)-/)?.[1];
    if (signatures[signature]) return `${ROOT}marks/${signatures[signature]}.webp`;
    return DEFAULT_ABILITY_ICON;
  }
  const id = String(record?.id ?? "").replace(/^item-/, "");
  return equipment[id] ? `${ROOT}icons/${equipment[id]}.svg` : DEFAULT_EQUIPMENT_ICON;
}
/** Existing chosen art is never replaced by a catalog default. */
export function hasGenericItemIcon(img) {
  return img === undefined || img === null || img === "" || ["icons/svg/item-bag.svg", "icons/svg/item.svg"].includes(img);
}
export function itemIconForData(data, catalogs) {
  const type = data.type;
  if (!["ability", "equipment"].includes(type)) return null;
  if (!hasGenericItemIcon(data.img)) return null;
  const id = type === "ability" ? data.flags?.["heroes-of-legend"]?.catalogId : data.system?.catalogId;
  const record = type === "ability" ? catalogs?.choices?.find(r => r.kind === "ability" && r.id === id) : catalogs?.inventory?.equipment?.find(r => r.id === id);
  return catalogItemIcon(record ?? { id }, type);
}

/** The same icon on a card and directory, respecting any chosen Item artwork. */
export function itemDisplayIcon(data, catalogs) {
  return itemIconForData(data, catalogs) ?? data.img;
}
