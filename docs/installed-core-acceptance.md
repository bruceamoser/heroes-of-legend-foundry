# Installed core-play acceptance — issues #121, #16 and #144

Prepared fixture, **not yet executed**. Run only after final code/static acceptance
and the release workflow produces an unpublished 0.1.0 draft. Download that
workflow's exact manifest, ZIP and SHA256SUMS. Native installation and this play
fixture must use those same ZIP bytes before publication; independent fresh
LevelDB builds are not assumed byte-identical.

The isolated Setup instance uses `/tmp/hol-release-install-144`, separate port
30024 and the existing licensed runtime outside Git. Its private Config contains
only the existing isolated license and fresh loopback/no-UPnP options; its initial
systems/worlds directories are empty. Do not start it before runtime ownership is
explicitly handed off. The shared test world and real installation are separate.

Follow [release install/update acceptance](release-0.1.0.md) for the retained
alpha baseline, edited world-Actor preservation and native Setup installation of
the unchanged draft ZIP. The loopback transport helper changes only outer
manifest URLs. Retain the original hash and mark public URL checks pending.

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
fixture messages, Combat, Scene, Actors and Users. The separately edited import
used for installation/update preservation remains outside this fixture.

This is a bounded core-play journey. It does not repeat full guided creation
(already accepted in #137), every specialty, every historical failure fixture or
public installation checks. It requires the integrated #140 advisory behavior and
#15 equipment controls. Record actual results, screenshots reviewed and any
cleanup errors after execution; do not promote this prepared contract to evidence.
