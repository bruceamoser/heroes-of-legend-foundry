# Discipline expansion v16.3.0: play behavior audit

Issue [#171](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/171) imports the 62 new cards from approved rulebook commit [`d67e046466bdd5052360b96ed91861d607091446`](https://github.com/bruceamoser/heroes-of-legend/commit/d67e046466bdd5052360b96ed91861d607091446) (the diff from `64089a1c8961d7faff172f179448a8b6e57827ef`). The canonical card controls if this audit differs. Each linked canonical card supplies the narrative and full printed constraints; the table maps its behavior into the current workflow. This file is an audit, not a replacement rules catalog.

## Current workflow boundary

High Guard uses the existing native Shield Block workflow: one Reaction, one shared benefit key, two Boons while its shield remains held, and the existing expiry. Defend remains a separate stacking benefit. The four pinned defense-substitution cards have an optional same-roll selector using the printed replacement attribute and Boon; their Reaction spend and trigger/equipment judgments remain table tracked.

The other 57 cards use full local rules references. Posting or attaching a reference adds no cost, modifier, effect, condition edit, target or token movement. Players and the DA resolve their printed behavior through the existing roll, defense, damage, condition, inventory, token, combat-budget and summon controls. Each paid action is tracked once; a reference post does not pay it. Ordinary play controls remain nonblocking.

Classification is about the *existing primitive used to finish play*, not a claim of card automation. "DA adjudicated" means the DA chooses terrain, path, target, timing, and/or result while the system records ordinary state. No card requires a new mandatory permission dialog merely to express a specialty. A bounded native handler is warranted where the existing workflow would otherwise compute the wrong attribute, consume the wrong attack resource, duplicate a benefit, or lose persistent state; see the behavior checks after the inventory.

## All 62 approved cards

Each pinned source link opens the narrative and exact adjudicable rules. Imported owned cards must present the same text on creation and play surfaces; this table is a workflow audit, not a duplicate catalog. Every row except High Guard needs a manually recorded action cost. The four substitution cards have an optional same-defense roll control for their printed stat and Boon; all other portions remain table adjudicated.

| Card and approved source | Current play classification | Critical constraint and workflow |
| --- | --- | --- |
| [Bank the Embers](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/bank-the-embers.md) | Condition care (manual source edit) | Edit only the temporary Burning contribution; hazard may reapply it. |
| [Beacon through Terror](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/beacon-through-terror.md) | Condition care (manual source edit) | Choose one newly applied temporary Frightened/Blinded contribution after application; existing and starred sources remain. |
| [Breakaway Rig](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/breakaway-rig.md) | Condition care (manual source edit) | Reduce only the incoming grapple contribution before it is recorded; inspect accessible worn rig. |
| [Breath of White](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/breath-of-white.md) | Existing attack/attribute roll (manual outcome or modifier) | One area attack roll for the three chosen connected adjacent squares; use worst target adjustment, individual outcomes, cold damage, and Strong Freezing. |
| [Call Their Name](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/call-their-name.md) | Condition care (manual source edit) | Apply Frightened reduction before the affected attribute roll sources are frozen. |
| [Cast Off the Venom](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/cast-off-the-venom.md) | Condition care (manual source edit) | Reduce temporary Poisoned by 3 only; do not heal HP or cure starred poison. |
| [Catch the Ledge](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/catch-the-ledge.md) | Existing movement or summon state (DA adjudicated token operation) | DA validates reachable secure hold, free hand and ongoing force; leave token hanging, then ordinary climb. |
| [Catch the Mechanism](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/catch-the-mechanism.md) | Existing defense roll or damage panel (manual timing and adjustment) | Substitute Knowledge in the pending trap defense before rolling; one existing defense, no disarm. |
| [Catch the Root](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/catch-the-root.md) | Existing movement or summon state (DA adjudicated token operation) | DA verifies rooted vegetation and applies Stability 2 to this forced movement once; Prone/collision damage remain. |
| [Catch Them Falling](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/catch-them-falling.md) | Existing movement or summon state (DA adjudicated token operation) | DA validates adjacency, footprint, supported landing and free hand; move target before fall travel and apply Prone to rescuer. |
| [Clear the Airway](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/clear-the-airway.md) | Condition care (manual source edit) | Reduce only the newly applied temporary inhalation contribution, choosing Asleep or Poisoned. |
| [Clear the Smoke](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/clear-the-smoke.md) | Narrative or scene state (DA adjudicated) | DA marks up to 3 connected ordinary smoke/fog squares clear until next turn; recalculate cover/visibility, not magical areas. |
| [Close Shot](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/close-shot.md) | Existing attack/attribute roll (manual outcome or modifier) | Trigger only on enemy ending voluntary movement adjacent; make Basic Ranged with ammunition and nonrecursive free-attack receipt. |
| [Cold Cuirass](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/cold-cuirass.md) | Existing defense roll or damage panel (manual timing and adjustment) | Add event-scoped physical resistance 2 before damage; use highest matching value and preserve other effects. |
| [Crosswind](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/crosswind.md) | Existing defense roll or damage panel (manual timing and adjustment) | One Boon on existing physical-projectile defense; DA checks area and projectile size exclusions. |
| [Cup the Flame](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/cup-the-flame.md) | Existing defense roll or damage panel (manual timing and adjustment) | Add fire resistance 2 for this event only; do not clear Burning. |
| [Doors for the Host](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/doors-for-the-host.md) | Existing movement or summon state (DA adjudicated token operation) | Teleport at most two own summons to legal visible full-footprint spaces; preserve the same Actor/Token state and command receipts. |
| [Draw the Tether](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/draw-the-tether.md) | Existing movement or summon state (DA adjudicated token operation) | DA moves controller normally, then marks one nonstacking Boon for the summon’s next commanded attack this turn; no command now. |
| [Duck into the Brush](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/duck-into-the-brush.md) | Existing defense roll or damage panel (manual timing and adjustment) | One Boon on the existing physical attack defense while cover-producing vegetation is occupied; keep normal cover. |
| [Ease the Spasm](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/ease-the-spasm.md) | Condition care (manual source edit) | Reduce temporary Slowed by 1; preserve wound/starred source. |
| [Field Triage](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/field-triage.md) | Condition care (manual source edit) | For each of at most two adjacent willing targets choose Bleeding or Poisoned; reduce temporary contribution by 2. |
| [Find the Seam](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/find-the-seam.md) | Existing attack/attribute roll (manual outcome or modifier) | Mark one target’s next ranged attack this turn: physical resistance −1 and partial-cover Bane ignored; keep attack path and heavy cover. |
| [Find Your Footing](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/find-your-footing.md) | Existing movement or summon state (DA adjudicated token operation) | DA validates climb/swim route and spends this Maneuver’s two squares at printed costs; opportunity checks remain. |
| [Follow My Leap](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/follow-my-leap.md) | Existing movement or summon state (DA adjudicated token operation) | DA validates paths and separate landings; chosen allies spend their own Reactions, with no ordinary movement spend. |
| [High Guard](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/high-guard.md) | Reviewed native Shield Block replacement | One tracked Reaction reuses the shield-block benefit key, replacing 1 Boon with 2 until next turn; held shield and eligible attacks still govern it. |
| [Hold the Pulse](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/hold-the-pulse.md) | Condition care (manual source edit) | Reduce temporary Bleeding immediately before its turn-end damage and then tick remaining rating/decay once. |
| [Hook with the Shield](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/hook-with-the-shield.md) | Existing attack/attribute roll (manual outcome or modifier) | This is a Brawn attack with Agility NPC defense and no HP damage; push away, then Strong Prone independently of Stability. |
| [Ironbound Advance](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/ironbound-advance.md) | Existing movement or summon state (DA adjudicated token operation) | DA validates legal unprovoking 3-square route; conditional Stability 3 requires both worn armor and held melee weapon. |
| [Keep Pressure](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/keep-pressure.md) | Condition care (manual source edit) | Reduce temporary Bleeding before end-turn tick; preserve starred source and wound. |
| [Last Light of the Watch](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/last-light-of-the-watch.md) | Existing defense roll or damage panel (manual timing and adjustment) | Add 2 Boons to existing defense only; on Strong reduce temporary Blinded afterward, no invented defense for automatic effects. |
| [Lend Your Eyes](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/lend-your-eyes.md) | Narrative or scene state (DA adjudicated) | DA tracks link/view at turn start; disallow summons; sight uses recipient vision but effects still originate at user’s position. |
| [Name What Is Real](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/name-what-is-real.md) | Condition care (manual source edit) | Reduce only newly applied temporary Dazed, without recalculating previously chosen categories. |
| [Play It Off](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/play-it-off.md) | Existing attack/attribute roll (manual outcome or modifier) | Add 1 Boon only to eligible Guile explanation roll; DA assesses language and visible evidence. |
| [Press and Bind](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/press-and-bind.md) | Condition care (manual source edit) | Reduce temporary Bleeding by 1 without HP or wound recovery. |
| [Quiet Conference](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/quiet-conference.md) | Narrative or scene state (DA adjudicated) | DA tracks participants, radius, language comprehension and one conference; words only, no control. |
| [Read the Ward](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/read-the-ward.md) | Existing attack/attribute roll (manual outcome or modifier) | DA discloses only remaining duration/printed ending route, then applies nonstacking 1 Boon to one escape/disruption roll this turn. |
| [Recall the Shape](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/recall-the-shape.md) | Existing movement or summon state (DA adjudicated token operation) | Interrupt first tether crossing before disappearance; teleport existing summon to fitting adjacent space and resume remaining forced movement/tether checks. |
| [Recast the Footprint](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/recast-the-footprint.md) | Existing movement or summon state (DA adjudicated token operation) | Reposition existing summon; never recreate/restore it or reset HP, condition, duration or command history. |
| [Ride the Furnace Breath](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/ride-the-furnace-breath.md) | Existing defense roll or damage panel (manual timing and adjustment) | Fire resistance 3 applies to one event; only afterward, if capable, move on a legal unprovoking route. |
| [Rim Strike](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/rim-strike.md) | Existing attack/attribute roll (manual outcome or modifier) | Shield attack uses Brawn and printed 3/3/5 physical damage; Standard/Strong push away with Stability, not Basic Melee values. |
| [Rime Footholds](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/rime-footholds.md) | Narrative or scene state (DA adjudicated) | DA tracks surface squares, one set and safe expiry; no withdrawal or replacement while supporting a climber. |
| [Road of Dawn](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/road-of-dawn.md) | Condition care (manual source edit) | Edit temporary fear for each chosen ally, then resolve each optional ally Reaction move separately. |
| [Road of Rime](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/road-of-rime.md) | Existing movement or summon state (DA adjudicated token operation) | DA draws supported connected ground ribbon and movement cost override; hazards and opportunity rules still apply. |
| [Set the Wedge](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/set-the-wedge.md) | Existing attack/attribute roll (manual outcome or modifier) | DA records prepared obstacle/task and one next Force Boon; preparation itself cannot move obstacle. |
| [Shade the Eyes](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/shade-the-eyes.md) | Existing defense roll or damage panel (manual timing and adjustment) | Add radiant resistance 2 for one event only; condition from event still applies. |
| [Shatterguard](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/shatterguard.md) | Existing defense roll or damage panel (manual timing and adjustment) | Apply one Boon to existing defense; only on Strong afterward push attacker away with Stability; no Shield Block activation. |
| [Shield Roof](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/shield-roof.md) | Existing defense roll or damage panel (manual timing and adjustment) | DA checks held shield, continuing adjacency and shield-blockable area attacks; 1 defense Boon and Stability 2 do not multiply. |
| [Shielded Advance](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/shielded-advance.md) | Existing defense roll or damage panel (manual timing and adjustment) | Move first, then choose adjacent ally; 1 Boon to its next eligible defense only while adjacent and shield held. |
| [Silent Cue](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/silent-cue.md) | Narrative or scene state (DA adjudicated) | DA applies one-way language comprehension and 20-word cap; message grants no action or control. |
| [Slip the Closing Door](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/slip-the-closing-door.md) | Existing movement or summon state (DA adjudicated token operation) | DA checks voluntary movement trigger, actual concealment/cover endpoint and legal unprovoking path; no Hidden grant. |
| [Snare the Missile](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/snare-the-missile.md) | Existing defense roll or damage panel (manual timing and adjustment) | Substitute Knowledge and add 1 Boon within the existing projectile defense; area/oversize excluded. |
| [Spot the Tell](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/spot-the-tell.md) | Narrative or scene state (DA adjudicated) | DA reveals only known witnessed attack’s defense attribute and range; no hidden statistics or Boon. |
| [Stay with My Voice](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/stay-with-my-voice.md) | Condition care (manual source edit) | Reduce temporary Dazed before start-of-turn category choice; never retroactively restore chosen categories. |
| [Steel at the Wrist](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/steel-at-the-wrist.md) | Existing defense roll or damage panel (manual timing and adjustment) | Substitute Brawn for normal defense attribute before the existing adjacent melee weapon defense; no Boon. |
| [Still the Avalanche](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/still-the-avalanche.md) | Existing defense roll or damage panel (manual timing and adjustment) | Before damage/displacement, grant event-scoped cold resistance 3 and Stability 3 once, including joining collision group; no condition immunity. |
| [The Forest Takes the Blow](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/the-forest-takes-the-blow.md) | Existing defense roll or damage panel (manual timing and adjustment) | Add 2 Boons to existing defense; Strong permits legal vegetation-only unprovoking move after attack. |
| [Thought Before the Blow](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/thought-before-the-blow.md) | Existing defense roll or damage panel (manual timing and adjustment) | Substitute Reason and add 1 Boon in same defense; Strong permits legal post-resolution move. |
| [Turn the Fall](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/turn-the-fall.md) | Existing defense roll or damage panel (manual timing and adjustment) | Before landing, reduce distance used for fall damage by 4; location/hazards and collision damage unchanged. |
| [Wake the Nerves](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/wake-the-nerves.md) | Condition care (manual source edit) | Reduce temporary Dazed by 1; already chosen action categories remain. |
| [Whiteout](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/whiteout.md) | Existing attack/attribute roll (manual outcome or modifier) | One Knowledge roll sets 5/8/12 connected ground squares; DA applies Heavy Cover 3 Banes, no Hidden/damage/terrain. |
| [Wind the Sight](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/wind-the-sight.md) | Existing attack/attribute roll (manual outcome or modifier) | One next ranged attack this turn reduces only cover Bane as printed; visibility/path and other Banes remain. |
| [Winter Store](https://github.com/bruceamoser/heroes-of-legend/blob/d67e046466bdd5052360b96ed91861d607091446/design/cards/winter-store.md) | Narrative or scene state (DA adjudicated) | DA records one Bulk 1 bundle and 24-hour spoilage pause; no inventory-die replenishment or purification. |

## Issue #171 behavior checks against the play workflow

| Printed check | Current workflow and required adjudication | Bounded implementation / acceptance evidence |
| --- | --- | --- |
| High Guard | Held shield, eligible incoming defense, one Reaction. Replace Shield Block's 1 Boon with 2 for eligible defenses through next turn; never add a second Shield Block. | Native handler uses the same `shield-block` benefit key and tracked Reaction. Unit coverage checks replacement, held-shield loss, repeated use and Defend stacking; the isolated runtime fixture verifies the native service and existing roll basis. |
| Shield Roof / Shielded Advance | DA judges shield-blockable attacks, adjacency, held shield, supported movement and expiry. One recipient benefit each; neither activates Shield Block. | Existing benefit/defense sources can carry a single Boon after DA judgment. Native area geometry and ongoing adjacency are not established by a posted reference. |
| Rim Strike / Hook with the Shield | Both use an attack roll. Rim Strike uses Brawn, shield, 3/3/5 physical and printed pushes. Hook uses Brawn vs Agility NPC defense, 0 HP damage, push **away** and Strong Prone regardless of movement left after Stability. | A generic Basic Melee click would misstate damage; a generic pure-control/no-roll entry would lose Hook's attack. Until dedicated attack handling exists, resolve from the full card and record target, outcome, damage, push and condition separately. |
| Shatterguard | Add one Boon to the existing eligible defense; after a Strong result, push the adjacent attacker with Stability. | The existing defense result is the sole roll. Do not activate Shield Block automatically. |
| Still the Avalanche / Stability | Declare before the event's damage and displacement. Event cold resistance 3 and Stability 3 apply at the right stage; one Stability application when joining a moving collision group. Falling and Prone survive. | Reuse resistance and forced-movement max-3 rules. DA enters event-specific mitigation and movement; do not create a permanent passive or sum Stability sources. |
| Four attribute substitutions | Catch the Mechanism → Knowledge for reachable mechanical trap; Steel at the Wrist → Brawn for adjacent melee weapon; Snare the Missile → Knowledge +1 Boon for eligible projectile; Thought Before the Blow → Reason +1 Boon for perceived attack, Strong post-defense move. All are pre-roll Reactions. | `defense-substitutions.mjs` pins card hashes; the optional defense selector uses the same incoming attack, same defense response and one dice roll. Base incoming attribute remains in `attributeKey`; `resolvedAttributeKey` records the actual stat. Trigger/equipment and Reaction spend remain explicit table adjudication. |
| Close Shot | Voluntary movement ending adjacent is required. The free attack is **Basic Ranged**, with its printed attribute/range/damage, ammunition consumption and no recursive free-attack trigger. | Current native player attack handler is Basic Melee only; treating Close Shot as that operation is wrong. Use card and ordinary attack/ammunition controls manually until a Basic Ranged/free-attack operation is reviewed. |
| Recast the Footprint / Doors for the Host / Recall the Shape | Move existing summon tokens only to fitting, supported legal destinations while retaining HP, conditions, remaining duration, command history and tether. Recall interrupts first over-distance loss and resumes remaining forced movement; 0 HP/unconscious loss remains terminal. | Do not create a new summon or call command. After every reposition recheck tether; DA resolves actual scene geometry and collision. |
| Lend Your Eyes | Link an adjacent willing conscious nonsummon creature; borrow sight only within 6 squares. Effects still originate from the user's own token and require its range/path. | DA records link/view selection, language-independent vision limitations and expiry. No token relocation or control transfer. |
| Condition care | Printed timing matters: new contribution vs existing temporary rating, turn-end Bleeding before its damage/decay, and Dazed before start-of-turn category choice. No HP or wound healing; starred sources persist. | Use source-aware condition edits, not blanket condition deletion. Wake the Nerves / Name What Is Real cannot return categories already fixed this turn. Stay With My Voice can alter the upcoming choice only if declared first. |
| Winter Store / Rime Footholds / Whiteout | Inventory preservation does not replenish a die. Icy holds support existing climbers through expiry and cannot be dismissed to drop them. Whiteout places the rolled count of connected supported ground squares with Heavy Cover, without Hidden, damage or difficult terrain. | DA marks spoilage pause, safe foothold expiry and exact area; ordinary inventory/movement/cover controls carry remaining state. |
| Resistances / Boons | Event resistance is highest matching source capped at 3; Stability highest capped at 3. Boons/Banes cancel and cap by the existing roll plan. | Keep the existing damage and roll primitives; do not sum duplicate resistance/benefit sources or introduce global replacement mechanics. |

The linked canonical cards and bundled catalog expose every printed tier, DP, mixed requirement, action, attribute, target, equipment grant, duration and limit for import review. Creation/advancement eligibility, origin migration, discipline coverage, catalog ID uniqueness and example-hero checks are validated separately from this behavior map; actual results are recorded below.

## Source intake and existing characters

The new immutable pin is `d67e046466bdd5052360b96ed91861d607091446`.
The source lock contains 989 records, with 419 abilities, 44 equipment records,
192 creatures and 73 summons in the generated packs. All 62 new stable IDs and
12 revised origins are imported. Eleven new cards have printed absent-item
acquisition grants; these reuse existing compatible equipment and receipts.
No new equipment statistics, discipline, passive, Universal or signature was
introduced. The six example character sources are unchanged across this update.

Committed native Actors retain their owned Item snapshots, origin grants,
ledgers, HP, conditions, spent Grit and command history. Updating installed
content does not rebuild them. New advancement uses the current catalog against
the persisted development state and requires saving/reviewing its current draft.

Bruce's later correction in #173 supersedes the initial optional update behavior.
Browser imports, named saves and autosaves apply the current catalog automatically.
Earlier origin markers are discarded; each selection resolves to its current pair.
Native creation drafts use the same current-only choices and save normally, without
an update approval or historical grant option. Committed world Actors are not
rebuilt and live resources are not reset.

Old Walled Communities equipment arrangement/removal keys normalize to the current
light-armor grant. The parser continues to validate file structure and ignores
untrusted derived state; the input source pin does not select an alternate ruleset.
Native JSON import now rebuilds exported higher-level plans through the shared
workshop progression rules, including signatures, purchases and acquisition grants
(#221). It preserves live resources and commits only into a new character.

## Initial verification and author review (#171)

The retained-choice checks below describe the initial implementation, superseded
by #173. Current-only update validation is recorded in that PR.

- Node 24 `npm run check` passed: build, package validation and **416 tests**.
  Coverage includes all 62 IDs, exact tiers/actions, full mixed requirements,
  meaningful Maneuver/Reaction access for all 18 disciplines at all three tiers,
  12 revised origins, grant replay, unchanged six example builds, prior origin
  grant/ledger equivalence, portable history markers, shield benefits and the
  four substitution sources.
- Source-lock and authored-pack reproduction passed at the approved pin:
  989 source records, 192 portrait sources, 73 summon links and 419/44/192/73
  ability/equipment/creature/summon documents. Art bytes remain unchanged.
- Full Playwright workshop flow passed without browser errors, including new
  origin alternatives, retained historical choice, deliberate replacement,
  reload/export/import, the six one-DP choices, light armor and narrow layouts.
- Disposable Foundry **14.369** High Guard fixture passed: one Reaction, shared
  Shield Block key, two Boons, Defend stacking to three, both replacement orders,
  held-shield suppression, turn expiry, retransmission and cleanup.
- The native substitution fixture passed all four preview choices, ordinary
  defense fallback, actual-stat snapshots, and a single defense resolved by the
  GM coordinator with the original incoming attack and correct chat flavor.
  Their Reaction spending and trigger/equipment judgments remain manual.
- The native origin-update fixture passed explicit review and backup, retained
  versus replacement options, native flag deletion, portable import and normal
  creation commitment. It also checked that rendering a previously committed
  character leaves its owned state intact. Fixture documents were removed and
  original coordinator settings restored.

Author review inspected source intake, generated records, acquisition grants,
legacy-choice validation, native flag merging, defense services, templates and
web behavior. It caught and fixed the nested-flag retention when deliberately
replacing an old origin. This is author review under Bruce's authorization.
These checks certify implementation behavior, not encounter balance or automated
resolution of the 57 reference-led specialties.
