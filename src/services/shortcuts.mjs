const ID = "heroes-of-legend";
const SHORTCUT_TYPES = new Set(["ability", "equipment"]);
const SHORTCUT_VERSION = 1;
const SCRIPT_MACRO = "script";

function localize(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/** A shortcut may only reference a live Item embedded in an Actor. */
export function isShortcutItem(item) {
  return Boolean(
    item?.documentName === "Item" &&
      SHORTCUT_TYPES.has(item.type) &&
      item.actor?.documentName === "Actor" &&
      item.actor.items?.get(item.id) === item,
  );
}

export function normalizeHotbarSlot(slot) {
  const value = Number(slot);
  if (!Number.isInteger(value) || value < 1 || value > 50)
    throw new Error("Choose a hotbar slot from 1 to 50.");
  return value;
}

/** The complete command is derived from the UUID; no dragged statistics are used. */
export function shortcutCommand(itemUuid) {
  if (typeof itemUuid !== "string" || !itemUuid)
    throw new TypeError("A shortcut needs a live Item UUID.");
  return `await game.heroesOfLegend.openItem(${JSON.stringify(itemUuid)});`;
}

export function shortcutProvenance(item) {
  if (!isShortcutItem(item))
    throw new Error("Choose a live HOL ability or equipment Item.");
  return Object.freeze({
    generator: "item-sheet-shortcut",
    version: SHORTCUT_VERSION,
    itemUuid: item.uuid,
    actorUuid: item.actor.uuid,
    itemId: item.id,
    itemType: item.type,
  });
}

/**
 * Validate both generated provenance and the exact command before reuse.
 * Matching flags alone never make a modified script trusted.
 */
export function isGeneratedShortcutMacro(macro, item) {
  if (
    !macro ||
    macro.type !== SCRIPT_MACRO ||
    macro.scope !== "global" ||
    !isShortcutItem(item)
  )
    return false;
  const expected = shortcutProvenance(item),
    actual = macro.getFlag?.(ID, "shortcut");
  return Boolean(
    actual &&
      actual.generator === expected.generator &&
      actual.version === expected.version &&
      actual.itemUuid === expected.itemUuid &&
      actual.actorUuid === expected.actorUuid &&
      actual.itemId === expected.itemId &&
      actual.itemType === expected.itemType &&
      macro.command === shortcutCommand(expected.itemUuid),
  );
}

async function resolveShortcutItem(itemUuid) {
  if (typeof itemUuid !== "string" || !itemUuid) return null;
  try {
    return await fromUuid(itemUuid);
  } catch {
    return null;
  }
}

/** Shared by row clicks and generated macros, so both use identical live-document checks. */
export async function openItemShortcut(itemUuid) {
  const item = await resolveShortcutItem(itemUuid);
  if (!isShortcutItem(item)) {
    ui.notifications.warn(localize("HOL.ShortcutSourceMissing"));
    return false;
  }
  if (!item.testUserPermission(game.user, "OBSERVER")) {
    ui.notifications.warn(localize("HOL.ShortcutSourceInaccessible"));
    return false;
  }
  await item.sheet.render({ force: true });
  return true;
}

/**
 * Create or reuse one generated Macro for an owned live Item and assign it to a slot.
 * This deliberately performs no Item creation, cloning, grant, payment or resource use.
 */
export async function addHotbarShortcut(itemUuid, slot) {
  const item = await resolveShortcutItem(itemUuid);
  if (!isShortcutItem(item))
    throw new Error(localize("HOL.ShortcutSourceMissing"));
  if (!item.actor.testUserPermission(game.user, "OWNER"))
    throw new Error(localize("HOL.ShortcutOwnerRequired"));
  const hotbarSlot = normalizeHotbarSlot(slot),
    expectedCommand = shortcutCommand(item.uuid),
    existing = game.macros.find(
      (macro) =>
        isGeneratedShortcutMacro(macro, item) &&
        macro.canUserExecute(game.user),
    );
  let macro = existing;
  if (!macro) {
    macro = await CONFIG.Macro.documentClass.create({
      name: item.name,
      type: SCRIPT_MACRO,
      scope: "global",
      img: item.img,
      command: expectedCommand,
      flags: {
        [ID]: {
          shortcut: { ...shortcutProvenance(item) },
        },
      },
    });
  }
  if (!macro) throw new Error(localize("HOL.ShortcutCreationFailed"));
  await game.user.assignHotbarMacro(macro, hotbarSlot);
  ui.notifications.info(
    localize("HOL.ShortcutReady", { name: item.name, slot: hotbarSlot }),
  );
  return { macro, reused: Boolean(existing) };
}

/**
 * Intercept only live HOL Items. Other documents return normally to native Hotbar handling.
 * Returning false synchronously prevents core from also creating its generic sheet toggle.
 */
export function registerItemShortcuts() {
  Hooks.on("hotbarDrop", (_hotbar, data, slot) => {
    if (data?.type !== "Item" || typeof data.uuid !== "string") return;
    let item;
    try {
      item = foundry.utils.fromUuidSync(data.uuid);
    } catch {
      return;
    }
    if (!isShortcutItem(item)) return;
    void addHotbarShortcut(item.uuid, slot).catch((error) => {
      ui.notifications.error(error.message);
    });
    return false;
  });
}

export const SHORTCUT_API = Object.freeze({
  openItem: openItemShortcut,
  addHotbarShortcut,
});
