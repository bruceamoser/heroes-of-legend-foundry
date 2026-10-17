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

### Native condition sources — issue #54

HOL conditions now live on native ActiveEffects. The character sheet opens a source panel; the HOL status HUD entry API opens the same panel instead of blindly toggling every effect with that status. The native status palette uses HOL conditions while preserving core defeat and movement-mode statuses. Blinded/Invisible are mapped to the native special-status IDs; complete senses/levels behavior remains C04/D04 validation, not claimed by this integration.

The DA can add an identified source, reduce a particular temporary contribution, or retire a specific source. Owners/observers can inspect accessible actors but manual changes require the actual request author's GM role. Retired effects remain disabled audit records rather than disappearing; their native status clears when no active source remains. Starred and maintained effects cannot be removed by generic temporary reduction. Unrelated effects and existing source IDs are preserved. Editing the form survives unrelated panel refreshes.

Each coordinator request checks its last observed condition revision. Strict native effect preflight precedes one Actor update containing effects, revision and receipt, followed by created-ID verification. Replay of a retired grant does not restore it. The same path handles an unlinked Token's synthetic Actor, preserving isolation from its base Actor. `actorContributions` reads only active, nonretired effects and validates their typed source records for later roll/phase services. Native generic status effects from older worlds are not silently converted into HOL records; migration remains E07 work.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:conditions` passed on 14.369: permission denial, separate temporary/starred sources, source-specific reduction/removal, native status membership, unrelated-effect preservation, panel click, HUD entry API, synthetic-Actor isolation, reload and replay. The panel was visually inspected; the test does not claim an actual canvas HUD click or vision-occlusion certification. Sheets, combat tracker and coordinator regressions also pass. End-turn ticking/survival are not enabled by this increment.

