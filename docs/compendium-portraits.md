# Compendium portraits — issue #124

All 192 native creature Actors resolve their portrait from the source-locked
`assets/creatures/manifest.json`. The 73 summon profiles use the same asset as
their explicitly linked creature. Actor images and prototype Token textures use
installed URLs under `systems/heroes-of-legend/assets/creatures/`; stable Actor
IDs, footprint width/height, source identities and printed rules are preserved.
Missing mappings or source-lock drift fail generation. Asset file, byte/hash,
source/derivative dimensions and the 768px/no-upscale policy, alpha, exact file set and provenance validation remain in the
build and release checks. Manifest changes affect deterministic Actor pack hashes.

The initial #124 wiring created no new image derivatives. Issue #213 now bounds
those shared assets to a 768px maximum edge, preserving aspect and alpha without
upscaling or cropping; no duplicate summon image is created. A compact portrait on each creature/summon sheet opens the
native [V14 ImagePopout](https://foundryvtt.com/api/v14/classes/foundry.applications.apps.ImagePopout.html).
The sheet does not automatically share the image. Generation modifies authored
compendium sources only; existing world Actors and their edited images remain
untouched. Distribution licensing remains undecided.

The summon sheet review correction removes a blanket summon-chain statement,
keeps the short reference/DA lifecycle note, and puts full commands and provenance
in collapsed source details. Printed statistics and attacker outcomes stay visible.

## Runtime data and measured payload

`src/services/catalog.mjs` consumes `data/choices.json` and `data/inventory.json`
for creation, advancement and equipment. `src/services/wounds.mjs` consumes
`data/wounds.json`. The creature and summon intake catalogs have no runtime
consumer; native play reads their Actor compendiums. The build therefore excludes
only `data/creatures.json` and `data/summons.json`, saving 3,602,451 uncompressed
bytes. All authored source catalogs remain in the repository.

Measured local build/package (October 17, 2026): 338 files, 98,303,923 installed
bytes, ZIP 95,288,023 bytes. Image payload is 192 WebP files totaling 93,699,982
bytes, shared across 192 creature and 73 summon mappings. The archive was extracted
and every file verified byte-for-byte by the release packager. Exact-set validators
reject masters/reference formats and extra art files; no source masters, prompts
or QA variants are included. These are local package results, not publication.

## Validation and native acceptance

Node 24.22.0 full `npm run check` passed build, package/art validation and 280 tests,
including two official CLI semantic round trips for all four packs. Counts remain
350 abilities, 43 equipment entries, 192 creatures and 73 summons. The Basic Melee
handler and every native footprint remain intact.

Native Foundry 14.369 acceptance passed on October 17, 2026 in the isolated
world. The combined command verified all 192 creature imports, all 73 strict
summon models and stable-ID imports, four readable summon sheets, the native
Actor-directory drop, and exact installed HTTP bytes/hashes for all 192 assets.
Real fixture Tokens, creature/summon sheets, native enlarged views and the
non-square Ettin image passed with zero page errors. A final portrait-only rerun
used a clearer viewport pan and dismissed headless notifications for screenshots;
those sheet, Token and enlarged-image captures were visually inspected. Both
fixtures reported unchanged preexisting Actors/Token identities and no remaining
fixture documents after cleanup.

Native testing found that Foundry StringField trimming removed the final newline
from preserved summon source Markdown. Summon reference fields now disable
trimming, and the native fixture confirms exact full source text for all 73.
The invalid-data fixture uses strict construction with fallback disabled; native
choices, fractional HP and forbidden healing restrictions are rejected. The drop
fixture uses an empty temporary folder and preserves the native stable ID without
sorting or replacing preexisting Actors. Final full Node 24 checks passed 280/280
again; the release packager verified a fresh rebuilt archive after native testing.

For repeat acceptance, once the isolated world is released and points at this build, run
`npm run test:compendium-content` with `HOL_TEST_URL`, `HOL_TEST_ALLOW_WRITES=1` and
`HOL_TEST_ISOLATED_WORLD=1`. It serially runs the complete creature and summon pack
fixtures plus portrait acceptance. The latter checks all 192 installed asset URLs
and exact response hashes, imports representative source Actors (Adder, Red
Dragon, non-square Ettin and linked summoned Adder), explicitly creates fixture
Tokens, checks native textures and dimensions, opens native enlarged images, and
captures sheets/tokens/enlarged views for visual inspection. It tracks/deletes
only its fixture Actors/Scene and verifies preexisting Actors and Token identities
are unchanged. The summon fixture separately covers native Actor-directory drop.
This provides one combined acceptance command for issues #128 and #124. The
release archive was extracted and verified separately; native HTTP/render checks
used the identical installed build paths in the isolated server.
