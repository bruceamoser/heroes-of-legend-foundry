# Approved creature action expansion — behavior intake (#175)

Authority: [Foundry issue #175](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/175), [approved book PR #1280](https://github.com/bruceamoser/heroes-of-legend/pull/1280), and immutable [book commit `bdfd18ed535fbd0e1892b9344444abf6da644809`](https://github.com/bruceamoser/heroes-of-legend/tree/bdfd18ed535fbd0e1892b9344444abf6da644809). The [approved action review](https://github.com/bruceamoser/heroes-of-legend/blob/bdfd18ed535fbd0e1892b9344444abf6da644809/design/bestiary/action-coverage.md) records every roster judgment; the [exact source delta](https://github.com/bruceamoser/heroes-of-legend/compare/d67e046466bdd5052360b96ed91861d607091446...bdfd18ed535fbd0e1892b9344444abf6da644809) is the import boundary. Do not substitute a moving checkout or copy this catalog into a second rules source.

## Intake classification

| Approved change | Intake and behavior boundary |
|---|---|
| 33 new stable `monster-*` templates: six Maneuvers, 27 Reactions | Import the issue's exact IDs, action types, triggers, targets, limits, effects and full local narrative. Reuse template IDs across creatures; creature-local descriptions remain distinct. These are DA references, not DP purchases. |
| Eight short movement templates | Preserve the printed movement amount and mode. Avoid only the one chosen visible enemy's opportunity, except where the template says otherwise. Other opportunities, walls, terrain, occupancy and sight still apply. Stalking Step must end in cover or concealment from that enemy and grants no Hidden. The `monster-root-bridge` wording change has no value/permission change. |
| 161 creature entries | Reconcile exact assignments and reviewed CVs against the pin. Distinctive Maneuver coverage is 127 → 165 and Reaction coverage 13 → 136; 177 Maneuver and 148 Reaction choices. Preserve all Main Action tables, base attributes, HP, speeds and defenses. CV is provisional utility judgment, not calibrated balance. |
| 55 summon profiles | Reconcile 37 content/organization and 18 title/CV-only changes. These remain separate commanded profiles, with controller-turn timing, tether and energy-form rules. Their shared title CV identifies the DA creature only. No Reactions, opportunities, autonomous activity, extra commands or healing. |

## Resolution contract

One Reaction and an ordinary opportunity attack use the same budget. Interference is declared before its printed roll, damage or forced-movement point; retaliation resolves after the incoming attack and only while the reactor survives and can act. No retaliation or free-attack chain. Second Head Watches spends that Reaction for one Basic Melee at reach 2 against an action that normally provokes, then the provoking action continues if capable. It adds no head turn, specialty opportunity or extra Reaction.

Clinging Recoil gives Slowed 2, Answering Lament and Reproach the Caster give Frightened 2, and Thunderous Answer gives Deafened 2. Ordinary attacker end-turn decay leaves 1. Burning, Freezing and Bleeding retaliations use rating 1: damage occurs before ordinary decay. Separate retaliators are tracked as distinct contributions; ordinary aggregate/decay behavior applies without a new global rule.

Cover a Companion and other one-target interference use the existing worst-target modifier for a single player area roll; they do not add an opposed defense roll. Fall to Pieces gives Physical resistance 3 to one attack, then Prone if present. Highest matching resistance wins; mixed damage and the one-point minimum still apply. It neither moves the skeleton nor stands it up. Tail Retort and Hook the Retreat use ordinary Stability, terrain, collision and legal-placement rules; a conditional Stability Reaction occurs at the printed point and never erases prior contact damage or resists Prone/grapples.

Guide the Light lights only unlit squares along an unobstructed path; it does not reveal Hidden or penetrate cover. Spore Curtain is partial obstruction, Lay the Rime difficult terrain. No inferred entry damage, blindness, falling or bridge. Summon Maneuvers consume the existing command package with controller-turn expiry; no copied DA Reaction or autonomous response.

## Existing implementation evidence and limits

`tests/creature-expansion-behavior.test.mjs` exercises the existing pure action budget, interruption, no free-attack chain, NPC defense perspective, ordinary condition tick/stack/decay, highest resistance, mixed damage, minimum damage, difficult terrain, Prone occupancy and standing cost. This is a primitive check, not proof that a creature specialty effect is automated. `declareCreatureAction` currently posts the full reference and optional defender-facing attack card without applying specialty costs or effects; native evidence must confirm that boundary and the complete printed trigger/effect text. No generic specialty Reaction resolver, AoE worst-target calculator, or forced-movement Stability/collision solver exists in this branch. Preserve those outcomes as readable DA adjudication unless a separately reviewed implementation supplies them. Do not claim native automation for them from a passing primitive test.

## Accepted evidence

The Node 24 build, validation and all 432 tests pass. Catalog checks verify the 33 new shared IDs, all 126 templates, 161 creature changes, 55 summon changes, 141 revised creature CVs, unchanged Main Action tables and base statistics, and the separate 419 character abilities. The workshop browser suite passes with the same current source pin.

Foundry 14.369 native checks passed nine representative creature imports and ten specialty action declarations, complete local rules text and shared template IDs, zero unexpected rolls or Actor mutations, and commanded Air Elemental restrictions. The existing Red Dragon multi-target/repeated-defense regression is recorded in the development evidence. These reference workflows leave specialty timing, survival, AoE modifiers, movement and terrain decisions to the DA; the primitive tests above establish ordinary rules behavior, not automatic specialty resolution.

GM world creature and summon sheets expose **Update profile**. This reads only the installed current compendium. An exact old-profile fingerprint permits replacement of printed actions, CV and reference blocks; divergent local blocks remain untouched. It never replaces live HP, base statistics, inventory, effects, token/name/art, or summon command history. Partial updates retain truthful original provenance. There is no historical rules selector or forced review screen.

The native update fixture passed an injured Skeleton Horse receiving Fall to Pieces and its shared template, an Air Elemental retaining custom actions and flavor while its CV updates, and an injured commanded summon retaining command history. All cases preserve embedded items/effects and other protected state; repeating the update changes nothing. Unsupported older or modified blocks are preserved conservatively. Fingerprints contain no archived rule text.
