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

## Current correction evidence (October 20)

These results describe the correction branch before final release packaging:

- `check-landing.mjs` passed on licensed Foundry 14.369 in the isolated
  `hol-release-patch-fresh` world: valid native scene/tiles/drawings, unchanged
  active scene on creation, preservation of an edited title, immediate theme
  toggle, GM book navigation, and player navigation with no DA link. The player
  could open the Player’s Book and could not create landing scenes. Fixtures
  were removed. The screenshot review corrected native tile texture anchors;
  the final scene keeps the full cover illustration and title in frame.
- `test:workshop`, `test:chat-preview` and `test:tools-preview` passed against
  the actual web application, including responsive layouts and no uncaught
  browser errors. These establish the reference behavior; they do not replace
  native runtime checks.
- `npm run check` passed all 566 tests on the 2.0.0 candidate, including build,
  validation, release byte round-trip, import, coordination and native rules
  regressions. Later source changes require the final check again.
- Native creation validation exercised blank name, attribute overspend, changed
  ancestry/origin dependencies and blur followed by Continue. Invalid Save stays
  blocked with a repairable draft, while navigation preserves the latest input.
- A clean-restart runtime exposed mixed coordinator metadata despite an agreed
  idle binding, lease and checkpoint. The guarded repair was verified against
  that exact saved state on ordinary GM login, without resetting settings or
  calling recovery controls. Busy/uncertain and competing claims remain guarded
  by focused tests.

- The actual workshop exported a level-3 character which the GM imported and
  saved through the native UI. The complete state comparison passed, including
  progression, inventory identities, live resources, conditions, languages,
  favorites and crafting. Standard FilePicker selection saved immediately;
  Read → Close → Read remained inline. A normal browser reopened and reloaded
  the persisted Actor successfully. Forced graphics flags in one test browser
  caused a blank reload and were removed from the harness.
- Fresh-browser NPC/chat checks passed full defense resolution and numeric
  damage, native dice tooltip access, and role-specific defender selection.
  Computed result-card typography was checked against the actual web app.
- Author review identified an interrupted startup claim and an editable-defense
  result trust gap. Guarded idle-claim recovery and GM-ledger result binding
  have focused regressions. The refreshed package repaired the exact preserved
  interrupted claim on ordinary GM login after a clean server restart, with all
  binding/metadata/lease/work records agreeing and no reset or recovery call.

Final player import, complete advancement, latest tool/sheet visual comparisons
and the complete release artifact check are still pending here.
