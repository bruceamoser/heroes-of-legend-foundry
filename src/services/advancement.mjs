import {
  enqueueCharacterOperation,
  isCreationAuthority,
  buildCharacterItems,
  validateCreationChanges,
} from "./creation.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { awardMilestones } from "../rules/development.mjs";
import { advancementPreview } from "../rules/advancement.mjs";
const ID = "heroes-of-legend";
export function registerAdvancement() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "developmentRequest") && isCreationAuthority())
      resolveDevelopmentRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Development needs attention: ${foundry.utils.escapeHTML(error.message)}`,
        });
      });
  });
}
export function currentDevelopment(actor) {
  const state = structuredClone(actor.getFlag(ID, "development"));
  if (!state) throw new Error("Complete character creation first.");
  state.gritGranted = actor.system.grit.granted;
  state.gritSpent = actor.system.grit.spent;
  state.items = actor.items
    .filter((i) => i.type === "equipment")
    .map((i) => ({
      instanceId: i.id,
      catalogId: i.system.catalogId,
      quantity: i.system.quantity,
      hands: i.system.hands,
      inventoryDie: i.system.inventoryDie,
    }));
  return state;
}
export async function requestDevelopment(actor, kind, payload = {}) {
  if (!actor.isOwner) throw new Error("You must own this character.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("A GM must enable character processing first.");
  return ChatMessage.create({
    content: "Character development requested.",
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: { developmentRequest: { actorUuid: actor.uuid, kind, ...payload } },
    },
  });
}
export function resolveDevelopmentRequest(id) {
  return enqueueCharacterOperation(() => apply(id));
}
async function apply(id) {
  if (!isCreationAuthority()) return { status: "not-authority" };
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "developmentRequest");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.type !== "character" ||
    actor.isToken ||
    actor.pack ||
    !message.author ||
    !actor.testUserPermission(message.author, "OWNER")
  )
    throw new Error("Unauthorized character development request.");
  const current = currentDevelopment(actor),
    changes = {};
  let state,
    createdIds = [];
  if (["award", "safePlace"].includes(request.kind)) {
    if (!message.author.isGM)
      throw new Error("The DA must award milestones and approve a safe place.");
    if (request.kind === "award") {
      if (!Number.isSafeInteger(request.level) || request.level < 1)
        throw new Error("Invalid milestone level.");
      if (request.level <= current.level) return { status: "already-awarded" };
      state = awardMilestones(current, request.level);
      changes["system.grit.granted"] = state.gritGranted;
    } else {
      if (typeof request.approved !== "boolean")
        throw new Error("Invalid safe-place decision.");
      if (current.safePlace === request.approved)
        return { status: "unchanged" };
      state = { ...current, safePlace: request.approved };
    }
  } else if (request.kind === "commitDraft") {
    if (
      !/^[A-Za-z0-9]{16}$/.test(request.draftId ?? "") ||
      !Number.isSafeInteger(request.revision) ||
      request.revision < 1
    )
      throw new Error("Invalid draft identity.");
    const receipt = current.commitReceipts?.[request.draftId];
    if (receipt) {
      if (receipt.status !== "complete") {
        if (receipt.createdIds.some((id) => !actor.items.has(id)))
          throw new Error(
            "Development needs Item reconciliation; do not repeat grants.",
          );
        await actor.update({
          [`flags.${ID}.development.commitReceipts.${request.draftId}.status`]:
            "complete",
        });
      }
      return { status: "complete", replay: true };
    }
    const draft = actor.getFlag(ID, "advancementDraft");
    if (
      !draft ||
      draft.id !== request.draftId ||
      draft.revision !== request.revision ||
      draft.baseRevision !== (current.revision ?? 0)
    )
      throw new Error(
        "Development changed. Review the current ledger before committing.",
      );
    const catalogs = await loadCatalogs();
    if (draft.sourceCommit !== catalogs.commit)
      throw new Error("Review the current book baseline before committing.");
    const preview = advancementPreview(
      current,
      draft.data,
      catalogs.choices,
      catalogs.inventory,
    );
    if (!preview.valid)
      throw new Error("The advancement draft has unresolved choices.");
    state = preview.state;
    const newInventory = state.items.filter(
      (i) => !current.items.some((old) => old.instanceId === i.instanceId),
    );
    const plan = buildCharacterItems(
      actor,
      state.abilities,
      newInventory,
      catalogs,
    );
    changes.items = plan.items;
    createdIds = plan.createdIds;
    changes["system.health.baseMax"] =
      actor.system.health.baseMax + preview.maximumHpDelta;
    changes["system.grit.granted"] =
      actor.system.grit.granted + preview.gritDelta;
    state.ledger = [
      ...(current.ledger ?? []),
      ...preview.ledger.map((entry) => ({ ...entry, operationId: message.id })),
    ];
    state.commitReceipts = {
      ...(state.commitReceipts ?? {}),
      [draft.id]: {
        status: "pending-verification",
        requestId: message.id,
        revision: draft.revision,
        createdIds,
      },
    };
  } else throw new Error("Unknown development operation.");
  state.revision = (current.revision ?? 0) + 1;
  changes[`flags.${ID}.development`] = state;
  validateCreationChanges(actor, changes);
  if (!isCreationAuthority()) return { status: "authority-lost" };
  if (
    (actor.getFlag(ID, "development")?.revision ?? 0) !==
    (current.revision ?? 0)
  )
    throw new Error(
      "Development changed during review. Retry against its current revision.",
    );
  await actor.update(changes);
  if (request.kind === "commitDraft") {
    if (createdIds.some((id) => !actor.items.has(id)))
      throw new Error(
        "Development needs Item reconciliation; do not repeat grants.",
      );
    await actor.update({
      [`flags.${ID}.development.commitReceipts.${request.draftId}.status`]:
        "complete",
    });
  }
  await message.update({
    content:
      "Character development completed. Review the updated character sheet.",
  });
  return { status: "complete", replay: false };
}