[ActiveEffect](https://foundryvtt.com/api/v14/classes/foundry.documents.ActiveEffect.html) and [status configuration](https://foundryvtt.com/api/v14/variables/CONFIG.statusEffects.html) were checked against installed 14.369 behavior. Icons reference Foundry's installed SVGs; no Foundry assets are copied into the repository. Automation should use typed condition services, not the generic `toggleStatusEffect` path for HOL condition IDs, because source ratings and persistence require explicit choices.

### Native turn budgets — issue #56

Encounter start initializes Reaction availability; selecting a participant refreshes that participant's counted Main/Maneuver/Reaction and movement budget in the same Combat update as the turn/receipt. Budgets persist between participants' turns rather than resetting on every global turn. Dazed/Grappled choices are requested at the selected participant's turn start and validated against current contributions. Later changes do not recalculate retained categories, while current Grappled/Paralyzed/helpless states still restrict movement/actions. A 0-HP actor cannot use ordinary actions or movement; full Dying/Grit/Last Words workflows remain C01.

The tracker exposes Main → Maneuver and Maneuver → movement. Two resulting Maneuvers plus the original allowance produce a three-allowance sprint. Owner requests share the GM coordinator and encounter revision/receipt path. A DA exception must carry a reason and the actual author must be a GM; a player-supplied claim of DA authority is rejected. The pure planner records the exception. The service supports that explicit adjudication payload; a general exception-management UI is still pending.

Created characters derive movement from frozen ancestry/trait speed base plus current Agility, current Brawn capacity, and every carried item's Bulk. Exactly one worn ordinary outfit is excluded; bags do not hide contents. Slowed is applied separately. For an incomplete/custom profile without a speed base, the DA enters a speed ruling and reason in the turn dialog; it persists for that encounter instead of guessing a speed. The budget snapshots the base movement for the turn; automatic mid-turn equipment/attribute speed changes and path charging remain D01/B05 integration.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:budgets` passes on 14.369: player category dialog, frozen Dazed selection, live grapple/paralysis restrictions, genuine versus forged DA exception, native conversion button, full sprint, replay, turn refresh, preservation between turns, reload and explicit custom speed. Pure movement tests check capacity, worn clothing, negative attributes, malformed equipment and overflow. The ordinary combat suite also passes with explicit fixture speed metadata. Ability cost execution and condition end-turn damage/decay are not yet connected by this increment.

### Defend maneuver execution — issue #58

The source-locked Defend Item now exposes **Use Defend**. Its owner can declare it during the character's selected encounter turn. The coordinator validates the native author, owned Item, pinned adapter hash, participant and encounter revision, then durably reserves one Maneuver. A native ActiveEffect contributes one defense Boon; repeat uses spend another Maneuver but do not stack that benefit. The anchor remains valid through intervening turns and expires immediately when the next own-turn budget begins. Native effect disabling reconciles its visual record after that mechanical expiry. Deleted encounters invalidate the anchor; orphan visual cleanup remains pending.

This is the character's Defend **maneuver**, distinct from the unrestricted attack-card **Defend response** required by #14. The shared defense dialog consumes the active benefit as one automatic Boon. Out-of-combat use remains pending.

The Combat stores a durable pending operation before the Actor effect write. Its final settlement receipt is written only after the effect receipt and continuation succeed. Pending operations block further encounter progression and new actions. Manage automation offers **Resume reserved action**, including after the original chat request is deleted. A known failure before the effect write can resume without paying again. An unknown native write acknowledgment still follows the coordinator's suspension/relaunch protocol; this test does not claim to prove every network failure. If an applied effect is manually deleted before settlement, recovery stops for DA reconciliation rather than recreating or repaying it automatically.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:defend-maneuver` passes with separate GM/player browsers on 14.369: native Item sheet activation, payment, repeated non-stacking use, overspend rejection, intervening-turn preservation, next-own-turn expiry, injected pre-effect continuation failure, blocked progression, deleted-chat recovery through the native settings panel and receipt replay. The test waits for native notification insertion before deleting a chat entry: deleting during the core 100ms insertion animation exposed a 14.369 `ChatLog` null-element error. No proprietary core patch is included.

### Shield Block reaction execution — issue #88

The reviewed `ability-shield-block` adapter uses the same durable action phases as Defend: the coordinator validates the actual request author, pinned source, participant, encounter revision and attack context, reserves one Reaction, writes an Actor benefit receipt, and only then writes the Combat settlement receipt. A defense handled by any player may qualify a selected non-owner Actor; ownership remains required for standalone use. The exact Ability Item must belong to the selected defender.

Shield Block requires an authentic GM attack card with an explicit DA `blockable: true` judgment before the defense is rolled. The GM creature sheet records that judgment when creating the card; it is never inferred from physical damage and players cannot override it. Legacy cards without the field, and historic cards whose encounter is no longer loaded, allow ordinary defense but show Shield Block as unavailable. Eligibility is rechecked after reservation. Loss of the held shield reflects an interrupted continuation with the Reaction still spent, never a refund or repeated effect.

The benefit is one automatic Boon until the start of that defender's next turn. It stacks with Defend because their benefit keys differ, but repeated Shield Block effects do not multiply. The effect stores both the reviewed Ability source and the exact held shield Item. If a later eligible Shield Block is paid for while a same-key benefit remains, that one effect is refreshed to the newly selected held shield before continuing. At roll preparation it applies only while that stable shield catalog Item (`item-ordinary-shield` in the current equipment model) remains held and the incoming card remains blockable. The current equipment model has no general shield category, so display names are never used as capability identity.

The shared dialog lists only reviewed Defend and Shield Block options, available first and unavailable with specific own-turn, Maneuver, Reaction, attack-judgment and held-shield reasons. An unresolved defense attempt blocks activation; a completed or abandoned earlier attempt does not block forever when the player explicitly selects another attempt and records its reason. Activation settles before the dialog refreshes its source basis; no dice are evaluated while that activation is pending. The coordinator stores the original request and verified incoming-attack snapshot, so deleted request chat can be resumed without trusting a replacement entry or repeating its cost, and continuation rejects a changed attack snapshot. The serialized native runtime script is `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:shield-block`. It must run only against the isolated development world.

Validation for #88: Node 24 checks pass 134 tests after the inventory-plan integration. Isolated Foundry 14.369 suites pass for Defend, Shield Block, defense responses, NPC attacks, roll sources and passive defenses. The shield fixture uses a linked targeted defender so its Actor matches the encounter budget; unlinked-token isolation is covered separately by damage/defense tests. Both native opening-side paths are handled. Additional-attempt inputs update ability choices in place, preserving focus and the immediate Roll click. Visual inspection confirmed the HOL theme and disabled-reason presentation; reasons are joined as sentences rather than comma-coerced arrays. This remains bounded ability coverage, not full catalog automation.

### Shared roll sources — issue #60

Sheet attributes now open a shared ApplicationV2 roll preparation window. Automatic condition sources remain distinct from editable, labeled situational Boons/Banes. Fear sources require an explicit perceived/not-perceived choice. The preview shows uncapped source totals, canceled pairs, capped net extras and the native formula; its footer keeps the Roll button visible while source details scroll. A changed character/condition/benefit snapshot at submission refreshes the preview and requires another click rather than silently rolling altered statistics. Closing creates no roll or cost.

The exported `promptDefenseRoll` entry uses the same dialog without an owner gate. It includes active Defend benefits, Grappled and the single overlapping helpless penalty, with zero HP supplying unconsciousness. It creates only a native roll ChatMessage; it does not spend a Reaction or mutate the defender. Attack-card linking, Threat, ability/reaction choices and resulting damage remain subsequent #13/#14 work. Attribute rolls still require ownership. Generic inventory/wound rolls are deliberately excluded.

Chat records the actual roller separately from the Actor, exact source labels/amounts, perception choices and retained dice. The service rechecks the prepared snapshot immediately before starting native dice evaluation. This is not a transaction with other clients: updates arriving after dice evaluation begins belong to a later adjudication, and native chat creation failure recovery remains part of the future attack operation workflow.

`npm run check` passes 72 tests. `test:rolls` and `test:roll-sources` pass in the isolated 14.369 world: keep-high/low serialization, actual non-owner defense UI, explicit fear choices, poison plus Defend sources, labeled adjustment, changed-state review with preserved choices, actual author/source persistence after reload, expiry, cancellation and no Reaction/Actor mutation. The forest/gold/ivory dialog was visually inspected. This advances #13 but does not close its ability-selection acceptance criteria.

### Native creature profiles — issue #62

A separate `creature` Actor type stores printed attributes, HP, CV, Speed, size, Armor DR, Stability, Evasion/Threat Boons/Banes and the Basic Melee defense-oriented damage profile. It has no character Grit or charactermancer. The V2 creature sheet supports explicit Save, native permissions, condition inspection and owned attribute rolls. Profile fields use strict numeric validation; current HP cannot exceed maximum HP. Creature type does not determine who rolls an attack: control perspective remains a separate action-workflow decision.

Native turn budgets take printed creature Speed directly, without adding Agility again. Live conditions still restrict that budget. Size is stored for the forthcoming token setup workflow; editing it does not yet resize existing tokens. Armor/Threat/Evasion are explicit data for subsequent attack/damage services, not claimed as applied in the current standalone roll dialog. Automatic death at zero HP, complete creature import, special healing, nonordinary anatomy, equipment encumbrance and action execution remain separate plan steps.

The canonical reference is pinned `design/da-book/manuscript/09-using-the-bestiary.md`. Basic Melee's default 5/3/2 is editable because the printed profiles also include 4/2/1 and 2/1/1. Full bestiary ingestion must assign each exact profile rather than deriving damage from CV or another attack.

`npm run test:creatures` passes on 14.369 after restarting the isolated world to load the new manifest type: native sheet edits/reload, strict invalid-value rejection, printed-Speed encounter budget, no PC Grit, observer write denial, owner rolls and independent synthetic-token HP. The native sheet was visually inspected; its type label is localized. The build/validation and 72 existing tests also pass.

### NPC Basic Melee attack cards — issue #64

The creature sheet's **Declare NPC Basic Melee** is an explicit DA choice of NPC attack perspective. It is not automatically called for every creature Actor; player-controlled creature attack routing remains separate. The selected creature must have a current encounter budget. The coordinator validates the actual native GM author and revision, spends one Main once and stores the attack snapshot plus final receipt in the same Combat update. Reprocessing presents the existing snapshot without another payment.

The click captures every native GM target Token UUID before asynchronous work. The public card describes adjacent-target Agility defense, printed Threat and the creature's actual Basic Melee defense-oriented damage profile. **Defend** is available to any player. Multiple suggestions open a chooser; a single available suggestion prefills directly. **Change defender** permits correction, and the chooser accepts another visible token, accessible Actor or an additional Actor/Token UUID. Ownership is not a defense-roll gate. Deleted suggestions lead back to a usable chooser after reload. Hidden suggestions do not disclose their names to players.

The shared dialog adds declared Threat to current defender conditions/benefits and labeled situational choices. Its native roll records the incoming attack ID, actual roller and defender, and the selected printed physical damage before resistance. This remains a clearly labeled development **roll-only** card: automatic damage, attacker-condition/perspective modifiers, range/geometry guidance, per-defender committed-response duplicate protection, reaction choices and network-safe response settlement are not connected yet. Repeated card use does not spend another Main, but currently produces independent rolls for DA adjudication. It must not be presented as completion of #14.

Validation: Node 24 build/validation and 72 tests pass. `test:npc-attacks`, `test:roll-sources` and `test:coordinator` pass on 14.369. The attack scenario uses actual canvas multi-target selection, native creature-sheet declaration, forged non-GM request rejection, receipt replay, another player's non-owned token, an additional defender, explicit defender correction, persisted incoming Threat/profile outcome and deleted-target recovery after reload. The incoming defense dialog was visually inspected. The fixture identifies embedded Tokens by Actor identity rather than assuming native creation-result order.

### Per-defender roll attempts — issue #66

Attack-linked defense submissions now use native ChatMessage requests and the selected GM coordinator. The original player remains the native message author and recorded roller; the coordinator evaluates native dice on their behalf with interactive/manual dice disabled, updates that same message with the result, then settles the attack-card receipt. Standalone attribute/defense checks retain their existing local roll path. Native public/GM/blind/self message mode is applied before submitting the request.

Opening/canceling a dialog reserves nothing. Submission reserves one attempt for the native Actor identity; unlinked Token Actors are distinct defenders. The selected Token UUID is also preserved for attribution and the native speaker, including linked tokens. A second simultaneous submission cannot produce another official roll for that defender. Separate defenders remain independent. An explicit additional attempt requires a reason and retains prior results; no previous damage is silently undone or applied again. After an earlier attempt, the dialog exposes the additional-attempt controls. Unknown pending attempts require DA review rather than a new roll.

The public attack ledger stores a SHA-256 request digest instead of copying the complete submitted context. The full additional-attempt reason remains on the original request under its chosen message visibility. Public response rows reveal status, not dice or quality. This preserves native display behavior; it does not add a secrecy boundary beyond the previously documented Foundry client-data limits.

The rolling phase is durable before dice evaluation. A saved child result can settle the final attack receipt without rerolling. If no saved result exists after interruption, retry does not evaluate dice again. Manage automation provides **Resume saved result** and an explicit DA **Abandon unknown result** disposition with a reason; abandonment preserves the audit and allows a subsequent explicitly requested attempt. A saved roll cannot be abandoned through that path. Unknown native write acknowledgments still require the coordinator's established reconciliation/relaunch protocol. The recovery fixture reconstructs persisted phases; it is not a claim to have simulated every network failure.

This replaces the earlier untracked repeat-roll limitation, but consequences remain manual. Reaction/ability costs, automatic damage/wounds and complete attack-perspective modifiers remain open #13/#14 and A03/A07 work.

Validation: build/validation and 74 tests pass. Native 14.369 defense-response and NPC-attack suites pass after the final changes. Shared-source and coordinator regressions also pass. The new three-client scenario verifies racing submissions, independent defenders, native original authorship, explicit additional-attempt UI, stale-source rejection, blind mode, and no HP mutation. Saved-result recovery temporarily makes any new dice evaluation throw, proving settlement does not evaluate again. The unresolved-result fixture exercises the actual DA abandonment dialog. Native selected-Token identity is preserved through the attack-card roll path.

### Held and worn equipment (#68)

`test:equipment` verifies owner preparation, native held stack state, exact replay, stale inventory rejection, DA-only reasoned encounter/anatomy corrections, observer denial and reload on isolated 14.369. The panel tracks held and worn state independently and counts one held unit per stack; holding does not remove that stack from carried Bulk. Worn state can change which single ordinary outfit qualifies for the Bulk exclusion. Existing items default to unheld and unworn; hand capacity defaults to two until a DA anatomy ruling. Owned item sheets route hand and worn changes through the arrangement panel. Draw/stow/pickup timing and ground transfers are not implemented by this preparation panel.

### Survival rules (#74)

Pure survival transitions distinguish entry into Dying (one wound), damage while Dying (one mark), damage after stabilization (new wound and one mark), locked start-of-turn Grit/death-roll choices and natural results. Own-turn counters make Last Words expire at the end of the second following own turn; damage never restarts that deadline. Healing/safe breath preserve scars and spent Grit. Becoming Dying mid-turn waits for the next start. These tests are rules-layer evidence; native damage, wound results and survival UI are subsequent integration work. The DA establishes whether a breath is safe; the calculator does not infer safety.

### Wound table foundation (#76)

`HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:wounds` reads the pinned Git object and validates its source hash. `validate:wounds` detects drift. The package now includes all 280 approved keyed wound references and typed consequences: temporary/starred conditions, contextual modifiers, movement penalties, immediate push/pull and Last Words. Unknown effect syntax fails import. Direction, Frightened source, contextual activity and anatomy applicability remain explicit table choices. No scene movement or wound effect is applied merely by looking up a result. Dice fixtures enumerate all 216 unmodified triples and validate every table, the five-die cap, source-type elemental condition mapping and consecutive anatomy advancement. Native consequence receipts and treatment are subsequent integration work.

### Native damage (#78)

`test:damage` exercises actual DA authorization, mixed damage, printed creature DR once, unlinked-token isolation, Dying/wound/mark transitions, stale preview rejection, replay, duplicate settled-defense application and reload in isolated 14.369. Settled-defense amount comes from the attack card and must match the saved native dice outcome. The duplicate fixture reconstructs a settled result; the separate defense suite exercises actual multiplayer rolling.

The DA opens Apply damage from a sheet or Review and apply damage on a settled defense. The preview merges the bounded reviewed passive snapshot with event-specific DA sources and includes printed creature Physical DR once. Highest matching resistance/weakness still runs through the existing capped arithmetic. One Actor update persists HP, survival state, pending wound metadata, event and final receipt. A new request for the same defense event cannot apply damage twice. Wound rolls/effects, survival turn integration, generic healing and native defeated-marker reconciliation remain subsequent work. Existing zero-HP actors without survival state, or direct HP edits that disagree with tracked survival, require DA reconciliation; the damage service does not guess away wounds or death marks.

### Recovery and reconciliation (#80)

The DA Health and recovery panel records already-adjudicated healing, safe breath and stabilization, with a source/reason; it does not grant or pay spell/potion/stabilization action costs. Automatic worn Life resistance is included, while the panel field records only an additional event source. It also reconciles imported zero-HP characters and direct HP edits through an explicit audited correction. Ordinary recovery cannot reverse Last Words/death; repeating a correction to existing Last Words retains its deadline. Pending wounds/history and native spent Grit are preserved. `test:recovery` verifies the native panel, Life-resistance healing minimum and HP cap, safe breath, replay after new damage, scars/Grit preservation, Last Words boundaries, actual-author denial, stale state and reload on 14.369. This is DA event recording, not the final player healing-ability workflow.

### Native wound resolution (#82)

Owners can request the saved pending wound’s eligible damage type and native capped roll from Wounds and scars. A durable rolling phase precedes evaluation; unknown results never reroll on retry. The DA can explicitly recover dice with a recorded reason, then review consecutive anatomy skips and apply the result once. Native condition effects, lasting modifier records, scar/remedy data, pending displacement and final receipt share one Actor update. 666 enters Last Words; conditions apply once and source commit changes require content review. Lasting movement/contextual modifiers are recorded but their automatic application and treatment are subsequent work; immediate displacement explicitly awaits legal DA placement.

`test:wounds` verifies owner UI/native dice, replay without evaluation, DA-only application/recovery, unknown-phase refusal, recovered Cold effects, once-only native conditions/scars, anatomy advancement, Last Words and reload on 14.369. Deterministic recovery/outcome phases are reconstructed fixtures, not injected network failures; selected-coordinator unknown-write recovery retains the existing relaunch requirements.

### Survival turns and choices (#84)

`HOL_TEST_URL=http://localhost:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:survival`
uses the isolated V14.369 world. It verifies native turn-start Dying choices,
the finish guard, the sheet's Grit button, one-time payment, native death dice,
replay, a known pre-write validation failure after Combat reservation, resumption,
a reconstructed pending death-roll recovery with retained natural sixes, Last
Words through the second following own turn, and reload persistence. The recovery
fixture is not evidence of an injected network failure. Combat, roll-source and
recovery runtime suites also pass against this change.

Turn transitions reserve their Actor work on Combat before changing the Actor.
The Actor receipt prevents repeated clock advancement when settling the Combat
receipt. Manage automation can resume a reserved phase even after the original
request chat is deleted; DA cancellation is limited to unapplied Actor phases.
Other supported mutations wait while the phase is reserved. Pending death dice
cannot be rerolled by retry: Health and recovery lets the DA record retained dice
with a reason. Raw document edits that contradict a reserved snapshot require
reconciliation before that reservation can settle.

This implements survival phases, not condition end ticks or summon controller
phases. Those remain separate engine work. Package validation now syntax-checks
all shipped JavaScript modules as well as checking manifest assets.

### Condition end phases (#86)

`npm run test:condition-turns` uses the same explicit disposable-world environment.
Burning/Freezing damage, Bleeding bypass, source-based temporary decay, starred
preservation, damage waking Asleep, and survival/wound transitions now occur in
one reserved Actor end-phase before Combat settlement. Damage events use distinct
IDs, and overlapping temporary severities decay by one in total. Native effects
are prevalidated and checked after application. Snapshot checks include all
embedded effects so resumption cannot overwrite intervening effect edits.

The first damaging Finish turn dialog asks for event-specific Fire/Cold sources
only when a type is not covered by a reviewed automatic passive. Its saved
manual values are additional DA sources, never a cache of automatic defenses. A
single Freezing tick covered by worn Winter Lining can finish without a manual
defense review. Multiple simultaneous damage types still use an explicit DA
order; overlapping duration-only sources require a combined or independent
duration ruling. These are recorded rulings, not new universal rules.
Summon/controller phases remain separate work.

The Node 24 static suite covers condition resolution as well as the full rules,
data and package checks. V14.369 runtime checks cover the actual ruling dialog,
matching resistance, decay, starred preservation, subsequent turn and reload;
survival (including known phase failure/resume), combat, conditions, and damage
regressions also passed. The tests do not claim complete passive ability or
summon automation.

### Bounded passive defenses (#89)

`passiveDefenseSources` recognizes four pinned catalog effects by stable catalog
ID and validates both the source path and SHA-256. Names, descriptions, unknown
inventory records and bestiary prose never select mechanics. The reviewed
coverage is:

- Wear Medium Armor plus worn ordinary medium armor: Physical resistance 2.
- Wear Heavy Armor plus worn ordinary heavy armor: Physical resistance 3.
- Worn Winter Lining: Cold resistance 1.
- Worn Gravebound Brooch: Life resistance 1 for damage and healing.

The damage, recovery and condition-turn bases snapshot the resulting automatic
sources with the equipment revision. Recomputing before application rejects
changed worn state or catalog provenance. Automatic and manual event sources
are merged into the existing highest-value, weakness-before-resistance, cap-3
arithmetic, so printed creature armor, trained armor and other Physical sources
do not stack. Bleeding continues to bypass resistance. This is bounded catalog
coverage, not general parsing of item or ability prose and not complete passive
automation. Reaction passives, typed bestiary weaknesses and other special
procedures remain separate reviewed handlers.

`npm run test:passive-defenses` is the native fixture for worn equipment UI,
damage/healing application, replay, stale worn snapshots and actor isolation.
Node 24 checks pass with 110 tests. The native fixture passed on isolated
Foundry 14.369, along with equipment, damage, recovery, condition-turn and
survival regressions. Recovery reclaims the coordinator after its test reload
before submitting a new mutation. Saved DA condition policies are reused unless
explicit review or missing order/duration rulings require a new decision.

### Inventory supply dice and healing potions (#91)

`src/rules/inventory.mjs` implements the reviewed d20 -> d12 -> d10 -> d8 -> d6
-> d4 -> out supply ladder. Only a retained 1 steps down, and the caller must
invoke the check after a successful use so the final use still works. Inventory
checks accept no attribute, Boon/Bane or action modifiers. `refillInventory`
applies explicit reviewed step and cap inputs, entering at d4 from out, without
granting recipe permission or creating/splitting supply containers.

`src/rules/potions.mjs` pins the lesser, greater and superior bottle adapters
to catalog IDs, paths and SHA-256 hashes at source commit `9bc9b4f`, plus the
universal `use-a-healing-potion` action. Plans use the existing action, hand,
healing and survival primitives for the giver's Maneuver and free hand,
interruption, another living recipient's Reaction, fixed 6/10/16 healing with
Life resistance and missing-HP cap, and the final supply check. The caller must
supply an explicit boolean giver own-turn state; ordinary off-turn use is
rejected by the action primitive. A zero-HP giver is unconscious and cannot use
the bottle. A zero-HP recipient spends no Reaction. Last Words, dead and
unhealable summon recipients, and bottles already at out, are rejected before
declaration.

Self use requires the giver and recipient Actor IDs to match and their survival
snapshots to agree. The self recipient turn mirrors the giver turn after the
Maneuver is spent, so no stale budget is returned. This identity/snapshot check
is the boundary that prevents a forged second Actor from bypassing adjacency
and the living recipient's Reaction.

The planner returns declarative snapshots rather than mutating inputs. Adjacency
and willingness are explicit booleans, not proof of token geometry, consent or
permission; actor ownership and supply identity still require native service
checks. Inventory faces are accepted only by the separate post-success resolver,
never during preflight. The planner rejects a giver operation ID already present
in the supplied turn state, and a prior recipient Reaction ID when one is
required, instead of returning another applicable heal. It cannot distinguish a
repeat against an unchanged snapshot from the original request, so the
coordinator must check its authoritative operation receipt before applying
healing or requesting the supply die. Durable phases and receipts remain
necessary to prevent a crash or repeated request from rerolling the supply check
or granting a free use. Player/GM UI, native Item action wiring, multi-Actor
transaction settlement and Foundry runtime tests are not implemented in this
issue.

Node 24 `npm run check` passes 127 tests, including 17 focused inventory and
potion cases. This is bounded rules-layer evidence; native UI, multi-Actor
settlement and Foundry runtime validation remain subsequent integration work.
### Two-recipe Ordinary Recipe Study (#93)

The current pinned `ordinary-recipe-study` card at
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3` grants two distinct compatible
ordinary recipes per 2-DP purchase. Creation and advancement now persist
`recipeIds` with exactly two IDs and reject missing, extra, duplicate, known or
incompatible choices before charging DP. A repeat purchase remains legal when
both selected recipes are new; the ability itself is learned once.

Both wizards show every ordinary recipe option, with unlearned compatible
recipes first and known or incompatible recipes left visible but disabled with
a concise reason. The two recipe selections receive distinct defaults only when
at least two eligible recipes exist; otherwise Recipe Study's Add action remains
disabled with the available-count reason. Older saved `recipeId` drafts remain
in place, display their one saved recipe and a player-facing repair message, and
cannot commit until the player removes and replaces that purchase with two
recipe choices. No second recipe is inferred.

This is validation for drafts, not a world-content migration. Existing committed
single-recipe grants and all other purchases, acquisition receipts and crafting
context are preserved without retroactive additions. Relevant direct Node tests
cover the two-recipe boundary, distinct/compatible/known checks, repeat pairs,
2 DP per purchase, legacy rejection, visible blocked options and downstream
crafting-grant context. Node 24 `npm run check` passes all 143 tests. The updated native creation,
creation-commit and advancement fixtures pass on isolated Foundry 14.369,
including persisted recipe pairs and visible blocked options. Native option
assertions inspect the DOM disabled property directly.
### Reference-hero creation parity (#92)

`node tests/reference-heroes.test.mjs` is an offline pure test over
`tests/fixtures/reference-heroes.json`. It does not need a book checkout,
Foundry, a browser or installed dependencies. The fixture pins the complete
`design/characters/*.md` blobs at
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3`, records a SHA-256 for each character
sheet and the index, and keeps all six creation drafts, origin pair choices,
purchases, shopping, acquisition selections and hand use explicit.

The test rebuilds each draft with `creationPreview` and compares it with values
transcribed independently from the sheets: HP, Grit, Stability, Speed, capacity,
carried Bulk, starting/spent/remaining coins, stage pools/compensation/expiry,
learned cards, discipline ranks, recipe knowledge, language permissions,
inventory grants and acquisition receipt selections. This proves pure
creation/catalog parity only. It does not claim native charactermancer UI,
document commitment, drag/drop or Foundry runtime parity.

Ordinary Recipe Study now represents the two recipes printed on Oren’s sheet.
The fixture records Wooden Brace and Simple Replacement Leg explicitly rather
than deriving the expected list from production code. Source hashes are checked
against the pinned source lock. Native campaign language configuration and
six-character document commitment remain separate runtime work.
