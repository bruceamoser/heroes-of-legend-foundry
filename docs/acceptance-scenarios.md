# Acceptance scenarios

These are requirements for future tests and manual Foundry checks. **They have not been executed against a HOL implementation.** Pure calculations should become deterministic fixtures; integration cases require a licensed V14 instance. Catalog-specific numbers must be rechecked against the final source lock.

## Rules and damage

| ID | Given / action | Required result |
|---|---|---|
| T01 | Total 8, 9, 14, 15 | Weak, Standard, Standard, Strong respectively. |
| T02 | 3 Boons, 1 Bane; dice 1,2,4,5,6; attribute +1 | Keep 4,5,6; total 16 Strong. |
| T03 | 2 net Banes with the same five dice; +1 | Keep 1,2,4; total 8 Weak. |
| T04 | 8 Boons and 4 Banes | Net extras cap at 3; roll six dice, retain three. |
| T05 | Retained 666 with −2, retained 111 with +2 | Strong + benefit, Weak + complication; no automatic damage doubling or extra action. |
| T06 | Player attacks another player | One attacker roll; no extra defense roll. |
| T07 | NPC attack receives Strong defender roll | Use Weak attack equivalent / explicit Strong-defense column once. |
| T08 | NPC attacks NPC; a player handles dice | Defender's printed attribute; control stays with DA. |
| T09 | Area attack has target nets +2 Boons and −1 Bane | One player attack roll at −1 net; target resistances remain separate. |
| T10 | NPC area affects two player characters | One defense roll per affected character; not one shared attacker roll. |
| T11 | 4 physical + 1 fire; fire weakness 2; physical resistance 2, fire resistance 1 | 2 physical + 2 fire = 4 total. Weakness applied before resistance. |
| T12 | Two physical resistance sources at 2 and 3 | Effective resistance 3, not 5. |
| T13 | 2 physical + 1 fire; both fully resisted | Exactly 1 event damage. If wound caused, player chooses an original damage type. |
| T14 | Pure physical damage against fire weakness | No added fire component. |
| T15 | Two separate fire components in one event | Aggregate fire and apply the single highest fire weakness once; no repeated weakness injection. |
| T16 | Pure condition/no-damage ability | Do not invent 1 damage from the event minimum. |
| T17 | Heal 4 against Life resistance 2 with 1 HP missing | Restore 1, never above maximum. At full HP restore 0. |
| T18 | Novice spell healer at 1 HP | Upfront 1 HP payment rejected; no roll or cost committed beyond permitted action rules. |

## Creation and inventory

| ID | Given / action | Required result |
|---|---|---|
| T19 | Mental sum +1 | Each creation pool begins at 11; stage-0 remainder never moves to stage 1. |
| T20 | Class grant would qualify a stage-0 purchase | Reject purchase; no retroactive qualification. |
| T21 | Stage-1 class grant duplicates a rank | +1 DP for stage 1; no rank upgrade or unrestricted replacement. |
| T22 | Blade acquires Arms 1, 2, 3 from zero | Separate 1,2,4 DP purchases; total 7. Cannot skip rank 1. |
| T23 | Level-3 shared ability with all discipline requirements but no earlier card | Eligible at level 3; no invented chain prerequisite. |
| T24 | Level 3 award delivered twice / reload mid-award | One 11-DP award, one added Grit, one chosen class signature grant. |
| T25 | Item increases Fortitude after creation | Effective Fortitude changes; original HP/creation DP do not silently increase. |
| T26 | Three learned attacks grant compatible ordinary weapon | One weapon; sell it and revisit sheet: no new free weapon. |
| T27 | Brawn +1, ancestry Speed 5, Agility 0, Bulk 15 | Capacity 13, penalty 2, Speed 3. |
| T28 | d4 potion used, die rolls 1 | Healing occurs, then supply becomes out; subsequent use rejected. |
| T29 | Supply check while Poisoned / with action Boons | Roll only its inventory die; no action-roll modifiers. |
| T30 | Giving potion to living conscious recipient versus at 0 HP | Giver pays Maneuver/free-hand requirement; recipient pays Reaction except at 0 HP. |
| T31 | Crafting from out raises product two steps with cap d6 | d4 then d6; preserve printed time/material costs and reject over-cap output. |

