# Implementation plan

This is the staged backlog. F01–F03 have initial implementations and local 14.367 evidence; their 14.369 gate remains pending. Work is organized into focused issues/PRs. Each row becomes a numbered issue before implementation; split again if it cannot be reviewed in one session. Dependencies are logical, not a request to launch parallel agents.

Research is [#1](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/1), this specification is [#2](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/2), and completed DA/bestiary intake is [#3](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/3).

Created foundation issues: [F01 / #4](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/4), [F02 / #5](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/5), [F03 / #6](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/6), [F04 / #7](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/7), [F05 / #8](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/8), [F06 / #9](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/9), [F07 / #10](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/10).

## Milestone 0 — prove V14 extension points

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| F01 | Minimal package, build, manifest and test harness | Spec review | Clean build produces correct paths; new V14 world loads without HOL deprecation warnings; no claimed packs that do not exist. |
| F02 | Character/ability schemas and V2 edit/view sheets | F01 | Create, edit, save and reload; invalid attributes rejected; owner/observer behaviors verified. |
| F03 | Native 3d6 roll service and chat card | F02 | Boundary/natural/keep-high/keep-low fixtures pass; serialized chat reload preserves results. |
| F04 | GM request/receipt and authority prototype | F01 | Two GMs, duplicate request, permission denial, disconnect and partial retry tests pass. |
| F05 | Official CLI pack round-trip proof | F01 | One Actor with embedded Item/effect and one Journal page retain stable IDs and links through pack/unpack/import. |
| F06 | V14 combat/effect timing prototype | F02 | One custom turn-start/end event produces one condition tick and correct native effect expiry after reload. |
| F07 | V14 movement/region/levels prototype | F02 | Waypoints, paused movement, square area and two-level occlusion verified in an isolated scene. |

**Gate:** actual 14.369 runtime evidence for F01–F07, with exact APIs and deviations recorded. Do not expand a custom database writer, socket authority scheme or legacy duration payload before these proofs.

## Milestone 1 — automated encounter alpha

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| A01 | Ability declarations, costs and Basic Melee | F03, F04 | Validate owned item, action, weapon and target; fixed 2/3/5 outcomes; no double payment. |
| A02 | Defense requests and perspective mapping | A01 | PC→NPC, NPC→PC, PC→PC, NPC→NPC and controlled-creature paths each produce the correct single roll. |
| A03 | Damage/healing and receipt service | A02 | Weakness/resistance order, minimum-one event and healing payer/cap cases pass. |
| A04 | Alternating-side tracker | F06, F04 | Opening 12+ rule, side choice, uneven sides and persisted acted state work. |
| A05 | Action conversions and turn restrictions | A04 | Sprint yields three movement allowances; Dazed/Grappled categories freeze at turn start; defense costs no Reaction. |
| A06 | Core condition contributions and decay | A03, A05 | Burning/Bleeding, starred/temporary, highest bonuses and repeat-hook guards pass. |
| A07 | Common reactions and interruption windows | A01, A05, F07 | Opportunity and Shield Block choice/cost/timing; original action resumes or stops correctly. |
| A08 | Alpha scenario and workflow review | A01–A07, U01–U04 | Two players and a GM complete a small encounter including an area defense, a condition and a reaction without manual arithmetic; use the prefilled Defend/dialog flow, core drag/drop and HOL styling. |

**Gate:** runnable alpha using a small explicitly labeled fixture catalog. This is not yet a full-system or content-completeness release.

## Core interaction work — required alongside the encounter alpha

These are four additional focused work items, confirmed in #12. Created issues: [U01 / #13](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/13), [U02 / #14](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/14), [U03 / #15](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/15), [U04 / #16](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/16). Complete the relevant initial drop routes for alpha, then extend the same contract as creation, inventory and summons become available. Full release requires every drop route in [interaction design](interaction-design.md).

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| U01 | Shared roll dialog with abilities and Boons/Banes | F03, A01, A05, A06 | Select eligible owned abilities; preview effects, costs, attribute replacement and net dice; support labeled situational adjustments and cancel without payment. T85–T87. |
| U02 | Creature attack card and per-target Defend flow | A02, A03, A07, U01 | Descriptive chat, correct prefilled defender context, still-editable ability/modifier choices, permission checks and one resolution per response. T88–T90, T96. |
| U03 | Native drag/drop workflow service | F02, F04, U01 | UUID validation, contextual feedback, dialog/hotbar/inventory/scene/reference drop routes as features arrive; no duplicate items, free acquisitions or free summons. T91–T93. |
| U04 | HOL theme tokens and reusable UI components | F02 | Exact book palette/typography/card/icon references; themed sheet, ability card, roll dialog and attack chat proof; keyboard, contrast and detached-window checks. T94–T95. |

## Milestone 2 — character and inventory lifecycle

B02–B04 must deliver the full creation/advancement charactermancer in [#18](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/18), including one-decision-at-a-time guidance, saved drafts, eligible-first ordering with visible disabled alternatives, exact blocked reasons, downstream-choice repair and before/after commitment review. T97–T102 are required alongside mechanical parity.

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| B01 | Character-choice ingestion and ID map | F05 | Ancestry/trait/origin/class/discipline records validate with exact grants and prices. |
| B02 | Stage-0 creation ledger | B01, F04 | Attributes, paired origins, duplicate compensation, legal purchases and stage expiry pass. |
| B03 | Stage-1 class and grant completion | B02 | Class minima, distinct grants/signature, separate DP pool, HP/Speed/Bulk and one-time equipment verified. |
| B04 | Advancement and acquisition browser | B03 | Milestone DP/Grit/signature grants once; safe-place spending and prerequisite explanations; no card chains. |
| B05 | Equipment, hands, coins and Bulk | B03 | Held/worn states, compatibility, sale/trade, encumbrance and grant deduplication tested. |
| B06 | Inventory dice and potion automation | B05, A03 | Final use works before stepdown; no action Boons/Banes; recipient Reaction exception and no spell attack mode. |
| B07 | Recipe/crafting/derivation jobs | B06 | Materials, capabilities, time, step limits and once-only completion; no group shortcut. |
| B08 | Six reference-character parity | B04–B07 | Rebuild approved six characters and compare ledger, HP, Grit, ranks, abilities, gear, coins and Bulk. |

## Milestone 3 — survival and complete timing

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| C01 | Dying, stabilization, Grit and Last Words | A03, A06 | Transition fixtures, locked pre-roll choice and no ordinary Last Words reversal. |
| C02 | Wound table importer and keyed lookup | F05, C01 | 5 × 56 results, retained/sorted wound dice, ties and anatomy advance; immediate consequences once. |
| C03 | Treatment, scars and day boundaries | C02, B07 | One attempt per wound per day across healers; progress remedies only stated effects; scars remain. |
| C04 | Remaining conditions and contextual predicates | A06, C01 | Helpless penalty once, perception-dependent Frightened, sense loss, maintained grapple and binary state tests. |
| C05 | Scene/world-time effects and safe breath | C03, C04 | Explicit scene/day transitions, no passive Grit recharge or Dying bypass; effect expiry correct outside combat. |

## Milestone 4 — battlefield and summon automation

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| D01 | Ordinary movement, terrain, jumps and falling | F07, A05 | Correct square costs, footprint/wall checks, approach limits and complete-pair falling calculation. |
| D02 | Forced movement and collision planning | D01, A03 | Stability consumed once, contact damage order, hard obstacle and legal group/bounce handling. |
| D03 | Areas, target sets and persistent regions | D01, A02, C05 | Exact grid footprints, worst target modifier, individual defenses and no duplicate zone effects. |
| D04 | Senses, lights, concealment and scene levels | D03, C04 | Blind/invisible/Hidden distinction, source-aware restoration, no through-floor targets; document cross-level rulings. |
| D05 | Summon profile import and spawn lifecycle | F05, A02, #3 | Explicit eligibility, correct attributes/orientation, distinct token instances and no-healing/death behavior. |
| D06 | Summon commands and controller timers | D05, A05, C05 | One command per turn, immediate free command consumption, no independent reactions/activity. |
| D07 | Summon tether, healing payer and cleanup | D06, D02 | Nearest-square distance at every waypoint, 6/7 boundary, controller state cleanup, one HP payment. |
| D08 | Forms, granted attacks and special handlers | B04, D03, D07 | Own HP/wounds preserved in forms; no recursive free attacks; each exceptional handler has fixtures. |

## Milestone 5 — complete content and table tools

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| E01 | Complete player content adapters | B01, A01, C04 | Cover all approved ability/equipment/recipe families; fail unknown fields and unresolved references. Split by behavior family. |
| E02 | Completed DA/bestiary import | #3, D05 | Full roster/monster powers/summons and art paths reconcile with final upstream source lock. |
| E03 | Per-card automation coverage | E01, E02, D08 | Every record has a handler, deliberate human-choice boundary and tests; no silent text-only mechanics at full release. Split into reviewable catalog batches. |
| E04 | Noncombat tasks and DA encounter tools | B07, E02 | Binary/cumulative progress, Aid exclusivity, advisory encounter budget, scene/creature setup. |
| E05 | Rule journals, adventure links and onboarding | E01, E02 | Linked accessible player rules; DA-only secrets in restricted documents; tour and first scene verified. |
| E06 | Browsers, hotbar, HUD and accessibility | B04, E03 | Search/filter, blocked-reason display, keyboard/focus, source links, token controls and detached sheets. |
| E07 | Content update and schema migration workflow | E03, F04 | Preview changed content, preserve local edits, stable IDs, ascending migrations and interrupted recovery. |

## Milestone 6 — release hardening

| ID | Focused work | Depends on | Acceptance |
|---|---|---|---|
| R01 | Multiplayer, permissions and recovery regression | All engine work | Acceptance suite with GM + two players + second GM, pending operations, stale clicks and secret data checks. |
| R02 | Compatibility/performance/accessibility matrix | E06, R01 | Recorded Foundry/OS/browser versions, full-catalog workload and no system deprecation warnings. |
| R03 | Licensing, attribution and assets | Source intake | Selected code license, explicit book/content policy and font/art notices; optimized VTT assets with provenance. |
| R04 | Versioned package and release pipeline | E07, R02, R03 | Clean Node 24 build, tag/version equality, immutable ZIP, valid packs, manifest install and upgrade smoke test. |
| R05 | Optional integration adapters | Core release gates | Independently validate Dice So Nice/Item Piles or other requested modules; core works without them. |

## Proposed commands and layout

These commands must be implemented and documented in F01, not assumed to exist now: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run validate:content`, `npm run pack`, and `npm run test:foundry` (requires an explicitly configured licensed test installation). Build/package must work without access to a personal user-data directory. Runtime tests must never download or publish Foundry itself.

```text
src/
  system.mjs
  data/             # Typed models
  documents/        # Thin Foundry subclasses
  rules/            # Pure calculations
  services/         # Actions, acquisition, combat, effects, recovery, movement
  applications/     # V2 sheets, builders and browsers
  integrations/     # Optional adapters
  templates/ styles/ lang/
content/
  source-lock.json  # Pinned approved source revision(s)
  records/          # Reviewed intermediate source records
  automation/       # Explicit behavior mappings
  ids.json          # Stable HOL/Foundry identity mapping
scripts/ tests/ static/ docs/
dist/               # Generated package only
```

## First implementation recommendation

Start F01, F02 and F03 after specification review. Prove the authority, pack, combat/effect and movement spikes before expanding automation. Intake #3 can proceed when the other chat finishes the approved DA/bestiary sources. None of these steps require changing the rulebook, copying Neon Relic wholesale, or waiting for every cosmetic design choice.
