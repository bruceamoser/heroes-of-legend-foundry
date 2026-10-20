import { assertNoPendingTurn } from "./turn-lock.mjs";
import { handLayout } from "../rules/hands.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
const ID = "heroes-of-legend";
export function equipmentBasis(actor) {
  return {
    revision: actor.getFlag(ID, "equipmentRevision") ?? 0,
    capacity: actor.getFlag(ID, "handCapacity") ?? 2,
    items: actor.items
      .filter((i) => i.type === "equipment")
      .map((i) => ({
        id: i.id,
        catalogId: i.system.catalogId,
        source: structuredClone(i.getFlag(ID, "source") ?? null),
        hands: i.system.hands,
        held: i.system.held,
        worn: i.system.worn,
        quantity: i.system.quantity,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    encounters: game.combats
      .filter((c) =>
        c
          .getFlag(ID, "encounter")
          ?.roster.some(
            (r) =>
              !r.withdrawn &&
              c.combatants.get(r.id)?.actor?.uuid === actor.uuid,
          ),
      )
      .map((c) => c.uuid)
      .sort(),
  };
}
export async function requestEquipment(
  actor,
  basis,
  items,
  capacity,
  reason = "",
) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  return ChatMessage.create({
    content: "Hand arrangement requested.",
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: {
        equipmentRequest: {
          actorUuid: actor.uuid,
          basis,
          items,
          capacity,
          reason,
        },
      },
    },
  });
}
export function resolveEquipmentRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "equipmentRequest");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.documentName !== "Actor" ||
    actor.pack ||
    !message.author ||
    !actor.testUserPermission(message.author, "OWNER")
  )
    throw new Error(
      "Only an owner or the DA can prepare this actor's equipment.",
    );
  const signature = JSON.stringify(request),
    prior = actor.getFlag(ID, "operationReceipts")?.[id];
  if (prior?.applied) {
    if (prior.request !== signature || prior.authorId !== message.author.id)
      throw new Error("The completed equipment request was changed.");
    return { status: "complete", replay: true };
  }
  assertNoPendingTurn(actor);
  const basis = equipmentBasis(actor);
  if (JSON.stringify(basis) !== JSON.stringify(request.basis))
    throw new Error(
      "Equipment or encounter state changed. Review the current arrangement.",
    );
  if (request.capacity !== basis.capacity) {
    if (!message.author.isGM)
      throw new Error(
        "Anatomy changes require the DA.",
      );
  }
  if (
    !Array.isArray(request.items) ||
    request.items.length !== basis.items.length ||
    request.items.some(
      (i) =>
        !basis.items.some((b) => b.id === i.id) ||
        typeof i.worn !== "boolean",
    )
  )
    throw new Error(
      "The arrangement must include every owned equipment item exactly once.",
    );
  handLayout(request.items.map(item => ({ ...item, quantity: basis.items.find(current => current.id === item.id).quantity })), request.capacity);
  const items = actor.toObject().items;
  for (const item of items) {
    const state = request.items.find((i) => i.id === item._id);
    if (state) {
      item.system.hands = state.hands;
      item.system.held = state.held;
      item.system.worn = state.worn;
    }
    const native = new CONFIG.Item.documentClass(item, {
      parent: actor,
      strict: true,
    });
    native.validate({ strict: true, fallback: false });
  }
  const changes = {
    items,
    [`flags.${ID}.handCapacity`]: request.capacity,
    [`flags.${ID}.equipmentRevision`]: basis.revision + 1,
    [`flags.${ID}.operationReceipts.${id}`]: {
      applied: true,
      authorId: message.author.id,
      request: signature,
    },
  };
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(actor, changes);
  for (const expected of request.items) {
    const actual = actor.items.get(expected.id)?.system;
    if (
      !actual ||
      actual.hands !== expected.hands ||
      actual.held !== expected.held ||
      actual.worn !== expected.worn
    )
      throw new Error(
        "Equipment needs reconciliation; do not repeat the change.",
      );
  }
  await message.update({
    content: "Equipment arrangement recorded.",
  });
  return { status: "complete", replay: false };
}
export function registerEquipmentRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "equipmentRequest") && isCreationAuthority())
      resolveEquipmentRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Equipment needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
