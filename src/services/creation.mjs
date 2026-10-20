import {
  registerAuthority,
  ensureAuthorityReady,
  writeCharacterActor,
  isCreationAuthority,
  bindCreationAuthority,
  enqueueCharacterOperation,
} from "./authority.mjs";
export {
  isCreationAuthority,
  bindCreationAuthority,
  enqueueCharacterOperation,
} from "./authority.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { getCampaignLanguageConfiguration } from "./languages.mjs";
import { workshopCharacter } from "../rules/workshop-character.mjs";
import { nativePlayEffects } from "../rules/native-play-import.mjs";
import { importedCharacterState } from "../rules/native-character-state.mjs";
import {
  abilityItemSource,
  equipmentItemSource,
} from "../rules/item-construction.mjs";
const ID = "heroes-of-legend";
export function registerCreationAuthority() {
  registerAuthority();
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "creationRequest") && isCreationAuthority())
      resolveCreationRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Character creation needs attention: ${foundry.utils.escapeHTML(error.message)}`,
          [`flags.${ID}.creationFailure`]: error.message,
        });
      });
  });
}
export async function requestCreation(actor, revision) {
  if (!actor.testUserPermission(game.user, "OWNER"))
    throw new Error("You must own the character.");
  await ensureAuthorityReady();
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
/** Wait for the authoritative document receipt, never for request dispatch alone. */
export async function waitForCreation(actor, requestId, revision, { timeout = 30000, interval = 100 } = {}) {
  const start = Date.now();
  while (true) {
    const receipt = actor.getFlag(ID, "creationReceipt");
    if (receipt?.requestId === requestId && receipt.revision === revision && receipt.status === "complete") return receipt;
    const failure = game.messages.get(requestId)?.getFlag(ID, "creationFailure");
    if (failure) throw new Error(failure);
    if (Date.now() - start >= timeout) throw new Error("Character processing has not completed. Your draft is saved; keep this window open and check that the GM automation coordinator is online before retrying.");
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
export function resolveCreationRequest(messageId) {
  return enqueueCharacterOperation(() => applyCreation(messageId), {
    requestId: messageId,
  });
}
export function validateCreationChanges(actor, changes) {
  for (const data of changes.items ?? []) {
    const item = new Item(data, { parent: actor, strict: true });
    item.validate({ strict: true, fallback: false });
  }
  for (const data of changes.effects ?? []) {
    const effect = new foundry.documents.ActiveEffect(data, { parent: actor, strict: true });
    effect.validate({ strict: true, fallback: false });
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
      if (receipt.createdIds.some((id) => !actor.items.has(id)) || (receipt.createdEffectIds ?? []).some(id => !actor.effects.has(id)))
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
  if (typeof saved.languageBasis !== "string" || !saved.languageBasis)
    throw new Error(
      "The draft does not record its campaign language configuration. Review and save the draft before committing.",
    );
  const { choices, inventory, commit } = await loadCatalogs();
  if (saved.sourceCommit !== commit)
    throw new Error(
      "The book baseline changed or was not recorded. Review and save the draft before committing.",
    );
  const languages = getCampaignLanguageConfiguration();
  if (saved.languageBasis !== languages.basis)
    throw new Error(
      "Campaign language settings changed after review. Review and save the draft again before committing.",
    );
  const preview = workshopCharacter(saved.data, { choices, inventory, commit }, languages.definitions);
  if (!preview.valid)
    throw new Error(
      "The creation draft has unresolved choices. Return to Review.",
    );
  const { items, createdIds, reusedIds, instanceIds } = buildCharacterItems(
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
    level: preview.state.level,
    stage: "advancement",
    // Web planning approval is not campaign authority to spend banked DP.
    safePlace: preview.state.level > 1 ? false : preview.state.safePlace,
    dp: preview.state.dp,
    sourceCommit: commit,
    creation: structuredClone(saved.data),
    creationSummary: preview.creation.summary,
    languages: preview.play.languages,
    ledger: [...preview.ledger, ...preview.advancementLedger],
    coins: preview.inventory.remainingCoins,
  };
  const changes = {
    [`flags.${ID}.operationReceipts.${message.id}`]: {
      applied: true,
      kind: "creation",
    },
    name: saved.data.name.trim(),
    items,
    "system.health.baseMax": preview.summary.maximumHp,
    "system.health.value": Math.min(preview.summary.maximumHp, saved.data.play?.hp ?? preview.summary.maximumHp),
    "system.grit.granted": preview.summary.gritGranted,
    "system.grit.spent": Math.min(preview.summary.gritGranted, saved.data.play?.gritSpent ?? 0),
    "system.biography": saved.data.profile?.story ?? "",
    "system.memorizedMessage": saved.data.play?.memorizedMessage ?? "",
    [`flags.${ID}.development`]: state,
    [`flags.${ID}.creationReceipt`]: {
      status: "pending-verification",
      revision: request.revision,
      requestId: message.id,
      sourceCommit: commit,
      languageBasis: languages.basis,
      createdIds,
      reusedIds,
    },
  };
  let woundsCatalog;
  if (saved.data.play?.wounds?.some(wound => wound.catalogId)) {
    const response = await fetch("systems/heroes-of-legend/data/wounds.json");
    if (!response.ok) throw new Error("Cannot load the wound catalog required by this character.");
    woundsCatalog = await response.json();
  }
  const effects = nativePlayEffects(saved.data, {choices, inventory, commit}, {randomID: () => foundry.utils.randomID(), woundsCatalog});
  changes.effects = [...(actor.toObject().effects ?? []), ...effects.effects];
  changes[`flags.${ID}.wounds`] = {...(actor.getFlag(ID, "wounds") ?? {}), ...effects.wounds};
  changes[`flags.${ID}.creationReceipt`].createdEffectIds = effects.effects.map(effect => effect._id);
  const imported = importedCharacterState(saved.data, preview, items, instanceIds);
  Object.assign(changes, imported);
  for (const [key, value] of Object.entries(preview.summary.creationAttributes))
    changes[`system.attributes.${key}.base`] = value;
  // One Actor update carries nested Items, statistics and the receipt. No separate item grant calls.
  if (!isCreationAuthority()) return { status: "authority-lost" };
  if (getCampaignLanguageConfiguration().basis !== languages.basis)
    throw new Error(
      "Campaign language settings changed during validation. Review and submit the draft again.",
    );
  if (actor.getFlag(ID, "creationDraft")?.revision !== request.revision)
    throw new Error("Draft changed during validation. Review and retry.");
  validateCreationChanges(actor, changes);
  await writeCharacterActor(actor, changes);
  if (createdIds.some((id) => !actor.items.has(id)) || effects.effects.some(effect => !actor.effects.has(effect._id)))
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
    reusedIds = [],
    instanceIds = {},
    matchedExisting = new Set();
  const add = (data) => {
    const id = foundry.utils.randomID();
    createdIds.push(id);
    items.push({ _id: id, ...data });
    return id;
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
    add(
      abilityItemSource(record, {
        sourceCommit: commit,
        creationGrant: grantKind === "creation",
        grantKind,
      }),
    );
  }
  for (const item of inventoryItems) {
    const existing = actor.items.find(
      (i) =>
        i.type === "equipment" &&
        !matchedExisting.has(i.id) &&
        i.system.catalogId === item.catalogId &&
        (i.getFlag(ID, "acquisitionInstance") === item.instanceId ||
          (!i.getFlag(ID, "acquisitionInstance") && (item.source !== "creation" || i.system.worn))),
    );
    if (item.source !== "coins" && existing) {
      matchedExisting.add(existing.id);
      instanceIds[item.instanceId] = existing.id;
      reusedIds.push(existing.id);
      continue;
    }
    const def = inventory.equipment.find((r) => r.id === item.catalogId);
    instanceIds[item.instanceId] = add(
      equipmentItemSource(def, {
        sourceCommit: commit,
        creationGrant: grantKind === "creation",
        grantKind,
        acquisitionInstance: item.instanceId,
        quantity: item.quantity,
        hands: item.hands ?? 0,
        inventoryDie: item.inventoryDie ?? 0,
        worn: item.worn ?? item.instanceId === "creation-outfit",
        held: item.held ?? false,
        carried: item.carried ?? true,
      }),
    );
  }
  return { items, createdIds, reusedIds, instanceIds };
}
