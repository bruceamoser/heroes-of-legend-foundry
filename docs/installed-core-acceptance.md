# Installed core-play acceptance — issues #121, #16 and #144

Final combined native execution **passed**, including gameplay, visual capture,
zero page errors through browser teardown and exact fixture cleanup. Primary
reviewed the final light/dark/narrow/detached and attack/defense screenshots,
using the earlier unobstructed narrow probe as supporting evidence. Publication,
anonymous public URL/hash verification and native public Install passed. The
alpha Update-button comparator limitation is recorded below. Installation and gameplay used
the same downloaded draft ZIP; independent fresh LevelDB builds are not assumed
byte-identical.

The isolated Setup instance uses `/tmp/hol-release-install-144`, separate port
30024 and the existing licensed runtime outside Git. Its private Config contains
only the existing isolated license and fresh loopback/no-UPnP options; its initial
systems/worlds directories are empty. Do not start it before runtime ownership is
explicitly handed off. The shared test world and real installation are separate.

Follow [release install/update acceptance](release-0.1.0.md) for the retained
alpha baseline, edited world-Actor preservation and native Setup installation of
the unchanged draft ZIP. The loopback transport helper changes only outer
manifest URLs. Retain the original hash and track public verification separately.

Once the final package is installed and its blank world is launched, run:

```sh
HOL_TEST_URL=http://127.0.0.1:30024 \
HOL_TEST_ALLOW_WRITES=1 HOL_TEST_ISOLATED_WORLD=1 \
HOL_TEST_INSTALLED_PACKAGE=/tmp/hol-release-install-144/Data/systems/heroes-of-legend \
HOL_RELEASE_ARTIFACT_DIR=/absolute/path/to/downloaded-draft-assets \
npm run test:installed-core
```

Use pinned Node 24. The fixture rejects a worktree symlink, verifies the supplied
ZIP checksum and compares installed core modules to that ZIP before playing. It
checks four pack counts and the imported creature portrait over same-origin HTTP.

One GM and two players use constructor-built PCs in one continuous encounter:

- Source compendium equipment enters owned inventory through **Add equipment**.
- A player uses the native Basic Melee Item button, Foundry target selection and
  optional owned reference; the authoritative roll preserves that reference.
  Linked damage applies once even when its review action is repeated.
- The GM posts a typed creature action with two native target suggestions. A
  different player's defender receives Shield Block and two fresh Defend rolls,
  without an ownership or written-reason questionnaire.
- Printed specialty effects stay manual. A separate DA damage application and
  one temporary Burning contribution pass through ordinary turn completion.
- A cross-owner potion receives one-click recipient consent; a later free-play
  self-potion uses a separate real d4 bottle, without an artificial encounter.
- GM reload and same-operation attack/potion replay preserve HP, dice, receipts
  and action state.

The same run captures light/dark, narrow and native detached character sheets,
plus attack/defense views. Inspect the PNGs visually; screenshots existing on disk
are not themselves a passing visual review. Evidence JSON records the exact ZIP
hash and marks public URLs untested. Cleanup verifies deletion of all tracked
fixture messages, Combat, Scene, Actors and Users. Each client restores the prior
Scene or tears down the fixture Canvas before deletion. Browser error checking
continues through cleanup and browser teardown. The separately edited import
used for installation/update preservation remains outside this fixture.

