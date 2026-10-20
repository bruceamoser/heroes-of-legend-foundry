# Release 1.0.0 checklist and evidence

Bruce requested a new major release on October 20, 2026 (#216), after the native
web-design integration in [#215](https://github.com/bruceamoser/heroes-of-legend-foundry/pull/215).
Published October 20, 2026 as [v1.0.0](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/tag/v1.0.0).
Fresh native Setup installation, the public 0.1.0 upgrade/preservation checks,
installed core gameplay and anonymous artifact verification passed on Foundry 14.369.
A final item-card visual finding is tracked in #218 for an immutable 1.0.1 patch.

## Release identity

- Version: `1.0.0` in package metadata, lockfile and shipped manifest.
- Tag: `v1.0.0` at `0a78a39187a6f225fe6aa732a6c63208ef5fe027`, prepared in [#217](https://github.com/bruceamoser/heroes-of-legend-foundry/pull/217).
- Foundry: V14; minimum 14.367, verified development runtime 14.369.
- Stable update manifest: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json>.
- Version-specific manifest: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.0/system.json>.
- Immutable ZIP: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.0/heroes-of-legend.zip>.
- Preceding public release: [0.1.0](release-0.1.0.md).
- Source baseline: unchanged pinned `content/source-lock.json`; no rulebook mechanics changed for this release.

## Features and supported scope

- Native character sheets have fixed vitals/attributes, hanging tabs, Favorites,
  Story, inventory, Development and conditional Crafting. Creation and advancement
  use persistent learning/equipment markets with visible unresolved grant choices.
- NPC/creature cards show seven combat statistics and full action references.
  Native targeting, declaration/defense workflows, roll dialogs, chat cards and
  side-grouped combat controls retain their existing document services.
- Owner-facing recovery, Grit expenditure, additional wounds and wound treatment,
  sourced conditions, retained empty inventory stacks, capped resupply and known
  recipe crafting use permission checks, persistent receipts and one authority.
- Character, NPC/creature and summon portraits use Foundry's native image picker
  with an explicit image-only **Save portrait** action. Observers can view images.
- All 419 ability and 44 equipment catalog entries have appropriate discipline or
  category icons. Existing generic defaults receive image-only cosmetic updates;
  custom images are preserved. There are 192 creature and 73 summon profiles.
- Complete local rule references ship as two JournalEntry compendiums: 610 player
  references and 408 DA references. The Rules Library supports search and local
  links; explicit world imports preserve existing edited source identities.
- All 192 runtime creature portraits fit a 768px maximum edge without cropping or
  upscaling (Ettin 640×768). Transparency and pinned original source hashes remain.
  Runtime art totals 41,666,026 bytes, down from 93,699,982 bytes (55.53% smaller).

Specialty costs/effects, placement, geometry, optional carried crafting materials,
printed activity time and unsupported specialty outcomes remain table judgments
unless a reviewed native handler implements them. Crafting does not advance world
time automatically. Summon spawning, commands, tether checks and lifecycle remain
manual. This release does not claim all-ability automation. See
[native integration coverage](native-web-integration.md) for detailed boundaries.

## Upgrade instructions

Back up the world, stop it and return to Foundry Setup before updating. From
0.1.0, use the system's **Update** control when 1.0.0 is offered. The actual
0.1.0→1.0.0 native Setup Update transition passed in a disposable installation,
preserving edited Actor statistics/biography, custom artwork, ownership, Items and
the edited campaign journal across launch and explicit rules import.

World Actors, Items and imported journals are editable snapshots. Updating system
compendiums does not silently rebuild existing characters or replace edited world
content. Review source changes before explicitly importing or refreshing a world
profile. Existing generic item icons may receive cosmetic `img` changes; custom
artwork remains. Rules-journal world import is explicit and retains already
imported source identities, including renamed entries.

The earlier local `0.1.0-alpha.1` comparator limitation is recorded in the
[0.1.0 evidence](release-0.1.0.md). If Setup does not offer an update, use **Game
Systems → Install System** with the stable manifest after backing up and stopping
the world; fresh installation of this exact candidate passed separately.

## Acceptance record

| Gate | Status | Evidence |
|---|---|---|
| Integrated implementation | Passed | #215 merged as `6909593a09d552ecd453080729103930c717ca68`; author review under repository authorization, not independent approval. |
| Release build/validation/tests | Passed locally | Node 24: 508 tests after version bump; both final #215 CI runs also passed. New release CI remains pending below. |
| Native development acceptance | Passed on 14.369 | Separate GM/owner/observer clients; Grit, crafting, manual wounds, exact-RV treatment, condition damage, empty-stack resupply/Favorites, observer denial and all 1,018 journals. Zero browser errors; exact fixture cleanup. |
| Portrait/icon and visual development checks | Passed on 14.369 | Native portrait picker invocation, image-only save/reload, NPC image update, custom/default item-art policy; character/NPC/item/tool/library visuals reviewed. Resized-art visual check passed. |
| Builders, conditions and startup | Passed on 14.369 | Native creation/advancement markets, grants, persistence/replay; sourced conditions, observer denial/unlinked tokens; startup smoke. |
| Web browser suites | Passed | All nine suites. The final builder-view reload assertion waits for the exact restored control; final #215 CI passed after that test timing correction. |
| Release metadata PR and CI | Passed | #217 author review and both CI runs passed; version-bumped local build/validation and all 508 tests passed. |
| Tagged draft artifacts | Passed | [Workflow 39497202817](https://github.com/bruceamoser/heroes-of-legend-foundry/actions/runs/39497202817) passed at the tagged commit. Downloaded all three unchanged assets and verified both SHA256SUMS entries; 457 archive files. |
| Fresh native Setup installation | Passed | Separate disposable Foundry 14.369 installed the exact draft ZIP via Setup, created `hol-release-fresh`, and loaded 1.0.0 with all six compendiums. |
| Upgrade from public 0.1.0 | Passed | Installed the public baseline through Setup, then used the actual native Update control and launched `hol-release-upgrade`. Actor UUID/name/HP9/biography/attributes/ownership/source marker, custom Item image/data and edited journal identity/text/permissions were preserved. Repeated rules import retained the edited journal and created no duplicate source identities. |
| Exact installed-package acceptance | Passed; visual follow-up #218 | Installed native-design GM/owner/observer suite passed with no browser errors and exact cleanup: 8 messages, 1,018 journals, 2 Actors, 2 Users. All ten installed-core checkpoints passed, including native targets, player/creature attacks, repeat damage protection, Shield Block/Reaction budget, conditions, consent, free-play healing and reload/replay. Cleanup verified 3 Actors, 2 Users, 1 Scene, 1 Combat and 20 messages; no browser errors through teardown. |
| Publication and public assets | Passed | Full public release at 2026-10-20T21:28:37Z. Anonymous versioned manifest/ZIP/checksums match accepted draft bytes. Cache-refreshed latest manifest resolves 1.0.0 and its pinned ZIP; the initial bare latest request briefly returned the preceding release. |

The release workflow creates an unpublished draft. Local transport may change
only the outer manifest URLs, preserving the downloaded ZIP unchanged. Archive
round-tripping alone is not a native Setup install test. Do not replace accepted
artifacts silently; changed candidate bytes require the affected checks again.

Code and content licensing remain undecided. Retain all source/art/provenance
notices; this release creates no new license grant or Foundry directory approval.

## Exact artifact identity and transport

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `system.json` | 2,818 | `76cdd5ff200ac9c6069a0ae016d831ae030ba79bf63649710e060f03f8b70004` |
| `heroes-of-legend.zip` | 45,354,353 | `8dd2f6e0f6ee3edac2be63e236f8cb034a14d21be4eec8ef04f7c0b28d849eb9` |
| `SHA256SUMS` | 165 | `ad4eac73ae08cd97b2141cd2965313f48ec616aec4e66bd263ff27464156134a` |

Draft acceptance used a loopback transport manifest serving the unchanged CI ZIP.
To test Update before publication, only the installed **baseline** manifest tracking
URL was pointed to that transport while the disposable world was stopped; the
baseline/candidate ZIP bytes and version identities were unchanged. Native Setup
reported `isUpgrade: true`, and its Update control installed 1.0.0. Public asset
verification remains a separate gate. A stopped-world copy was retained before
migration; no live campaign data or proprietary runtime files enter this repository.

Local evidence is under `/mnt/disk4/tmp/hol216/`: `upgrade-setup.json`,
`upgrade-preservation.json`, `fresh-install.log`, `foundry-fresh.log`,
`native-design.log`, and the exact `candidate/` downloads. The first installed-core
attempt reached the player attack checkpoint, then a late Foundry tutorial overlay
intercepted a chat click. It cleaned up its exact fixture; the harness now dismisses
native tutorials at actionability boundaries and brings the active UI forward.
This test-only correction changes no accepted release bytes.

## Installed visual review and follow-up

Primary reviewed the exact installed light/dark, narrow, detached, attack and defense
PNGs, plus native character/NPC/card/recovery/crafting/library views. A supplemental
unobstructed 600px sheet at the normal 1500px desktop viewport passed and was viewed;
the earlier 820px viewport triggered Foundry's minimum-screen-resolution notice over
the title bar. Normal vertical scrolling remains.

The final item screenshot exposed pale read-only quantity/Bulk/hands/supply values
and the untranslated `TYPES.Item.equipment` title. #218 corrects those visual details
in 1.0.1; the published 1.0.0 files are preserved. No gameplay or world-data defect
was found. `public/verified-public.json` records anonymous artifact equality;
`test-results/installed-core-evidence.json` records ten checkpoints and exact cleanup.