## Combat, effects and reactions

| ID | Given / action | Required result |
|---|---|---|
| T32 | Opening roll 11 versus 12 | Opposition first versus players first; same starting side next round. |
| T33 | Three PCs, one enemy | Alternate while both have unacted participants, then remaining PCs finish; no duplicate turns. |
| T34 | Convert Main and original Maneuver to movement at Speed 6 | Three total allowances, 18 movement before terrain; no upward conversion. |
| T35 | Dazed 1 at turn start, then Dazed rises mid-turn | Choose two categories at start; do not undo spent actions or recalculate that selection. |
| T36 | Dazed 2 and Grappled 1 | One category retained from greater restriction; movement zero while grapple remains. |
| T37 | Burning 3 and fire resistance 2 | End-turn damage 1, then temporary rating 2; rerender/reconnect does not tick again. |
| T38 | Temporary Bleeding 3 untreated | End-turn events 3,2,1 bypassing resistance, then ends. |
| T39 | Starred and temporary contributions coexist | Only temporary part decays; temporary additions do not become permanent. |
| T40 | Paralyzed and Unconscious together | One helpless penalty of 3 Banes; no doubled penalty. |
| T41 | Grappler freely releases its contribution | Remove exactly that contribution from both sides; other grapplers remain. |
| T42 | Provoked action is interrupted by Basic Melee; actor remains capable | Pay enemy Reaction, resolve attack, then resume original action. |
| T43 | Interrupted potion user enters Dying | Committed action spent; potion not used, inventory not rolled. |
| T44 | Forced push leaves melee | No opportunity prompt. |
| T45 | Granted free attack would trigger another free attack | Block recursive grant; ordinary permitted riders remain. |
| T46 | End-turn replay / GM turn rewind | No duplicate condition damage or resource refresh; explicit correction required for reversal. |

## Survival, movement and summons

| ID | Given / action | Required result |
|---|---|---|
| T47 | One prior scar; wound dice 2,4,4,6 | Retain 4,4,6; lookup 446, not total 14; add new scar afterward. |
| T48 | Four prior scars | Roll only five dice total; scars still persist. |
| T49 | Wound anatomy invalid at 116 | Advance to next applicable listed result, starting 122; do not reroll. |
| T50 | Death roll 111 versus 666 | +2 death marks versus restore 1 HP/clear marks. |
| T51 | Choose death roll, then see Weak | Cannot retroactively choose Grit that turn. |
| T52 | Damage at Dying versus stabilized 0 HP | Dying: +1 mark, no new wound. Stabilized: new Dying entry/wound and +1 mark. |
| T53 | Last Words begins | Speech only; death at end of second following own turn; ordinary healing/Grit rejected. |
| T54 | Second healer attempts same wound same game day | Reject; completed treatment retains scar and removes only printed penalties. |
| T55 | Safe breath | Full HP only after safe transition; Grit spent, scars and unresolved conditions preserved. |
| T56 | Forced movement 1 into difficult square | Enter final square and stop; ordinary movement with only 1 remaining cannot do the same. |
| T57 | Push 5 into initial Stability 1; move one; contact Stability 2 | Contact damage uses remaining 3, then deduct 2 for remaining travel 1. |
| T58 | Collision group cannot fit legal spaces | Stop at last fitting configuration; legal DA arrangement cannot add forward movement or cross wall. |
| T59 | Broad jump Agility +1, with/without two-square approach | Max 3 / 1 squares; movement spent; no unsupported endpoint. |
| T60 | Fall five squares | 6 physical before resistance; not 7.5 or 9. |
| T61 | Large summon nearest square 6 away, farthest 7 | Remains. Nearest becomes 7: immediately disappears. |
| T62 | Movement path briefly exceeds tether then returns | Disappears at breach, not preserved by final destination. |
| T63 | Newly summoned free Main command then another paid command | Reject second command for that summon this controller turn. |
| T64 | Main command package | Main + Maneuver; approach consumes conversion as needed, no independent extra movement or Reaction. |
| T65 | Uncommanded summon | No movement, following, lookout or attack; conditions/durations still resolve at controller anchor. |
| T66 | Summon healer costs 3, controller at 3 versus 4 HP | Reject at 3; at 4 pay once to 1, use summon attribute/outcomes; summon does not also pay. |
| T67 | Attempt to heal summon / summon reaches 0 / controller unconscious | No healing; disappear without body at 0; controller state ends it. No invented intangibility. |