This is a bounded core-play journey. It does not repeat full guided creation
(already accepted in #137), every specialty, every historical failure fixture or
public installation checks. It requires the integrated #140 advisory behavior and
#15 equipment controls. Record actual results, screenshots reviewed and any
cleanup errors after execution; partial checkpoints do not establish a passing
overall run.

## Recorded candidate execution

The final combined run passed all nine gameplay/visual checkpoints on Foundry
14.369, with zero page errors through cleanup/browser teardown. Exact cleanup
removed 3 Actors, 2 Users, 1 Scene, 1 Combat and 24 messages. Primary viewed the
final light/dark/narrow/detached and attack/defense PNGs, supported by the earlier
unobstructed narrow probe: the HOL palette, controls, native targets, effective
slider and fixed footer were readable without horizontal clipping; normal
vertical scrolling remains. Evidence: `/tmp/hol121-installed-native-5.log` and
`/tmp/hol-installed-core-worktree/test-results/installed-core-evidence.json`.
The JSON marks screenshots as requiring review; the primary review followed it.

The exact installed candidate was tag `v0.1.0`, source
`bc251123e0ba5a9e0c90d7bec1975a4aec197a3c`, from
[CI run 39087097066](https://github.com/bruceamoser/heroes-of-legend-foundry/actions/runs/39087097066).
Node 24.22.0 passed 370 tests and packaged 352 files. ZIP: 95,390,654 bytes,
SHA-256 `8189bdb81cd1b33f4b7013b6aa4ff10f56480a1d4dd14f890a9158a390779388`.
Native Setup installed the unchanged ZIP and replaced the retained alpha through
local manifest-driven Install. The edited imported Actor retained its UUID, name, HP 9,
biography, portrait/source and custom marker; Setup browser errors were empty.

Earlier fixture-only corrections covered startup timeout, duplicate/scoped DOM
selectors, native sheet configuration instead of a stale theme-cache assertion,
and restricting initialization to HTTP documents to avoid about:blank storage
errors. The final pass supersedes those attempts; no production changes or
accepted ZIP replacement were required. The executed corrected harness bytes are
committed as `3e6baf6` ([#153](https://github.com/bruceamoser/heroes-of-legend-foundry/pull/153)),
separate from tagged production `bc25112`.

The full latest [v0.1.0 release](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/tag/v0.1.0)
was published unchanged. Anonymous GET of manifest, ZIP and SHA256SUMS succeeded;
all public bytes matched accepted CI downloads. Evidence:
`/tmp/hol-release-public-v0.1.0/verified-public.json`. This supersedes the native
evidence JSON's earlier `publicUrlsTested: false`. Native public Install
subsequently passed; the actual alpha Update check is limited as described below.

This bounded installed journey uses constructor-built PCs; the separately
accepted #137 continuous guided creation/advancement and six reference-hero
Review/commit checks remain separate evidence. Readable specialty effects/costs
stay manual, and decorative tier-diamond/discipline-silhouette parity is not
claimed. No live campaign or baseline preservation Actor was deleted by fixture
cleanup.


Native public Install on Foundry 14.369 launched 0.1.0, retained the edited
import's UUID/name/HP 9/biography/portrait/source/marker/Items and recorded zero
browser errors. Evidence: `/tmp/hol144-public-native-5.log` and the `public`
record in `/tmp/hol-release-install-144/acceptance-state.json`; the preservation
screenshot was viewed. The actual Update check discovered correct public URLs
and version 0.1.0, but returned `isUpgrade: false` from the local development
0.1.0-alpha.1 build. No Update-button transition is claimed. There was no prior
public release; local alpha users can reinstall through Setup's Install System
manifest field. This accepted platform limitation is distinct from the passing
public installation and world-document preservation checks.


After acceptance the isolated runtime (PID 3452062) was stopped, port 30024 was
verified closed and the transport was stopped. The disposable world, including
the separately preserved edited Actor, remains available for review.

## Release 1.0.0 candidate procedure (#216)

The harness now defaults to `HOL_TEST_RELEASE_VERSION=1.0.0`, verifies both
release asset checksums and the standalone/embedded manifest identity, and checks
current native sheets plus all six compendiums: 419 abilities, 44 equipment,
192 creatures, 73 summon profiles, 610 player rules and 408 DA rules. It opens a
player rule as a player and rejects an existing DA rule path. The historical
0.1.0 evidence above remains historical; these changes are instructions, not a
claim that the 1.0.0 candidate has passed installation or gameplay acceptance.

After native Setup installation of the exact downloaded draft and world launch:

```sh
HOL_TEST_URL=http://127.0.0.1:30016 \
HOL_TEST_ALLOW_WRITES=1 HOL_TEST_ISOLATED_WORLD=1 \
HOL_TEST_RELEASE_VERSION=1.0.0 \
HOL_TEST_INSTALLED_PACKAGE=/absolute/disposable-data/Data/systems/heroes-of-legend \
HOL_RELEASE_ARTIFACT_DIR=/absolute/path/to/downloaded-draft-assets \
npm run test:installed-core
```

The fixture enters the native Inventory tab before Add equipment, returns to Main
for sheet screenshots, and preserves the original targeting, attack/defense,
turn budgets, consent, damage, replay, persistence and exact cleanup checks. Run
`test:native-design` separately against that installed candidate for portraits,
icons, new owner tools, journal import preservation and observer access. Serialize
these native runs; screenshots still require visual review. Record completed
1.0.0 evidence in [release-1.0.0.md](release-1.0.0.md).
