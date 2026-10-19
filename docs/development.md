# Development

The V14 package includes guided creation/advancement, native character/creature/summon profiles, source compendiums and core play workflows. Specialty effects and summon lifecycle remain manual; see the current [release checklist and evidence](release-0.1.0.md). Historical issue notes below record the state and evidence at each implementation stage.

## Build and checks

Use Node **24.22.0** (`.node-version`; minimum 24.13.1) and npm:

```sh
npm ci
npm run check
```

The build copies `src/` and `static/` into `dist/heroes-of-legend/`. No transpiler or compatibility library is needed for native ES modules. Manifest validation rejects missing assets, unsafe paths, incompatible generations and mismatched source/package versions. Tests exercise broken-package rejection as well as successful output. CI runs these checks and uploads a development directory artifact. `npm run package:release` creates a reproducible ZIP, standalone manifest and SHA256SUMS in `release-artifacts/`. The tag-triggered release workflow validates and packages the candidate into a draft GitHub release. Publication and exact installed-package acceptance are tracked in [release-0.1.0.md](release-0.1.0.md); a local build or passing CI does not establish public installation.

### First-run processing and ordinary restarts — issue #121

A pristine world's active GM automatically claims the existing single-writer
service during `ready`. Its initial binding, metadata and work checkpoint must
all be empty. Other GMs and players do not claim it. Same-browser reloads retain
the established path. A normal world relaunch can resume without a recovery
checkbox only for the same active GM and browser, with matching binding/metadata
and an explicitly idle, non-uncertain work checkpoint. The checkpoint is checked
again after the activation fence; busy, mismatched or uncertain work never takes
this shortcut. Different-browser handoff and explicit interrupted-write recovery
retain their existing controls.

Ten stateful VM tests cover automatic initial claims, duplicate tabs, ownership,
partial-state refusal, same-browser resume, clean relaunch, unsafe checkpoints
and actionable startup failure notices. On October 17, 2026 startup production
commit `9e58068` passed the isolated Foundry 14.369 startup/restart fixture:
fresh active-GM auto-start, a real clean world relaunch with same-GM/browser
auto-resume, two-GM and duplicate-tab exclusion, queued handoff, lost-acknowledgment
recovery, unknown-write suspension, blocked takeover before relaunch and explicit
post-relaunch recovery with once-only grants/replay. The full Node 24 check passed
347 tests. Restart phases captured zero uncaught page errors through teardown;
all fixture Actors, requests and temporary users were cleaned. The coordinator
panel screenshot was visually reviewed. This verifies startup, not the broader
#121 integrated encounter acceptance.

The existing two-GM fixture now waits for
initial auto-start and releases only its own known lease before testing handoff.
The restart fixture adds `--prepare-idle` and `--verify-idle`: run the first mode,
close its clients, restart only the isolated server, then run the second mode.
It retains only its test browser identifier between phases, creates no Actors,
and releases the resumed lease after verification. Existing `--prepare`,
`--check-blocked` and `--verify` continue to test uncertain-work recovery.

### Compact creature art — issue #119

The checked-in runtime art under `static/assets/creatures/` is derived from the 192 portrait records pinned in `content/source-lock.json`. Each source is read from the locked Git commit with `git cat-file`; its SHA-256, native dimensions and alpha fact are checked before encoding. The initial runtime baseline is lossy WebP quality 85 at native dimensions, with method 6, exact transparent RGB, alpha quality 100 and no source metadata copied. The one non-square source remains non-square. Identical source blob hashes produce one shared content-addressed path.

The sorted `manifest.json` records source commit/path/hash/provenance, source/output dimensions, output hash and bytes, encoding versions/settings and aggregate byte reports. The current 192 mappings use 192 unique assets totaling 93,699,982 bytes. There is no invented universal size ceiling: byte totals and provenance counts are an exact reviewed baseline, and the build prints them for review when art changes. Rights remain explicitly undecided.

Use Python 3.14.4 in a local virtual environment with the pinned `requirements-art.txt`; do not install packages system-wide. Source regeneration requires `HOL_BOOK_REPOSITORY` and reads only immutable blobs. `python3 scripts/build-creature-art.py --check` verifies the manifest's exact encoder provenance, then uses Pillow's available WebP decoder to inspect every immutable asset. The decoder version may differ from the recorded encoder version, but it must be capable of fully decoding the files; regenerating records the environment's actual Pillow and WebP encoder versions so their changed bytes and metadata are reviewable. The pure Node release validator is invoked by both `scripts/build.mjs` and `scripts/validate.mjs`, rejects missing, extra, stale, unreferenced or master/reference files, verifies static WebP container/image headers, dimensions, hashes and exact aggregate bytes, and keeps the reviewed encoder baseline pinned. According to the [WebP lossless bitstream specification](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification), the VP8L alpha flag is only a decoder hint, so Pillow's full decode remains the authoritative alpha check. CI installs the pinned Python dependency before the existing Node check.

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

### Native Item compendium sources — issue #115

The checked-in `content/packs/` tree began with generated editable JSON for two native Item compendiums: all 350 source-locked abilities and all 43 source-locked equipment records. The ability pack includes the 18 universal references. Issue #122 adds the third creatures pack below. `content/packs/index.json` pins the shared source revision, catalog schema versions, record counts and semantic hashes.

Pack construction uses the same pure ability/equipment constructors as creation and advancement, so `catalogId`, exact `{ path, sha256 }` source flags and the source commit have one representation. Stable Foundry IDs are checked against the namespaced 16-character hash and collision set already used by the learning catalog. Any source lock/catalog commit mismatch, changed hash, duplicate ID, hash collision or catalog `foundryId` drift fails before compilation.

Each ability description contains the full authored reference as escaped, generated HTML, including flavor, all metadata, rule blocks, outcomes and addenda. The manifest registers `description` as HTML for both Item models so Foundry server-side sanitization applies. Reference prose never supplies an automation handler. Only Defend and Shield Block receive the reviewed status, label and handler from `src/rules/ability-definitions.mjs`; every other ability and equipment record remains explicitly pending/reference-only. Importing the Item does not run acquisition, grant free equipment, create an effect or spend currency.

Equipment prototypes preserve source Bulk and normal supply die but begin at quantity 1 with no hands assigned, `held: false` and `worn: false`. `EquipmentData` currently has no separate supply-interval field, so the pack import neither invents nor rewrites one; use/acquisition interval handling remains outside this Item-copy step.

`scripts/build.mjs` verifies every authored pack file and compiles all declared directories with the pinned official `@foundryvtt/foundryvtt-cli` API into `dist/heroes-of-legend/packs/`. LevelDB output is dist-only. `tests/item-packs.test.mjs` covers Item-specific coverage, identity/provenance, safe HTML, explicit handler labels, equipment defaults and drift rejection; `tests/packs.test.mjs` performs two official-CLI semantic round trips for each whole pack.

`scripts/check-item-packs.mjs` is the guarded native fixture for opening the shipped packs, reading stable UUIDs, importing copies with retained IDs, resolving the two reviewed handlers through the current service, validating both native Item models and checking the embedded reference HTML and neutral equipment defaults. It refuses non-localhost URLs or a run without `HOL_TEST_ALLOW_WRITES=1`, refuses to overwrite existing world Items, and deletes only its own imports. Run it after deploying the built system:

```sh
HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 node scripts/check-item-packs.mjs
```

Runtime evidence must be recorded separately; source checks and official-CLI round trips do not prove the native Foundry fixture.

### Native creature Actor pack — issue #122

`node scripts/generate-creature-packs.mjs` builds the editable Actor sources for
all 192 source-locked creatures. The shared generator also verifies the existing
Ability and Equipment files, so `--check` covers the combined 586-file authored
tree and its semantic pack index. Actor IDs follow the catalog's namespaced hash;
flags retain exact source path/hash, source commit, classification,
ability-source references and summoning metadata. Foundry's core fallback image
is used. The shared build also packages and validates the compact artwork from
#119; mapping those portraits onto Actor images remains separate work in #124.

`CreatureData` now stores exact source-stat strings, typed alternate Speeds,
footprint and size label, Armor marker, numeric/special mitigation entries,
immunities, signed CV and explicit player-defense orientation. Authored action
tables and detail Markdown live separately from editable notes. A small renderer
escapes all source text and converts the supported headings, tables, paragraphs,
strong/emphasis and pinned-link subset to HTML before V14 TextEditor enrichment;
unsafe protocols and unsupported prose remain escaped text. The sheet's
source-reference region is read-only and labels specialty automation pending.
Numeric mitigations are preserved but not connected to the damage resolver;
existing printed Armor and Basic Melee paths remain unchanged.

`scripts/check-creature-packs.mjs` is the guarded native fixture. It requires a
local `HOL_TEST_URL`, `HOL_TEST_ALLOW_WRITES=1` and an explicit
`HOL_TEST_ISOLATED_WORLD=1`. Before any world write it loads and strictly
validates every source Actor and reports all field failures together. It also
validates a plain native creature with its defaults, explicitly accepts the
legitimate empty Armor marker, rejects an invalid nonempty value in every
choice-backed field, and verifies that numeric and special mitigations keep their
distinct authored shapes. It imports all 192 Actors with retained IDs, validates
the complete roster, checks exact Adder and Red Dragon snapshots through awaited
native UUID resolution, creates and checks a signed-negative CV Actor, verifies
real heading/table elements, absence of raw Markdown separators and escaped
hostile source HTML and unsafe links in the enriched sheet reference, and
deletes only tracked fixture documents before returning. Returned IDs are
recorded for cleanup immediately after import and before ID assertions. The
reviewed roster currently has no negative-CV record despite the issue wording,
so the negative case is explicitly synthetic rather than altering a source-locked
printed profile.

```sh
HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 HOL_TEST_ISOLATED_WORLD=1 node scripts/check-creature-packs.mjs
```

Integration review rebased the pack pipeline onto the merged compact-art pipeline
at `26357b4`, including the merged Basic Melee handler. Build retains the exact-set artwork validation and byte report,
then compiles all three native packs through the official CLI. Node 24.22.0
`npm run check` passes build, validation and all 272 tests, including complete
artwork decoding and exact-set rejection cases. Current Evasion
and Threat summary labels follow edited numeric modifiers while retaining the
pinned source-stat prose as provenance. Native prototype Token dimensions now
use the printed footprint in grid squares; a synthetic 1x3 projection verifies
orientation because the current roster contains only square footprints.

