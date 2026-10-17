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
