import { loadCatalogs } from "./catalog.mjs";
import { creationPreview } from "../rules/creation.mjs";
const ID = "heroes-of-legend";
let queue = Promise.resolve();
export function registerCreationAuthority() {
  game.settings.register(ID, "creationAuthorityClient", {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "creationRequest") && isCreationAuthority())
      resolveCreationRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Character creation needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
export function isCreationAuthority() {
  return (
    game.user.isGM &&
    game.socket.connected &&
    game.settings.get(ID, "creationAuthorityClient") === game.socket.id
  );
}
/** Binding is deliberate and fail-closed. A different binding is never silently replaced. */
export async function bindCreationAuthority() {
  if (!game.user.isGM)
    throw new Error("Only a GM can process character creation.");
  const bound = game.settings.get(ID, "creationAuthorityClient");
  if (bound && bound !== game.socket.id)
    throw new Error(
      "Character creation is bound to another GM window. Reconcile outstanding requests before explicitly resetting that binding.",
    );
  await game.settings.set(ID, "creationAuthorityClient", game.socket.id);
}
export async function requestCreation(actor, revision) {
  if (!actor.testUserPermission(game.user, "OWNER"))
    throw new Error("You must own the character.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error(
      "A GM must enable character processing in their creation window first.",
    );
  return ChatMessage.create({
    content:
      "Character creation requested. The assigned GM window will validate and commit the saved draft.",
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: { [ID]: { creationRequest: { actorUuid: actor.uuid, revision } } },
  });
}
export function enqueueCharacterOperation(operation) {
  const job = queue.then(operation);
  queue = job.catch(() => {});
  return job;
}
export function resolveCreationRequest(messageId) {
  return enqueueCharacterOperation(() => applyCreation(messageId));
}
export function validateCreationChanges(actor, changes) {
  for (const data of changes.items ?? []) {
    const item = new Item(data, { parent: actor, strict: true });
    item.validate({ strict: true, fallback: false });
  }
  actor.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
}
async function applyCreation(messageId) {
  if (!isCreationAuthority()) return { status: "not-authority" };
  const message = game.messages.get(messageId),
    request = message?.getFlag(ID, "creationRequest");
  if (
    !request ||
    typeof request.actorUuid !== "string" ||
    !Number.isSafeInteger(request.revision) ||
    request.revision < 1
  )
    throw new Error("Invalid creation request.");
  const actor = await fromUuid(request.actorUuid);
  if (
    actor?.documentName !== "Actor" ||
    actor.type !== "character" ||
    actor.isToken ||
    actor.pack
  )
    throw new Error("Creation requires a world character.");
  if (!message.author || !actor.testUserPermission(message.author, "OWNER"))
    throw new Error("The request author does not own this character.");
  const receipt = actor.getFlag(ID, "creationReceipt");
  if (receipt) {
    if (receipt.revision !== request.revision)
      throw new Error(
        "Character creation is already complete. Use advancement or a DA correction.",
      );
    if (receipt.status !== "complete") {
      if (receipt.createdIds.some((id) => !actor.items.has(id)))
        throw new Error(
          "Creation needs reconciliation: a committed Item is unavailable. Do not repeat grants.",
        );
      await actor.update({
        [`flags.${ID}.creationReceipt.status`]: "complete",
      });
    }
    return { status: "complete", replay: true };
  }
  const saved = actor.getFlag(ID, "creationDraft");
  if (saved?.revision !== request.revision)
    throw new Error(
      "The draft changed. Review and submit its latest revision.",
    );
  const { choices, inventory, commit } = await loadCatalogs();
  if (saved.sourceCommit !== commit)
    throw new Error(
      "The book baseline changed or was not recorded. Review and save the draft before committing.",
    );
  const preview = creationPreview(saved.data, choices, inventory);
  if (!preview.valid)
    throw new Error(
      "The creation draft has unresolved choices. Return to Review.",
    );
  const { items, createdIds, reusedIds } = buildCharacterItems(
    actor,
    [
      ...preview.state.abilities,
      ...choices
        .filter((r) => r.kind === "ability" && r.universal)
        .map((r) => r.id),
    ],
    preview.inventory.items,
    { choices, inventory, commit, grantKind: "creation" },
  );
  const state = {
    ...preview.state,
    level: 1,
    stage: "advancement",
    dp: 0,
    sourceCommit: commit,
    creation: structuredClone(saved.data),
    creationSummary: preview.summary,
    ledger: preview.ledger,
    coins: preview.inventory.remainingCoins,
  };
  const changes = {
    name: saved.data.name.trim(),
    items,
    "system.health.baseMax": preview.summary.maximumHp,
    "system.health.value": preview.summary.maximumHp,
    "system.grit.granted": preview.summary.gritGranted,
    "system.grit.spent": 0,
    [`flags.${ID}.development`]: state,
    [`flags.${ID}.creationReceipt`]: {
      status: "pending-verification",
      revision: request.revision,
      requestId: message.id,
      sourceCommit: commit,
      createdIds,
      reusedIds,
    },
  };
  for (const [key, value] of Object.entries(preview.summary.creationAttributes))
    changes[`system.attributes.${key}.base`] = value;
  // One Actor update carries nested Items, statistics and the receipt. No separate item grant calls.
  if (!isCreationAuthority()) return { status: "authority-lost" };
  if (actor.getFlag(ID, "creationDraft")?.revision !== request.revision)
    throw new Error("Draft changed during validation. Review and retry.");
  validateCreationChanges(actor, changes);
  await actor.update(changes);
  if (createdIds.some((id) => !actor.items.has(id)))
    throw new Error(
      "Creation needs reconciliation: a committed Item is unavailable. Do not repeat grants.",
    );
  await actor.update({ [`flags.${ID}.creationReceipt.status`]: "complete" });
  await message.update({
    content:
      "Character creation completed. The character sheet now contains the approved statistics and granted equipment.",
  });
  return { status: "complete", replay: false };
}

export function buildCharacterItems(
  actor,
  abilityIds,
  inventoryItems,
  { choices, inventory, commit, grantKind = "advancement" },
) {
  const items = actor.toObject().items ?? [];
  const createdIds = [],
    reusedIds = [];
  const add = (data) => {
    const id = foundry.utils.randomID();
    createdIds.push(id);
    items.push({ _id: id, ...data });
  };
  for (const id of new Set([...abilityIds])) {
    const existing = actor.items.find(
      (i) => i.type === "ability" && i.getFlag(ID, "catalogId") === id,
    );
    if (existing) {
      reusedIds.push(existing.id);
      continue;
    }
    const record = choices.find((r) => r.id === id);
    add({
      name: record.name,
      type: "ability",
      system: {
        description: `Rules: https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${record.source.path}\nAction automation is pending.`,
      },
      flags: {
        [ID]: {
          catalogId: id,
          source: record.source,
          automation: "pending",
          creationGrant: grantKind === "creation",
          grantKind,
        },
      },
    });
  }
  for (const item of inventoryItems) {
    const existing = actor.items.find(
      (i) =>
        i.type === "equipment" &&
        i.system.catalogId === item.catalogId &&
        (item.source !== "creation" || i.system.worn),
    );
    if (item.source !== "coins" && existing) {
      reusedIds.push(existing.id);
      continue;
    }
    const def = inventory.equipment.find((r) => r.id === item.catalogId);
    add({
      name: def.name,
      type: "equipment",
      system: {
        catalogId: def.id,
        quantity: item.quantity,
        bulk: def.bulk,
        hands: item.hands ?? 0,
        inventoryDie: item.inventoryDie ?? 0,
        worn: item.instanceId === "creation-outfit",
      },
      flags: {
        [ID]: {
          source: def.source,
          creationGrant: grantKind === "creation",
          grantKind,
          acquisitionInstance: item.instanceId,
        },
      },
    });
  }
  return { items, createdIds, reusedIds };
}
