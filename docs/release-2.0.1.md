# Heroes of Legend 2.0.1

This patch addresses the first live-table feedback on 2.0.0 (#228–#230).

- Ordinary login automatically recovers old world-session checkpoints. Interrupted requests retain their evidence and no longer block unrelated characters or encounters. Connection diagnostics are now **Interrupted actions**, not a required setup step.
- Early learning validates the steps reached so far; class selection is requested at its actual step. Early and heroic learning cards have discipline marks, action-type letters and compact controls.
- Chat uses tighter spacing, collapsed full references and one primary result. Supplies align the die and resupply buttons.
- Abilities with a printed attribute open the configured roll composer even when their specialty effects have no dedicated automation adapter. Existing 2.0.0 reference-only Items resolve their printed attribute without overwriting custom Item data. The result includes the ability name and matching printed outcome.
- Player owners can confirm a safe training place, start an encounter containing their character, apply damage to their character and correct mistaken health/survival changes. Shared-document operations still use a connected GM automatically; no manual approval is involved. Campaign milestones and opposition/roster control remain campaign-authority actions.
- Five native wound RollTables cover all seven damage types. **Add wound → choose type → Roll** posts the evaluated wound, applies its effects and offers guarded Undo. Wounds work for the owning player without a connected GM. Previous wounds still modify canonical wound dice; anatomy/fear-source inputs retain the original rolled result.

Specialty effects remain explicit reference/manual resolution where no reviewed adapter exists. This patch does not invent effect automation from prose or remove document ownership.

## Validation

Acceptance includes automated tests and isolated Foundry 14.369 GM/player flows. The release record contains the final test totals and artifact verification. No live campaign was used for automated tests.

The corrected candidate passed **605 automated tests**, including official
compendium compile/extract comparison of all five tables and all 280 embedded
results. Native checks on 14.369 proved stale busy/legacy checkpoint recovery,
GM/player web import → Save → returned sheet → reload, player-owned damage and
health correction, encounter start, numeric Scrap knife defense/damage and
replay/reload protection. The character suite passed with 47 captures,
including both clients' configured ability rolls, player safe-place confirmation,
24px aligned supply controls and persistent advancement. Native wound checks
proved all seven types, native table draws, GM UI Undo, and player roll/apply/Undo
with the GM disconnected. Fixture cleanup and zero uncaught browser errors were
checked. Narrow chat result cards measured about 194px; unobscured whole-message
attack and defense captures were visually inspected.

The first new table build lacked the CLI document keys and loaded an empty
compendium. Native acceptance caught it before publication; the export and
compile/extract regression now cover that failure. Some earlier character
captures were occluded by overlapping test windows and are diagnostic, not visual
acceptance; the final chat inspection uses unobscured captures.
