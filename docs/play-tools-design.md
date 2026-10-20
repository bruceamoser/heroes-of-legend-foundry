# Play-tool web designs

Entry points: `combat.html`, `journal.html`, `recovery.html`, `crafting.html`.
Each uses the same compact theme and shared rule references, with a Tools link
from the existing Pages previews. These are disposable local examples: no saved
character, Foundry campaign, game clock or permissions are changed.

## Combat tracker

V14's [CombatTracker API](https://foundryvtt.com/api/v14/classes/foundry.applications.sidebar.tabs.CombatTracker.html)
has header, tracker and footer template parts, turn context, native participant
controls and sidebar/pop-out support. This supports a HOL layout around native
Combat/Combatant documents and token actions. The existing system's render hook
already adds HOL state; this design pass does not replace it or claim native
runtime verification.

The 370px preview groups sides, shows ready/active/acted state, opening result,
round, visible participant portraits and HP, and the active action/movement
budget. Choose/finish transitions, round alternation, action refresh and
conversions use existing encounter/action helpers. Spending an exhausted tracked
counter clamps at zero; it does not block a roll. Player preview omits hidden
participants and opposition HP/budget controls. Portraits open a compact actor
reference; native integration should open the Actor sheet and retain Foundry's
token hover, pan, ping, visibility, defeated and context actions.

## Journals

The reader includes all nine pinned `design/rules/*.md` documents plus ability,
equipment and recipe entries from the existing catalogs. Local links open the
matching entry, search includes text, collections narrow the index, and the
reading pane scrolls independently. Browser back/forward follows entry navigation.
Dialog rule references open a second modal without losing the current operation.
This models the future native JournalEntry/JournalEntryPage presentation, not a
completed native journal pack.

`npm run import:web-journals` reads the approved source commit from
`content/source-lock.json` using Git, verifies every document hash and writes
`web/data/journals.json`. `HOL_RULES_REPO` can locate the read-only book checkout.
Workshop builds verify edition, exact hashes, completeness and unique records.
They also copy the existing pinned reference-hero drafts for party/crafting
examples. No source book files are changed.

## Recovery and crafting

Recovery shows HP/Grit/wounds, healing with Life resistance and a live preview,
safe breath, stabilization, and wound treatment. Reaching recovery value removes
listed effects while retaining the scar. Treatment records a table-resolved
1/2/3 progress result after eligibility/activity time; it adds no treatment roll
or natural-healing timer. The Dying button switches the disposable scenario.

Crafting uses Oren's known recipes and actual permission cards. Attempts show
printed tools, materials and time. Shared roll controls produce 1/2/3 progress or
inventory steps. Supplies stop at the printed cap; permanent projects accumulate
to their printed target and count a finished product. New projects retain finished
counts. Optional carried materials make a supply check after the attempt. Scene
materials, timing and suitability remain table judgments; the preview does not
advance native world time or automatically grant equipment or wound remedies.

## Evidence

`npm run test:tools-preview` checks alternating sides through the next round,
budget conversion, hidden roster display, journal search/embedded abilities,
healing resistance/safe breath, exact wound recovery with scars, consumable caps,
permanent project progress, nested rule references and narrow layouts. CI and
Pages run it alongside the eight existing web suites. Screenshots are saved to
`test-results/tools/`. Native Foundry integration remains a separate acceptance
step after visual review.
