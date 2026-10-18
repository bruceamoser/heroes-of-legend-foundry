# Decision register

This register separates confirmed direction from proposed engineering choices. It does not reopen approved game rules. It is not necessary to answer every entry before starting the foundation work.

## Confirmed by Bruce

| ID | Decision | Evidence |
|---|---|---|
| D01 | Public repository `bruceamoser/heroes-of-legend-foundry`. | October 17, 2026 repository-name reply. |
| D02 | Current `design/player-book` plus `design/rules`; incorporate completed DA/bestiary book. | October 17, 2026 source-selection reply. |
| D03 | Automate core play where it helps; use native Foundry interactions and prioritize ease of play. Readable manual specialty references are accepted. | October 17, 2026 follow-up, superseded in scope by the later #129 correction. |
| D17 | The roll dialog supports use of applicable abilities and player-applied Boons/Banes. | October 17, 2026 interaction follow-up; details in [interaction design](interaction-design.md). |
| D18 | Creature attacks post descriptive chat with Defend; it opens a prefilled defense dialog that still allows applicable abilities. | Same follow-up; preserve normal attack/defense perspective. |
| D19 | Drag/drop is a primary system interaction. | Same follow-up; validated drop matrix in the interaction contract. |
| D20 | Preserve HOL's established look, feel and color theme. | Same follow-up; pinned book palette, typography and visual references. |
| D22 | Any player may open/use Defend and choose the defender; GM native multi-target selection at Attack time supplies immutable suggestions; DA adjudicates encounter-rule exceptions. | October 17, 2026 clarifications; #14/#22. |
| D21 | Full-featured creation and advancement charactermancer; ease of use paramount; eligible-first choices with visible disabled ineligible options and exact unmet requirements. | October 17, 2026 follow-ups; #18. |
| D23 | Use native Foundry targeting, a single prefilled effective −3…+3 Boon/Bane slider, no adjustment reason fields, and optional contextual controls defaulting off. Core playability is the release goal; every card nuance need not be automated. | Bruce's latest October 17, 2026 correction; #129. |
| D24 | Defend can be reopened and rolled repeatedly with changed abilities. Each fresh submission has its own identity; only retransmission of that same identity is deduplicated. No same-defender completed/unknown-result gate, repeat checkbox, reason or approval. | Bruce's later #129 correction, October 17, 2026. |

| D25 | Ordinary play uses table judgment without mandatory prose or adjudication questionnaires. Attack geometry and blockability are guidance; deliberate ability selection records intent. Single-condition Finish uses zero additional manual mitigation by default. Permissions, resources, source identity and operation receipts remain enforced. Creation/advancement retains strict eligible-first choices and visible disabled ineligible options. | Bruce’s October 17 ease-of-play correction; #133. |

| D26 | Tracked action counters, own-turn status and ordinary condition applicability are advice for deliberate actions, without extra DA approval. Clamp counters at zero; unfunded conversions create no resources and active benefits are reused without another charge. Owners may correct equipment arrangements during encounters. Real Item/HP costs, source identity, permissions, consent, uncertain writes and creation/acquisition eligibility remain strict. | Bruce’s subsequent October 17 no-gates correction; #140. |

## Proposed engineering defaults

Latest interface direction (October 17, 2026): bundle native rules journals and
open gameplay references locally; iterate character creation/sheet design in a
GitHub Pages builder with portable JSON and shared calculations. Keep a common
hero header above the content, a top-left Edit toggle, and minimal icon tabs
hanging off the left edge with hover/focus labels. Match the book's visual style
without requiring pixel fidelity. Do not add preview disclaimers to the product
interface. Bruce requested direct implementation without delegation for this
design work. Tracked in #155 and #156.

