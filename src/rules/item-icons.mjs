const ROOT = "systems/heroes-of-legend/assets/";
const MARKS = new Set(["armor", "arms", "athletics", "calling", "craft", "flame", "frost", "guard", "influence", "life", "marksmanship", "medicine", "mind", "radiance", "scholarship", "storm", "subterfuge", "wilderness"]);
const equipment = {
  "ammunition-bundle": "arrows", "book-of-quiet-doors": "book", "chain-coil": "chain", "cincture-of-might": "belt", "clearing-tonic": "potion", "climbing-fittings": "tools", "craft-tools": "tools", "digging-tools": "pick", "disguise-clothes": "mask", "ember-edge": "sword", "food-bundle": "food", "glass-of-fine-detail": "lens", "gravebound-brooch": "jewel", "greater-healing-bottle": "potion", "lesser-healing-bottle": "potion", "lever-and-wedges": "tools", "lighting-bundle": "torch", "local-map": "map", "lock-tools": "key", "material-bundle": "materials", "mixing-kit": "potion", "musical-instrument": "lute", "ordinary-heavy-armor": "armor", "ordinary-light-armor": "armor", "ordinary-medium-armor": "armor", "ordinary-melee-weapon": "sword", "ordinary-ranged-weapon": "bow", "ordinary-shield": "shield", "padlock": "lock", "restraints": "chain", "rope-coil": "rope", "signal-kit": "horn", "sleeping-roll": "bedroll", "small-necessities": "pouch", "small-tent": "tent", "smoke-supply": "smoke", "superior-healing-bottle": "potion", "trade-sack": "pouch", "travel-clothes": "clothes", "travel-pack": "pack", "water-flask": "flask", "weather-clothes": "cloak", "winter-lining": "cloak", "writing-kit": "quill",
};
const universal = {
  "a-party-piece": "lute", "another-tongue": "quill", "catch-a-falling-friend": "hands", "catch-that": "hands", "conditioned-body": "fist", "hold-a-conversation": "hands", "keep-your-bearings": "map", "look-over-here": "horn", "message-by-heart": "book", "notice-the-human-detail": "lens", "one-more-dawn": "bandage", "pack-with-purpose": "pack", "quick-exit": "step", "tell-a-worthy-story": "book",
  aid: "hands", "basic-melee": "sword", "basic-ranged": "bow", "basic-throw": "arrow", "basic-unarmed": "fist", "command-a-summon": "summon", "convert-an-action": "exchange", defend: "shield", disengage: "step", force: "fist", "handle-an-item": "hands", move: "step", "opportunity-attack": "sword", "reduce-a-condition": "bandage", "shield-block": "shield", stabilize: "bandage", stand: "step", "use-a-healing-potion": "potion",
};
const illustrations = {
  "arrows": "icons/containers/ammunition/arrows-quiver-green-brown.webp",
  "book": "icons/sundries/books/book-worn-green.webp",
  "chain": "icons/commodities/metal/chain-steel.webp",
  "belt": "icons/equipment/waist/belt-thick-studded-leather.webp",
  "potion": "icons/consumables/potions/potion-flask-corked-green.webp",
  "tools": "icons/tools/smithing/hammer-sledge-steel-grey.webp",
  "pick": "icons/tools/hand/pickaxe-worn-steel-grey.webp",
  "mask": "icons/commodities/treasure/mask-jeweled-gold.webp",
  "sword": "icons/weapons/swords/sword-guard-worn-gold.webp",
  "food": "icons/consumables/grains/breadsticks-crackers-wrapped-ration-brown.webp",
  "lens": "icons/tools/navigation/spyglass-telescope-brass.webp",
  "jewel": "icons/commodities/treasure/brooch-skull-dagger-grey.webp",
  "torch": "icons/sundries/lights/torch-brown-lit.webp",
  "map": "icons/tools/navigation/map-marked-gold.webp",
  "key": "icons/tools/hand/lockpicks-steel-grey.webp",
  "materials": "icons/commodities/metal/ingot-worn-iron.webp",
  "lute": "icons/tools/instruments/lute-gold-brown.webp",
  "armor": "icons/equipment/chest/breastplate-scale-leather.webp",
  "bow": "icons/weapons/bows/shortbow-leather.webp",
  "shield": "icons/equipment/shield/shield-round-boss-wood-brown.webp",
  "lock": "icons/sundries/misc/lock-bronze-reinforced.webp",
  "rope": "icons/sundries/survival/rope-coiled-wrapped-brown.webp",
  "horn": "icons/commodities/treasure/horn-carved-banded.webp",
  "bedroll": "icons/sundries/survival/bedroll-worn-tan.webp",
  "pouch": "icons/containers/bags/pouch-simple-leather-tan.webp",
  "tent": "icons/sundries/survival/shelter-tent-small.webp",
  "smoke": "icons/commodities/tech/smoke-bomb-yellow.webp",
  "clothes": "icons/equipment/chest/shirt-simple-white.webp",
  "pack": "icons/containers/bags/pack-simple-leather-brown.webp",
  "flask": "icons/sundries/survival/waterskin-leather-brown.webp",
  "cloak": "icons/equipment/back/cloak-plain-green.webp",
  "quill": "icons/skills/trades/academics-scribe-quill-gray.webp",
  "hands": "icons/skills/social/diplomacy-handshake.webp",
  "fist": "icons/skills/melee/unarmed-punch-fist.webp",
  "step": "icons/skills/movement/feet-spurred-boots-brown.webp",
  "arrow": "icons/containers/ammunition/arrows-quiver-simple-brown.webp",
  "summon": "icons/creatures/magical/spirit-poison-smoke-green.webp",
  "exchange": "icons/skills/social/trading-justice-scale-gold.webp",
  "bandage": "icons/tools/medical/bandages-gauze-rough.webp"
};
const signatures = { arcanist: "scholarship", blade: "arms", intellect: "mind", leader: "influence", odd: "calling", protector: "guard", shadow: "subterfuge", shepherd: "life", unbalanced: "athletics", warden: "wilderness" };
export const DEFAULT_ABILITY_ICON = `${ROOT}marks/crest.webp`;
export const DEFAULT_EQUIPMENT_ICON = "icons/commodities/metal/ingot-worn-iron.webp";
/** Select a reviewed discipline mark or a Foundry core fantasy illustration; never infer mechanics. */
export function catalogItemIcon(record, type = record?.kind === "ability" ? "ability" : "equipment") {
  if (type === "ability") {
    const discipline = record?.requirements?.find(r => r.kind === "discipline")?.id?.replace(/^discipline-/, "");
    if (MARKS.has(discipline)) return `${ROOT}marks/${discipline}.webp`;
    const id = String(record?.id ?? "").replace(/^ability-/, "");
    if (universal[id]) return illustrations[universal[id]];
    const signature = id.match(/^signature-([a-z]+)-/)?.[1];
    if (signatures[signature]) return `${ROOT}marks/${signatures[signature]}.webp`;
    return DEFAULT_ABILITY_ICON;
  }
  const id = String(record?.id ?? "").replace(/^item-/, "");
  return illustrations[equipment[id]] ?? DEFAULT_EQUIPMENT_ICON;
}
/** Existing chosen art is never replaced by a catalog default. */
export function hasGenericItemIcon(img) {
  return img === undefined || img === null || img === "" || ["icons/svg/item-bag.svg", "icons/svg/item.svg"].includes(img);
}
export function itemIconForData(data, catalogs) {
  const type = data.type;
  if (!["ability", "equipment"].includes(type)) return null;
  const id = type === "ability" ? data.flags?.["heroes-of-legend"]?.catalogId : data.system?.catalogId;
  const record = type === "ability" ? catalogs?.choices?.find(r => r.kind === "ability" && r.id === id) : catalogs?.inventory?.equipment?.find(r => r.id === id);
  const legacyCategory = type === "ability" ? universal[String(id).replace(/^ability-/, "")] : equipment[String(id).replace(/^item-/, "")];
  const exactLegacyDefault = record && legacyCategory && data.img === `${ROOT}icons/${legacyCategory}.svg`;
  if (!hasGenericItemIcon(data.img) && !exactLegacyDefault) return null;
  return catalogItemIcon(record ?? { id }, type);
}

/** The same icon on a card and directory, respecting any chosen Item artwork. */
export function itemDisplayIcon(data, catalogs) {
  return itemIconForData(data, catalogs) ?? data.img;
}