Foundry 14.369 / Node 24.22.0 native acceptance passes in the isolated world:
all 192 source Actors strictly validate and import with retained IDs, exact
mitigation shapes and native Token footprints; defaults and legal blank markers
validate; invalid choices fail; Adder/Red Dragon profiles and signed CV survive
UUID resolution; the enriched read-only sheet escapes hostile HTML/links. The
creature and NPC attack regressions pass with zero page errors. Their fixtures
wait for initialized canvas state and use software WebGL; the creature regression
also checks the newly explicit Basic Melee defense/orientation fields.

`npm run test:creature-pack-visual` dispatches a native DOM compendium drop,
asserts a strict Red Dragon Actor and 3x3 Token, captures normal and 500px-wide
sheet references, and verifies cleanup and zero page errors. Reviewed screenshots
show readable headings/tables, wrapped narrow-screen cells and a compact default
defense summary. All fixtures delete only their own documents. These results
were captured before the final rebase from `bf54200` onto `26357b4`. That rebase
was conflict-free and changed no creature production files or generated Actor
sources. Combined regeneration preserves the current Basic Melee handler and
Item pack hashes byte-for-byte; the final integrated Node check passes above.

### Guided creation draft

Issue #41 connects the pure ledgers and acquisition adapters to `CreationWizard`, a native V14 Handlebars ApplicationV2 opened from the character sheet. Eight steps cover identity, ancestry/languages, complete origin pairs, level-0 learning, class, level-1 learning, equipment and review. Eligibility sorts available choices first while displaying disabled choices and their reasons. Named book links provide source detail. Acquisition choices refresh crafting permissions before subsequent recipe purchases. Shopping tracks exact coins and Bulk. Saving and navigating persist only an actor flag, separately from committed mechanics; final character commitment is deliberately unavailable in this increment.

Issue #109 adds source-locked ability references to creation and advancement acquisition rows. Each reference keeps authored flavor, action, attribute, target, time, duration, acquisition details, limits, rule paragraphs, exact Weak/Standard/Strong outcomes and explicit addenda separate from learning metadata. The native expandable section is keyboard operable, distinguishes reviewed native actions from rules whose play automation remains in progress, and links back to the immutable book source. Search and eligible-first ordering are unchanged; ineligible rows and their unmet requirements remain visible. Imported HTML is rendered only through escaping Handlebars expressions. The native fixtures cover normal and narrow layouts with screenshots; their 500 ms chat cleanup follows a normal authority release.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:creation` passed on 14.369: full valid draft, duplicate-origin grants, two Conditioned Body purchases in distinct stages, recipe choices, disabled learning options, search, shopping, review, unchanged character HP, reload/resume and backtracking. Visual inspection corrected inherited dark-theme heading/definition contrast and banner spacing. Draft saves check their last observed revision and reject known stale windows, but are not a distributed compare-and-swap or final commitment authority. Closing without Save retains the last saved revision. Creation commitment and advancement remain tracked by #18.

### Creation commitment and native inventory

Issue #43 adds typed equipment Items and an owner-requested, assigned-GM creation service. The request is a native ChatMessage; authorization uses its server-established author, not a user ID supplied in a socket payload. A fixed GM socket binding serializes requests. The GM recomputes the saved draft against the pinned catalog, checks revision/source, validates every Item strictly, then submits statistics, embedded Items and the initial receipt in one Actor update. Existing personal data and compatible equipment are preserved. A verification checkpoint checks created Items before marking the receipt complete. Replays never replenish HP/Grit or recreate sold items.

**Native behavior discovered on 14.369:** an Actor update containing an invalid embedded Item can accept parent changes while the invalid Item is absent from the usable collection. Do not describe native validation as all-or-nothing. The service therefore constructs/validates every proposed Item and validates the parent before writing; it also verifies IDs after the update. Incomplete verification is reconciliation work, not permission to repeat grants. The reference tests cover an invalid-quantity Item caught before the write, concurrent requests, real-author permission denial, unrelated-data preservation, spent-resource replay, reload persistence and loss of authority after reload.

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:creation-commit`. The authority must start unbound for this isolated test; it restores the prior setting afterward. Production handoff/reconnection recovery remains under #7: binding to a different client is intentionally rejected, and reloading the selected GM does not silently adopt unresolved work. Until that is resolved, this is a development workflow, not a claim of unattended multiplayer production readiness. Learned abilities are persisted with source identity and an explicit automation label. Only exact reviewed definitions such as Defend and Shield Block receive their handler identity; every other action adapter remains pending and is not fabricated from default sheet values.

The commitment test also passes with `HOL_TEST_COMMIT_UI=1`: a player uses the Review screen's Create button while another request is submitted concurrently; the completed native character sheet opens. This variant enables canvas for the player's ActorSheetV2. It also verifies an existing Craft Tools Item is reused rather than duplicated. The source pin is stored with each saved draft; an unpinned/outdated draft must be reviewed and saved before commitment.

### Campaign language configuration — issue #97

A GM-only ApplicationV2 editor configures named campaign languages with stable IDs, display names, ordinary availability, spoken/signed form and writing from [the pinned language rules](https://github.com/bruceamoser/heroes-of-legend/blob/9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/design/rules/languages.md). The reserved `common` ID must remain ordinary. The initial list is the original source list; regional languages such as Reed Speech and River Speech are explicit custom additions rather than world defaults. Invalid stored definitions fail closed instead of falling back to defaults.

The native wizard renders every configured home and extra-language option, eligible first. Unavailable options remain visible and disabled with their exact reason. A removed saved home is shown selected and disabled until another home is chosen. A selected invalid extra remains available only for unchecking; once unchecked it cannot be selected again until repaired or reconfigured. Drafts store the exact configuration basis displayed for review; saving or committing after the world setting changed is rejected and rerendered for review. Authoritative creation re-reads and validates the same world setting and rejects a changed basis before writing; committed character language records are never rewritten by later settings edits.

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:languages` only in the disposable local world. The guarded scenario restores the prior setting and removes its fixture User, request messages and Actors.

### Native reference-hero commitment — issue #102

The reference-hero runtime check seeds the six source-approved drafts from `tests/fixtures/reference-heroes.json` at Review, with the pinned source commit and campaign-language basis recorded. A player owner opens each normal CreationWizard Review and clicks its Create control while one selected GM coordinator processes the request. The check compares persisted Actor/Item/flag data to the fixture's independently transcribed expected values, then reloads and replays each receipt without repeating grants. It intentionally exercises Review/commit/persistence rather than replaying every earlier wizard step; `test:creation` covers that navigation.

Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:reference-heroes` only against the disposable local world on Foundry 14.369. Cleanup removes the fixture Actors, owner User and request messages, then restores the prior campaign-language setting.

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

Late arrivals require a DA choice of this round or next round and an optional note. Withdrawals retain acted history; finish an active turn before withdrawing it. Native deletion/defeated flags do not silently rewrite the HOL roster. The DA explicitly withdraws a participant from the active roster when appropriate. Rewind deliberately does not refund actions, effects or time; audited exceptional-turn corrections remain a separate feature. New action budgets and condition timing are not yet connected to turn phases. No arbitrary six-second world-time advance is inferred from a HOL turn.

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

The tracker exposes Main → Maneuver and Maneuver → movement. Two resulting Maneuvers plus the original allowance produce a three-allowance sprint. Owner requests share the GM coordinator and encounter revision/receipt path. A DA exception records structured intent with an optional note; the actual author must be a GM; a player-supplied claim of DA authority is rejected. The pure planner records the exception. The service supports that explicit adjudication payload; a general exception-management UI is still pending.

Created characters derive movement from frozen ancestry/trait speed base plus current Agility, current Brawn capacity, and every carried item's Bulk. Exactly one worn ordinary outfit is excluded; bags do not hide contents. Slowed is applied separately. For an incomplete/custom profile without a speed base, the DA enters a speed ruling and reason in the turn dialog; it persists for that encounter instead of guessing a speed. The budget snapshots the base movement for the turn; automatic mid-turn equipment/attribute speed changes and path charging remain D01/B05 integration.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:budgets` passes on 14.369: player category dialog, frozen Dazed selection, live grapple/paralysis restrictions, genuine versus forged DA exception, native conversion button, full sprint, replay, turn refresh, preservation between turns, reload and explicit custom speed. Pure movement tests check capacity, worn clothing, negative attributes, malformed equipment and overflow. The ordinary combat suite also passes with explicit fixture speed metadata. Ability cost execution and condition end-turn damage/decay are not yet connected by this increment.

### Square movement plans — issue #112