## Foundry integration and release

| ID | Scenario | Required evidence |
|---|---|---|
| T68 | Two unlinked tokens from one creature prototype | Damage/conditions on one do not alter the other or prototype. |
| T69 | Two GMs process one operation; player double-clicks | Exactly one cost, roll and application; receipts explain all clients' state. |
| T70 | GM disconnects after first of two target updates | Resume only missing target update, no reroll; conflicting interim edits require reconciliation. |
| T71 | Request claims another actor/user or arbitrary HP update | Author/current ownership validated; unauthorized mutation rejected. |
| T72 | Player opens DA-sensitive content or blind chat | Restricted documents and hidden results are not exposed through public flags, tooltips or HTML. |
| T73 | Reload with pending defense/reaction | Same pending operation and stored dice; no duplicate request/payment. |
| T74 | Area on one level, token behind wall/on another floor | Respect actual levels, occlusion and card targeting; ambiguous vertical distance requests a ruling. |
| T75 | Region entry plus end-turn hook for same effect | Apply only defined trigger frequency; no duplicate event application. |
| T76 | Content import/rebuild/rename and user-edited copy | Stable IDs/UUIDs; exact diff; local edits preserved until explicit update. |
| T77 | Pack round trip | Actor embedded Items/effects and Journal pages remain accessible; no phantom records or broken links. |
| T78 | Schema migration failure and rerun | Completion version not advanced prematurely; prior completed steps are safe to repeat/resume. |
| T79 | Latest manifest installation followed by tagged upgrade | ZIP/manifest versions and paths match; same source IDs; playable fixture survives. |
| T80 | Full catalog audit | Every active record honestly labels automated, partial or reference/manual handling. Automated claims have scenario evidence; readable manual specialties are accepted for core release. |
| T81 | Keyboard, dark/light mode, detached sheet | No missing actions, inaccessible critical controls, clipped text or lost listeners. |
| T82 | Group binary target 7, results Weak/Strong/Strong | Total 7 succeeds; Weak/Standard/Strong total 6 fails binary but retains 6 for cumulative task. |
| T83 | Same actor aids and contributes to one group attempt | Reject double participation; no group wound treatment/crafting/derivation. |
| T84 | Native hotbar/HUD action versus sheet action | Same validation, cost and results, with correct acting token. |

## Interactive preparation, drag/drop and HOL identity

| ID | Scenario | Required result |
|---|---|---|
| T85 | Open a roll/defense or player Attack dialog; inspect reviewed actions and optionally attach an owned reference | Reviewed Use controls show their exact supported cost/effect and refresh sources once. Searchable reference attachments preserve Item/source identity but add no inferred bonus, cost or effect. Automatic sources count once; timing/counter/ordinary-condition advice does not require extra approval. |
| T86 | Automatic 2 Boons and 1 Bane prefill the effective slider at +1; move it to 0, then +1 | Show ordinary 3d6 at 0 and 4d6 keep-high-three at +1, with no adjustment reason fields or double addition. Retain source audit identity. Until manually overridden, source changes refresh the default; the displayed effective net remains capped at −3…+3. |
| T87 | Cancel a defense without Use/Roll; separately Use Shield Block, then cancel the later roll | Opening, browsing and reference attachment spend nothing. Explicit Use commits the reviewed action separately: track an available Reaction once, keep an empty counter at zero, and retain the benefit if the later roll is canceled. Reusing the active matching benefit adds no charge; retransmitting the same operation repeats neither payment nor effect. |
| T88 | Creature attacks Hero A; Hero A clicks Defend | Show creature attack description and A's actual token, printed defense attribute/effective stat, Threat, conditions and benefits; allow eligible abilities without rebuilding context. |
| T89 | Area attack on A and B; A defends with an ability | A and B have separate response IDs/results; A's choice does not change B's roll or resolve B automatically. |
| T90 | Any player/non-owner clicks Defend; two players handle one defender; chat reloads | Dialog opens without ownership/target gating; actual roller and chosen defender recorded separately; same-operation retransmission is idempotent; fresh submissions for the same defender each roll without a checkbox, explanation or DA approval. |
| T91 | Drag owned eligible ability into dialog, then a compendium/unowned ability | Owned ability becomes a draft selection; unowned source cannot grant free use. Invalid type/drop explains why. |
| T92 | Drop same ability into acquisition twice; transfer equipment; drop summon into scene | No duplicate grant/payment; transfer preserves instance/supply and debits once; summon requires eligible paid workflow. |
| T93 | Drag/drop after sheet rerender and in detached window; use keyboard alternative | Same UUID/permission validation and result as main sheet; no lost listeners, silent failure or acting-actor swap. |
| T94 | View sheet, ability card, roll dialog and attack/Defend chat together | All use approved forest/gold/ivory/paper/ink tokens, established type hierarchy, tier/discipline marks and narrative/rules separation. Compare to pinned book references. |
| T95 | Light/dark/narrow/detached layouts with keyboard focus | Controls and numbers remain readable; gold is not low-contrast body text; identity stays HOL; focus and states do not depend on color alone. |
| T96 | A condition/resource changes while defense dialog is open; player-controlled creature attacks | Refresh/revalidate preview before submission without silent changed roll; player-controlled attacker follows one attacker roll and never creates an extra Defend save. |

