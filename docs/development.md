# Development

Issue #4 establishes the package and test harness. Issue #5 adds typed character and ability models and V2 editor sheets. Compendiums, the guided charactermancer and gameplay automation remain separately tracked work; the manifest only advertises implemented types.

## Build and checks

Use Node **24.22.0** (`.node-version`; minimum 24.13.1) and npm:

```sh
npm ci
npm run check
```

The build copies `src/` and `static/` into `dist/heroes-of-legend/`. No transpiler or compatibility library is needed for native ES modules. Manifest validation rejects missing assets, unsafe paths, incompatible generations and mismatched source/package versions. Tests exercise broken-package rejection as well as successful output. CI runs these checks and uploads a development directory artifact. This is not a published installable release; release URLs and ZIP publishing will be added when a playable version is ready.

## Licensed runtime testing

Use a **separate data directory**, never a campaign directory. Install your licensed Foundry V14 application independently; its application files and license must stay outside this repository. Configure the test instance with a distinct port, UPnP disabled and appropriate host/firewall settings. `hostname` is an advertised hostname, not a network bind restriction.

Copy or link `dist/heroes-of-legend/` into `<test-data>/Data/systems/heroes-of-legend/`. Start Foundry under Node 24 using its `--dataPath=<test-data>` and `--port=<test-port>` options. Create a blank Heroes of Legend world in Setup and a test Gamemaster. Do not give a public server an unprotected GM account.

Install the browser once:

```sh
node node_modules/playwright/cli.js install chromium
```

Against that already-created, launched development world:

```sh
HOL_TEST_URL=http://127.0.0.1:30014 npm run test:runtime
```

Optional `HOL_TEST_USER` and `HOL_TEST_PASSWORD` select the test account. Do not commit credentials. The smoke script only accepts localhost URLs, logs in, waits for `game.ready`, checks package/localization initialization and fails on uncaught browser errors. It does not create or modify game documents. Restart Foundry after manifest changes; rebuild and refresh the browser after source changes.

## Evidence — October 17, 2026

- Linux; Node 24.22.0; Playwright Chromium 156.0.8078.4.
- Installed Foundry **14.367** at `/home/bruce/foundryvtt`.
- Separate `/tmp/hol-foundry-test` data directory, port 30014, no imported campaign worlds or modules.
- Created a blank `hol-development` world through Foundry's native Setup UI and joined as the test GM.
- `npm run check`: build and manifest validation pass; three package tests pass.
- Runtime smoke: `game.ready`, system ID/version and localized preview confirmed; package init logged; zero uncaught page errors.
- V14 Setup excludes packages with no `compatibility.verified` value (availability UNKNOWN). The manifest therefore names **14.367**, the build actually boot-tested, and sets minimum 14.367 / maximum generation 14.
- The planning target remains **14.369**, not yet available/tested here. The verified declaration covers this minimal package only, not future mechanics, permissions or sheets. Re-run runtime checks as features arrive.
- During CLI discovery, `--help` unexpectedly started Foundry against its default data directory; that process was immediately stopped without entering a world. Subsequent tests used only the separate directory. Use documented startup options, not `--help`, for this application.

Bruce subsequently authorized author review and merge on October 17, 2026. Author review found and fixed asset validation gaps: encoded/URL paths and directories declared as file assets now fail validation. Seven package tests pass after these fixes. This is not independent review.

## Character/ability editor evidence — issue #5

Added real-client integration tests: `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:sheets`. These create temporary users/documents in a disposable world and clean them up. Never enable writes against a campaign. The same Foundry 14.367 / Node 24 environment passed:

- Native V2 character form edits, save and reload; ability description/outcomes save and reload.
- Invalid out-of-range/fractional attributes, overspent Grit and HP above maximum rejected. Custom NumberField cleaning preserves invalid input for validation instead of Foundry's default silent rounding/clamping.
- A real player owner can save; an observer sees disabled fields and is denied by the mutation service.
- An unlinked token's HP edits survive reload without changing the base Actor.
- Zero uncaught browser errors. Headless Chromium warns about hardware acceleration; this is not a system deprecation.
- Character screenshot inspected for palette, readable form fields and typography. Full accessibility, detached-window and usability acceptance remain under U04/E06.