October 18 compact-tool refinement (#158): only the content pane scrolls;
header, icon tabs and learning DP remain visible. Culture/background names
include grants. Equipment exposes grants, supply dice, Bulk and equip/remove
controls. Rename Encounter to Main, use concise action tables grouped by timing,
show ancestry traits/defenses and recipe rolls, and expose basic-action visibility
in Edit mode. Add named local saves, explicit coin overspend override, DP totals
and reversible level plans with advancement learning. Keep creation history in
the web Development tab, not the eventual native one. No Wear Light Armor rule
exists in the inspected approved source; do not invent one.

| ID | Proposal | Reason / decision point |
|---|---|---|
| D04 | Package ID `heroes-of-legend`; V14 only; first runtime target 14.369. | Stable compact system identity; no V13 compatibility baggage. Confirm availability before package listing. |
| D05 | ES modules + JSDoc, Handlebars V2, scoped CSS, Node 24, small build scripts. | Familiar reference patterns without copying Neon Relic's domain/build complexity. Foundation issue may choose TypeScript if justified. |
| D06 | Separate `character`, `creature`, `summon` Actor types. | Explicit survival/control differences; shared schema fragments avoid repetition. |
| D07 | Focus automation on dependable core play; clearly label manual specialty handling. Keep DA rulings available without routine questionnaires. | Latest #129 direction supersedes the earlier full-automation default. |
| D08 | Native document requests/receipts and one GM authority; no mandatory socket module. | Ownership and retry behavior tested before mutation automation. Transport details are a technical spike. |
| D09 | Pinned Markdown intake, reviewed adapters, stable compendium IDs and explicit content updates. | Keeps the evolving books authoritative without overwriting user worlds. |

## Bounded remaining decisions

| ID | Question / constraint | Recommended treatment | Blocks |
|---|---|---|---|
| D10 | Both completed books confirmed October 17; reconciled to approved v16.1.0 at 9bc9b4f in content/source-lock.json (#72). | Use the pinned records and 192-entry artwork manifest; review subsequent source changes explicitly. | Production creature/DA content freeze. |
| D11 | Code license and separate rules/art distribution terms. | Bruce explicitly deferred license selection and authorized release on October 17; retain content/asset notices and provenance without inventing a license grant. No assumption that Neon Relic's MIT metadata licenses HOL content. | No release gate; rights remain undecided. |
| D12 | Which licensed Foundry installation/test world will host runtime validation? | Isolated development world on 14.369 and Node 24; never modify a live campaign for testing. | Runtime certification, not pure-rules implementation. |
| D13 | Cross-level distance, vertical tether measurement, airborne incapacitation and non-square grids are not fully specified by HOL sources. | Implement native levels/visibility; show geometry guidance without blocking ordinary attacks. Ask Bruce for universal rules before claiming full cross-level automation. | Manual geometry guidance; no ordinary attack gate. |
| D14 | Mid-round combat joins/removals, multiple opportunity ordering and rewind semantics need exact rules/operational policy. | Preserve acted history; present DA choices; write and approve deterministic policy before those branches auto-resolve. | Exceptional combat transitions. |
| D15 | A “day” for daily treatment limits needs a world-time boundary; scenes require an explicit narrative end. | World-time day key plus DA-controlled scene transition. Confirm offset/calendar policy in timekeeping issue. | Daily/scene resets. |
| D16 | Automatic authority failover during partial multi-document application needs proof. | Prototype receipts, serialized queues and stale-state checks; suspend ambiguous operations for reconciliation. | Cross-owner automatic mutation. |

## Already settled — do not list as open

- October 15 approval covers active catalog proposals, class pricing, creation details and manuscript mechanics; older labels do not nullify that approval.
- October 16: NPC-only attacks use defender rolls; handling dice does not change control.
- Highest resistance and numerical weakness by type, cap 3; weakness applied once before resistance.
- Fully resisted minimum-damage wound chooses among original damage types.
- Collision damage precedes new participant Stability; groups stop at the last legal arrangement without extra movement.
- Summons are tangible energy forms, unhealable, vanish at 0, with controller-paid healing and nearest-occupied-square tether.
- Interrupted action and additional cost timing, mixed temporary/starred tracking, and falling rounding are taught in the approved player manuscript; older proposal markers do not make them globally unresolved.

If later completed DA text conflicts with these records, flag the exact discrepancy for Bruce. Do not silently restore an older version because it appears in a PDF or an old open issue.
