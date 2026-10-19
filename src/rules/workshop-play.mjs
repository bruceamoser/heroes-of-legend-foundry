import { WOUND_TABLES } from "./damage.mjs";
import { woundRoll } from "./wounds.mjs";
import {
  CONDITION_KINDS,
  conditionSummary,
  validateContributions,
} from "./conditions.mjs";

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 200) =>
  typeof value === "string" && value.length <= max;
const instance = (value) => text(value) && /^[a-z0-9:-]{1,200}$/.test(value);
const list = (value, max = 500) => Array.isArray(value) && value.length <= max;

/** Explicit play edits stay separate from acquisition and creation receipts. */
export function normalizeWorkshopPlay(value, catalogs) {
  const fail = () => {
    throw new Error("The character file contains malformed play controls.");
  };
  if (!object(value)) fail();
  const result = {
    inventory: { added: [], removed: [] },
    languages: { added: [], removed: [] },
    conditions: [],
  };
  for (const key of ["hp", "failedDeathRolls"]) {
    if (value[key] !== undefined) {
      if (
        !Number.isSafeInteger(value[key]) ||
        value[key] < 0 ||
        value[key] > (key === "failedDeathRolls" ? 3 : 1000000)
      )
        fail();
      result[key] = value[key];
    }
  }
  if (value.gritSpent !== undefined) {
    if (
      !Number.isSafeInteger(value.gritSpent) ||
      value.gritSpent < 0 ||
      value.gritSpent > 10000
    )
      fail();
    result.gritSpent = value.gritSpent;
  }
  if (value.lastWords !== undefined) {
    if (typeof value.lastWords !== "boolean") fail();
    result.lastWords = value.lastWords;
  }
  if (value.collapsed !== undefined) {
    if (
      !object(value.collapsed) ||
      Object.keys(value.collapsed).length > 100 ||
      Object.entries(value.collapsed).some(
        ([k, v]) => !instance(k) || typeof v !== "boolean",
      )
    )
      fail();
    result.collapsed = Object.fromEntries(Object.entries(value.collapsed));
  }
  if (value.favorites !== undefined) {
    if (!object(value.favorites)) fail();
    result.favorites = {};
    for (const key of ["abilities", "items"]) {
      const values = value.favorites[key] ?? [];
      if (!list(values, 1000) || !values.every(instance)) fail();
      result.favorites[key] = [...new Set(values)];
    }
  }
  if (value.wounds !== undefined) {
    if (
      !list(value.wounds, 100) ||
      value.wounds.some(
        (w) =>
          !object(w) ||
          !instance(w.id) ||
          !text(w.name, 200) ||
          !w.name.trim() ||
          !text(w.notes, 2000),
      ) ||
      new Set(value.wounds.map((w) => w.id)).size !== value.wounds.length
    )
      fail();
    result.wounds = value.wounds.map((w) => {
      const next = { id: w.id, name: w.name.trim(), notes: w.notes };
      if (w.progress !== undefined) {
        if (
          !Number.isSafeInteger(w.progress) ||
          w.progress < 0 ||
          w.progress > 1000000
        )
          fail();
        next.progress = w.progress;
      }
      if (w.catalogId !== undefined) {
        if (
          !text(w.catalogId) ||
          !/^wound-(physical|elemental|mental|radiant|life)-[1-6]{3}$/.test(
            w.catalogId,
          ) ||
          ![
            "physical",
            "fire",
            "cold",
            "lightning",
            "mental",
            "radiant",
            "life",
          ].includes(w.damageType) ||
          !object(w.roll) ||
          !Number.isSafeInteger(w.roll.priorWounds) ||
          w.roll.priorWounds < 0 ||
          w.roll.priorWounds > 100
        )
          fail();
        const roll = woundRoll(w.roll.priorWounds, w.roll.faces);
        if (
          roll.key !== w.roll.key ||
          w.catalogId !== `wound-${WOUND_TABLES[w.damageType]}-${roll.key}`
        )
          fail();
        Object.assign(next, {
          catalogId: w.catalogId,
          damageType: w.damageType,
          roll: {
            priorWounds: w.roll.priorWounds,
            faces: [...w.roll.faces],
            key: roll.key,
          },
        });
      }
      return next;
    });
  }
  if (value.memorizedMessage !== undefined) {
    if (
      !text(value.memorizedMessage, 5000) ||
      value.memorizedMessage.trim().split(/\s+/).filter(Boolean).length > 50
    )
      fail();
    result.memorizedMessage = value.memorizedMessage;
  }
  if (value.inventory !== undefined) {
    const inv = value.inventory;
    if (
      !object(inv) ||
      !list(inv.added) ||
      !list(inv.removed) ||
      !inv.removed.every(instance)
    )
      fail();
    if (inv.overrides !== undefined) {
      if (!object(inv.overrides) || Object.keys(inv.overrides).length > 1000)
        fail();
      result.inventory.overrides = Object.fromEntries(
        Object.entries(inv.overrides).map(([id, v]) => {
          if (
            !instance(id) ||
            !object(v) ||
            Object.keys(v).some(
              (k) => !["quantity", "inventoryDie"].includes(k),
            )
          )
            fail();
          const next = {};
          if (v.quantity !== undefined) {
            if (
              !Number.isSafeInteger(v.quantity) ||
              v.quantity < 0 ||
              v.quantity > 10000
            )
              fail();
            next.quantity = v.quantity;
          }
          if (v.inventoryDie !== undefined) {
            if (![0, 4, 6, 8, 10, 12, 20].includes(v.inventoryDie)) fail();
            next.inventoryDie = v.inventoryDie;
          }
          return [id, next];
        }),
      );
    }
    const seen = new Set();
    result.inventory.removed = [...new Set(inv.removed)];
    result.inventory.added = inv.added.map((item) => {
      if (
        !object(item) ||
        !text(item.instanceId, 90) ||
        !/^inventory-[a-z0-9-]+$/.test(item.instanceId) ||
        seen.has(item.instanceId) ||
        !catalogs.inventory.equipment.some((r) => r.id === item.id) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 10000
      )
        fail();
      seen.add(item.instanceId);
      return {
        instanceId: item.instanceId,
        id: item.id,
        quantity: item.quantity,
      };
    });
  }
  if (value.languages !== undefined) {
    const langs = value.languages;
    if (
      !object(langs) ||
      !list(langs.added, 100) ||
      !list(langs.removed, 100) ||
      !langs.removed.every((id) => text(id, 80))
    )
      fail();
    result.languages.removed = [...new Set(langs.removed)];
    const ids = new Set();
    result.languages.added = langs.added.map((lang) => {
      if (
        !object(lang) ||
        !text(lang.id, 80) ||
        !/^[a-z0-9-]+$/.test(lang.id) ||
        ids.has(lang.id) ||
        !text(lang.name, 80) ||
        !lang.name.trim() ||
        !["spoken", "signed"].includes(lang.form) ||
        typeof lang.written !== "boolean"
      )
        fail();
      ids.add(lang.id);
      return {
        id: lang.id,
        name: lang.name.trim(),
        form: lang.form,
        written: lang.written,
      };
    });
  }
  if (value.conditions !== undefined) {
    if (!list(value.conditions, 100)) fail();
    result.conditions = value.conditions.map((c) => {
      if (
        !object(c) ||
        !text(c.id, 80) ||
        !text(c.source, 200) ||
        !Object.hasOwn(CONDITION_KINDS, c.key) ||
        !Number.isSafeInteger(c.rating) ||
        c.rating > 10000
      )
        fail();
      return {
        id: c.id,
        key: c.key,
        source: c.source,
        rating: c.rating,
        persistence: c.persistence,
      };
    });
    validateContributions(result.conditions);
  }
  return result;
}