This is a draft editor, not a completed character builder. Base HP is manually recorded until the creation ledger exists; current Fortitude never recalculates HP. Attribute sum is displayed, not enforced on intermediate drafts. Ability outcomes remain plain text until structured handlers arrive. Drop acquisition is explicitly blocked so native Item copying cannot bypass future purchase rules.

Fonts are copied unchanged from `design/player-book/fonts` at the pinned rules commit (see source-baseline). Cinzel and EB Garamond are bundled with their SIL OFL notices in `static/fonts`; no book artwork is imported here.

## Native roll implementation — issue #6

The attribute buttons open a cancellable foundation dialog with Boon/Bane inputs and a live formula preview. This is not yet the U01 ability-selection/cost workflow. The service reads the current owned Actor's effective attribute, cancels Boons/Banes before capping at three extra dice, and evaluates a native `foundry.dice.Roll`. Retained faces determine natural 111/666 and tier; rolled dice remain in the native serialized ChatMessage. The summary is rendered only when `message.isContentVisible` is true. V14 `messageMode` replaces deprecated `rollMode`.

References: [V14 Roll API](https://foundryvtt.com/api/v14/classes/foundry.dice.Roll.html), [V14 DialogV2 API](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html). Signatures also checked against installed 14.367 source.

Unit tests cover cancellation order, caps, tier boundaries, natural overrides, malformed inputs and all 216 retained d6 triples across attributes -2 through +2. Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:rolls` against the disposable world for native dice/dialog/chat/reload checks.

Runtime result on Foundry 14.367: keep-high and keep-low retained faces match native die results; dialog preview updates correctly; each native chat view receives one summary; serialized roll/snapshot survive reload byte-for-byte; cancel adds no message; zero uncaught page errors. Multiplayer private/blind visibility remains part of R01 rather than a completed claim here.

## Compendium round-trip evidence — issue #8

The official [Foundry CLI](https://github.com/foundryvtt/foundryvtt-cli) is pinned to **3.0.5**. `npm test` compiles synthetic JSON fixtures, extracts them, recompiles them and extracts them again, comparing complete records. The fixtures include an Actor with an embedded ability and ActiveEffect, and a JournalEntry with an embedded page and Actor UUID reference. Embedded records require their own CLI `_key` paths; the Journal fixture explicitly includes `categories: []` to match extraction normalization. These fixtures contain no book text or artwork.

The Foundry **14.367** runtime test also passed: pack documents load, embedded IDs survive, the Journal UUID resolves and enriches without a broken link, and native Actor and Journal imports with `keepId`/`keepEmbeddedIds` preserves the fixture IDs and attribute value. The imported temporary documents are deleted. Unknown Actor types are rejected by native validation. A pre-existing world Actor with the fixture ID causes the test to stop rather than overwrite it. No uncaught browser errors occurred. This is not yet evidence for 14.369 or a production content importer.

Reproduction in the disposable `hol-development` world only, using Node 24:

1. Run `npm run stage:pack-probe` to compile into ignored `test-results/pack-probe/{actors,journal}`.
2. While the test server is running, run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:pack-runtime -- --prepare`. This creates the native world compendia and reports their relative paths.
3. Stop the test server completely. Replace only the two newly created fixture pack directories (`packs/hol-fixture-actors` and `packs/hol-fixture-journal` inside the disposable world) with the corresponding staged directories. Never replace a pack while Foundry is running or use a campaign data directory.
4. Restart the isolated server with `--dataPath=/tmp/hol-foundry-test --port=30014 --world=hol-development`, then run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:pack-runtime`.

The shipped system manifest does not advertise these test packs. All database compilation uses the official CLI; no custom LevelDB writer is introduced.

## Combat/effect timing — issue #9

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:timing` verifies scoped native V14 expiry and once-only fixture ticks across two GMs, duplicate calls and reload. See [the timing evidence and limitations](research/turn-timing-prototype.md). The prototype is not connected to gameplay hooks.

## Foundry 14.369 baseline — issue #28

On October 17, copied the installed application to `/tmp/hol-foundry-runtime/resources/app` and used Foundry's official Stable updater against a separate empty `/tmp/hol-foundry-update` data directory. The updater installed **14.369** and shut down normally. The original `/home/bruce/foundryvtt` remains **14.367**. Stopped the old disposable test server before copying its data to `/tmp/hol-foundry-test369`; started the updated application on port 30014 with that copied world. No live campaign data was used or migrated.

Actual 14.369 / Node 24.22.0 / Chromium results: startup smoke, character/ability sheets, owner/observer permissions, unlinked-token persistence, roll dialog/native dice/chat, CLI pack imports, turn/expiry timing, and the two-GM/two-player authority probe all pass. Build/manifest validation and 16 Node tests pass. The manifest now verifies **14.369**, retaining the previously tested 14.367 minimum. This declaration covers implemented features; it does not complete the remaining authority or canvas gates.

The 14.369 join form uses `select[name=userId]`; test login now supports that and the 14.367 username input through one helper. Document-only roll tests disable canvas; sheet keyboard tests keep canvas enabled at low rendering settings because core Tab handling references the token layer even in no-canvas mode. The attempted no-canvas sheet run exposed that core error and was reverted; separate movement/levels testing remains required. The known hidden-compendium confidentiality limitation is still reproducible in 14.369 (`visible: false`, direct read succeeds), so no confidential payload guarantee is made.

## Canvas proof — issue #10

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:canvas` tests native waypoint pause/resume, exact square membership, terrain-aware costs, wall stops and two-level surface culling. See [canvas evidence and implementation boundaries](research/canvas-prototype.md). It requires enabled canvas and a disposable local world.

## Fixed damage and healing arithmetic — issue #31

`src/rules/damage.mjs` calculates reviewable per-type breakdowns, highest capped weakness before resistance, one minimum point per damaging event, post-resistance wound ties, capped healing and upfront HP affordability. Zero-damage effects stay non-damaging; summons reject healing and healing-harmed recipients require their printed Life attack outcome. Tests include the full single-type damage/weakness/resistance boundary grid and malformed/overflow inputs. This pure layer does not yet apply HP, pay costs, trigger wounds or coordinate document receipts; those remain A03 integration work.

## Character learning catalog — issue #33

The pinned-source importer produces 452 records with stable IDs, source hashes, complete origin pairs, class signatures and rank prices, ancestry traits/contributions and ability learning prerequisites. All references resolve and origin grants satisfy their paired cards' rank requirements. Tests distinguish universal actions from purchases and reject unknown metadata rather than silently infer it. See [content metadata](../content/README.md) for reproduction and the remaining automation boundaries.

## Development ledger and eligibility — issue #35

The pure development engine rebuilds origin/class grants and ordered purchases, gives duplicate compensation only to its creation stage, expires both unused pools and retains invalid draft entries with repair reasons. Eligible choices sort first; blocked choices remain in the result with exact reasons. Milestone awards bank `8 + level` DP once per newly crossed level, grant Grit/signature choices at 3/7, preserve spent Grit and require fresh safe-place approval before advancement spending.

This validates the DP/learning ledger, not a complete character: ancestry/trait effects, languages, equipment/recipe adapters, final Foundry persistence and wizard UI remain required under #18. `creationLedger.valid` means its ledger inputs passed, not that those other character-completion checks are satisfied. Recipe eligibility consumes explicit compatible-crafting context from the future adapter; it never guesses from a card's prose.

## Creation identity and languages — issue #37

The creation preview validates two distinct ancestry traits and calculates frozen creation attributes, base HP/Speed, explicit +1 trait benefits, Conditioned Body purchases, capacity, coins and initial Grit. Language grants preserve separate understanding/expression, spoken/signed and literacy permissions; the Human extra-language trait grants two distinct spoken-only choices. Common can be renamed and language availability changed through supplied campaign definitions. Regional/ancient languages must have concrete campaign definitions rather than placeholder identities. Contextual trait automation, inventory completion and final actor commitment remain separate work.

### Acquisition and inventory metadata

Issue #38 adds source-locked market metadata for 43 equipment records, 10 recipe permission records and a reviewed acquisition adapter for each of the 350 abilities. Run `HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run validate:inventory` to reproduce from immutable Git objects. Any changed ability hash requires review, including grants stated outside the acquisition paragraph (Smoke in a Bottle grants both Smoke Flask and Travel Food).

`acquireAbility` is a pure plan: persist inventory, recipe knowledge and its receipt together through the later document service. Shared compatible equipment is reused; every ability's acquisition is consumed even when equipment was already owned. Selling an item does not recreate it on replay. Weapon hand choices and recipe selections remain explicit. Knowledge grants no materials or finished supplies. Ordinary Recipe Study remains a development-ledger purchase, not a repeat equipment grant. Recipe metadata describes permission and caps; crafting outcomes, item effects, purchasing UI and Foundry persistence remain separate work. Market prices are benchmarks, with special-order availability retained. Exactly one worn ordinary outfit can be excluded from Bulk; carried spares and containers count normally.

### Guided creation draft

Issue #41 connects the pure ledgers and acquisition adapters to `CreationWizard`, a native V14 Handlebars ApplicationV2 opened from the character sheet. Eight steps cover identity, ancestry/languages, complete origin pairs, level-0 learning, class, level-1 learning, equipment and review. Eligibility sorts available choices first while displaying disabled choices and their reasons. Named book links provide source detail. Acquisition choices refresh crafting permissions before subsequent recipe purchases. Shopping tracks exact coins and Bulk. Saving and navigating persist only an actor flag, separately from committed mechanics; final character commitment is deliberately unavailable in this increment.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:creation` passed on 14.369: full valid draft, duplicate-origin grants, two Conditioned Body purchases in distinct stages, recipe choices, disabled learning options, search, shopping, review, unchanged character HP, reload/resume and backtracking. Visual inspection corrected inherited dark-theme heading/definition contrast and banner spacing. Draft saves check their last observed revision and reject known stale windows, but are not a distributed compare-and-swap or final commitment authority. Closing without Save retains the last saved revision. Creation commitment and advancement remain tracked by #18.

### Creation commitment and native inventory

Issue #43 adds typed equipment Items and an owner-requested, assigned-GM creation service. The request is a native ChatMessage; authorization uses its server-established author, not a user ID supplied in a socket payload. A fixed GM socket binding serializes requests. The GM recomputes the saved draft against the pinned catalog, checks revision/source, validates every Item strictly, then submits statistics, embedded Items and the initial receipt in one Actor update. Existing personal data and compatible equipment are preserved. A verification checkpoint checks created Items before marking the receipt complete. Replays never replenish HP/Grit or recreate sold items.

**Native behavior discovered on 14.369:** an Actor update containing an invalid embedded Item can accept parent changes while the invalid Item is absent from the usable collection. Do not describe native validation as all-or-nothing. The service therefore constructs/validates every proposed Item and validates the parent before writing; it also verifies IDs after the update. Incomplete verification is reconciliation work, not permission to repeat grants. The reference tests cover an invalid-quantity Item caught before the write, concurrent requests, real-author permission denial, unrelated-data preservation, spent-resource replay, reload persistence and loss of authority after reload.

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:creation-commit`. The authority must start unbound for this isolated test; it restores the prior setting afterward. Production handoff/reconnection recovery remains under #7: binding to a different client is intentionally rejected, and reloading the selected GM does not silently adopt unresolved work. Until that is resolved, this is a development workflow, not a claim of unattended multiplayer production readiness. Learned abilities are persisted with source identity and explicit pending-automation status; their action adapters are not fabricated from default sheet values.

The commitment test also passes with `HOL_TEST_COMMIT_UI=1`: a player uses the Review screen's Create button while another request is submitted concurrently; the completed native character sheet opens. This variant enables canvas for the player's ActorSheetV2. It also verifies an existing Craft Tools Item is reused rather than duplicated. The source pin is stored with each saved draft; an unpinned/outdated draft must be reviewed and saved before commitment.

### Advancement workflow

Issue #45 adds the advancement browser and pure draft preview. The DA awards milestone levels and approves safe-place spending; owners choose pending class signatures and purchases. Available options sort first, blocked choices remain visible with reasons, recipe/equipment selections are explicit, and saved drafts survive reloads. A changed committed ledger requires an explicit refresh/review. The shared character authority queue serializes creation and advancement; native message authors determine who may award milestones or spend an owned character's DP.

Milestone high-water marks prevent duplicate DP/Grit. Conditioned Body increases maximum HP without healing. One More Dawn adds its once-only Grit without resetting expenditure. Advancement commits carry the ledger, native Items and receipt together and use the same strict Item preflight/verification as creation. Existing Items remain user-owned snapshots; acquired actions are still marked pending until their effect adapters are imported.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:advancement` passes on 14.369 with a GM and owner player: unauthorized self-award, repeated DA award, safe-place gate, saved draft reload, UI commitment, recipe/tool grants, replay, and persisted resources. The extended scenario jumps from level 2 to 7, chooses both earned signatures, purchases One More Dawn and the new level's Conditioned Body, and verifies 61 DP, maximum HP 21/current HP 3, Grit granted 5/spent 1. Full charactermancer acceptance (#18) still includes content explanations, drag/drop, reference-character parity and authority recovery.

### Coordinator handoff and recovery — issue #7

The earlier fixed-binding reload limitation is superseded by the [bounded coordinator protocol](research/authority-prototype.md#production-character-coordinator--october-17-14369). Open system settings → Manage automation. The active GM enables the initial coordinator. Release waits for queued work before another GM/browser can take over. Idle same-browser reloads resume; a committed character receipt can reconcile a lost acknowledgment. Unknown writes remain suspended until reconciled or until the DA closes former GM windows, relaunches the world and confirms recovery. Use HTTPS or localhost for the GM's browser lock. No timeout steals a live coordinator.

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:coordinator` in the disposable world with no existing binding. The separate restart test deliberately leaves a fixture and uncertain checkpoint: run `npm run test:coordinator-restart -- --prepare`, then `--check-blocked`, stop/restart only the isolated world, and run `--verify` with the same environment. Its fixture metadata is ignored under `test-results/`. Never run this procedure against a campaign. The legacy `test:authority` remains the independent bounded multi-target receipt probe; the new coordinator does not turn arbitrary multi-document changes into transactions.

### Action plans and turn arithmetic — issue #48

`src/rules/actions.mjs` provides pure turn-budget, conversion, movement-cost, declaration and continuation plans. Main/Maneuver/Reaction use counts; converting Main and both resulting Maneuvers permits three movement allowances. Dazed/Grappled retain categories at turn start using the greater restriction, while live grapple/helpless restrictions still prevent movement. Defense spends no Reaction even when a helpless defender is being rolled for. A Reaction may be declared off-turn. Free attacks cannot recursively grant another free attack.

Declaration consumes the action once. An interruption can permanently stop the operation without spending its extra HP or item quantities; continuation checks affordability and pays those extras once. Reusing an ID for changed choices/costs is rejected. The pure returned state/resources must be persisted with their receipts by a permission-checked coordinator; these helpers perform no native writes and do not grant authority to an override payload. A DA exception records an actual-user/reason audit, which the future service must authenticate. Inventory dice, multi-Actor payment, geometry and native combat integration remain separate handlers.

Control perspective is explicit, independent of Actor type or the person rolling: Basic Melee gives 2/3/5 from a player attacker roll and 5/3/2 from an NPC attack's defender roll. Authored defender-oriented tables are not reversed twice. This covers Basic Melee only, not arbitrary monster damage tables.

Source: pinned `design/player-book/manuscript/06-playing.md`, `design/rules/conditions.md` and `design/cards/basic-melee.md`. The book does not explicitly resolve converting into an action category that was not retained. That branch reports a DA-adjudication reason and permits an audited exception; it is not asserted as a new universal rule. The action-plan tests cover sprint arithmetic, live restrictions, frozen category choice, replay, interruptions, costs, control perspective, malformed state and overflow. Full A01/A05 integration is not complete yet.

### Alternating-side encounter tracker — issue #50

The native Combat document now uses `HOLCombat`, with a scoped enhancement of the V14 CombatTracker. Add native combatants, review their explicit Players/Opposition assignment, enable the GM coordinator, and start the HOL encounter. One native unmodified 3d6 roll establishes the first side (12+ Players). Each side chooses an unacted participant; when a side runs out, the other completes its turns. The same opening side starts each round. The tracker shows Active/Acted/Ready/Next round states and retains core token controls.

Owners can request selection/end of their participant's turn; the DA can handle any participant. The actual native ChatMessage author is checked. Finish authorization uses the actual current combatant, never a caller-supplied alternative ID. The coordinator serializes requests and writes round, native turn index, HOL history/serial and the receipt in one Combat update. A completed request can be replayed after its turn has ended, but edited request payloads cannot reuse its receipt. A stale revision never selects a second participant. These ownership checks concern changing encounter state; they do not restrict the separate any-player Defend workflow.

Late arrivals require a DA choice of this round or next round and a recorded reason. Withdrawals retain acted history; finish an active turn before withdrawing it. Native deletion/defeated flags do not silently rewrite the HOL roster. The DA explicitly withdraws a participant from the active roster when appropriate. Rewind deliberately does not refund actions, effects or time; audited exceptional-turn corrections remain a separate feature. New action budgets and condition timing are not yet connected to turn phases. No arbitrary six-second world-time advance is inferred from a HOL turn.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:combat` verifies native tracker clicks and opening dice, explicit sides, real player permission denial, owned choices, duplicate selection, uneven sides, fixed next-round starter, history/reload and late admission on 14.369. Pure sequence tests independently exercise both opening thresholds and roster edge cases. The native panel was visually inspected. The coordinator, creation-commit and effect-timing regression suites remain applicable after the shared service change.

API references: [Combat](https://foundryvtt.com/api/v14/classes/foundry.documents.Combat.html) supplies the native document and turn/round methods; [CombatTracker](https://foundryvtt.com/api/v14/classes/foundry.applications.sidebar.tabs.CombatTracker.html) supplies the existing tracker enhanced through its render hook. Installed 14.369 code and runtime were checked for nullable turn indices and tracker structure. No private core methods are called or proprietary source copied. Compatibility with modules expecting initiative order or automatic world-time progression still needs explicit testing.

The timing regression exposed a test assumption: native embedded-effect iteration order is not guaranteed to match creation order. The test now identifies start/end fixtures by their expiry key, so it checks the intended effect rather than random document ordering. Both events, repeat guards and unrelated-Actor exclusion pass after that correction.

### Condition contribution plans — issue #52

`src/rules/conditions.mjs` keeps individual source IDs, ratings and temporary/starred/maintained/binary persistence. Severity aggregates while binary and duration-only conditions remain a single active state. Dazed/Grappled/Slowed and immediate helpless states produce explicit inputs for the action planner. Poisoned, perceived Frightened, the actual target's Grappled rating and overlapping helpless states produce labeled roll sources; inventory dice receive none. Defense-perspective Grappled is a Bane to the defender, corresponding to the attacker's advantage. Dazed and Prone do not invent extra defense penalties. Death-roll output currently includes the explicitly stated Poisoned penalty only.

An end plan calculates distinct Burning/Freezing/Bleeding events before reducing temporary ratings. Starred contributions and maintained grapples survive. Typed fire/cold events use the damage engine; Bleeding directly supplies its rating as damage without resistance or an invented typed weakness/wound table. Later survival/source handling must determine any required wound consequence. The plan has stable turn/condition event IDs but performs no writes: native phase coordination must persist its effects and receipt together and honor `ready` before applying anything.

Temporary severity decays by one total point for the condition, not one point per source. The default source allocation is oldest ordered contribution first with stable ID tie-breaking; `decayPriority` permits an explicit source selection, which matters for separate fear sources. Source removal is distinct from generic temporary reduction. Frightened requires an explicit complete perceived-source list; omitted perception does not silently remove its Banes.

The pinned book describes duration-only states and separate temporary/starred portions but does not settle multiple independent temporary duration sources. That case returns a pending DA choice of independent countdowns or a combined countdown; callers must persist the ruling. This is not a new universal stacking rule. Native ActiveEffect/HUD integration, combat-phase receipts, passive ability sources and survival transitions remain subsequent work. Pure tests cover mixed sources, damage-before-decay, resistance/bypass, source removal, perception, nonstacking helpless penalties, duration decisions and invalid records.