## Charactermancer usability and advancement

| ID | Scenario | Required result |
|---|---|---|
| T97 | Browse a mixed set of eligible/ineligible choices | Eligible choices first; ineligible choices visible below, disabled, with exact unmet requirements accessible without hover. |
| T98 | Build a first character through each stage | One decision at a time, live summary/budget, explanatory grants and searchable comparisons; no manual arithmetic required. |
| T99 | Change an earlier ancestry/class/attribute choice | Identify affected later selections, preserve still-valid choices and guide repair; no silent reset or spend. |
| T100 | Pause, reload, resume or cancel a draft | Draft resumes accurately; cancel changes no committed mechanical state; stage expiry occurs only at valid commitment. |
| T101 | Level up with banked DP, then repeat/reload/retry | Show exact new grants, safe-place restrictions and before/after review; keep banked DP; milestone grants and purchases occur once. |
| T102 | Two owners commit the same draft; compare keyboard/drop workflows | Stale revision rejected or reconciled with explanation; identical validation; no duplicate rewards; approved reference-character parity. |

## Native GM targeting and open defense

| ID | Scenario | Required result |
|---|---|---|
| T103 | GM natively targets A/B, clicks Attack, then targets C | Posted suggestions remain A/B; native multi-target UI is sufficient; C does not silently replace them. |
| T104 | Wrong player clicks; no target was selected; extra character is affected | Open/cancel/choose another defender without consuming card; no-target case opens chooser; each defense is independent. |
| T105 | A rule suggests an ability/defender is ineligible during encounter | Show concise table guidance and allow deliberate ability/defender selection without extra DA approval. Actual source/equipment requirements, mutation permissions and same-operation protection remain intact. |

## Test organization and evidence

Pure-rule tests cover T01–T05, damage aggregation, ledger math, state transitions, wound selection and grid calculations. Model tests verify invalid input, derived data and serialization. Content tests verify source coverage and complete outcomes. Runtime tests cover authoritative mutation, documents, effects, combat events, scene geometry and UI. Each content handler contributes additional fixtures beyond this seed matrix.

For each runtime run record commit, package/schema/content versions, Foundry build, browser, OS, modules, client roles, fixture world, expected/actual outcome and console output. A mock pass is not a Foundry pass. Core release requires the applicable supported-workflow scenarios and honest content coverage labels. Readable manual specialties are accepted under #129; list them in release notes without claiming they are automated.

### T106 — completed-book languages

Creation grants Common plus a named ordinary language without DP cost. A Foot in Two Worlds adds two distinct additional ordinary spoken languages, preserving spoken-only permissions and excluding signed/uncommon choices unless the campaign explicitly changes eligibility. All six updated reference characters preserve their recorded languages. Translate the Fragment completion does not add a language.

### T107 — owned Item shortcuts

