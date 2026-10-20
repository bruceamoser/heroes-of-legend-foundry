import { assertNoPendingTurn } from "./turn-lock.mjs";
const ID = "heroes-of-legend";

function assertInventoryOwner(actor) {
  if (actor?.documentName !== "Actor" || actor.pack || !actor.id ||
      !actor.testUserPermission(game.user, "OWNER"))
    throw new Error("Only this character's owner can edit equipment.");
}

/** Intentional catalog/world copy; an Actor-owned Item requires a separate move. */
export async function copyEquipmentToActor(actor, sourceUuid, {quantity} = {}) {
  assertInventoryOwner(actor);
  const source = typeof sourceUuid === "string" ? await fromUuid(sourceUuid) : null;
  if (source?.documentName !== "Item" || source.type !== "equipment" || source.uuid !== sourceUuid)
    throw new Error("Choose equipment from a compendium or world Item.");
  if (source.actor || source.parent?.documentName === "Actor")
    throw new Error("Use an explicit transfer or arrange the move manually with the DA. This drop will not clone another character's equipment.");
  if (!source.testUserPermission(game.user, "OBSERVER"))
    throw new Error("This equipment source is not readable.");
  const data = source.inCompendium
    ? game.items.fromCompendium(source, { clearFolder: true, keepId: false })
    : source.toObject();
  if (quantity !== undefined) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error("Choose a whole quantity from 1 to 10,000.");
    data.system.quantity = quantity;
  }
  // The native embedded Item receives a new identity and inherits its Actor's access.
  delete data._id;
  delete data.parent;
  delete data.folder;
  delete data.ownership;
  data.flags ??= {};
  data.flags[ID] ??= {};
  data.flags[ID].copySourceUuid = source.uuid;
  assertInventoryOwner(actor);
  const created = await Item.implementation.create(data, { parent: actor });
  if (!created || created.actor?.uuid !== actor.uuid)
    throw new Error("The equipment was not added to this character.");
  return created;
}

/** Click alternative to a native inventory drop; actual permissions are rechecked on copy. */
export async function equipmentCopyOptions() {
  const options = [...game.items]
    .filter(item => item.type === "equipment" && !item.actor && item.testUserPermission(game.user, "OBSERVER"))
    .map(item => ({ uuid: item.uuid, name: `World — ${item.name}` }));
  const pack = game.packs.get(`${ID}.equipment`);
  if (pack?.visible) {
    const index = await pack.getIndex({ fields: ["type"] });
    for (const entry of index)
      if (entry.type === "equipment")
        options.push({ uuid: entry.uuid ?? pack.getUuid(entry._id), name: `Equipment catalog — ${entry.name}` });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeEquipmentFromActor(actor, itemId) {
  assertInventoryOwner(actor);
  assertNoPendingTurn(actor);
  const item = actor.items.get(itemId);
  if (item?.type !== "equipment" || item.actor?.uuid !== actor.uuid) throw new Error("That equipment is no longer owned by this character.");
  const {inventoryActorTargets}=await import("./inventory.mjs");
  for (const host of [...game.combats,...inventoryActorTargets()]) {
    const operationId=host.getFlag(ID,"pendingPotion"),operation=host.getFlag(ID,"potionOperations")?.[operationId];
    if (operationId && operation?.giver?.actorUuid === actor.uuid) throw new Error("Finish the pending healing-potion use before deleting equipment.");
  }
  for (const key of ["pendingCrafting","pendingPotion","pendingDamage","pendingInventory"])
    if (actor.getFlag(ID,key)) throw new Error("Finish the pending character operation before deleting equipment.");
  return actor.deleteEmbeddedDocuments("Item",[itemId]);
}
