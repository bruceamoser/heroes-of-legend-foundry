import { updateOwnedDocument } from "./documents.mjs";
const ID = "heroes-of-legend";
/** Explicit profile selection changes printed statistics, never portrayal or live effects. */
export function npcProfileChanges(actor, source) {
  if (actor?.type !== "creature" || source?.type !== "creature")
    throw new Error("NPC combat profiles require creature Actors.");
  const system = structuredClone(source.toObject().system);
  system.health.value = Math.min(actor.system.health.value, system.health.baseMax);
  system.biography = actor.system.biography;
  const changes = {
    system,
    [`flags.${ID}.npc.profileLinked`]: true,
    [`flags.${ID}.npc.profileName`]: source.name,
  };
  for (const key of ["catalogId", "source", "sourceCommit", "automation", "automationLabel", "classification", "family"])
    changes[`flags.${ID}.${key}`] = source.getFlag(ID, key) ?? null;
  return changes;
}
export async function selectNpcProfile(actor, profileId) {
  if (!game.user.isGM || !actor.testUserPermission(game.user, "OWNER"))
    throw new Error("Only a DA owner can replace this NPC's combat profile.");
  if (!actor.id || actor.pack) throw new Error("Save a world NPC before choosing its profile.");
  const pack = game.packs.get(`${ID}.creatures`);
  if (!pack || pack.documentName !== "Actor") throw new Error("The creature compendium is unavailable.");
  const source = await pack.getDocument(profileId);
  if (!source || !source.testUserPermission(game.user, "OBSERVER"))
    throw new Error("This creature profile is unavailable.");
  return updateOwnedDocument(actor, npcProfileChanges(actor, source));
}