An owned ability or equipment row is a native live-Item drag source and a hotbar drop creates or reuses an actor-bound generated Macro without copying, granting or spending anything. Activating that Macro, clicking the row, or using the keyboard/click **Add shortcut** control with a chosen slot opens the exact live Item sheet through the same permission-checked service. Rerendered and unlinked-token sheets retain their UUID context; modified generated commands are not reused; deleted or inaccessible sources produce an intelligible notification; and unrelated native hotbar drops remain available. Same-Actor sheet sorting is native, while cross-Actor and compendium drops still require the acquisition flow.

### T108 — native creature Actor pack

The creatures Actor compendium contains all 192 reviewed records with stable namespaced IDs and pinned `{ path, sha256 }` provenance. Before importing, the native fixture strictly validates every source Actor and reports aggregate field failures. Plain native creature defaults and a legitimate empty Armor marker validate; invalid nonempty values in every choice-backed field are rejected; and numeric and special mitigations keep their distinct authored shapes. Native prototype Token width and height match the printed footprint for all 192; a DOM compendium drop creates a strict Red Dragon Actor and a 3x3 Token. A clean isolated world imports all 192; Adder and Red Dragon retain their exact attributes, HP, signed CV, alternate Speeds, size/footprint, Armor marker, Evasion, Threat, Stability, mitigations, immunities and player-defense Basic Melee. A synthetic signed-negative CV Actor validates because the reviewed roster currently has no negative-CV record. The sheet safely converts and enriches the complete authored actions/details into a read-only reference region with real headings and tables, escaping hostile source HTML and unsafe links, while specialty automation remains visibly pending. Existing Basic Melee/Defend behavior continues to use the imported printed profile. Artwork uses the native fallback. The fixture refuses pre-existing fixture IDs, records each actual returned ID before assertions, tracks only its own imports and synthetic Actor, and deletes every fixture document before returning.

## Simple core roll interaction — issue #129

Use native Foundry targeting with read-only target preview; zero or multiple
single-action targets produce a short inline targeting instruction. A target
change refreshes the preview and submission validates the current target identity.
Shared attribute/defense and player attack dialogs have exactly one accessible
signed −3…+3 slider and no Boon/Bane reason fields. Verify keyboard and mouse use,
−3/0/+3, automatic-source prefill/cancellation/cap and exact final formula.
With automatic +2, choosing −1 means final −1. Untouched controls follow ability
changes; a deliberate slider override retains its chosen net. Optional fear
and wound controls default off and do not block ordinary play. Preserve ability
choices, any-player Defend and additional defender selection. Every intentional fresh defense may roll again without a checkbox, explanation or DA approval, including while an older operation's dice are unknown. Same-operation replay never rolls again.
Unknown-dice recovery and exceptional DA rulings remain explicit. Native evidence must be
recorded after serialized runtime testing; static checks alone do not prove UI.

### T109 — native healing-potion execution

The exact bottle and universal action open one preparation flow. Self and another
native Actor identity restore fixed 6/10/16 HP before Life resistance and then
check d4 supply; the final use applies before becoming out. The giver needs a free
hand; its Maneuver is tracked when available. A living willing recipient tracks
a Reaction when available, while a
0 HP recipient does not. Full HP still uses and checks the bottle. Attributed
consent, DA geometry/source reconciliation and a single GM coordinator persist
budgets and receipts without duplicate costs. A dropped response or reconnect
resumes missing Actor/Combat phases without replenishment; unknown dice require a
DA-entered face, and a changed bottle is never silently substituted. Summon,
dead, Last Words, stale source and supply-out cases fail
closed. Interruption spending the declared action before healing is represented,
but opportunity automation is not claimed. Native adjacency uses occupied square
centers and grid spaces, including large footprints and 5-unit scenes; walls,
non-square grids, unavailable geometry, scene levels and altitude never fall back
to pixel distance or an invented ruling. Prevalidation rejects an invalid
embedded Item before the supply Actor write.

## Nonblocking table guidance (#133)

- A player can submit Basic Melee with native targeting when geometry reports
  nonadjacency or uncertainty; the hint stays visible. Hidden targets, changed
  Actor/Token identities, permissions, source snapshots and action receipts remain
  checked. Timing, condition applicability and empty action counters are visible
  guidance, without a separate DA action-budget approval.
- Declare NPC Basic Melee without opening optional attack guidance. Persist unknown
  blockability as `null`, preserve explicit hints, and never rewrite all attacks as
  blockable. Choosing Shield Block records intent without another judgment form;
  its held shield, source provenance, tracked Reaction and same-operation receipts
  still apply.
