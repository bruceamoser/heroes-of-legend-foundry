# Native parity correction acceptance

Issues #221–#226 implement Bruce’s October 20 rejection of visual and functional
parity in 1.0.1. Prior runtime results remain evidence of the particular operations
that were exercised, but are **not acceptance of the interface or full web parity**.
The actual current web applications in `web/` are the reference, including their
validation, state coordination and final results. This document defines gates;
it does not claim that every gate has already passed.

| Area | Required evidence |
|---|---|
| Character and NPC sheets | Equivalent populated web/native screenshots; every tab, compact portrait, editable resources, action groups, inline references, standard Foundry image picker. |
| Creation and advancement | All steps and dependent choices compared; invalid choices blocked with specific feedback; blur followed by Continue preserves input; Save waits for its exact completed receipt then opens the updated sheet; failure retains repairable draft. |
| Import | Actual web UI export → native UI import → Save → sheet → reload as GM and player. Compare derived stats plus inventory, quantity, carried/worn/held state, supply, HP/Grit/survival, conditions, wounds/scars, language, profile, favorites and crafting. |
| Defense | GM selected token only; player assigned Actor only. Missing/ambiguous selection gives message. Actual roll composer, result, numeric damage and reload persistence. Fresh GM browser works without resetting automation; duplicate/replayed requests do not duplicate damage. |
| Rules | One native multi-page book per audience, with TOC/sections/search and complete pinned source content. Player cannot read DA book. Repeated explicit import preserves world edits. Ability Read stays inline; full-book navigation is explicit. |
| Items and chat | Actual web comparisons for equipment/ability cards and result cards; complete rules, notes and appropriate polished artwork; custom art survives migration. |
| Tools | Recovery, crafting, combat budgets, action conversion and resource workflows match the web reference and persist through native permission-checked services. |
| Theme and landing | Native theme readable with standard controls; opt-out works. Existing HOL artwork, editable native scene, working player/DA links and preserved edits on repeated setup; no implicit scene activation. |
| Release | Current source build, unit suite, web checks and applicable native workflows pass; author review records remaining limits honestly; immutable versioned package round-trips before publication. |

Native title bars, permissions, canvas controls and document editing remain Foundry
features. Differences in those controls are acceptable when they preserve the
specified workflow. A missing feature or materially different layout is an open
implementation task, not a platform exception unless demonstrated and reported.

The secure browser APIs required by coordination and signed defense snapshots need
HTTPS for remote clients (localhost is also supported). This is an environment
prerequisite, not an accepted silent failure or a reason to remove validation.

## Release acceptance (October 20)

The corrected source passed build/content validation and **585 tests** under Node
24. The actual web application's workshop, play, resources, recovery, builder,
NPC/item prototypes, roll, chat and tool browser checks passed. The CI workflows
install Chromium before the card DOM regression; the initial missing-browser
failure was an environment setup error and is not counted as a passing run.

Licensed **Foundry 14.369**, isolated world `hol-release-patch-fresh`:

- Actual web UI level-3 export → native UI import → Save → updated sheet → reload
  passed as both GM and player. Exact comparisons covered progression, Item
  identities/quantities/equipment/supply, live HP and spent Grit, conditions,
  wounds, languages, biography, favorites and crafting. Native FilePicker saved
  immediately. Read → Close → Read stayed inside the sheet.
- Blank name, attribute overspend, changed ancestry/origin dependencies and
  blur → Continue were exercised. Draft HP/Grit/wound/death controls changed
  only the draft. A real level-4 award, safe-place approval and Conditioned Body
  purchase completed through its receipt, returned to the sheet and survived
  reload: exactly 2 DP spent, maximum HP +1, no healing, no Grit refill, no
  duplicate grant. Scar-note edits and inline wound treatment preserved permanent
  wound history.
- Eight creation steps, six character tabs for both clients, advancement and
  draft wound/death dialogs were captured alongside the actual web reference.
  Rendered review corrected native global table backgrounds, column widths,
  checkbox presentation, inherited fonts, missing dice glyphs, raw UUID text,
  secondary dialog styling and dialog padding. Final package captures are the
  acceptance images; older captures remain diagnostic evidence only.
- Actual imported Goblin **Scrap knife** → Defend → evaluated result → fixed
  physical damage passed. Same-request replay, reload and replay again preserved
  HP and original dice without a second damage application. Actual canvas checks
  proved GM selected-token and player assigned-Actor selection, including missing
  and ambiguous selection messages. NPC HP edits at zero/restoration survived
  reload. Whole chat cards and original dice tooltips were inspected against the
  web typography.
- Ordinary GM login recovered the exact preserved prior-launch interrupted
  claim and interrupted-finalization states without resetting settings or
  invoking recovery. Tests refuse busy, uncertain, current-launch competing and
  mismatched-owner states. The shutdown harness now waits for coherent idle
  state before returning to Setup.
- Native books contain 610 player and 408 DA source pages plus 15 section pages
  each. Next/previous, contents, search, explicit import, repeated import and
  edited world-page preservation passed. Player tests denied DA paths through
  the library, world documents and compendium. Inline ability reading preserved
  edited book content.
- Recovery healing, canonical wound treatment, native wound Record → Roll →
  Apply, crafting with a selected material check, and encounter action spending,
  conversion and turn completion passed with persisted results. Scars/counts,
  HP and spent Grit were checked. Native tools and item cards were captured and
  reviewed; the suite reported zero uncaught browser errors and cleaned fixtures.
- Theme opt-out, native landing tiles/drawings, full approved artwork, ordinary
  activation controls, navigation, player/DA links, repeated setup preserving
  an edited title and player creation denial passed. The scene never replaced
  or automatically activated another scene.

The local 2.0.0 archive contains **483 files**. Packaging extracted it, validated
it and compared every staged byte; all 446 directly shipped source/static files
also matched the current source. The archive was installed into a real isolated
system directory and all entries were compared before the final character run.
That exact-package run passed all 38 character/reference captures and complete
GM/player workflows; the NPC/chat and rules/tools suites also passed on the
installed ZIP, including the final dialog title and material-checkbox styling.
The release workflow creates a draft; publication follows passing CI and final
artifact checks, not this document alone.

This is author review under the repository's recorded authorization, not an
independent review. Evidence establishes the scenarios above, not every possible
module combination, arbitrary specialty effect or summon lifecycle. Existing
explicit manual-resolution boundaries remain documented in README and release notes.
