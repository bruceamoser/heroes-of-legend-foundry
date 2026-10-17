# Development

Issue #4 establishes the package and test harness. This preview has no character/ability types, sheets, compendiums or gameplay automation yet. Those remain separately tracked work; the manifest intentionally does not advertise them.

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
