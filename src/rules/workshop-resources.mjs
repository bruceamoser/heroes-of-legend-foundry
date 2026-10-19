import { woundRoll, woundResult } from "./wounds.mjs";
import { inventoryCheck } from "./inventory.mjs";
import { healingPotionAdapter, HEALING_POTION_IDS } from "./potions.mjs";

export function rolledWorkshopWound({
  catalog,
  damageType,
  priorWounds,
  faces,
  id,
}) {
  const roll = woundRoll(priorWounds, faces);
  const result = woundResult(catalog, damageType, roll.key);
  return {
    wound: {
      id,
      name: result.record.injury,
      notes: result.record.remedy,
      catalogId: result.record.id,
      damageType,
      roll: { priorWounds, faces: [...faces], key: roll.key },
    },
    effects: result.effects,
  };
}

export function workshopWoundEffects(wounds, catalog) {
  if (!catalog) return [];
  return wounds.flatMap((w) => {
    if (!w.catalogId) return [];
    const result = woundResult(catalog, w.damageType, w.roll.key);
    if (result.record.id !== w.catalogId)
      throw new Error("Wound result identity differs from its dice.");
    return result.effects.map((effect, index) => ({
      ...effect,
      id: `${w.id}-${index}`,
      injury: result.record.injury,
    }));
  });
}

export function workshopSupplyUse({
  item,
  face,
  hp,
  maxHp,
  catalog,
  lastWords = false,
}) {
  if (!item || item.quantity < 1)
    throw new Error("This supply has no quantity remaining.");
  const potion = HEALING_POTION_IDS.includes(item.catalogId)
    ? healingPotionAdapter(item.catalogId, catalog)
    : null;
  if (potion && lastWords)
    throw new Error("Ordinary healing cannot reverse Last Words.");
  const check = inventoryCheck({ die: item.inventoryDie, retained: face });
  const afterHp = potion ? Math.min(maxHp, hp + potion.healing) : hp;
  return {
    ...check,
    hp: afterHp,
    healed: afterHp - hp,
    potion: Boolean(potion),
  };
}

export function workshopSpendGrit({
  spent = 0,
  granted,
  maxHp,
  lastWords = false,
}) {
  if (!Number.isSafeInteger(spent) || spent < 0 || spent >= granted)
    throw new Error("No Grit remains.");
  if (lastWords) throw new Error("Ordinary Grit cannot reverse Last Words.");
  return { gritSpent: spent + 1, hp: maxHp, failedDeathRolls: 0 };
}
