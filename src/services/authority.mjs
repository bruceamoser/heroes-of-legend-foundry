/** One selected GM client, with a browser-enforced tab lock and explicit idle handoff. */
const ID = "heroes-of-legend";
let queue = Promise.resolve(),
  held = false,
  releaseLock,
  lockTask,
  activation,
  activeWork,
  suspended = false;
const setting = (key) => game.settings.get(ID, key);
export function authorityBrowserId() {
  const key = `${ID}.authority-browser`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = foundry.utils.randomID(32);
    localStorage.setItem(key, id);
  }
  return id;
}
const launch = () => game.world.lastPlayed;
export function registerAuthority() {
  game.settings.register(ID, "creationAuthorityClient", {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(ID, "authorityMeta", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
  game.settings.register(ID, "authorityWork", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
  Hooks.once("ready", async () => {
    let meta = setting("authorityMeta");
    const legacy = setting("creationAuthorityClient");
    if (legacy && !meta.clientId && game.users.activeGM?.isSelf) {
      // Preserve an older binding until a subsequent, explicitly confirmed world relaunch.
      meta = { clientId: legacy, legacy: true, launch: launch() };
      await game.settings.set(ID, "authorityMeta", meta);
    }
    if (
      game.user.isGM &&
      meta.userId === game.user.id &&
      meta.browserId === authorityBrowserId()
    ) {
      try {
        await bindCreationAuthority();
      } catch {
        /* Another live tab or unresolved work must remain suspended. */
      }
    }
  });
}
async function takeLocalLock() {
  if (held) return;
  if (!navigator.locks)
    throw new Error("Use HTTPS or localhost for the GM coordinator.");
  let resolve, reject;
  const acquired = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  lockTask = navigator.locks
    .request(
      `${ID}:authority:${game.world.id}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          reject(
            new Error(
              "Another live tab in this browser holds the coordinator. Release it there first.",
            ),
          );
          return;
        }
        held = true;
        resolve();
        await new Promise((done) => {
          releaseLock = done;
        });
        held = false;
        releaseLock = undefined;
      },
    )
    .catch(reject);
  await acquired;
}
async function dropLocalLock() {
  releaseLock?.();
  await lockTask;
}
export function isCreationAuthority() {
  const meta = setting("authorityMeta");
  return (
    game.user.isGM &&
    held &&
    game.socket.connected &&
    setting("creationAuthorityClient") === game.socket.id &&
    meta.clientId === game.socket.id &&
    meta.userId === game.user.id &&
    meta.launch === launch()
  );
}
async function appliedWork(work) {
  if (!work.requestId) return false;
  const message = game.messages.get(work.requestId);
  const request =
    message?.getFlag(ID, "creationRequest") ??
    message?.getFlag(ID, "developmentRequest") ??
    message?.getFlag(ID, "combatRequest") ??
    message?.getFlag(ID, "conditionRequest") ??
    message?.getFlag(ID, "equipmentRequest") ??
    message?.getFlag(ID, "abilityRequest") ??
    message?.getFlag(ID, "npcAttackRequest") ??
    message?.getFlag(ID, "defenseRequest");
  const uuid = message?.getFlag(ID, "defenseRequest")
    ? `ChatMessage.${request.attackMessageId}`
    : message?.getFlag(ID, "abilityRequest") ||
        message?.getFlag(ID, "npcAttackRequest")
      ? request?.combatUuid
      : (request?.actorUuid ?? request?.combatUuid);
  if (!uuid) return false;
  const actor = await fromUuid(uuid);
  // This is the final settlement receipt. Multi-document operations write it only
  // after their required child mechanics and result records have succeeded.
  return (
    actor?.getFlag(ID, "operationReceipts")?.[work.requestId]?.applied === true
  );
}
export function bindCreationAuthority(options = {}) {
  if (activation) return activation;
  activation = activate(options).finally(() => {
    activation = null;
  });
  return activation;
}
async function activate({ restartConfirmed = false } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can process automation.");
  if (isCreationAuthority()) {
    if (suspended) {
      const work = setting("authorityWork");
      if (!(await appliedWork(work)))
        throw new Error(
          "An uncertain write needs reconciliation or a world relaunch.",
        );
      suspended = false;
      await game.settings.set(ID, "authorityWork", {
        clientId: game.socket.id,
        busy: false,
      });
      Hooks.callAll("holAuthorityReady", { resumedRequest: work.requestId });
    }
    return;
  }
  const bound = setting("creationAuthorityClient"),
    meta = setting("authorityMeta");
  let work;
  const stamp = launch();
  if (!stamp || !Number.isFinite(Date.parse(stamp)))
    throw new Error("The world launch marker is unavailable.");
  const sameBrowser =
    meta.userId === game.user.id && meta.browserId === authorityBrowserId();
  const restarted = meta.launch && meta.launch !== stamp;
  if (!bound) {
    if (!game.users.activeGM?.isSelf)
      throw new Error("The active GM must enable the initial coordinator.");
  } else if (restarted) {
    if (!restartConfirmed || !game.users.activeGM?.isSelf)
      throw new Error(
        "After closing former GM windows and relaunching the world, the active GM can explicitly recover the coordinator.",
      );
  } else if (!sameBrowser)
    throw new Error(
      "The selected GM must release their coordinator before another browser takes over.",
    );
  await takeLocalLock();
  try {
    if (
      setting("creationAuthorityClient") !== bound ||
      JSON.stringify(setting("authorityMeta")) !== JSON.stringify(meta)
    )
      throw new Error(
        "Coordinator changed during activation. Refresh and retry.",
      );
    const next = {
      clientId: game.socket.id,
      userId: game.user.id,
      browserId: authorityBrowserId(),
      launch: stamp,
    };
    await game.settings.set(ID, "authorityMeta", next);
    // Keep the old client binding until this round trip delivers preceding setting updates.
    // The mixed metadata/client binding fails closed while we inspect the fresh checkpoint.
    work = setting("authorityWork");
    if (bound && !restarted) {
      if (work.clientId !== bound)
        throw new Error(
          "The former coordinator has no settled work checkpoint. Recovery requires a world relaunch.",
        );
      if (work.busy && !(await appliedWork(work)))
        throw new Error(
          "A request may still be in flight. Relaunch the world before recovering it.",
        );
    }
    await game.settings.set(ID, "creationAuthorityClient", game.socket.id);
    await game.settings.set(ID, "authorityWork", {
      clientId: game.socket.id,
      busy: false,
    });
    Hooks.callAll("holAuthorityReady", {
      resumedRequest: work.busy ? work.requestId : null,
    });
  } catch (error) {
    await dropLocalLock();
    throw error;
  }
}
export const writeCharacterActor = (...args) => writeAuthorityDocument(...args);
export async function writeAuthorityDocument(actor, changes) {
  if (!activeWork || !isCreationAuthority())
    throw new Error("No active coordinator operation.");
  activeWork.uncertain = true;
  const result = await actor.update(changes);
  activeWork.uncertain = false;
  return result;
}
export function enqueueCharacterOperation(
  operation,
  { requestId = null } = {},
) {
  const job = queue.then(async () => {
    if (!isCreationAuthority()) return { status: "not-authority" };
    if (suspended)
      throw new Error("The coordinator is suspended for write reconciliation.");
    activeWork = { uncertain: false };
    const clientId = game.socket.id;
    await game.settings.set(ID, "authorityWork", {
      clientId,
      busy: true,
      requestId,
    });
    if (!isCreationAuthority()) return { status: "authority-lost" };
    try {
      return await operation();
    } finally {
      if (activeWork?.uncertain && !(await appliedWork({ requestId })))
        suspended = true;
      activeWork = null;
      if (isCreationAuthority())
        await game.settings.set(ID, "authorityWork", {
          clientId,
          busy: suspended,
          requestId,
          uncertain: suspended,
        });
    }
  });
  queue = job.catch(() => {});
  return job;
}
export function releaseAuthority() {
  return enqueueCharacterOperation(async () => {
    await game.settings.set(ID, "creationAuthorityClient", "");
    await game.settings.set(ID, "authorityMeta", {});
    await game.settings.set(ID, "authorityWork", {});
    await dropLocalLock();
    return { status: "released" };
  });
}
