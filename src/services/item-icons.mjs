import { itemIconForData } from "../rules/item-icons.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { updateOwnedDocument } from "./documents.mjs";

/** Cosmetic upgrade of core defaults only; chosen artwork and compendiums are untouched. */
export async function refreshDefaultItemIcons(documents, catalogs) {
  let updated = 0;
  for (const item of documents) {
    if (item.pack || !item.id || !item.testUserPermission(game.user, "OWNER")) continue;
    const img = itemIconForData(item.toObject(), catalogs);
    if (!img || img === item.img) continue;
    await updateOwnedDocument(item, { img });
    updated++;
  }
  return updated;
}
export function registerItemIcons() {
  let catalogs;
  Hooks.on("preCreateItem", (document, data) => {
    const img = itemIconForData({ ...document.toObject(), ...data }, catalogs);
    if (img) document.updateSource({ img });
  });
  Hooks.once("ready", async () => {
    try {
      catalogs = await loadCatalogs();
      // One elected GM upgrades existing defaults. Without a GM, an owner can
      // update only their readable world/embedded Items through normal permissions.
      if (game.users.activeGM && !game.users.activeGM.isSelf) return;
      const items = new Map();
      const add = item => items.set(item.uuid, item);
      for (const item of game.items) add(item);
      for (const actor of game.actors) for (const item of actor.items) add(item);
      for (const scene of game.scenes) for (const token of scene.tokens) {
        if (!token.actor || token.actorLink) continue;
        for (const item of token.actor.items) add(item);
      }
      await refreshDefaultItemIcons(items.values(), catalogs);
    } catch (error) {
      console.warn("heroes-of-legend | Default item artwork could not be refreshed", error);
    }
  });
}