- Finish a single damaging condition directly with automatic passives and zero
  additional manual mitigation. Explicit review accepts mitigation with a blank note.
  Multiple tick ordering and genuinely ambiguous overlapping durations still need
  their concrete choices.
- Submit manual damage, Speed settings, equipment corrections, healing, retained-dice
  recovery and technical disposition with blank notes. Preserve actual document
  permissions, required numbers, saved dice and immutable operation identity.
- Supply-use and supply-recovery notes are optional; the deliberate Check supply,
  Record observed result or Close check action records intent. Supply dice and
  quantity/identity/permission checks remain unchanged.
- Creation and advancement remain eligible-first, with ineligible choices visible,
  disabled and accompanied by their exact unmet requirements.
## Manual reference play (#134)

Post an owned ability from its sheet and character list; verify the complete readable card, stable live Item/source identity and refusal of unowned/compendium-only sources. Open a shared roll or player Attack, search and optionally select references, then roll: formula, source modifiers and costs remain unchanged. Reference-only selection is distinct from reviewed Defend/Shield Block controls. A private/blind roll carries its reference links in the same private message, with no public side message or visible summary for excluded players. Hostile authored HTML and unsafe links cannot execute; unrevealed secret sections are not copied. Native fixture: `npm run test:reference-play` against an explicitly isolated writable world.

A bounded native player Attack path runs with `HOL_TEST_REFERENCE_ONLY=1 npm run test:player-attacks`; it stops after the actual Attack reference snapshot assertion, retaining native targeting, slider and wound-refresh checks.


### T110 — creature specialty reference actions

Import Red Dragon from the native compendium with every typed action intact.
Furnace breath posts Agility defense and Crushing bite posts Fortitude defense,
with printed Threat and exact Weak/Standard/Strong player-defense outcomes plus
source details. Native GM multi-target suggestions reach the existing any-player
defender chooser. A non-owner may roll each defense repeatedly with the effective
slider, without Combat, prose or repeat controls. Results show the exact selected
outcome text; automatic damage rejects reference results. Wing Beat posts its
no-roll effect without an attack card or invented dice. Numeric Basic Melee and
its linked damage path remain covered by existing regressions.
## Supported builder drops (#137)

Creation learning steps and advancement learning accept readable native ability Items with an exact catalog ID/source match. A drop invokes the existing Add path, including current recipe selections, DP, level, discipline and acquisition validation. Ineligible, inaccessible, stale-source, wrong-type and unsupported-route drops explain the failure without changing the draft. Ancestry/class/discipline compendium drops and equipment shopping drops are not claimed. Eligible options remain first; ineligible options remain visible and disabled with their unmet requirements. Both builders display readable acquisition weapon names while retaining stable values internally.

`npm run test:charactermancer` covers a continuous owner journey from a blank character through guided choices, eligible/ineligible DOM drops, backtracking/reload, normal commit, equipment arrangement, native scene placement and an advancement. It checks current HP/spent Grit preservation, milestone replay and compatible equipment reuse. Run only with an explicitly isolated writable world; static checks do not establish this native acceptance.
## Tracked action guidance (#140)

An intentional reviewed action may proceed outside the selected turn or with an empty Main/Maneuver/Reaction counter. Live condition applicability is table guidance rather than another approval form. Record the advice and actual tracked spend, clamp counters at zero and preserve same-operation replay. A conversion with no source counter grants no destination counter or movement allowance. Printed HP/item costs, exact source/target identity, ownership, any-player defense policy and uncertain partial-write recovery remain separate checks. Reuse an already-active defense benefit without another charge. Owners can correct their equipment arrangement during an encounter; anatomy changes still require the actual DA. Character creation/acquisition requirements remain strict.


Run the bounded native guidance paths with `HOL_TEST_ADVISORY_ONLY=1` and the isolated-world URL/write authorization: `npm run test:player-attacks`, `npm run test:shield-block`, and `npm run test:potions`. Assert real owner Attack and equipment correction, any-player defensive ability activation/reuse, and potion consent/healing/supply despite empty tracked categories and another selected participant. An unconscious giver is advice; dead/Last Words/unhealable recipients and actual source/item costs remain strict. These runs stop after the targeted assertions and clean exact fixture documents.

