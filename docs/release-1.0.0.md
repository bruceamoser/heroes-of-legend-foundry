# Release 1.0.0 checklist and evidence

Bruce requested a new major release on October 20, 2026 (#216), after the native
web-design integration in [#215](https://github.com/bruceamoser/heroes-of-legend-foundry/pull/215).
This document tracks the 1.0.0 candidate. **Publication, tagged artifact identity,
fresh Setup installation and the 0.1.0 upgrade are pending.** Existing development
acceptance below does not certify installation of a newly assembled ZIP.

## Release identity

- Version: `1.0.0` in package metadata, lockfile and shipped manifest.
- Intended tag: `v1.0.0`; tested merged commit and tagged workflow remain pending.
- Foundry: V14; minimum 14.367, verified development runtime 14.369.
- Stable update manifest: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json>.
- Version-specific manifest, after publication: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.0/system.json>.
- Immutable ZIP, after publication: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.0/heroes-of-legend.zip>.
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
0.1.0→1.0.0 Setup transition and preservation checks are still pending for this
candidate; do not treat this instruction as acceptance evidence.

World Actors, Items and imported journals are editable snapshots. Updating system
compendiums does not silently rebuild existing characters or replace edited world
content. Review source changes before explicitly importing or refreshing a world
profile. Existing generic item icons may receive cosmetic `img` changes; custom
artwork remains. Rules-journal world import is explicit and retains already
imported source identities, including renamed entries.

The earlier local `0.1.0-alpha.1` comparator limitation is recorded in the
[0.1.0 evidence](release-0.1.0.md). If Setup does not offer an update, use **Game
Systems → Install System** with the stable manifest after backing up and stopping
the world; fresh/replacement installation of this exact candidate remains pending.

## Acceptance record

| Gate | Status | Evidence |
|---|---|---|
| Integrated implementation | Passed | #215 merged as `6909593a09d552ecd453080729103930c717ca68`; author review under repository authorization, not independent approval. |
| Release build/validation/tests | Passed locally | Node 24: 508 tests after version bump; both final #215 CI runs also passed. New release CI remains pending below. |
| Native development acceptance | Passed on 14.369 | Separate GM/owner/observer clients; Grit, crafting, manual wounds, exact-RV treatment, condition damage, empty-stack resupply/Favorites, observer denial and all 1,018 journals. Zero browser errors; exact fixture cleanup. |
| Portrait/icon and visual development checks | Passed on 14.369 | Native portrait picker invocation, image-only save/reload, NPC image update, custom/default item-art policy; character/NPC/item/tool/library visuals reviewed. Resized-art visual check passed. |
| Builders, conditions and startup | Passed on 14.369 | Native creation/advancement markets, grants, persistence/replay; sourced conditions, observer denial/unlinked tokens; startup smoke. |
| Web browser suites | Passed | All nine suites. The final builder-view reload assertion waits for the exact restored control; final #215 CI passed after that test timing correction. |
| Release metadata PR and CI | Pending | Run current release build/validation/tests and review the version/notes diff. |
| Tagged draft artifacts | Pending | Tag the tested merged commit; download the workflow's exact manifest, ZIP and SHA256SUMS; record commit, bytes and hashes. |
| Fresh native Setup installation | Pending | Separate disposable licensed Foundry14.369 installation using the unchanged downloaded ZIP and a transport-only local manifest if required. |
| Upgrade from public 0.1.0 | Pending | Actual native Setup upgrade; preserve edited world documents, custom artwork, permissions and local source identities across reload. |
| Exact installed-package acceptance | Pending | Repeat applicable native gameplay/permissions/recovery/catalog/visual checks against the installed candidate, not a worktree symlink. |
| Publication and public assets | Pending | Publish accepted draft unchanged, verify anonymous public checksums/manifest ZIP URL and record final manifest. |

The release workflow creates an unpublished draft. Local transport may change
only the outer manifest URLs, preserving the downloaded ZIP unchanged. Archive
round-tripping alone is not a native Setup install test. Do not replace accepted
artifacts silently; changed candidate bytes require the affected checks again.

Code and content licensing remain undecided. Retain all source/art/provenance
notices; this release creates no new license grant or Foundry directory approval.
