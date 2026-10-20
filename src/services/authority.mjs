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
const clock = () => game.time?.serverTime ?? Date.now();
const LEASE_MS = 15000;
let heartbeatTimer, renewing = false;
const currentLease = () => setting("authorityLease") ?? {};
/** These browser guarantees are prerequisites for receipts and tab exclusion. */
export function assertAutomationCapabilities() {
  const missing = [];
  if (globalThis.isSecureContext === false) missing.push("secure browser context");
  if (!globalThis.crypto?.subtle?.digest) missing.push("Web Crypto");
  if (game.user.isGM && !globalThis.navigator?.locks?.request) missing.push("Web Locks");
  if (missing.length) throw new Error(`Automation requires HTTPS or localhost. Missing: ${missing.join(", ")}. Open the world over HTTPS in a supported browser.`);
}
function ownsBinding() {
  const meta = setting("authorityMeta");
  return game.user.isGM && held && game.socket.connected &&
    setting("creationAuthorityClient") === game.socket.id &&
    meta.clientId === game.socket.id && meta.userId === game.user.id &&
    meta.browserId === authorityBrowserId() && meta.launch === launch();
}
function coherentCoordinator() {
  const bound = setting("creationAuthorityClient"), meta = setting("authorityMeta"), lease = currentLease();
  return Boolean(bound && meta.clientId === bound && meta.userId && meta.launch === launch() &&
    meta.leaseVersion === 1 && lease.clientId === bound && Number.isFinite(lease.expires) && lease.expires > clock());
}
function settledRelaunch(meta = setting("authorityMeta"), bound = setting("creationAuthorityClient")) {
  const work = setting("authorityWork"), lease = currentLease();
  const legacyIdle = Object.keys(lease).length === 0 && !meta.leaseVersion &&
    meta.clientId === bound && meta.userId === game.user.id && meta.browserId === authorityBrowserId();
  // Shutdown may occur after binding but before the final idle checkpoint write.
  // A prior process cannot resume; require its exact bound owner snapshot and
  // an explicitly settled predecessor checkpoint, never infer idle from absence.
  const interruptedFinalization = meta.leaseVersion === 1 && meta.clientId === bound &&
    lease.clientId === bound && JSON.stringify(lease.owner) === JSON.stringify(meta) &&
    typeof work.clientId === "string" && work.clientId.length > 0;
  return Boolean(bound && game.users.activeGM?.isSelf && meta.launch &&
    Number.isFinite(Date.parse(meta.launch)) && meta.launch !== launch() &&
    ((work.clientId === bound && (lease.clientId === bound || legacyIdle)) || interruptedFinalization) &&
    work.busy === false && !work.uncertain);
}
function expiredIdle(meta = setting("authorityMeta"), bound = setting("creationAuthorityClient")) {
  const lease = currentLease(), work = setting("authorityWork");
  return meta.launch === launch() && meta.leaseVersion === 1 && meta.clientId === bound && lease.clientId === bound &&
    Number.isFinite(lease.expires) && lease.expires <= clock() &&
    work.clientId === bound && work.busy === false && !work.uncertain;
}
function recoverableIdleClaim(meta = setting("authorityMeta"), bound = setting("creationAuthorityClient")) {
  const lease = currentLease(), work = setting("authorityWork");
  const priorLaunch = Boolean(meta.launch && Number.isFinite(Date.parse(meta.launch)) && meta.launch !== launch());
  return Boolean(bound && game.users.activeGM?.isSelf &&
    meta.leaseVersion === 1 && meta.clientId !== bound && lease.clientId === meta.clientId &&
    JSON.stringify(lease.owner) === JSON.stringify(meta) && Number.isFinite(lease.expires) &&
    (priorLaunch || (meta.launch === launch() && lease.expires <= clock())) &&
    work.clientId === bound && work.busy === false && !work.uncertain);
}
function leaseRecord(meta) {
  return {clientId: meta.clientId, expires: clock() + LEASE_MS, owner: structuredClone(meta)};
}
function metadataRepairOwner() {
  const lease = currentLease(), owner = lease.owner, work = setting("authorityWork");
  if (!game.user.isGM || !held || !game.socket.connected ||
      setting("creationAuthorityClient") !== game.socket.id || lease.clientId !== game.socket.id ||
      !Number.isFinite(lease.expires) || lease.expires <= clock() || owner?.clientId !== game.socket.id ||
      owner.userId !== game.user.id || owner.browserId !== authorityBrowserId() || owner.launch !== launch() ||
      work.clientId !== game.socket.id || work.busy !== false || work.uncertain) return null;
  return owner;
}
async function maintainAuthority() {
  if (!game.user.isGM || renewing || !game.socket.connected) return;
  renewing = true;
  try {
    // The lease carries the identity which won binding. A delayed rollback may
    // clobber metadata after that binding commits; only the still-locked owner
    // of this exact settled tuple may repair it. Work is never rewritten here.
    const owner = metadataRepairOwner();
    if (owner && JSON.stringify(setting("authorityMeta")) !== JSON.stringify(owner))
      await game.settings.set(ID, "authorityMeta", owner);
    if (isCreationAuthority() || (ownsBinding() && currentLease().clientId !== game.socket.id)) {
      // A late old heartbeat can replace the lease document, but never the
      // current binding. Only that binding's still-locked owner may repair it.
      // An expired lease belonging to this client is never revived here.
      await game.settings.set(ID, "authorityLease", leaseRecord(setting("authorityMeta")));
    } else if (game.users.activeGM?.isSelf && expiredIdle()) {
      await bindCreationAuthority();
    }
  } catch (error) {
    if (error.code !== "HOL_AUTHORITY_TAB_LOCK") console.warn("HOL coordinator heartbeat:",error.message);
  } finally { renewing = false; }
}

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
  game.settings.register(ID, "authorityLease", {scope:"world",config:false,type:Object,default:{}});
  Hooks.once("ready", async () => {
    if (game.user.isGM) {
      try { assertAutomationCapabilities(); }
      catch (error) { ui.notifications.warn(error.message, {permanent: true}); return; }
    }
    if (game.user.isGM && typeof setInterval === "function") {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => maintainAuthority(), 4000);
    }
    let meta = setting("authorityMeta");
    const legacy = setting("creationAuthorityClient");
    if (legacy && !meta.clientId && game.users.activeGM?.isSelf) {
      // Preserve an older binding until a subsequent, explicitly confirmed world relaunch.
      meta = { clientId: legacy, legacy: true, launch: launch() };
      await game.settings.set(ID, "authorityMeta", meta);
    }
    const emptyRecord = (value) => value && typeof value === "object" &&
      !Array.isArray(value) && Object.keys(value).length === 0;
    const freshWorld = game.user.isGM && game.users.activeGM?.isSelf &&
      !legacy && emptyRecord(meta) && emptyRecord(setting("authorityWork"));
    const checkpoint = setting("authorityWork");
    const idleRelaunch = game.user.isGM && settledRelaunch(meta, legacy);
    const resumeBrowser = game.user.isGM && legacy && meta.clientId === legacy &&
      meta.userId === game.user.id &&
      meta.browserId === authorityBrowserId();
    if (freshWorld || resumeBrowser || idleRelaunch || (game.users.activeGM?.isSelf && (expiredIdle(meta,legacy) || recoverableIdleClaim(meta,legacy)))) {
      try {
        await bindCreationAuthority();
      } catch (error) {
        // A competing tab may have claimed the pristine world meanwhile.
        // Existing assignments and uncertain work still require explicit recovery.
        const currentClient = setting("creationAuthorityClient");
        if (error.code !== "HOL_AUTHORITY_TAB_LOCK" &&
            (!currentClient || currentClient === game.socket.id || resumeBrowser || idleRelaunch))
          ui.notifications.warn(
            `Automation could not start. Open Game Settings → Manage automation. ${error.message}`,
            { permanent: true },
          );
      }
    }
  });
}
/** Check the active coordinator before creating a request which could otherwise wait forever. */
export async function ensureAuthorityReady() {
  assertAutomationCapabilities();
  if (game.user.isGM && !isCreationAuthority() &&
      (game.users.activeGM?.isSelf || setting("authorityMeta").userId === game.user.id)) {
    try {
      const meta = setting("authorityMeta"), bound = setting("creationAuthorityClient"), lease = currentLease();
      if (meta.launch === launch() && meta.leaseVersion === 1 && bound && bound !== game.socket.id &&
          meta.browserId !== authorityBrowserId() &&
          (lease.clientId === bound || (lease.clientId === meta.clientId && JSON.stringify(lease.owner) === JSON.stringify(meta))) && lease.expires > clock()) {
        const expires = lease.expires;
        let changed = false;
        while (clock() <= expires) {
          await new Promise(resolve => setTimeout(resolve,200));
          if (setting("creationAuthorityClient") !== bound || currentLease().expires > expires) {
            changed = true;
            break;
          }
        }
        // A setting update is progress, not proof that activation completed.
        if (!changed) await bindCreationAuthority();
      } else if (!coherentCoordinator()) await bindCreationAuthority();
    }
    catch (error) {
      throw new Error(`Automation is unavailable: ${error.message} Open Game Settings → Manage automation to recover the session.`);
    }
  }
  if (game.user.isGM && isCreationAuthority()) return;
  if (!game.users.activeGM)
    throw new Error("A GM must be connected before this action can resolve.");
  if (!coherentCoordinator())
    throw new Error("The GM automation session is not ready. Ask the GM to open Manage automation.");
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
            Object.assign(new Error(
              "Another live tab in this browser holds the coordinator. Release it there first.",
            ), { code: "HOL_AUTHORITY_TAB_LOCK" }),
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
    meta.launch === launch() &&
    (meta.leaseVersion !== 1 || (currentLease().clientId === game.socket.id && currentLease().expires > clock()))
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
    message?.getFlag(ID, "inventoryRequest") ??
    message?.getFlag(ID, "potionRequest") ??
    message?.getFlag(ID, "damageRequest") ??
    message?.getFlag(ID, "recoveryRequest") ??
    message?.getFlag(ID, "woundRequest") ??
    message?.getFlag(ID, "survivalRequest") ??
    message?.getFlag(ID, "abilityRequest") ??
    message?.getFlag(ID, "npcAttackRequest") ??
    message?.getFlag(ID, "playerAttackRequest") ??
    message?.getFlag(ID, "defenseRequest");
  const uuid = message?.getFlag(ID, "defenseRequest")
    ? `ChatMessage.${request.attackMessageId}`
    : message?.getFlag(ID, "abilityRequest") ||
        message?.getFlag(ID, "npcAttackRequest") ||
        message?.getFlag(ID, "playerAttackRequest")
      ? request?.combatUuid
      : (request?.actorUuid ??
        request?.combatUuid ??
        (typeof work.targetUuid === "string" ? work.targetUuid : null));
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
    meta = setting("authorityMeta"), leaseBefore = currentLease();
  let work;
  const stamp = launch();
  if (!stamp || !Number.isFinite(Date.parse(stamp)))
    throw new Error("The world launch marker is unavailable.");
  const sameBrowser =
    meta.userId === game.user.id && meta.browserId === authorityBrowserId();
  const restarted = meta.launch && meta.launch !== stamp,
    checkpoint = setting("authorityWork"),
    idleRestart = settledRelaunch(meta, bound);
  const idleExpiry = Boolean(bound) && game.users.activeGM?.isSelf && expiredIdle(meta,bound);
  const abandonedClaim = recoverableIdleClaim(meta,bound);
  if (!bound) {
    if (!game.users.activeGM?.isSelf)
      throw new Error("The active GM must enable the initial coordinator.");
  } else if (restarted) {
    if (!idleRestart && !abandonedClaim && (!restartConfirmed || !game.users.activeGM?.isSelf))
      throw new Error(
        "After closing former GM windows and relaunching the world, the active GM can explicitly recover the coordinator.",
      );
  } else if (!sameBrowser && !idleExpiry && !abandonedClaim)
    throw new Error(
      "The selected GM must release their coordinator before another browser takes over.",
    );
  await takeLocalLock();
  let claimedMeta;
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
      leaseVersion: 1,
    };
    claimedMeta = next;
    await game.settings.set(ID, "authorityMeta", next);
    // Keep the old client binding until this round trip delivers preceding setting updates.
    // The mixed metadata/client binding fails closed while we inspect the fresh checkpoint.
    if (JSON.stringify(setting("authorityMeta")) !== JSON.stringify(next))
      throw new Error("Another GM session completed coordinator activation first.");
    work = setting("authorityWork");
    if (abandonedClaim && JSON.stringify(work) !== JSON.stringify(checkpoint))
      throw new Error("The interrupted coordinator checkpoint changed. Retry after it settles.");
    if ((idleExpiry || abandonedClaim) && (JSON.stringify(currentLease()) !== JSON.stringify(leaseBefore) ||
        work.clientId !== bound || work.busy !== false || work.uncertain))
      throw new Error("The former coordinator resumed or has unsettled work. Retry after it settles.");
    if (idleRestart && (JSON.stringify(currentLease()) !== JSON.stringify(leaseBefore) || JSON.stringify(work) !== JSON.stringify(checkpoint) || work.busy !== false || work.uncertain))
      throw new Error("The saved work checkpoint changed during startup. Open Manage automation to recover it.");
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
    const verifyClaim = ({lease = false, binding = false, checkpoint = false} = {}) => {
      const currentWork = setting("authorityWork");
      if (JSON.stringify(setting("authorityMeta")) !== JSON.stringify(next) ||
          setting("creationAuthorityClient") !== (binding ? game.socket.id : bound) ||
          (lease && (currentLease().clientId !== game.socket.id || currentLease().expires <= clock())) ||
          (checkpoint && (currentWork.clientId !== game.socket.id || currentWork.busy !== false || currentWork.uncertain)))
        throw new Error("Coordinator activation changed before its settings settled. Retry when the other session is idle.");
    };
    verifyClaim();
    await game.settings.set(ID, "authorityLease", leaseRecord(next));
    verifyClaim({lease:true});
    await game.settings.set(ID, "creationAuthorityClient", game.socket.id);
    verifyClaim({lease:true,binding:true});
    await game.settings.set(ID, "authorityWork", {
      clientId: game.socket.id,
      busy: false,
    });
    verifyClaim({lease:true,binding:true,checkpoint:true});
    Hooks.callAll("holAuthorityReady", {
      resumedRequest: work.busy ? work.requestId : null,
    });
  } catch (error) {
    // Roll back only our incomplete claim. Never clear work or overwrite a
    // competing claim, a completed binding, or metadata we cannot identify.
    if (claimedMeta && setting("creationAuthorityClient") === bound &&
        JSON.stringify(setting("authorityMeta")) === JSON.stringify(claimedMeta)) {
      try { await game.settings.set(ID, "authorityMeta", meta); }
      catch (rollbackError) { console.warn("HOL coordinator metadata rollback:", rollbackError.message); }
    }
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
  { requestId = null, targetUuid = null } = {},
) {
  const job = queue.then(async () => {
    if (!isCreationAuthority()) return { status: "not-authority" };
    if (suspended)
      throw new Error("The coordinator is suspended for write reconciliation.");
    activeWork = { uncertain: false };
    const clientId = game.socket.id;
    const work = {
      clientId,
      busy: true,
      requestId,
      ...(typeof targetUuid === "string" ? { targetUuid } : {}),
    };
    await game.settings.set(ID, "authorityWork", work);
    if (!isCreationAuthority()) return { status: "authority-lost" };
    try {
      return await operation();
    } finally {
      if (
        activeWork?.uncertain &&
        !(await appliedWork({ requestId, targetUuid }))
      )
        suspended = true;
      activeWork = null;
      if (isCreationAuthority())
        await game.settings.set(ID, "authorityWork", {
          clientId,
          busy: suspended,
          requestId,
          uncertain: suspended,
          ...(typeof targetUuid === "string" ? { targetUuid } : {}),
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
    await game.settings.set(ID, "authorityLease", {});
    await game.settings.set(ID, "authorityWork", {});
    await dropLocalLock();
    return { status: "released" };
  });
}