export function itemArrangement(previous, prop, value) {
  if (!["carried", "held", "worn"].includes(prop) || typeof value !== "boolean")
    throw new Error("Choose a carried, held or worn state.");
  const next = {
    carried: previous?.carried ?? true,
    held: previous?.held ?? false,
    worn: previous?.worn ?? false,
    [prop]: value,
  };
  if (prop === "carried" && !value) {
    next.held = false;
    next.worn = false;
  } else if (value && ["held", "worn"].includes(prop)) next.carried = true;
  return next;
}

export function workshopPlay(draft, inventoryItems, languages, catalogs) {
  const play = normalizeWorkshopPlay(draft.play ?? {}, catalogs);
  const inventory = [
    ...inventoryItems,
    ...play.inventory.added.map((item) => {
      const def = catalogs.inventory.equipment.find((r) => r.id === item.id);
      return {
        instanceId: item.instanceId,
        catalogId: item.id,
        quantity: item.quantity,
        hands: def.handChoices[0] ?? 0,
        inventoryDie: def.inventoryDie,
        source: "play",
      };
    }),
  ]
    .filter((item) => !play.inventory.removed.includes(item.instanceId))
    .map((item) => ({
      ...item,
      ...play.inventory.overrides?.[item.instanceId],
    }));
  const known = new Map(
    languages.map((lang) => [lang.id, structuredClone(lang)]),
  );
  for (const lang of play.languages.added)
    known.set(lang.id, {
      id: lang.id,
      name: lang.name,
      form: lang.form,
      source: "play",
      permissions: {
        understand: true,
        express: true,
        speak: lang.form === "spoken",
        sign: lang.form === "signed",
        read: lang.written,
        write: lang.written,
      },
    });
  for (const id of play.languages.removed) known.delete(id);
  return {
    inventory,
    languages: [...known.values()],
    conditions: play.conditions,
    conditionSummary: conditionSummary(play.conditions),
  };
}