## Explicit actions supersede automatic chains (#232)

The October 20 user direction supersedes earlier automatic settlement expectations
in this matrix. Rolls post dice/outcomes without mutating HP, wounds or death marks.
Apply Damage targets controlled tokens only; no selection explains the required action.
Linked actors receive one update; unlinked tokens receive their own. Direct HP edits
and wound removal must remain usable after subsequent actions. Ability uses increment
Actor counters and Reset actions corrects them. Turn selection/finish never applies
condition damage or survival procedures. Owned creation/import/save and ordinary rolls
must work with no GM connected. A shared encounter mutation may use the pinned GM
relay, with existing author permissions, but no approval gate or global lease.

`scripts/check-explicit-actions.mjs` exercises the new native workflow. Earlier
coordinator/automatic-defense/turn-tick runtime scripts describe superseded behavior
and are historical diagnostics, not acceptance gates for this interaction model.

## October 21 simplification acceptance (#234–#237)

Action spending/counters and the earlier start/side/round encounter UI are superseded.
The native acceptance scripts for this interaction model are:

- `scripts/check-simple-turn-level.mjs`: Choose/Finish exclusivity, repeat participant,
  Add/Remove level, negative DP validation, paid-ability refund and physical deletion.
- `scripts/check-table-attacks.mjs`: Adder mixed damage/condition defense, selected
  application, condition removal/icon visibility, ranged ammo validation/consumption,
  direct consumables, non-damage results, no-roll text and compact dying dialog.
- `scripts/check-table-sheets.mjs`: web/native market and inventory captures, supported
  item controls, favorites, ammo assignment, language picker, sidebar links and creature
  controls. Model-only checks do not establish web/native presentation parity.

Each native fixture runs only in an explicitly isolated local world, records created
IDs before further mutation, and reports cleanup and browser errors. Conditional prose
is never guessed into effects; its explicit Apply dialog permits table interpretation.

## October 21 follow-up acceptance (#239)

The later correction restores round participation and automatic condition end effects
while retaining table control of action limits and equipment. `check-followup-table`
checks owned unlinked-token advancement without changing the base Actor, readable
language choices, signed HP, wound links and real roll modifiers, relevant initially
closed ability sections, combined clickable conditions, ordinary item edits, manual
supply depletion, silent four-hand arrangements, acted/round progression, condition
end damage/decay, native Dead and native ruler movement-cost bands.
`check-followup-cards-books` checks actual supply die reduction, resistance and reaction
chat presentation, native chapter navigation, preservation of edited world pages and
reload persistence. Earlier immediate-repeat-turn assertions are superseded.

## Persistent character editing and compact table controls (#241)

Place a character and creature from Actors: character token linked, creature copy
unlinked. Recover an existing unlinked character's renamed/added/deleted items,
Story and conditions before linking. Merge disjoint edits across scene copies;
when copies conflict, DA chooses the version for conflicting fields and originals
remain in the Actor's `tokenLinkRecovery` flag. Reject conversion if the Actor or
token changes while recovery is open. Player edits item and Story from the linked
token; delete token, reload, reopen from Actors and retain both changes. Creature
HP stays independent.

At native sheet width, supplies keep all controls aligned, inventory's pencil sits
beside its name, and the focused item editor displays rich text instead of HTML
markup. Save description/name and reopen. Actual weapon attack chat heading uses
that name. Healing a wound to RV disables native effects/icons and returns the
actual roll to an unmodified pool while retaining the scar. Old completed wounds
are repaired. The encounter panel and native tracker group Players/Creatures;
GM's bottom End combat uses native confirmation. Add/Remove level in development
must not create a false stale warning; genuine concurrent draft edits remain guarded.

## Direct signature tier choice (#243)

As a player owner, click Choose level 3 signature from the sheet: show only that
class's level 3 options, choose, save, and return to the same sheet tab. Repeat for
level 7 while level 3 is also pending. Grant exactly one native Item for the chosen
signature; leave the other pending tier available, DP unchanged, and an unrelated
saved purchase draft byte-for-byte unchanged. Reload and retain the grant. A
foreign-class, already-owned, locked, stale-revision or unavailable-tier request
must fail without adding Items. Generic Develop continues its separate draft flow.
