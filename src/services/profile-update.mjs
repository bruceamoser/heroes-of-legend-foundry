import { updateOwnedDocument } from "./documents.mjs";
import { planProfileUpdate } from "../rules/profile-update.mjs";
import { isSummon } from "../rules/summon-profile.mjs";

const ID = "heroes-of-legend";
const BASES = `systems/${ID}/data/profile-update-bases.json`;

/** The sheet may show the action only for identified world profile Actors. */
export function profileUpdateAvailable(actor) {
  const catalogId = actor?.getFlag?.(ID, "catalogId");
  return Boolean(
    game?.user?.isGM &&
      actor?.id &&
      !actor.pack &&
      !actor.parent &&
      game.actors?.get(actor.id) === actor &&
      actor.type === "creature" && !isSummon(actor) &&
      typeof catalogId === "string" &&
      catalogId.startsWith(`${actor.type}-`),
  );
}

function assertWorldProfile(actor) {
  if (
    !profileUpdateAvailable(actor) ||
    !actor.testUserPermission(game.user, "OWNER")
  ) {
    throw new Error(
      "A GM must update a saved world creature profile.",
    );
  }
}

async function loadBases() {
  const response = await fetch(BASES);
  if (!response.ok)
    throw new Error("Profile update baselines are unavailable.");
  return response.json();
}

/** Update only printed profile fields from the exact installed catalog entry. */
export async function updateCreatureProfile(actor) {
  assertWorldProfile(actor);
  const catalogId = actor.getFlag(ID, "catalogId");
  const pack = game.packs.get(`${ID}.${actor.type}s`);
  if (!pack || pack.documentName !== "Actor")
    throw new Error("Current profile pack is unavailable.");
  const index = await pack.getIndex({ fields: [`flags.${ID}.catalogId`] });
  const matches = [...index].filter(
    (entry) => entry.flags?.[ID]?.catalogId === catalogId,
  );
  if (matches.length !== 1)
    throw new Error(
      "Current profile catalog identity is missing or ambiguous.",
    );
  const document = await pack.getDocument(matches[0]._id);
  const current = document?.toObject();
  if (
    current?.type !== actor.type ||
    current?.flags?.[ID]?.catalogId !== catalogId
  ) {
    throw new Error("Current pack profile identity does not match this Actor.");
  }
  const baseData = await loadBases();
  const actorSource = actor.toObject();
  const oldFlags = actorSource.flags?.[ID] ?? {};
  const base = baseData.profiles?.[catalogId];
  const baseline = base?.sourceSha === oldFlags.source?.sha256 ? base : null;
  const plan = planProfileUpdate({ actor: actorSource, current, baseline });
  const changes = { ...plan.changes };
  const currentFlags = current.flags[ID];
  // Classification carries a redundant printed CV. Keep it aligned only if it
  // still tracked the live CV before this update; other classification edits
  // remain local.
  if (
    actor.type === "creature" &&
    (plan.current || plan.updated.includes("system.cv")) &&
    oldFlags.classification?.cv === actorSource.system?.cv &&
    currentFlags.classification?.cv !== undefined &&
    oldFlags.classification.cv !== currentFlags.classification.cv
  ) {
    changes[`flags.${ID}.classification.cv`] = currentFlags.classification.cv;
  }
  if (plan.current) {
    // Provenance is advanced only when every printed block matches the pack.
    for (const key of actor.type === "creature"
      ? ["source", "sourceCommit", "abilitySources", "monsterAbilityTemplates"]
      : ["source", "sourceCommit", "references"]) {
      if (currentFlags[key] === undefined) continue;
      if (JSON.stringify(oldFlags[key]) !== JSON.stringify(currentFlags[key])) {
        changes[`flags.${ID}.${key}`] = structuredClone(currentFlags[key]);
      }
    }
    if (oldFlags.profileUpdate !== undefined)
      changes[`flags.${ID}.-=profileUpdate`] = null;
  } else {
    const marker = {
      sourceCommit: currentFlags.sourceCommit,
      fields: plan.currentHashes,
      partial: true,
    };
    if (JSON.stringify(oldFlags.profileUpdate) !== JSON.stringify(marker)) {
      changes[`flags.${ID}.profileUpdate`] = marker;
    }
  }
  if (Object.keys(changes).length) {
    assertWorldProfile(actor); // Async pack and baseline reads may have outlived access.
    if (
      actor.getFlag(ID, "catalogId") !== catalogId ||
      actor.getFlag(ID, "source")?.sha256 !== oldFlags.source?.sha256
    ) {
      throw new Error("Profile identity changed while loading its update.");
    }
    await updateOwnedDocument(actor, changes);
  }
  return {
    updated: plan.updated,
    preserved: plan.preserved,
    current: plan.current,
  };
}
