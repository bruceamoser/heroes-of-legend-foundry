import { damageBasis, damagePreview } from "./damage.mjs";
import { updateOwnedDocument } from "./documents.mjs";
const ID = "heroes-of-legend";
const queues = new Map();
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

/** One explicit button press, one owned document update. No encounter or GM needed. */
export function applyOwnedDamage(actor, components, {
  operationId = foundry.utils.randomID(), sourceMessageId = null, label = "Damage",
  resistances = [], weaknesses = [], bypassResistance = false,
} = {}) {
  if (!actor || actor.pack || !["character", "creature", "summon"].includes(actor.type) ||
      !actor.testUserPermission(game.user, "OWNER"))
    return Promise.reject(new Error("Select a character, creature or summon you own to apply damage."));
  const source = JSON.stringify({ components, sourceMessageId, resistances, weaknesses, bypassResistance });
  const run = async () => {
    if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("You no longer own this damage target.");
    const previous = actor.getFlag(ID, "explicitDamage")?.[operationId];
    if (previous) {
      if (previous.source !== source) throw new Error("This damage action has different values. Start a new action.");
      return { ...previous, replay: true };
    }
    const basis = damageBasis(actor);
    const plan = damagePreview(actor, basis, { components, resistances, weaknesses }, { bypassResistance });
    const record = { operationId, sourceMessageId, source, label, authorId: game.user.id,
      before: basis.hp, after: plan.after, total: plan.event.total, event: plan.event };
    await updateOwnedDocument(actor, { "system.health.value": plan.after,
      [`flags.${ID}.damageRevision`]: basis.revision + 1,
      [`flags.${ID}.explicitDamage.${operationId}`]: record });
    return record;
  };
  const task = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(() =>
    globalThis.navigator?.locks?.request
      ? navigator.locks.request(`${ID}:damage:${game.world.id}:${actor.uuid}`, run) : run());
  queues.set(actor.uuid, task);
  task.finally(() => { if (queues.get(actor.uuid) === task) queues.delete(actor.uuid); }).catch(() => {});
  return task;
}

/** Apply to selected tokens, never targets or an inferred character. Linked tokens share HP. */
export async function applySelectedDamage(components, { sourceMessageId = null, label = "Damage" } = {}) {
  const selected = globalThis.canvas?.tokens?.controlled ?? [];
  if (!selected.length) throw new Error("Select one or more tokens, then click Apply Damage.");
  const actors = new Map(), names = new Map(), skipped = [];
  for (const token of selected) {
    if (!token.actor) { skipped.push(`${token.name ?? "Token"}: no actor`); continue; }
    actors.set(token.actor.uuid, token.actor);
    names.set(token.actor.uuid, token.actor.isToken ? (token.name ?? token.actor.name) : token.actor.name);
  }
  const operationId = foundry.utils.randomID(), applied = [];
  for (const actor of actors.values()) {
    try {
      const result = await applyOwnedDamage(actor, components, { operationId, sourceMessageId, label });
      applied.push({ actorUuid: actor.uuid, name: names.get(actor.uuid), ...result });
    } catch (error) { skipped.push(`${actor.name}: ${error.message}`); }
  }
  if (applied.length) {
    const content = `<article class="hol-damage-chat"><p class="hol-damage-label"><strong>${escape(label)}</strong> <span>· applied</span></p><table aria-label="Applied damage"><thead><tr><th scope="col">Target</th><th scope="col">Damage</th><th scope="col">HP</th></tr></thead><tbody>${applied.map(result => `<tr><th scope="row">${escape(result.name)}</th><td>${result.total}</td><td>${result.before} → ${result.after}</td></tr>`).join("")}</tbody></table><details><summary>Correct a mistake</summary><p>Edit the target’s HP on its sheet.</p></details></article>`;
    try { await ChatMessage.create({ content, flags: { [ID]: { explicitDamageResult: { operationId, sourceMessageId, applied } } } }); }
    catch { ui.notifications.warn("Damage was applied, but the chat summary could not be posted. Check HP before clicking again."); }
  }
  if (skipped.length) ui.notifications.warn(`Not applied: ${skipped.join("; ")}`);
  return { applied, skipped };
}
