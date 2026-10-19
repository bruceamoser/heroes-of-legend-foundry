import { conditionEndPlan } from "./conditions.mjs";
import { survivalState, sufferDamage } from "./survival.mjs";
import { woundRoll, woundResult } from "./wounds.mjs";
import { inventoryCheck, refillInventory } from "./inventory.mjs";
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
    const healed =
      result.record.recoveryValue !== null &&
      (w.progress ?? 0) >= result.record.recoveryValue;
    return result.effects
      .map((effect, index) => ({
        ...effect,
        id: `${w.id}-${index}`,
        injury: result.record.injury,
      }))
      .filter(
        (effect) =>
          !healed ||
          !(
            effect.kind === "movementPenalty" ||
            effect.kind === "rollModifier" ||
            (effect.kind === "condition" && effect.persistence === "starred")
          ),
      );
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

/** Printed wound data and treatment state; scars are never removed by progress. */
export function workshopWoundDetails(wound, catalog) {
  if (!wound?.catalogId)
    return {
      record: null,
      progress: 0,
      required: null,
      healed: false,
      effects: [],
    };
  const result = woundResult(catalog, wound.damageType, wound.roll.key);
  if (result.record.id !== wound.catalogId)
    throw new Error("Wound identity differs from its result.");
  const progress = wound.progress ?? 0,
    required = result.record.recoveryValue;
  const healed = required !== null && progress >= required;
  return {
    record: result.record,
    progress,
    required,
    healed,
    effects: result.effects,
  };
}
export function workshopTreatWound({ wound, steps, catalog }) {
  if (![1, 2, 3].includes(steps))
    throw new Error("Choose 1, 2 or 3 healing progress.");
  const details = workshopWoundDetails(wound, catalog);
  if (details.required === null)
    throw new Error(
      "This wound uses its printed remedy rather than healing progress.",
    );
  const next = {
    ...structuredClone(wound),
    progress: Math.min(1000000, details.progress + steps),
  };
  return {
    wound: next,
    healed: next.progress >= details.required,
    removedConditionIds:
      next.progress >= details.required
        ? details.effects.flatMap((e, i) =>
            e.kind === "condition" && e.persistence === "starred"
              ? [`${wound.id}-${i}`]
              : [],
          )
        : [],
  };
}

export function workshopResupply({ item, steps, catalog }) {
  if (!item) throw new Error("Choose an inventory stack to resupply.");
  const maximumDie = catalog.equipment.find(
    (e) => e.id === item.catalogId,
  )?.inventoryDie;
  if (![1, 2, 3, 4, 5, 6].includes(steps))
    throw new Error("Choose 1–6 resupply steps.");
  return refillInventory({ die: item.inventoryDie, steps, maximumDie });
}

/** Manual Apply deals this contribution's damage without also decaying it. */
export function workshopConditionDamage({
  condition,
  hp,
  maxHp,
  failed = 0,
  lastWords = false,
  resistances = {},
}) {
  const event = conditionEndPlan([condition], {
    turnId: "web-manual",
    resistances: Object.entries(resistances).map(([type, value]) => ({
      type,
      value,
    })),
  }).events[0];
  if (!event) throw new Error("This condition does not deal HP damage.");
  if (lastWords || (hp === 0 && failed >= 3))
    return {
      amount: event.damage.total,
      hp,
      failedDeathRolls: failed,
      lastWords: true,
      woundRequired: false,
    };
  const state = survivalState({ hp, maxHp, marks: hp > 0 ? 0 : failed });
  const applied = sufferDamage(state, event.damage.total);
  return {
    amount: event.damage.total,
    hp: applied.state.hp,
    failedDeathRolls: applied.state.marks,
    lastWords: applied.state.status === "lastWords",
    woundRequired: applied.wound,
  };
}

export function workshopFavorites(character, draft, catalogs) {
  const records = new Map(catalogs.choices.map((r) => [r.id, r]));
  const selected = draft.play?.favorites ?? {},
    rows = new Map();
  const add = (id, item) => {
    const record = records.get(id);
    if (!record) return;
    const supply =
      item?.inventoryDie !== null && item?.inventoryDie !== undefined;
    const key = supply ? `${id}:${item.instanceId}` : id;
    if (rows.has(key)) {
      if (item) rows.get(key).sourceItems.push(item);
      return;
    }
    rows.set(key, {
      record,
      basic: Boolean(record.universal),
      visible: true,
      sourceItems: item ? [item] : [],
      ...(supply ? { inventoryInstance: item } : {}),
      favoriteRow: true,
    });
  };
  for (const id of selected.abilities ?? []) {
    if (character.state.abilities.includes(id) || records.get(id)?.universal)
      add(id);
  }
  for (const instance of selected.items ?? []) {
    const item = character.inventory.items.find(
      (i) => i.instanceId === instance,
    );
    if (!item) continue;
    const ids =
      item.catalogId === "item-ordinary-melee-weapon"
        ? [
            "ability-basic-melee",
            "ability-basic-throw",
            "ability-opportunity-attack",
          ]
        : item.catalogId === "item-ordinary-ranged-weapon"
          ? ["ability-basic-ranged"]
          : item.catalogId === "item-ordinary-shield"
            ? ["ability-shield-block"]
            : HEALING_POTION_IDS.includes(item.catalogId)
              ? ["ability-use-a-healing-potion"]
              : ["ability-handle-an-item"];
    for (const id of ids) add(id, item);
  }
  return [...rows.values()];
}
