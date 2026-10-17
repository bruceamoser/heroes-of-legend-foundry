# Authority prototype — issue #7

October 17, 2026; Foundry 14.367, Node 24.22.0, Chromium 156, isolated development world. The initial experiment below was bounded; the later 14.369 coordinator evidence and operational boundaries are recorded at the end.

## Findings

1. Two concurrent `JournalEntry.create` calls with the same `_id` and `keepId: true` both fulfilled with that ID. Deterministic document IDs therefore do **not** supply an exclusive server lock. Reproduce with `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run probe:claims`. Never implement the authority protocol by assuming one caller must fail.
2. A world Journal hidden by ownership was still present in a player client's collection. A GM-only compendium configured with PLAYER/TRUSTED ownership NONE was invisible in normal UI, but a player client could retrieve the record by known ID and read its flags. These native permissions are not a proven confidentiality boundary. Do not store credentials or secrets on this basis, and do not claim unrevealed source data is unavailable to client inspection.
3. Native ChatMessage creation prohibits a non-GM from supplying a different author (the installed BaseChatMessage permission test checks the authenticated user against the author). The prototype uses the actual message author, never a claimed user ID in flags. GMs remain trusted adjudicators.

## Implemented bounded path

`src/prototypes/authority.mjs` is opt-in from development scripts only. It registers one hidden world setting but no request-processing hooks or gameplay actions. One explicitly selected GM **socket/client** runs a serialized queue. Other clients return without applying operations. Reload/disconnect changes the socket identity and fails closed; no automatic election or lease stealing is implemented.

The selected GM prepares a fixed probe plan for a known requester and source. Players submit only a plan ID in a persisted chat request; they cannot provide mutation patches. Targets and expected values come from the GM-prepared plan. The only mutation is an experimental counter flag, not HP, actions or inventory. Each target's new value and operation receipt are written in one Actor update. A retry skips an existing target receipt. A mismatched unreceipted target is blocked for reconciliation.

The ledger uses a native world compendium with normal GM-only UI visibility, **not claimed data confidentiality**. It is not shipped as a system pack. No custom database writer is used.

## Runtime evidence

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:authority` passed with two GMs and two players:

- Nonselected GM does not process the request; duplicate same-client submissions and separately created duplicate requests apply once.
- Wrong actual requester is rejected; the plan is hidden from the normal player pack UI. The test explicitly reports that its flags remain readable by known ID.
- Injected pause after target A's update but before its journal checkpoint produces counts [2,1]. After explicitly closing the old client, selecting the second GM and resuming gives [2,2], not [3,2].
- Reload loses the client designation and fails closed. After explicit reselection, completed-operation replay does not mutate again.
- Stale unreceipted target data is rejected; the other target remains unchanged.
- Zero uncaught browser errors. Canvas is disabled only in this document/permission test to avoid needless software-rendering load; it does not constitute canvas validation.

## Limitations identified by the initial prototype

- Safe authority activation/handoff while work is in flight. The explicit reselection helper is test setup, not a production election protocol. Simultaneous activation, delayed updates and ambiguous disconnects must stay suspended until reconciled. Do not call this distributed locking or an atomic multi-document transaction.
- A concrete confidentiality policy for unrevealed data: keep public projections minimal and avoid extra secret statistics; determine whether stronger protection than native UI permissions is required before choosing storage/transport. The initial specification's inaccessible-client-record assumption was not proven.
- Recovery UI, operation journal maintenance and real typed ability/cost handlers; performance and 14.369 validation.
- Source ownership in this artificial counter test is **not** the Defend eligibility rule. Bruce explicitly allows any player to open/roll a defense for a chosen defender; actual user and defender are distinct audit fields. Foundry write permissions still apply to effects.

The later coordinator work below addresses activation and recovery. It does not erase the failed lock/confidentiality hypotheses or certify arbitrary gameplay handlers.

## Production character coordinator — October 17, 14.369

Issue #7 now has a bounded operational protocol in `src/services/authority.mjs` and a restricted **Manage automation** settings panel. This supersedes the manual prototype reselection helper for character creation/advancement. The earlier failed exclusivity and confidentiality hypotheses remain valid. F04's request/receipt spike is complete; each later gameplay handler still needs its own authorization, receipt and interruption tests.

Only the native active GM may initially enable processing. The selected socket, GM, browser identity and observed world launch marker must all match. An exclusive [Web Lock](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request) prevents a second tab of the same browser/origin from processing; HTTPS or localhost is required for the GM. The lock is held for the window's processing lifetime and never stolen. This is a browser lock, **not** a global server mutex, lease or compare-and-swap. Both same-GM tabs can report themselves as Foundry's active GM, so that check alone is insufficient. Different GM users are covered by active-GM eligibility plus explicit release; malicious trusted-GM manipulation of settings or cloned sessions is outside this protocol.

Release waits behind all queued work. Another GM/browser cannot take over a live or ambiguous binding. Same-browser reload reacquires the browser lock and reads the persisted work checkpoint after a native settings round trip, keeping the binding unusable during inspection. An idle checkpoint resumes. A busy character request resumes only when its Actor has the receipt written with **all** mechanical changes in that single Actor update. Metadata verification can then finish without repeating grants. This proof must not be reused for a partially applied multi-target operation: those require the prototype's per-target receipts and separate reconciliation.

Before a mechanical write the coordinator marks it uncertain locally. An acknowledged write settles it; an ambiguous failure with no applied receipt suspends subsequent work. There is no timeout-based takeover. With former GM windows closed, the DA can relaunch the world and explicitly confirm recovery in the panel. The isolated 14.369 runtime changes `game.world.lastPlayed` on an actual relaunch. The [World schema](https://foundryvtt.com/api/v14/classes/foundry.packages.World.html) exposes this field, but its semantics are not a documented fencing-token guarantee; it is combined with explicit DA confirmation, not presented as a server epoch/CAS API. Missing markers fail closed. Older nonempty bindings without coordinator metadata acquire a legacy marker and require a subsequent relaunch; they are never silently erased.

Requests use the native ChatMessage's actual author and minimal public IDs, kind, revision and explicit choices. Typed handlers recompute effects from authoritative documents; requests cannot supply arbitrary mutation patches. Restricted UI is useful for table presentation but does not prove secret storage. Do not put credentials, unrevealed prose, hidden statistics or future secret outcomes in these request flags. Public attack projections must include only the information needed by the visible workflow. Strong secrecy beyond native Foundry client access is not promised.

### Additional runtime evidence

- `test:coordinator`: simultaneous activation by two distinct GMs, duplicate same-GM tab exclusion, release queued behind an in-flight job, subsequent handoff, and native panel rendering.
- A native Actor update completes but an injected application-level lost acknowledgment leaves the caller waiting. Reload reconciles its applied receipt. This is a service-boundary fault injection, not a claim of physical network packet-loss testing.
- An injected unknown write outcome without a receipt leaves the coordinator suspended and rejects activation in the same launch.
- `test:coordinator-restart -- --prepare`, then `--check-blocked`, then an actual isolated server stop/start and `--verify`: unknown work cannot recover in the same launch even with the checkbox; after relaunch, explicit recovery retries the original creation request once, producing HP 17 and no duplicate Items on replay.
- `probe:claims` now uses distinct A/B payloads for the same document ID. Both calls return their own nonce; the final record contains B in the observed run. Successful creation is not lock acquisition.

Current character receipts are retained on the Actor; the panel lists the latest 30 character requests, without deleting older audit messages or receipts. Future journal compaction must preserve idempotency. Full gameplay coverage and broad performance/compatibility testing remain later implementation work.
