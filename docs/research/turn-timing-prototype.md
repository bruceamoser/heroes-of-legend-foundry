# V14 turn timing probe

Issue #9 / F06, tested October 17, 2026 on local Foundry **14.367**, Node 24.22.0 and headless Chromium. This is an isolated prototype, not the finished tracker or condition engine. No gameplay combat hooks call it.

## Verified native contract

Register `heroes-of-legend.turnStart` and `.turnEnd` in `CONFIG.ActiveEffect.expiryEvents` during init. Create native effects with V14 `duration: {value: null, units: "seconds", expiry: eventName}`. Foundry initializes `start` itself. `ActiveEffect.registry.refresh(event, {combat, actors: new Set(...)})` evaluates only those Actors, applies configured native expiry, and persists `duration.expired`. No V13 duration fields are used.

Custom expiry event names are global: core does not infer whose turn they mean. The Actor set is therefore required. A controller event explicitly includes its summoned forms. Native expiry writes are performed by `game.users.activeGM`, so this probe uses that same GM for its writes. This is a verified constraint on the future authority integration; do not combine an independently selected authority with a silent assumption that its registry call will persist expiry.

References: [ActiveEffectRegistry](https://foundryvtt.com/api/v14/classes/foundry.helpers.ActiveEffectRegistry.html), [ActiveEffect](https://foundryvtt.com/api/v14/classes/foundry.documents.ActiveEffect.html). Exact signatures and active-GM behavior were checked in the installed 14.367 source and in the runtime probe.

## Repeatable evidence

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:timing` in the disposable local world. It creates three Actors, two effects per Actor, a Combat and a second GM. Canvas is disabled for this document-only test.

- Persist an explicit controller/participant mapping on the Combat.
- Turn start expires only the start effects for controller and summon; HP remains 12.
- Turn end with Burning 3 reduces HP to 9 and rating to 2, then expires end effects.
- Concurrent duplicate calls serialize; the second GM's call is ignored. HP/decay and receipt share one Actor update.
- Reload and replay keep HP, rating, expiry and persisted phase unchanged.
- A new turn end reduces HP to 7 and rating to 1.
- The unrelated Actor keeps HP 12 and both effects unexpired.
- No uncaught browser errors. Fixture documents/users are cleaned up.

## Limits

Burning is a fixture counter without resistance, wounds, Dying or starred contributions; those belong to A03/A06/C01. Explicit probe calls do not yet implement side choice, combat transitions, rewind adjudication or production hook wiring. Per-Actor receipts are retry evidence, not a multi-document transaction. Reload changes to the core active GM are handled by choosing the current active client in the test; simultaneous in-flight handoff remains the F04 gate. Actual 14.369 validation remains pending.
