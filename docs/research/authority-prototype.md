# Authority prototype — issue #7

October 17, 2026; Foundry 14.367, Node 24.22.0, Chromium 156, isolated development world. This is a bounded engineering experiment, not enabled gameplay automation and not a completed F04 gate.

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

## Still required before gameplay integration

- Safe authority activation/handoff while work is in flight. The explicit reselection helper is test setup, not a production election protocol. Simultaneous activation, delayed updates and ambiguous disconnects must stay suspended until reconciled. Do not call this distributed locking or an atomic multi-document transaction.
- A concrete confidentiality policy for unrevealed data: keep public projections minimal and avoid extra secret statistics; determine whether stronger protection than native UI permissions is required before choosing storage/transport. The initial specification's inaccessible-client-record assumption was not proven.
- Recovery UI, operation journal maintenance and real typed ability/cost handlers; performance and 14.369 validation.
- Source ownership in this artificial counter test is **not** the Defend eligibility rule. Bruce explicitly allows any player to open/roll a defense for a chosen defender; actual user and defender are distinct audit fields. Foundry write permissions still apply to effects.

Issue #7 remains open. The passing bounded path does not erase the failed lock/confidentiality hypotheses or certify general gameplay authority.