`src/rules/movement-plan.mjs` is a pure preparation layer for native movement integration. Its rules provenance is the exact `9bc9b4fe3256e68880b92c45facf0f25b98a1ea3` blobs [foundations](https://github.com/bruceamoser/heroes-of-legend/blob/9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/design/rules/foundations.md), [session resolution](https://github.com/bruceamoser/heroes-of-legend/blob/9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/design/rules/session-resolution.md), and the player movement text in [playing](https://github.com/bruceamoser/heroes-of-legend/blob/9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/design/player-book/manuscript/06-playing.md) and [adventure](https://github.com/bruceamoser/heroes-of-legend/blob/9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/design/player-book/manuscript/07-adventure.md).

The adapter contract supplies a complete path including its starting square, the current movement budget, explicit square facts, and any blocked edges. Square facts carry terrain, occupant posture, access mode, footprint legality, support and route legality; they are serializable evidence, not callbacks. Ordinary costs use the greatest applicable 1/2 category rather than adding surcharges. Plans reject nonconsecutive paths, barriers, illegal footprints, unsupported or implausible routes, standing passage, prone endpoints and insufficient movement without changing inputs. They return the actual path, per-square costs, total spent and remaining movement.

`planJump` is a broad horizontal, same-level path planner. It requires supported takeoff and landing squares, a free landing square, legal footprints and route evidence on every takeoff, flight and landing square, and open evidence-backed segments. Unsupported intermediate squares are allowed during flight; the adapter must explicitly establish route clearance rather than the planner inferring whether an occupant can be jumped over. Running reach applies only when the approach is exactly two consecutive squares whose final square is adjacent to takeoff. Jump plans spend the actual distance flown and grant no extra movement. A required explicit safe/uncertain adjudication separates a clear no-roll jump from a DA decision, and uncertain execution produces no invented roll.

`calculateJumpReach` retains the approved high-jump calculation, while `validateHighJumpHeight` checks an explicit nonnegative finite height against that calculation without pretending a two-dimensional path proves vertical motion. Native vertical geometry, cross-level trajectory and movement cost need a separate ruling and implementation. Falling returns pre-resistance physical damage as `3 * floor(squares / 2)` for nonnegative finite square distances, including fractional distances; the existing damage planner still applies resistance and all landing-surface rulings. Foundry waypoint conversion, Token mutation, ownership, opportunities, collisions, forced movement, levels, non-square grids, climb/swim capability grants and specialist movement exceptions remain outside this increment.

### Defend maneuver execution — issue #58

The source-locked Defend Item now exposes **Use Defend**. Its owner can declare it during the character's selected encounter turn. The coordinator validates the native author, owned Item, pinned adapter hash, participant and encounter revision, then durably reserves one Maneuver. A native ActiveEffect contributes one defense Boon; repeat uses spend another Maneuver but do not stack that benefit. The anchor remains valid through intervening turns and expires immediately when the next own-turn budget begins. Native effect disabling reconciles its visual record after that mechanical expiry. Deleted encounters invalidate the anchor; orphan visual cleanup remains pending.

This is the character's Defend **maneuver**, distinct from the unrestricted attack-card **Defend response** required by #14. The shared defense dialog consumes the active benefit as one automatic Boon. Out-of-combat use remains pending.

The Combat stores a durable pending operation before the Actor effect write. Its final settlement receipt is written only after the effect receipt and continuation succeed. Pending operations block further encounter progression and new actions. Manage automation offers **Resume reserved action**, including after the original chat request is deleted. A known failure before the effect write can resume without paying again. An unknown native write acknowledgment still follows the coordinator's suspension/relaunch protocol; this test does not claim to prove every network failure. If an applied effect is manually deleted before settlement, recovery stops for DA reconciliation rather than recreating or repaying it automatically.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:defend-maneuver` passes with separate GM/player browsers on 14.369: native Item sheet activation, payment, repeated non-stacking use, overspend rejection, intervening-turn preservation, next-own-turn expiry, injected pre-effect continuation failure, blocked progression, deleted-chat recovery through the native settings panel and receipt replay. The test waits for native notification insertion before deleting a chat entry: deleting during the core 100ms insertion animation exposed a 14.369 `ChatLog` null-element error. No proprietary core patch is included.

### Shield Block reaction execution — issue #88

The reviewed `ability-shield-block` adapter uses the same durable action phases as Defend: the coordinator validates the actual request author, pinned source, participant, encounter revision and attack context, reserves one Reaction, writes an Actor benefit receipt, and only then writes the Combat settlement receipt. A defense handled by any player may qualify a selected non-owner Actor; ownership remains required for standalone use. The exact Ability Item must belong to the selected defender.

Shield Block requires an authentic GM attack card with an explicit DA `blockable: true` judgment before the defense is rolled. The GM creature sheet records that judgment when creating the card; it is never inferred from physical damage and players cannot override it. Legacy cards without the field, and historic cards whose encounter is no longer loaded, allow ordinary defense but show Shield Block as unavailable. Eligibility is rechecked after reservation. Loss of the held shield reflects an interrupted continuation with the Reaction still spent, never a refund or repeated effect.

The benefit is one automatic Boon until the start of that defender's next turn. It stacks with Defend because their benefit keys differ, but repeated Shield Block effects do not multiply. The effect stores both the reviewed Ability source and the exact held shield Item. If a later eligible Shield Block is paid for while a same-key benefit remains, that one effect is refreshed to the newly selected held shield before continuing. At roll preparation it applies only while that stable shield catalog Item (`item-ordinary-shield` in the current equipment model) remains held and the incoming card remains blockable. The current equipment model has no general shield category, so display names are never used as capability identity.

The shared dialog lists only reviewed Defend and Shield Block options, available first and unavailable with specific own-turn, Maneuver, Reaction, attack-judgment and held-shield reasons. Prior defense results, including unknown older operations, do not block normal ability selection. Newly selected uses still pay normal resources; existing active benefits contribute on later rolls without an automatic new charge. Activation settles before the dialog refreshes its source basis; no dice are evaluated while that activation is pending. The coordinator stores the original request and verified incoming-attack snapshot, so deleted request chat can be resumed without trusting a replacement entry or repeating its cost, and continuation rejects a changed attack snapshot. The serialized native runtime script is `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:shield-block`. It must run only against the isolated development world.

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

### Player-character Basic Melee — issue #108

The owned **Basic Melee** ability item now uses a reviewed adapter pinned to
`design/cards/basic-melee.md` at book commit
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3`. Its source hash is
`9d6e0b6ca75363b94c6886fb3c53087f854098f024aac232395c61fdc438ae40`.
The adapter spends one Main Action, requires a held compatible melee weapon,
takes exactly one adjacent character or creature target, rolls Brawn, and applies
only 2/3/5 Physical damage for Weak/Standard/Strong. It grants no weapon and does
not add weapon damage.

The focused preparation dialog freezes the acting Token UUID, target Token UUID,
weapon instance, encounter revision, condition/Evasion sources and final roll
basis. Target Evasion and the actual target's Grappled rating use the shared
source calculator and native formula. Native occupied-square offsets and
`measurePath().spaces` supply footprint-aware square distance. The V14 movement
collision backend tests the nearest occupied-square center line on the same scene
level; elevation or level differences remain unverified until the DA supplies a
reasoned ruling. A confirmed nonadjacent target can receive the same explicit
audited exception rather than being rejected unconditionally. Neither path
bypasses the original ChatMessage author's Actor permission, source hash or
operation replay checks. Shared roll-basis and draft fields remain frozen as a
whole, including later reviewed source metadata such as wound applicability.

The GM coordinator clones the complete encounter, replaces only the acting
participant's budget with the declared Main, and advances its revision. It then
validates the committed action receipt and uses `continueAction` without
re-declaring the spent Main. The durable Combat operation stores the immutable
request, evaluated snapshot and native Roll JSON or DA recovery record before any
chat presentation. Chat roll/card/request flags are restorable projections and
are never an authority source. An unresolved or deleted-message reservation never
rerolls; it remains visible for DA retained-dice recovery or explicit attention.
Once settled, the player attack creates no second Defend roll, including in PvP.
The GM damage review consumes only the frozen result and links the target's typed
Physical damage to the attack event, using the existing resistance,
minimum-damage and wound workflow. NPC attacks keep their defender-perspective
workflow, while NPC-only, player-controlled creature, opportunity and specialty
attacks remain separate handlers.

The guarded `test:player-attacks` fixture covers encounter preservation,
five-units-per-square adjacency, large footprints, collision-blocked geometry,
an explicit DA nonadjacency exception, forged player-authored projection and
recovery edits, late chat presentation failure and replay, deleted presentation,
retained-dice authority, reload/replay and damage deduplication. Native Foundry
14.369 acceptance passed on October 17, 2026 using Node 24.22.0 and an isolated
disposable world. The deleted-chat scenario also opens the saved-result damage
panel and applies its operation ID twice: a forged draft amount is ignored, the
preserved 3 Physical damage meets resistance 1, and HP remains 10 after the second
application (12 → 10 → 10). The real preparation dialog, target visibility,
DA wound choices, PvP, recovery, and native replay paths completed with zero page
errors. Dialog and chat screenshots were inspected; headless Foundry displays its
hardware-acceleration warning.

The same run passed native Defend Maneuver, Shield Block, roll-source and
defense-response regressions. Fixture setup waits for initial canvas loading and
keeps new Scenes inactive until explicitly viewed; scene transitions allow core
scrolling-text animations to finish before teardown. This evidence covers the
listed Basic Melee paths, not the separate attack handlers above.

### Per-defender roll attempts — issue #66

Attack-linked defense submissions now use native ChatMessage requests and the selected GM coordinator. The original player remains the native message author and recorded roller; the coordinator evaluates native dice on their behalf with interactive/manual dice disabled, updates that same message with the result, then settles the attack-card receipt. Standalone attribute/defense checks retain their existing local roll path. Native public/GM/blind/self message mode is applied before submitting the request.

Opening/canceling a dialog reserves nothing. Submission reserves only its request ID; Actor identity and unlinked Token identity identify the defender, not a roll-deduplication key. The selected Token UUID is also preserved for attribution and the native speaker, including linked tokens. Each intentional submission has a fresh request ID and may roll, even for the same defender and attack or alongside an unknown older result. Only retransmission of the same request ID is idempotent. Reopening Defend allows changed ability choices without a repeat control or approval. Prior results and already-applied damage are preserved.

The public attack ledger stores a SHA-256 request digest instead of copying the complete submitted context. The full additional-attempt reason remains on the original request under its chosen message visibility. Public response rows reveal status, not dice or quality. This preserves native display behavior; it does not add a secrecy boundary beyond the previously documented Foundry client-data limits.

The rolling phase is durable before dice evaluation. A saved child result can settle the final attack receipt without rerolling. If no saved result exists after interruption, retry does not evaluate dice again. Manage automation provides **Resume saved result** and an explicit DA **Abandon unknown result** disposition with an optional note; abandonment preserves that old operation's audit; fresh rolls never require this disposition first. A saved roll cannot be abandoned through that path. Unknown native write acknowledgments still require the coordinator's established reconciliation/relaunch protocol. The recovery fixture reconstructs persisted phases; it is not a claim to have simulated every network failure.

This replaces the earlier untracked repeat-roll limitation, but consequences remain manual. Reaction/ability costs, automatic damage/wounds and complete attack-perspective modifiers remain open #13/#14 and A03/A07 work.

Validation: build/validation and 74 tests pass. Native 14.369 defense-response and NPC-attack suites pass after the final changes. Shared-source and coordinator regressions also pass. The new three-client scenario verifies racing submissions, independent defenders, native original authorship, explicit additional-attempt UI, stale-source rejection, blind mode, and no HP mutation. Saved-result recovery temporarily makes any new dice evaluation throw, proving settlement does not evaluate again. The unresolved-result fixture exercises the actual DA abandonment dialog. Native selected-Token identity is preserved through the attack-card roll path.

### Held and worn equipment (#68)

`test:equipment` verifies owner preparation, native held stack state, exact replay, stale inventory rejection, DA-only encounter/anatomy corrections with optional notes, observer denial and reload on isolated 14.369. The panel tracks held and worn state independently and counts one held unit per stack; holding does not remove that stack from carried Bulk. Worn state can change which single ordinary outfit qualifies for the Bulk exclusion. Existing items default to unheld and unworn; hand capacity defaults to two until a DA anatomy ruling. Owned item sheets route hand and worn changes through the arrangement panel. Draw/stow/pickup timing and ground transfers are not implemented by this preparation panel.

### Survival rules (#74)

Pure survival transitions distinguish entry into Dying (one wound), damage while Dying (one mark), damage after stabilization (new wound and one mark), locked start-of-turn Grit/death-roll choices and natural results. Own-turn counters make Last Words expire at the end of the second following own turn; damage never restarts that deadline. Healing/safe breath preserve scars and spent Grit. Becoming Dying mid-turn waits for the next start. These tests are rules-layer evidence; native damage, wound results and survival UI are subsequent integration work. The DA establishes whether a breath is safe; the calculator does not infer safety.

### Wound table foundation (#76)

`HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:wounds` reads the pinned Git object and validates its source hash. `validate:wounds` detects drift. The package now includes all 280 approved keyed wound references and typed consequences: temporary/starred conditions, contextual modifiers, movement penalties, immediate push/pull and Last Words. Unknown effect syntax fails import. Direction, Frightened source, contextual activity and anatomy applicability remain explicit table choices. No scene movement or wound effect is applied merely by looking up a result. Dice fixtures enumerate all 216 unmodified triples and validate every table, the five-die cap, source-type elemental condition mapping and consecutive anatomy advancement. Native consequence receipts and treatment are subsequent integration work.

### Native damage (#78)

`test:damage` exercises actual DA authorization, mixed damage, printed creature DR once, unlinked-token isolation, Dying/wound/mark transitions, stale preview rejection, replay, duplicate settled-defense application and reload in isolated 14.369. Settled-defense amount comes from the attack card and must match the saved native dice outcome. The duplicate fixture reconstructs a settled result; the separate defense suite exercises actual multiplayer rolling.

The DA opens Apply damage from a sheet or Review and apply damage on a settled defense. The preview merges the bounded reviewed passive snapshot with event-specific DA sources and includes printed creature Physical DR once. Highest matching resistance/weakness still runs through the existing capped arithmetic. One Actor update persists HP, survival state, pending wound metadata, event and final receipt. A new request for the same defense event cannot apply damage twice. Wound rolls/effects, survival turn integration, generic healing and native defeated-marker reconciliation remain subsequent work. Existing zero-HP actors without survival state, or direct HP edits that disagree with tracked survival, require DA reconciliation; the damage service does not guess away wounds or death marks.

### Recovery and reconciliation (#80)

The DA Health and recovery panel records already-adjudicated healing, safe breath and stabilization, with an optional source note; it does not grant or pay spell/potion/stabilization action costs. Automatic worn Life resistance is included, while the panel field records only an additional event source. It also reconciles imported zero-HP characters and direct HP edits through an explicit audited correction. Ordinary recovery cannot reverse Last Words/death; repeating a correction to existing Last Words retains its deadline. Pending wounds/history and native spent Grit are preserved. `test:recovery` verifies the native panel, Life-resistance healing minimum and HP cap, safe breath, replay after new damage, scars/Grit preservation, Last Words boundaries, actual-author denial, stale state and reload on 14.369. This is DA event recording, not the final player healing-ability workflow.

### Native wound resolution (#82)

Owners can request the saved pending wound’s eligible damage type and native capped roll from Wounds and scars. A durable rolling phase precedes evaluation; unknown results never reroll on retry. The DA can explicitly recover dice with an optional note, then review consecutive anatomy skips and apply the result once. Native condition effects, lasting modifier records, scar/remedy data, pending displacement and final receipt share one Actor update. 666 enters Last Words; conditions apply once and source commit changes require content review. Lasting movement/contextual modifiers are recorded but their automatic application and treatment are subsequent work; immediate displacement explicitly awaits legal DA placement.

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
with an optional note. Raw document edits that contradict a reserved snapshot require
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

### Native healing-potion execution (#116)

The reviewed bottle and universal-action routes now open one preparation
ApplicationV2. It uses Foundry's native targets: no other target defaults to
self, exactly one other targeted token selects that exact encounter recipient,
and multiple other targets show “Use one target.” The recipient is read-only;
target changes refresh the preview and clear consent/rulings for the previous
recipient. Optional DA exceptions and interruption controls are collapsed.
DA adjacency/willingness choices, observed-face recovery and source reconciliation
record the acting user and explicit choice; explanatory notes are optional and
never grant authority by themselves. It
shows the exact live bottle and recipient, fixed 6/10/16
healing before Life resistance and its resulting restoration, free hands,
Maneuver and Reaction costs, and the post-healing d4 supply check. Another
recipient confirms willingness in chat;
unowned recipients cannot be marked willing by the giver. Native square-grid
geometry is measured by the coordinator from occupied grid-square centers,
`measurePath(...).spaces`, and actual move-line collision. It therefore keeps
scene distance units out of square counts and supports large footprints and
clear ties. Non-square or unavailable geometry, walls that prevent every
nearest line, differing levels, and differing elevation use an attributed
DA adjacency choice with an optional note. A DA ruling remains bound to the GM proposer when a recipient later
owns the final consent request. The explicit interruption continuation control
is a table decision because opportunity automation remains disconnected.
The helper is local to #116 because the reviewed #108 branch is not merged;
after integration the primary can consolidate both callers onto it.

The coordinator writes one durable Combat operation containing the plan and both
participant budgets before Actor mutation. The giver `turnId` comes from that
enclosing budget; the separately stored action receipt contains no invented
turn identity. A living other-recipient Reaction is committed in its own Combat
phase after source and state checks, so cancellation before healing restores an
unused Reaction instead of claiming it was never spent. Recipient
HP/survival/source receipts share one strict Actor update. A deterministic
linked Actor child reserves the supply phase before evaluating its native Roll,
then stores the Roll JSON and settles supply after healing. Every proposed
embedded Item is constructed and validated strictly before the authoritative
supply Actor write; unrelated Items are verified unchanged afterward. Resume
reads actual receipts rather than trusting a cached phase; it never replenishes
actions or rerolls dice. A rolling child with no saved face can only continue
through a DA-entered observed face. If the exact bottle changes during the
operation, Manage automation offers an attributed reconciliation rather than
charging a replacement bottle. No release or licensing metadata changes with
this bounded integration.

`HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:potions`
is the serial disposable-world fixture for native UI consent, compendium
descriptions, 5-unit 1x1 and large-footprint geometry, walls, altitude, Life
resistance, 0 HP, unlinked synthetic Actor identity, durable retry, strict
embedded Item rejection, dropped response, final d4 recovery without a reroll,
source reconciliation and interruption. It tracks every fixture document when
created, markers cleanup targets, and is not run against campaign data.

Native startup validation now links every `src/**/*.mjs` module through Node's
ESM linker without evaluating Foundry-dependent bodies, so a named import that
does not match its target export or a local initialization cycle fails the
normal test suite. The potion sheets import the preparation UI from
`applications/potions.mjs`; service-only predicates remain in
`services/potions.mjs`. The serial fixture also verifies that
the ready hook, custom data models and `authorityMeta` initialized after
`game.ready`, reports captured browser page errors before binding, attempts
authority release only after a successful bind, and describes fixture cleanup
based on documents actually tracked.
Author review corrected the supply integrity check to accept the expected
d4-to-out change, retained source level/elevation during animation, and verified
completed replay after the original chat message is deleted. Service regressions
reject changed receipts and preserve the actual coordinator permission boundary.

Integration with Basic Melee blocks new player/NPC attacks, defense-ability
activations and encounter transitions while a potion operation is reserved.
Potion admission rejects an existing action or turn-phase reservation. Tests
exercise both directions with unchanged revision, budgets and zero writes on
refusal. This is partial #121 integration; shared geometry consolidation remains
separate.

The complete fixture passes on isolated Foundry 14.369 with Node 24.22.0 and
software WebGL: native target selection, one-click two-owner consent, optional
blank-note DA choices, 5-unit and large-footprint geometry, walls/elevation,
Life resistance, exact Maneuver/Reaction receipts, completed replay, eight
interleaving refusals, synthetic-Actor final d4 depletion without rerolling,
source reconciliation with no note, strict embedded Item prevalidation, dropped
responses, zero-HP healing and interruption. Both screenshots were visually
reviewed. Cleanup completed with zero uncaught page errors, including teardown.
Fixture clients keep the real chat log visible while temporary request cards
are tested; helper recipients are friendly so an unrelated random Dying turn
does not block setup. Node 24 build, validation and the full test suite pass.

#135 extends this route to free play. When the giver has no tracked encounter,
its Actor hosts the same operation and final settlement receipt; no Combat,
turn IDs or action budgets are invented. Exact native targets and genuine
recipient-owner consent use the same request path. Native range measurements
remain truthful advisory evidence, including unknown or nonadjacent results.
Normal API calls default to continuing, and the compact potion dialog keeps
supply math and range detail collapsed. Actor-host reservations also block
interleaved encounter writes involving either participant.

Stateful service regressions exercise ordinary self-use, fresh repeats, native
target consent, unknown/distant geometry, duplicate delivery and saved-face
recovery after a partial write. The extended `test:potions` fixture covers the
native free-play dialog and consent. On October 17, 2026 the complete serial
fixture passed against isolated Foundry 14.369 with Node 24 and software WebGL,
including cleanup and zero uncaught page errors. It verified native self-use
without Combat, two completed no-write replay attempts, a fresh distant-token
offer, actual recipient-owner one-click consent, truthful `adjacent: false`
and no invented encounter budgets. `/tmp/hol135-ui-offer.png` was visually
reviewed. The inherited encounter/fault/reservation scenarios also passed.

Native review found and fixed self-preview passing one token twice into the
two-token adjacency helper; a stateful service regression now covers this.
The fixture waits for local Actor receipts synchronously and for the first
dialog to detach before opening the next, avoiding UI timing races. The #116
native results above remain historical evidence for the encounter route.

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

After integration with the two-recipe fix, all six reference characters and the
source-lock provenance test pass. Node 24 `npm run check` passes all 150 tests.

### Native supply checks after use (#95)

An owned equipment Item's sheet now exposes **Check supply after use**. The
control opens a native V2 panel showing the Actor, Item, quantity, current
inventory die and an optional completed-use note. The sheet distinguishes
gear that never had supply from depleted supplies by using the stable catalog
die, falling back to a prior check target for content without catalog metadata.
A zero die has no Check control and native request validation rejects an
unsupported or out supply before reservation or dice. The panel captures the
displayed basis so changing the Item while it is open requires a fresh review.
Wiring the reviewed potion adapter to this control remains follow-up work.

The request is a native ChatMessage authored by the actual requester and
whispered only to GMs, that requester and relevant Actor owners. Its basis
snapshots the Actor inventory and equipment revisions plus the checked Item's
identity, die, quantity and source provenance. Authorization uses the native
message author's OWNER permission or GM status; no author ID is trusted from a
payload.

The selected-GM queue reserves `flags.heroes-of-legend.pendingInventory` before
rolling one native `1dX`. The snapshot retains the original request,
author/signature, target Item and a `reserved` or `result` phase. A known result,
including serialized native dice and retained face, is persisted before one
Actor update changes only that Item's inventory die and writes the result,
receipt and pending clear together. A saved roll must be an evaluated single
die with the expected `1dX` formula, retained face and total. An explicit DA
recovery may instead store the explicit face with `nativeRoll: null`. Every
embedded Item and the parent are strictly prevalidated; all Item IDs and
quantities are verified afterward. `inventoryRevision` increments on every
settlement, including faces that do not step the die down, so same-basis racing
requests cannot both consume.

At most one inventory check may be pending for an Actor. Settlement rejects a
pending turn or death roll and any changed equipment/Item basis. Unapplied
equipment ChatMessages are history rather than durable reservations. A saved
result resumes or is recovered through a new coordinator request, so any GM can
use the panel while only the selected coordinator writes. An unresolved
`reserved` phase never rerolls automatically. If an Item changes after a result
was saved, the DA can explicitly close the check without changing supply, with
an optional note; this stores the original snapshot and result, writes an
abandoned receipt, clears pending and advances the inventory revision. Replay
does not consume or roll again, and the basis is never replaced automatically.

Coordinator checkpoint work now records the resolved target document UUID, and
inventory operations supply the exact Actor UUID. Deleted-chat lookup enumerates
world Actors and scene-token Actors by UUID, so unlinked synthetic token Actors
are recovered without changing their base Actor. Existing unknown-write
acknowledgment suspension and relaunch recovery remain unchanged.

`npm run test:inventory` is the serial native fixture. It covers owner UI,
no-supply gear, observer denial, unapplied equipment history, same-basis racing
and replay, forged unsupported dice, stale-open-panel basis, saved-roll mismatch,
second-GM resume/recovery, explicit stale-result closure, unlinked-token
recovery, quantity preservation and reload. Direct Node validation of the
focused inventory and potion suites passed in this implementation environment.
The native fixture passes on isolated Foundry 14.369. Saved-roll validation
uses the public serialized `evaluated` field; Roll instances do not expose that
property. The fixture distinguishes pre-write failure from uncertain native
updates, waits for chat animation before deletion, and uses a second assistant
GM so the main Gamemaster remains the designated coordinator. The supply dialog
was visually inspected in the HOL theme.

After integration, Node 24 `npm run check` passes all 151 tests. Serial native
inventory, equipment, authority and coordinator checks pass on Foundry 14.369,
including two-GM handoff, unknown-acknowledgment suspension and replay recovery.

### Pure wound treatment planning (#100)

`src/rules/treatment.mjs` pins the six treatment cards and the wound source at
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3`, validating the selected card and
wound catalog path and SHA-256 before planning. Reservation takes an explicit
campaign day key, distinct wound event ID, patient identity, and at least one
elapsed hour. The printed one-hour duration is recorded separately; additional
world-time elapsed during the activity does not grant extra attempts or progress.
Reservation spends the Main Action and records the injury event's single attempt
for that day before a roll is known. The catalog wound ID remains separate from
the native wound event identity. Settlement requires the unchanged reserved
snapshot, including its patient and event identities, and the card's exact
Knowledge or Reason attribute; a reserved or settled attempt blocks another
healer on the same event and day.

Weak, Standard and Strong outcomes add 1, 2 and 3 persistent progress. Completion
returns only the wound's typed treatable effects: lasting movement/roll modifiers
and explicitly curable starred conditions. Temporary conditions, immediate
forced movement, binary Prone, HP, scars, wound count, lost parts and equipment
are preserved. Anatomy applicability and willingness are explicit caller inputs;
the planner never parses remedy prose or infers a calendar boundary. Zero-HP
Dying or stabilized patients remain eligible, while Last Words, dead and summon
patients are rejected. The receipt is pure and immutable; native Item mutation,
condition removal, authorization and UI remain subsequent integration work.

Primary author review also checked all 280 pinned wound records against the
adapter. Node 24 `npm run check` passes all 170 tests, including 19 focused
treatment tests. These are pure planning checks; native treatment UI, time
tracking, roll execution and effect settlement are follow-up work.
Campaign-language integration (#97) passes Node 24 `npm run check` (159 tests)
and isolated Foundry 14.369 language, creation and creation-commit fixtures.
The runtime tests verify removed-choice capture, stale displayed settings,
spoken/signed grants, non-GM denial and preservation of completed characters.
The settings editor and language choices were visually inspected at 1500×1000;
form labels remain readable and the HOL colors and fixed footer are preserved.

### Lasting wound contributions (#107)

Active wound effects now supply distinct injury-labelled roll sources and lasting
Speed reductions. Physical, mental and social roll modifiers require an explicit
applicability choice; the selected attribute never decides it automatically.
Death rolls exclude these action/social modifiers. Disabling or deleting an
effect invalidates the open wound choices, and submission revalidates the complete
roll basis. Movement separates inventory encumbrance from lasting wound reductions,
floors Speed at zero and preserves explicit DA overrides. Existing applied wounds
remain readable through their stored injury record and effect provenance.

The guarded `test:wound-context` fixture exercises the native controls, changed
effects, movement budgets and tracker breakdown; primary runtime results follow.
This does not implement wound treatment or immediate displacement.

Primary validation: Node 24 `npm run check` passes all 185 tests. All 280 wound
records reproduce from the pinned book revision. Foundry 14.369 native wound
context checks pass, including stale prepared-roll rejection after disabling an
effect, contextual cancellation, movement encumbrance and explicit DA override.
Both dialog and tracker screenshots were visually reviewed. The fixture's carried
load is Bulk 14 against Brawn +1 capacity 13, producing one encumbrance penalty.

Affected runtime regressions also pass: roll sources, wounds, turn budgets and
defense responses. The budget fixture was updated to expect temporary Dazed 3
to decay to 2 at turn end, then explicitly choose its one retained category;
its earlier expectation predated condition decay integration. Production timing
rules were unchanged.
### Owned Item hotbar shortcuts (#105)

Character-sheet ability and equipment rows now carry the documented
`data-item-id` drag source and render in native Item sort order. Dragging a row
onto another row from the same Actor delegates to `ActorSheetV2` sorting;
dragging from another Actor or a compendium retains the acquisition warning and
does not copy the Item. Only an owner receives the row shortcut controls, which
accept a chosen slot from 1 through 50.

The synchronous `hotbarDrop` hook handles only a live, actor-bound HOL ability
or equipment Item. It resolves the dragged UUID, creates or reuses one generated
script Macro, and assigns it to the requested native hotbar slot. The command is
derived solely from the exact Item UUID and calls the shared
`game.heroesOfLegend.openItem(uuid)` API. Row clicks and Macro execution use the
same live-document and `OBSERVER` permission service; missing or inaccessible
sources produce a visible notification. Reuse requires both the generated
provenance and the expected command, so matching flags do not authorize a
modified script. Unlinked Token Items retain their synthetic Actor UUID; no
selected Actor/token fallback, Item clone, acquisition, cost or resource spend
occurs. Other document types return to native Hotbar handling.

The registration was checked against the public V14 contracts for
`ActorSheetV2` drag data/native sorting, synchronous `hotbarDrop` cancellation
and numbered `User#assignHotbarMacro` slots. The installed 14.369 implementation
was inspected read-only for the narrow payload and signature check.

`scripts/test-shortcuts.mjs` is the guarded 1500×1000 native fixture for actual
sheet-to-hotbar drag, click and keyboard slot addition, rerendered sheets,
Macro reuse, modified-command rejection, deleted sources, observer denial,
cross-Actor drop denial, same-Actor sorting and unlinked-token/base-Actor
isolation. It uses real Player/GM roles and fixture-scoped cleanup. The fixture
is run only against the disposable local world with
`HOL_TEST_URL=http://127.0.0.1:<port> HOL_TEST_ALLOW_WRITES=1 node
scripts/test-shortcuts.mjs`. Primary author review corrected fixture Item lookup
rather than assuming native creation return order, preserved the GM's prior slot,
and enabled only read-only reference buttons for observers. Node 24 check passes
174 tests on the feature base. The full Foundry 14.369 shortcut fixture passes,
including real drag/reorder, click/keyboard, permission changes, deleted/modified
sources and unlinked-token identity.

The later #15 reference-drop increment selects an existing owned ability reference
in roll and player-attack dialogs through the same validation as the checkbox
picker. It adds no mechanical bonus, activation, grant or cost. Persistent outer
shells bind one delegated drop listener across rerenders; live UUID, Actor identity
and current visibility are rechecked. Focused tests cover repeated binding,
foreign/compendium/deleted/wrong-type drops, stale context and legitimate visible
any-player defense references. Native Foundry 14.369 acceptance passed actual owned-reference drag after repeated dialog renders, compendium refusal, searchable/click parity, unchanged dice and blind privacy, with zero captured page errors.

The original matrix is broader than this increment. Native targeting supersedes
Actor-to-target drop slots; specialty/summon lifecycle resolution remains manual
where approved. Cross-character transfer, containers and detached-window parity
need their own evidence. Current normal/narrow screenshots establish readable
forest/gold/parchment styling, not complete T94–T95 or decorative book parity;
explicit light/dark/detached coverage remains part of the final visual audit.


Integrated shortcut validation: Node 24 checks and the full Foundry 14.369
shortcut scenario pass after campaign-language integration. The unobscured
character-sheet screenshot was visually reviewed; item references and shortcut
controls are readable in the HOL theme, including the corrected window title.

Issue #109 integrated validation: Node 24 build, validation and all 195 tests pass. The 452-record choice import reproduces exactly from the pinned book revision. Foundry 14.369 creation and advancement fixtures pass, including keyboard-expanded rules, disabled choices, search and persistent commits. Normal and narrow screenshots were visually reviewed; expanded references span the available card grid.

Issue #112 author review verified movement and jumping against the pinned player manuscript. No additional straight-line approach restriction is imposed; route plausibility remains explicit DA/adapter evidence. Integrated Node 24 build, validation and all 209 tests pass. This establishes pure calculation behavior, not native token movement certification.

Issue #115 integrated validation: Node 24 build, manifest validation and all 221 tests pass, including two semantic round trips for both shipped packs. Foundry 14.369 opens/imports the packs with stable UUIDs, strict models and reviewed action provenance. All six reference heroes commit and replay correctly with the shared constructors; advancement also passes. Visual review corrected definition-list contrast and removed redundant notices. The native compendium fixture covers GM imports; complete player browsing/drop acquisition remains separate work.

### Simple roll dialogs — issue #129

Rolls use one effective −3…+3 slider, prefilled from current sources. Until it is
moved, changes to abilities or optional contexts refresh the default. Moving it
sets the desired final net; the stored audit includes a compensating modifier
against uncapped source totals, so a displayed −1 stays −1 even with automatic
Boons. Cancellation/cap still happen once in the existing rule planner.

Basic Melee shows the local native Foundry target read-only and subscribes to
V14 `targetToken`; zero/multiple targets give an inline instruction. A single
held weapon is read-only; multiple weapons retain a choice. Modifier reasons
are removed. Optional fear/wound checkboxes default off without a roll gate.
Fresh defense submissions never require a repeat checkbox or reason, and an older
unknown result does not block them. Recovery of the old ID does not reroll it. Any-player Defend,
additional defender choice, permissions and durable operation receipts remain.

Node 24.22.0 build, validation and 263 tests passed on the `26357b4` baseline.
Focused modifier/defense tests and updated native fixture syntax checks pass.
Foundry 14.369 native acceptance verifies effective slider prefill and source
refresh, keyboard/mouse −3/0/+3, automatic +2 to manual −1, uncapped +5/−1 to
manual 0, and retained manual overrides. The compact zero-adjustment screenshot
was visually reviewed. NPC multi-target declarations and any-player Defend pass;
the two-player defense fixture verifies intentional repeat without written text,
duplicate protection, stale sources, recovery and zero HP mutation. Those focused
fixtures pass with zero page errors and clean their own records.

The player-attack fixture passed the Wounds scene's read-only single weapon,
native zero/multiple target refresh, optional wound controls, changed-source reset
and actual Attack assertions. Its broader run later stopped at an old audit
selector waiting for a source inside the deliberately collapsed Roll details;
diagnostics reported zero page errors and cleanup completed. The selector now
reads the hidden audit text, but the unrelated late recovery cases were not
repeated for this UI issue. This is targeted native evidence, not a claim that the
entire player-attack suite passed after #129. A final display-only adjustment keeps
the slider's accessible signed label current even when no target is selected;
that branch is covered by a focused mock test. Potion recipient targeting belongs
to #116. No other checkout was modified.

Final #129 integration rebased onto `df5d415` (including the merged creature pack).
Node 24.22.0 build, package/art validation and all 277 tests pass. Conflicts were
append-only acceptance/CSS additions and equivalent NPC fixture formatting; both
features are preserved. Roll/attack/defense production files are byte-identical
to the checkpoint after the targeted native run. Native coverage and the broader
fixture limitation above remain the exact evidence; no new whole-suite pass is
claimed after rebase.

Latest #129 correction supersedes the earlier same-defender duplicate-roll policy:
new submissions always get new ChatMessage/operation identities. Completed and
unknown older results do not block rolling or ability selection. The audit and
same-ID receipts remain; replaying an unknown old ID still cannot evaluate dice.
Real selected ability costs remain serialized independently, and an already-active
benefit remains a source without being automatically purchased again. The old
native duplicate-race evidence above describes the superseded policy, not current
acceptance. Updated fixtures now expect two fresh same-defender requests to both
roll, reopened Defend without repeat controls, and a new roll alongside an older
unknown result. The bounded native results follow.

The fresh-roll correction passes Node 24.22.0 build/validation and all 278 tests,
with 14 focused modifier/defense tests. Foundry 14.369 native defense-response
verification now passes both fresh same-defender submissions, native Defend
reopening without repeat controls, changed modifiers, same-ID replay without new
dice, and a fresh roll while an older result is unknown. The bounded Shield Block
run (`HOL_TEST_SHIELD_CORE_ONLY=1`) passes forgotten-ability selection after
resolved/unknown older dice, normal Reaction payment, and reopening to roll with
active benefits without paying again. Same-operation ability replay stays
idempotent. Both fixtures clean their own records and report zero page errors.
The bounded fixture scopes new dialogs by actual Application element ID so an
older closing window cannot confuse its assertions. Remaining unrelated Shield
Block scenarios were not rerun. A fresh reroll screenshot was inspected.

At the default dialog height, two ability rows pushed the slider thumb below the
initial viewport. The existing slider block now comes before optional ability and
detail sections, keeping the main modifier control visible. This final field-order
change has no mechanics or gating changes; the native screenshot records the
preceding order rather than claiming a new visual run.

After native cleanup, #129 rebased onto `a31eaf0` (native summons and compact
compendium portraits). Both appended CSS blocks and package scripts are preserved.
Roll/defense source and templates are byte-identical to the pre-rebase checkpoint,
including the documented slider field-order change. Node 24.22.0 build, package/art
validation and all 286 tests pass; no unrelated native suite was rerun after this
integration.

### Nonblocking play guidance (#133)

October 17, 2026: mandatory prose was removed from damage, Speed settings,
equipment corrections, healing, retained-dice recovery, roster corrections,
supply use and technical dispositions. Notes remain optional; action/user/source
and receipt identities remain recorded. Native targeting and the effective
−3…+3 slider from #129 are preserved. Geometry is visible guidance; unspecified
NPC blockability stays `null`. Choosing Shield Block supplies table intent without
another judgment form, while the selected held shield and paid Reaction remain
validated. Single-condition Finish defaults to automatic passives and zero extra
manual mitigation. Ordering multiple ticks and choosing genuinely ambiguous
source-duration treatment remain explicit. Creation/advancement eligibility is
unchanged.

Serialized native 14.369 acceptance passed NPC declarations, Shield Block core,
condition turns, the full player Basic Melee suite, damage, recovery, equipment,
budgets, wounds, survival turns and inventory. The fixtures submitted blank notes
for the affected flows. Player geometry acceptance rendered the nonadjacency
warning with Attack enabled and submitted as the owning player without a DA ruling;
identity, visibility and source changes still rejected. Shield core verified an
unspecified attack hint, any-player activation, held shield/Reaction behavior,
fresh rolls and same-operation replay. This is bounded handler evidence, not an
all-abilities automation claim. Geometry and defense screenshots were inspected.

Evidence: `/tmp/hol133-native-{npc,shield,conditions,player-3,damage,recovery,equipment,budgets,wounds,survival-turns,inventory}.log`.
Two initial player-suite runs exposed obsolete adjacency/old-slider expectations
and a real dialog overwrite that reintroduced weapon/exception fields into the
roll draft; the final run passed with the refreshed selection draft preserved.
Cleanup checked the server log: all 58 created Actors, 27 Combats, 25 Scenes and
16 Users were deleted; the isolated server was stopped and the world released.
### Issue #134 manual reference play

Node 24.22.0 full check passed 321 tests on the integrated potion baseline. Native Foundry 14.369 bounded acceptance passed: an owner posted Winter Hold from its Item sheet and character list, preserved readable rules and exact Item/source identity, rejected unowned posting, and selected the searchable reference during an ordinary roll without changing its formula. A blind roll retained the attachment in the same message; the excluded second player saw no reference summary. Direct hostile-HTML checks removed scripts, event attributes, unsafe URLs and unrevealed secret sections. The bounded player Attack fixture preserved the pending reference through draft and authoritative snapshot while retaining actual Attack, native target changes, effective slider, single-weapon and wound-refresh assertions. Both fixtures exited successfully with zero page errors and exact fixture cleanup.

Fresh screenshots `test-results/reference-roll-selection.png` and `test-results/player-attack-reference-selection.png` were viewed. They precede the narrow reference-checkbox height correction. Early fixture-only failures involved duplicate sidebar/notification selectors, the required sidebar tab group and a startup `game` guard; these were corrected before the successful runs. Broader late recovery cases were not rerun. Runtime ownership was released after clean server shutdown before subsequent build/rebase work.

After native cleanup, #134 rebased onto #133's nonblocking-guidance main (`d13fc1f`). Only appended acceptance/development notes conflicted; both scopes were retained. The corrected `selection().draft` player Attack submission and all #133 guidance behavior remain intact. The final integrated Node 24 check passes 322 tests. No reference mechanics changed during rebase; the only post-native #134 production change is the scoped checkbox sizing noted above.


### Creature specialty reference cards (#138)

The pinned catalog's typed action tables now project into native creature Actors.
Compact GM action buttons post descriptive source cards, using native target
suggestions. Each typed defense action opens the existing any-player Defend dialog
with its own attribute and printed Threat. All non-Basic main action names match
an authored specialty detail section; generation fails if one goes missing.
No-roll maneuvers/reactions post references without invented defense dice.

The reference path has manual costs/effects and does not require Combat or the
coordinator merely to post. Compound outcomes remain exact text, distinct from
numeric Basic Melee, and cannot invoke automatic damage. Existing imported world
Actors are not rewritten. `test:creature-actions` is the bounded multiplayer
native fixture; static checks alone do not establish its runtime acceptance.

Native 14.369 acceptance passed in `/tmp/hol138-native-6.log`: Red Dragon imported
from the built compendium and retained its typed action array exactly; Furnace
breath and Crushing bite posted exact source outcomes with Agility/Fortitude and
printed Threat. Native GM target suggestions retained both defenders. A non-owner
player rolled each defense twice without Combat or reroll questions. Wing Beat
posted no-roll text with no attack card/dice. Reference roll summaries retained
selected outcome text and omitted automatic damage controls; direct defense damage
rejected reference results. A real encounter with a held shield and canonical
Shield Block exposed the ability without a numeric NPC attack receipt. Both
attribute screenshots were inspected; there were zero page errors.

Fixture preparation needed bounded fixes for an empty-world Canvas wait, an
obsolete ownership constant, Scene/target initialization, guarded game startup and
waiting for the prior dialog to detach before reopening. No production behavior
was loosened to satisfy these attempts. Cleanup was checked across all iterations:
15 Actors, one Combat, four Scenes, five Users and 17 ChatMessages created during
the session were all deleted. The isolated server was stopped and world released.
This proves the bounded reference flow, not automatic specialty effects or costs.
### Issue #137 builder polish — static checkpoint

Ability Item drops resolve their current UUID/read permission and exact catalog source identity, capture a temporary candidate draft for eligibility validation, then use the same purchase action as the visible Add button. Unsupported routes and ineligible drops leave the live draft unchanged. Creation learning and advancement learning are supported; no ancestry/class/discipline-card or shopping-drop route is claimed. Weapon acquisition values remain stable while both builders show readable names.

The initial pure/UI checkpoint rebased onto #134's main (`7097623`) with both appended acceptance/API notes preserved. Node 24 build/validation and all 326 tests pass; four focused tests cover identity, permission, rejected-drop draft preservation and weapon labels. The new `test:charactermancer` script is prepared for continuous native owner creation, backtracking/reload, drop acceptance/rejection, commit, equipment preparation, GM Token placement and one owner advancement with HP/Grit and grant replay checks. This paragraph records preparation, not native acceptance; runtime testing awaits the serialized world slot.

### Issue #137 continuous native acceptance

Foundry 14.369 accepted a continuous real-owner journey from a blank character through guided identity/ancestry/origin/class choices, eligible and ineligible native ability drops, backtracking, reload, normal Create, equipment arrangement and an actual GM canvas Token drop. The same owner then developed the character through a replayed level-2 milestone award, eligible/ineligible advancement drops, readable acquisition weapon names and normal Commit. Current HP stayed 3 and spent Grit stayed 1; Conditioned Body increased maximum HP from 19 to 20, 6 DP remained banked, the milestone was granted once and the compatible melee weapon was reused. Replaying the committed advancement did not duplicate rewards. The successful final fixture exited with zero page errors and removed its exact messages, scenes, Actor and User, then released its coordinator.

Review caught persistent-shell drop listeners accumulating across renders. Binding is now idempotent per application element; a focused regression and the final native fixture both assert exactly one handler per DOM drop. The initial journey's expected maximum HP was incorrectly 21; the printed +1 Conditioned Body increase was confirmed and the expectation corrected to 20. No rules changed. Fresh creation and advancement screenshots were inspected after clearing fixture notifications. The isolated server was cleanly stopped and the world released before integration/build work. Full pre-integration Node 24 checks pass 327 tests, including five focused builder-drop tests.

Final #137 integration rebased onto `a5693f2`, retaining the merged potion and creature-action/HP-sync work. Only appended documentation conflicted; both scopes were kept. The accepted builder production modules/templates are unchanged by this rebase. Final Node 24 build/validation and all 342 tests pass. No further native suite was run after this integration.
### Issue #140 advisory action accounting

Tracked declarations, empty counters and own-turn/ordinary-condition applicability record advice instead of requiring a DA override. Unfunded conversions grant no destination allowance. Exact source/equipment/permission requirements and uncertain partial-write recovery remain strict. Active matching defense benefits reuse one effect without another charge. Owners can arrange equipment during encounters; anatomy permissions remain distinct. Potion entry keeps its exact encounter participant off turn, with zero counters recorded as unavailable tracked costs. A zero-HP character giver is condition guidance; terminal/unhealable recipients and real bottle costs remain strict. Outside-combat mode stays explicitly typed and creates no synthetic budgets.

Native acceptance used the isolated Foundry V14 world before integration with startup #121 and builder #137. Bounded `HOL_TEST_ADVISORY_ONLY=1` runs passed `test:player-attacks`, `test:shield-block` and `test:potions`: actual owner Attack outside the selected turn with Main=0; owner EquipmentPanel held-item correction during that encounter; non-owner Shield Block with Reaction=0; active benefit reuse with one effect and no further charge; fresh repeated defenses; actual potion offer outside the selected turn with Maneuver=0 and recipient Reaction=0, owner consent, real HP restoration, post-healing supply roll, and same-operation replay. Counters stayed zero. All three fixtures reported zero page errors, exited successfully and cleaned only their own documents; server 3357869 shut down cleanly and port 30014 was verified closed. Initial fixture failures were setup/assertion/refresh mistakes, corrected without weakening production checks.

Screenshots were viewed in `test-results/advisory-player-attack.png`, `advisory-owner-equipment.png`, `shield-block-defense-dialog.png`, and `advisory-potion-consent.png`. The Attack capture is scrolled to expanded optional sections; equipment/defense captures precede wording-only corrections replacing the old DA-only/own-turn prohibition language. This proves these bounded flows, not every ability handler or whole-encounter release acceptance. Post-native production changes only correct those guidance/result labels; rebase and final Node 24 results are recorded with the PR.

Final #140 integration rebased onto `1573687`, preserving startup authority #121 and builder #137. Only appended acceptance/development documentation conflicted; both scopes were retained. The native-tested #140 production modules/templates are unchanged by rebase; subsequent production edits only correct guidance/result text and the stale numeric-NPC development-preview sentence. Final integrated Node 24 build/validation and all 356 tests pass. Focused action/defense/potion primitive and entry checks pass 32 tests. Native acceptance was not repeated solely for this integration/copy change.


### Issue #15 — basic inventory acquisition and learning routes

Owners can copy readable catalog/world equipment through native inventory drop or the Add equipment selector. The native Item creation path assigns a fresh embedded identity while preserving quantity, supply, canonical provenance and the exact source UUID in `flags.heroes-of-legend.copySourceUuid`. Same-Actor sorting stays native. Cross-Actor drops refuse an implicit clone; explicit transfer remains manual. An ability drop opens the existing learning wizard, preserving unsaved fields and current stage, with no automatic grant or DP spend. Only an available learning search is focused.

The bounded Foundry 14.369 three-client reference fixture passed catalog drop, world-source click copy, exact provenance/quantity/supply, same-Actor sorting, foreign-Actor refusal and current-stage/unsaved-draft preservation before the reference tests above. Cleanup removed the exact fixture documents; the isolated server was stopped and its port confirmed closed. Two fixture-only corrections matched the existing heroName field and tested a checkbox inside collapsed Details. A later focused regression prevents shopping-search changes when dropping an ability at that stage. Final Node 24 full check passes all 365 tests, including 13 focused reference/import/sheet-route regressions. This is not complete container, cross-character transfer or detached-window acceptance.

Final #15 integration rebased onto #140 main `168b7a4`. Only appended documentation conflicted; both acceptance records were preserved. The full integrated Node 24 build/validation passes 369 tests. Native acceptance was not repeated for the rebase or the focused shopping-stage guard. This increment received author review; primary review and merge are separate.


### Release 0.1.0 exact-artifact evidence

Tag `v0.1.0` at `bc251123e0ba5a9e0c90d7bec1975a4aec197a3c` passed [CI run 39087097066](https://github.com/bruceamoser/heroes-of-legend-foundry/actions/runs/39087097066) on Node 24.22.0: 370 tests and a validated 352-file package. The exact 95,390,654-byte ZIP (`8189bdb81cd1b33f4b7013b6aa4ff10f56480a1d4dd14f890a9158a390779388`) passed native Foundry 14.369 Setup installation/manifest-driven alpha replacement with edited-Actor preservation. The final installed GM/two-player run passed all nine gameplay/visual checkpoints, zero page errors through teardown and exact cleanup (3 Actors, 2 Users, 1 Scene, 1 Combat, 24 messages). Primary reviewed the final theme/layout and attack/defense screenshots, supported by the unobstructed narrow probe. The same assets were published as the full latest release; anonymous manifest/ZIP/SHA256SUMS downloads were byte-equal to CI. Native public Install also passed on 14.369, preserving the edited imported Actor with zero browser errors. The actual alpha Update check fetched correct public 0.1.0 URLs but returned `isUpgrade: false`; no Update-button transition or previous-public-release upgrade is claimed. Local alpha users can reinstall via Setup Install System; this platform limitation is documented. See [release evidence](release-0.1.0.md) and [installed-core acceptance](installed-core-acceptance.md).

The installed fixture uses constructor-built PCs; #137's guided creation/advancement and the six reference-hero Review/commits remain separate evidence. Readable specialty costs/effects remain manual; decorative tier/silhouette parity is not claimed. Licensing remains explicitly undecided with existing notices retained.


### Issue #175 creature actions and profile updates

Node 24 build/validation and all 432 tests pass. The full workshop browser suite
passes against current bdfd18e catalogs. Foundry 14.369 native acceptance passed
`test:creature-expansion` (nine representative creature sheets, ten full specialty
reference declarations, stable shared IDs, no unexpected rolls/mutations, and
commanded summon restrictions), `test:profile-update` (old creature/summon CV and
references, shared Fall to Pieces, preserved local blocks/injuries/items/effects/
command history/name/art, and idempotent replay), and `test:creature-actions`
(Red Dragon multi-target suggestions, non-owner fresh/repeated Defend, exact
printed outcomes and normal encounter defense ability availability). All three
reported zero page errors and cleaned their fixture documents. The isolated
server was stopped after acceptance.

GM world creature/summon sheets have **Update profile**, which reads the installed
current pack and preserves divergent printed blocks and all live resources.
`static/data/profile-update-bases.json` contains only previous-profile change
fingerprints; regeneration is pinned to software 9030f69 and book d67e046. Run
`node scripts/generate-profile-update-bases.mjs --check` with that software Git
object available. The ordinary package does not require a book checkout.
Specialty effects/timing, AoE worst-target choice, and forced movement/terrain
remain DA adjudication with complete local rules; pure primitive tests do not
establish automatic specialty resolution. See the action-expansion audit.


### Issue #177 web sheet play controls

The web header has editable current/max HP, reduced current/max Speed, wound
count, a skull death-roll control and six attribute dice buttons. Main and
Abilities action tables expose dice for records with a printed attribute; the
roll dialog keeps an editable attribute, a −3…+3 Banes/Boons slider and optional
learned ability selections. These selections document use; printed specialty
costs/effects remain table adjudication. Recipe rolls retain their existing path.
Abilities groups are Main Action, Maneuver, Reaction, Passive and Other.
Character records a wound history with names and effects/notes. Adding/removing
wounds is a manual record/correction, not a new wound generation/treatment rule.

Current HP, failed death rolls and wound history persist in browser saves and
portable character JSON. Positive HP edits clear death marks. The skull dialog
allows repeated rolls and manual mark corrections; browser play does not impose
an encounter clock or Last Words lock. Standard, Weak, Strong and natural 111/666
results follow the existing survival rules. Poisoned prefills the net slider;
Speed reflects existing encumbrance and Slowed. No wound penalties are inferred
from prose or automatically applied by the wound-note list.

Node 24 build/validation and all 435 tests pass. The full workshop browser suite
and new `npm run test:workshop-play` pass with zero browser errors. The latter
checks HP reload, attribute/ability rolls, repeatable death rolls with known dice,
failed-mark corrections/healing reset, wound history/count, five ability groups,
Slowed Speed, JSON round trips and 900/760/390px overflow. Primary visually
reviewed the native-sized and narrow web screenshots. Pure browser death results
are compared against native survival for all 216 die triples and three prior
mark counts. No Foundry runtime test or native sheet UI change is claimed here.
Both browser suites now run in validation and Pages deployment workflows.


### Issue #179 web resources and remembered presentation

Header **Wounds** opens a damage-type selector and rolls the shared wound rules:
3d6 plus prior-wound dice, capped at five; keep highest three and read ascending.
The current pinned 280-entry wound catalog is shipped with the web app. A roll
records the wound/scar, applies printed conditions, contributes lasting Speed
penalties, and exposes contextual wound Boons/Banes in the roll dialog. Wound
conditions are recorded once rather than re-created on reload; lasting effects
are derived from the canonical catalog ID/type/dice, never imported effect code.
Directional displacement is readable for table placement; the web app has no
canvas. Treatment/remedy text is retained, not an automated treatment procedure.
Last Words from a wound is recorded with 0 HP and three marks; ordinary Grit,
potions and death rolls do not reverse it. Manual HP/wound controls remain
available for table corrections.

Header **Grit** confirms one expenditure, restores full HP and clears marks;
wounds remain. Main's potion action and individual carried supply rows have dice
controls. Potions apply their printed fixed healing before the supply check,
including the final dose. Inventory dice step down only on 1; quantity is not
silently decremented or used to refill a supply. The inventory quantity input
updates the existing stack and recalculates Bulk, carrying, defenses and Speed;
zero quantity cannot grant worn/held benefits.

Every right-column section and action group is collapsible. State is saved
synchronously on summary activation, before the later native toggle event, so
an immediate reload retains the final change. Existing basic-action visibility
choices remain character data. Abilities and inventory instances have outline/
filled favorite stars. All these choices, rolled wound evidence, Grit expenditure
and per-instance quantity/supply overrides survive browser and portable saves.
No historical rules choices are introduced.

Node 24 build/validation and all 441 tests pass. The full workshop, #177 play and
new `test:workshop-resources` browser suites pass with zero browser errors. The
new suite uses known dice to verify wound conditions/Speed/context/Last Words,
confirmed/cancelled Grit, all collapsed sections through immediate reload,
final-dose potion healing, supply decay without quantity change, editable
quantity, stars and JSON persistence. It checks 900/760/390px overflow. Primary
reviewed compact Main, Inventory and Abilities captures. Pure tests cover every
approved wound type/key, prior-dice cap, safe portable state, Bulk/zero-quantity
benefits, Grit and supply rules. All three suites are required in CI and Pages.
This is web acceptance; native Foundry sheets were not changed or retested.


### Issue #181 wound recovery, resupply, Favorites and condition use

Character wound names open local detail dialogs. The table separates scar/history,
active effects and recovery progress/value. Apply healing records 1/2/3 progress;
Bruce explicitly confirmed completion when progress **reaches** the printed value.
Completion removes the printed treatable consequences (lasting Speed/roll
modifiers and this wound's starred conditions), preserving the scar, original
roll, wound count and unrelated/ordinary temporary conditions. No HP is restored
by a treatment-progress entry. Non-track remedies and Last Words retain their
printed rules. The table records an adjudicated treatment result; it adds no
calendar, permission or prerequisite gates.

Every inventory supply has Resupply at every die state, including empty or already
full. Steps use the shared refill ladder and cap at the item's printed starting
maximum; all healing bottles cap at d4. Resupply leaves quantity unchanged and can
also correct a zero-quantity stack's supply state without inventing new quantity.
Basic/universal actions can be starred. Main starts with a collapsible Favorites
section for learned/universal abilities and favorited inventory basics: melee,
throw and opportunity actions for melee weapons; ranged for ranged weapons;
Shield Block for shields; the potion action for healing bottles; ordinary item
handling otherwise. Supply favorites act on their exact instance. Duplicate
weapon/ability action favorites are combined. Opportunity uses Basic Melee's
printed roll. Favorites remains first on narrow screens, above the summary boxes.

Conditions have rating +/- and explicit Apply for Burning, Freezing and Bleeding.
Apply combines all sources of the same condition before native pure damage:
fire/cold resistance and minimum apply once to the combined event;
Bleeding bypasses resistance. It changes HP/death marks without simultaneously
decaying or deleting the condition. Repeating Apply is allowed for another tick
or table correction. Reaching 0 HP directs the player to the existing header
wound control. Browser play still has no complete encounter clock or automatic
wound roll triggered by HP loss.

Node 24 build/validation and all 445 tests pass. The full workshop, play, resource
and new `test:workshop-recovery` browser suites pass with zero browser errors;
all four are required in CI/Pages. New evidence covers exact-threshold healing,
starred removal/retained scars and Speed restoration, wound details, capped empty
resupply, universal/learned/inventory Favorites, manual condition damage without
decay, saved/reloaded/JSON state and 760/390px layout. Main and wound-table captures
were visually reviewed; Favorites position is asserted at both sizes. Pure checks
also cover every consumable at each valid die state (including quantity zero),
printed caps, bleeding bypass/minimum damage and duplicate favorite actions.
Native Foundry UI and book sources were not changed.

### Web builder and play controls (#183)

Discipline purchases have a separate, remembered disclosure above the ability
list. Both lists keep eligible choices first and unavailable choices visible;
ability search filters only abilities. Ability headers show A/M/R/P timing and
every required discipline icon, with rank 2/3 overlays where required. Existing
purchase, drag/drop, DP and creation/advancement rules remain shared.

Wounds have separate treatment capability, progress and Apply healing columns.
Bruce withdrew the natural-healing-time request: the rules provide no universal
rest timer, so no healing-time estimates were added. Main Defenses has repeatable
Evade with attribute selection, the existing net slider/ability selections,
applicable condition modifiers and reversed attack-effect tier guidance. Main
Supplies shares Inventory's resupply flow and printed caps.

Validation: Node 24 build/validation and 447 tests; workshop, play, resources,
recovery and new builder-view browser suites. The new suite checks separated
lists through advancement purchases, remembered disclosure, every requirement
badge, four action letters, separate wound columns, selectable/repeatable Evade,
condition modifiers and Main resupply at 760/390px. These are web browser checks;
no native Foundry UI or book sources changed.

### Web required choices and sheet layout (#185)

A pinned charactermancer banner names unresolved acquisition choices using the
same validation results that govern the granted item/language/recipe. Required
choice panels open with an amber highlight and instructions. On creation steps
without the normal acquisition list, missing choices appear directly above the
step content. Resolved choices lose their warning. This adds guidance, no new
play restrictions. Ranged equipment does not request melee hand use.

The header shows ancestry, culture, background, class and Level N(current DP).
Character omits the Player field and puts an always-editable, remembered Story
disclosure immediately above Wounds. Existing stored Player metadata is retained
in portable files. Character's Add wound opens the exact header wound-roll flow.
Development uses themed Training, Class signatures, Advancement history and
Creation ledger panels, retaining level adjustment, DP spending and independent
signature selection. Signature rendering tolerates unknown/mistyped imported
class IDs so users can repair them.

Validation covers missing Hook and Drive weapon choice, pinned warning while
scrolling, resolution and reload, Story editing/collapse persistence, shared wound
dialog content, Level 7/current-DP header, origin order, signature status and
760/390px Development layouts. All 447 pure tests and all five browser suites
pass. Screenshots were visually reviewed. No native Foundry UI or rules changes.

### Current Build and purchase dialogs (#187)

Early/Heroic learning use an always-open Current Build list. Required acquisition
choices appear only while unresolved, nested beneath the granting ability. The
Heroic list locks the Early Learning entries; earlier advancement entries are
likewise read-only. Early Learning has no discipline market. Separate Learn
abilities and Learn discipline dialogs preserve eligible-first ordering, visible
unavailable choices, discipline rank badges and available DP. Purchases update the
dialog without closing it; Close or Escape dismisses it. Reading rules uses the
separate reference dialog.

Equipment keeps only its compact starting inventory and purchase button. Its
inventory market remains open for repeated purchases. Every purchase exceeding
remaining coins asks for confirmation, even after a previously approved overage;
declining changes nothing. The portable coinOverride approval remains supported,
but no checkbox or acquisition forms are shown on Equipment.

Missing-choice messages navigate to the appropriate creation, signature or
advancement screen. Reviewing a previous level uses a persisted editor level,
without changing the character's actual level. Death rolls show three outlined
skull buttons, filling marks red after rolls or manual correction; keyboard and
saved-state behavior remain available. Existing death-roll rules are unchanged.

Validation: Node 24 build/validation and 447 tests passed, along with all five
workshop browser suites. Updated coverage follows the new dialogs through full
creation, advancement and import/repair flows. Dedicated checks cover Current
Build grants, nested missing choices, locked entries, absence of early discipline
buying, dialogs remaining open, over-budget acceptance/decline on repeated buys,
warning navigation including previous levels, and skull roll/correction/reload.
760/390px layouts and dialog screenshots were visually reviewed. Native Foundry
UI and book sources were not changed.

### Learning references and equipment eligibility (#189)

The learning dialog pins known discipline ranks and a compact purchased-ability
reference above its scrolling choices. The discipline filter includes All and
Universal; Universal selects abilities without discipline requirements, including
purchasable utility abilities. Free basic actions remain available without a DP
purchase. Class starting-discipline choices already held before class selection
are gray and disabled when unselected. Saved duplicate selections remain
removable rather than silently changing an existing build.

One shared equipment-eligibility helper covers the printed Light/Medium/Heavy
Armor training and Smoke Supply requirements. Both the creation market and play
Add item dropdown keep unavailable equipment visible with the required ability;
the purchase/add actions also enforce the same check. Existing inventory/imports
are retained. Equipment tests use unrestricted tents for quantity and over-budget
scenarios; separate assertions cover unavailable armor/smoke and attempted
manipulation of the Add item dropdown. Dialog close controls use transparent dark
header backgrounds and invert to dark text on parchment on hover/focus.

Node 24 build/validation and all 449 tests pass, as do all five browser suites.
New checks cover printed requirement parity, Universal classification, pinned
references, updating purchases, disabled already-known class choices, disabled
inventory options, action-level enforcement and close-button colors. Dialog
screenshots visually reviewed. No rules or native Foundry UI changes.

### Compact Current Build (#191)

Learning headings share a row with their purchase buttons. Current Build uses
compact aligned ability/source/control columns, 27px rows for ordinary entries at
760px, and reduced padding; required choices still expand below their granting
entry. Long text wraps on narrow screens. Browser acceptance checks row density,
heading alignment and 390px overflow; sheet/phone screenshots were reviewed.
Node 24 checks and all 449 tests pass; the targeted builder browser suite passes.
