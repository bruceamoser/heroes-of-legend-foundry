/** Stable capabilities, never display names, identify equipment used by rules. */
export const SHIELD_CATALOG_IDS = Object.freeze(["item-ordinary-shield"]);
export const MELEE_WEAPON_CATALOG_IDS = Object.freeze([
  "item-ordinary-melee-weapon",
]);

export function isShieldEquipment(item) {
  return (
    item?.type === "equipment" &&
    SHIELD_CATALOG_IDS.includes(item.system?.catalogId)
  );
}

export function isMeleeWeaponEquipment(item) {
  return (
    item?.type === "equipment" &&
    MELEE_WEAPON_CATALOG_IDS.includes(item.system?.catalogId)
  );
}
