/** Experimental request/receipt proof. Not wired to gameplay or automatic failover. */
const ID = "heroes-of-legend";
let queue = Promise.resolve();
export const PROBE_PACK = "world.hol-authority-prototype";

export function registerAuthorityPrototype() {
  game.settings.register(ID, "prototypeAuthorityClient", { scope: "world", config: false, type: String, default: "" });
}
export function isAuthority() {
  return game.user.isGM && game.socket.connected && game.settings.get(ID, "prototypeAuthorityClient") === game.socket.id;
}
/** Test setup only: changing authority during in-flight work is not supported. */
export async function selectAuthorityClient() {
  if (!game.user.isGM) throw new Error("Only a GM can select the prototype authority.");
  await game.settings.set(ID, "prototypeAuthorityClient", game.socket.id);
}
export async function prepareProbePlan(source, targets, user) {
  if (!isAuthority()) throw new Error("This client is not the selected authority.");
  if (!source.testUserPermission(user, "OWNER")) throw new Error("Requester must own the source.");
  const unique = [...new Map(targets.map(actor => [actor.uuid, actor])).values()];
  const plan = { version: 1, kind: "authority-probe", userId: user.id, sourceUuid: source.uuid, state: "prepared",
    targets: unique.map(actor => { const before = actor.getFlag(ID, "probeCount") ?? 0;
      return { uuid: actor.uuid, before, after: before + 1 }; }) };
  let pack = game.packs.get(PROBE_PACK);
  if (!pack) pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
    name: "hol-authority-prototype", label: "HOL authority prototype", type: "JournalEntry",
    ownership: { PLAYER: "NONE", TRUSTED: "NONE", ASSISTANT: "OWNER", GAMEMASTER: "OWNER" }
  });
  await pack.configure({ locked: false, ownership: { PLAYER: "NONE", TRUSTED: "NONE", ASSISTANT: "OWNER", GAMEMASTER: "OWNER" } });
  return JournalEntry.create({ name: "HOL authority probe", flags: { [ID]: { probePlan: plan } } }, { pack: pack.collection });
}
export async function requestProbe(planId) {
  // The requester can identify a prepared plan; cannot submit target patches or trusted user IDs.
  return ChatMessage.create({ content: "HOL development authority request", whisper: game.users.filter(user => user.isGM).map(user => user.id),
    flags: { [ID]: { probeRequest: { planId } } } });
}
export function resolveProbe(requestId, { pauseAfter = Infinity } = {}) {
  const job = queue.then(() => applyProbe(requestId, pauseAfter));
  queue = job.catch(() => {});
  return job;
}
async function applyProbe(requestId, pauseAfter) {
  if (!isAuthority()) return { status: "not-authority" };
  const request = game.messages.get(requestId);
  const planId = request?.getFlag(ID, "probeRequest")?.planId;
  const journal = await game.packs.get(PROBE_PACK)?.getDocument(planId);
  const plan = journal?.getFlag(ID, "probePlan");
  if (!plan || plan.kind !== "authority-probe") throw new Error("Unknown prepared plan.");
  const source = await fromUuid(plan.sourceUuid);
  if (request.author?.id !== plan.userId || !source?.testUserPermission(request.author, "OWNER")) throw new Error("Unauthorized requester.");
  if (plan.state === "complete") return { status: "complete", replay: true };
  // Prepared plans live in a GM-only compendium, not world Journal flags. Every target mutation has a same-document receipt.
  await journal.update({ [`flags.${ID}.probePlan.state`]: "applying" });
  let applied = 0;
  for (const target of plan.targets) {
    if (!isAuthority()) return { status: "authority-lost" };
    const actor = await fromUuid(target.uuid);
    if (!actor) throw new Error("Target no longer exists; reconciliation required.");
    if (actor.getFlag(ID, "probeReceipts")?.[journal.id]) continue;
    if ((actor.getFlag(ID, "probeCount") ?? 0) !== target.before) {
      await journal.update({ [`flags.${ID}.probePlan.state`]: "blocked" });
      throw new Error("Stale target state; reconciliation required.");
    }
    await actor.update({ [`flags.${ID}.probeCount`]: target.after,
      [`flags.${ID}.probeReceipts.${journal.id}`]: { before: target.before, after: target.after, requestId } });
    applied++;
    // Failure injection models losing the journal checkpoint after a target update.
    if (applied >= pauseAfter) return { status: "paused-after-target" };
    await journal.update({ [`flags.${ID}.probePlan.lastTarget`]: target.uuid });
  }
  await journal.update({ [`flags.${ID}.probePlan.state`]: "complete" });
  return { status: "complete", replay: false };
}
