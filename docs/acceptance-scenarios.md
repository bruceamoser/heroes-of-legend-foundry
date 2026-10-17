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
| T80 | Full catalog audit | Every active mechanical record has explicit automation coverage and scenario evidence; no warn-and-skip entries. |
| T81 | Keyboard, dark/light mode, detached sheet | No missing actions, inaccessible critical controls, clipped text or lost listeners. |
| T82 | Group binary target 7, results Weak/Strong/Strong | Total 7 succeeds; Weak/Standard/Strong total 6 fails binary but retains 6 for cumulative task. |
| T83 | Same actor aids and contributes to one group attempt | Reject double participation; no group wound treatment/crafting/derivation. |
| T84 | Native hotbar/HUD action versus sheet action | Same validation, cost and results, with correct acting token. |

## Interactive preparation, drag/drop and HOL identity

| ID | Scenario | Required result |
|---|---|---|
| T85 | Open an attack/defense dialog and select an applicable ability | Show the ability's exact effects/costs and updated formula; automatic passives count once; unrelated actions are unavailable with a reason. |
| T86 | Prefilled 2 Boons and 1 Bane; player adds a labeled situational Bane | Equal totals cancel to ordinary 3d6; removing the added entry restores 4d6 keep-high-three. Auto sources retain their identity. |
| T87 | Select Shield Block, deselect, then cancel defense before commitment | No Reaction/effect/payment consumed; request remains pending. Submitting the selected reaction pays once before rolling. |
| T88 | Creature attacks Hero A; Hero A clicks Defend | Show creature attack description and A's actual token, printed defense attribute/effective stat, Threat, conditions and benefits; allow eligible abilities without rebuilding context. |
| T89 | Area attack on A and B; A defends with an ability | A and B have separate response IDs/results; A's choice does not change B's roll or resolve B automatically. |
| T90 | Non-owner clicks Defend; two owners click; chat reloads after completion | Unauthorized user cannot roll for target; authorized users produce one committed response; completed button cannot reroll/reapply. |
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

## Test organization and evidence

Pure-rule tests cover T01–T05, damage aggregation, ledger math, state transitions, wound selection and grid calculations. Model tests verify invalid input, derived data and serialization. Content tests verify source coverage and complete outcomes. Runtime tests cover authoritative mutation, documents, effects, combat events, scene geometry and UI. Each content handler contributes additional fixtures beyond this seed matrix.

For each runtime run record commit, package/schema/content versions, Foundry build, browser, OS, modules, client roles, fixture world, expected/actual outcome and console output. A mock pass is not a Foundry pass. Final release requires all applicable scenarios and full content coverage, with any intentional exceptions explicitly approved and named in release notes.
