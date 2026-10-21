/** Explicit actions run on the clicking client. Only shared writes use a GM relay. */
const ID = "heroes-of-legend";
let queue = Promise.resolve(), activeWork = null;
const setting = key => game.settings.get(ID, key);

// Retained exports/settings allow older worlds and macros to load. Their saved
// leases/checkpoints no longer gate play and are never automatically replayed.
export function authorityBrowserId() { return game.socket?.id ?? game.user.id; }
export function assertAutomationCapabilities() {}
export function interruptedOperations() { return {}; }
export function registerAuthority() {
  for (const [key, type, value] of [
    ["creationAuthorityClient", String, ""], ["authorityMeta", Object, {}],
    ["authorityWork", Object, {}], ["authorityLease", Object, {}],
    ["interruptedOperations", Object, {}], ["actionRelay", Object, {}],
  ]) game.settings.register(ID, key, { scope: "world", config: false, type, default: value });
  Hooks.once("ready", bindCreationAuthority);
  Hooks.on("userConnected", () => bindCreationAuthority());
  game.socket?.on?.("connect", () => bindCreationAuthority());
}
export async function bindCreationAuthority() {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
  await game.settings.set(ID, "actionRelay", { userId: game.user.id, clientId: game.socket.id });
}
export async function ensureAuthorityReady({ shared = false } = {}) {
  if (!shared || game.user.isGM) return;
  if (!game.users.activeGM) throw new Error("A GM must be connected to update the shared encounter or another character.");
  const relay = setting("actionRelay");
  if (relay?.userId !== game.users.activeGM.id || !relay.clientId)
    throw new Error("The GM is still connecting. Retry this shared action in a moment.");
}
/** Explicitly mark where a request executes; other clients never process owner actions. */
export async function createActionMessage(data, { shared = false } = {}) {
  await ensureAuthorityReady({ shared });
  const relayed = shared && !game.user.isGM;
  const executor = relayed ? setting("actionRelay") : {userId:game.user.id,clientId:game.socket.id};
  const flags = { ...data.flags, [ID]: { ...data.flags?.[ID],
    actionExecution: { userId: game.user.id, clientId: game.socket.id, shared: relayed,
      executorUserId: executor.userId, executorClientId: executor.clientId },
  } };
  return ChatMessage.create({ ...data, flags });
}
export function shouldProcessRequest(message) {
  const execution = message?.getFlag(ID, "actionExecution");
  if (!execution || execution.userId !== message.author?.id) return false;
  if (!execution.shared) return execution.userId === game.user.id && execution.clientId === game.socket.id;
  // A new GM tab may become the relay for future requests, but it must never
  // also execute an action already dispatched to a different client.
  return Boolean(game.user.isGM && execution.executorUserId === game.user.id &&
    execution.executorClientId === game.socket.id);
}
export function isCreationAuthority() {
  return Boolean(activeWork || (game.user.isGM && game.users.activeGM?.isSelf));
}
export const writeCharacterActor = (...args) => writeAuthorityDocument(...args);
export async function writeAuthorityDocument(document, changes) {
  if (!activeWork) throw new Error("No action is being applied.");
  if (!game.user.isGM && !document.testUserPermission(game.user, "OWNER"))
    throw new Error("You do not have permission to change this document.");
  return document.update(changes);
}
export function enqueueCharacterOperation(operation, { requestId = null, targetUuid = null } = {}) {
  const job = queue.then(async () => {
    const message = requestId ? game.messages.get(requestId) : null;
    // Old saved requests require a deliberate GM retry; they are not replayed on login.
    if (message?.getFlag(ID, "actionExecution")) {
      if (!shouldProcessRequest(message)) return { status: "not-authority" };
    } else if (!game.user.isGM) return { status: "not-authority" };
    activeWork = { requestId, targetUuid };
    try { return await operation(); }
    finally { activeWork = null; }
  });
  queue = job.catch(() => {});
  return job;
}
export async function releaseAuthority() { return { status: "released" }; }
