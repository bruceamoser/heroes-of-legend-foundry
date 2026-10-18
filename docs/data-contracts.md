# Data contracts

Proposed schema revision **1**. This defines design intent, not executable Foundry model code. All proposed `system` fields require TypeDataModel declarations and validation. All flags use `flags.heroes-of-legend`; references to Actors in play include token UUIDs where applicable.

## 1. Document mapping

| Foundry document | HOL type / role | Important fields |
|---|---|---|
| Actor | `character` | Base/effective attributes, HP, Grit, stage/level, choices, purchase ledger, equipment, survival. |
| Actor | `creature` | Printed attributes, footprint/movement, defenses, Evasion/Threat, CV metadata and embedded actions. |
| Actor | `summon` | Creature profile plus controller/token links, eligibility and command lifecycle; no PC death track. |
| Item | `ability` | Shared/universal/signature/monster role, action specification, complete outcomes and automation. |
| Item | `ancestry` | HP/Speed/coin contributions and available trait references. |
| Item | `trait` | Ancestry requirement, benefits and explicit grants. |
| Item | `origin` | Culture/background discriminator, paired choice grants and coin contribution. |
| Item | `class` | Attribute minimums, HP/coins, starting discipline choices, rank price matrix and signatures. |
| Item | `discipline` | Stable discipline ID, description, owned rank and source grants. |
| Item | `equipment` | Weapon/armor/gear/consumable subtype, Bulk, hands, independent held/worn state, price, compatibility, supply die and effects. |
| Item | `recipe` | Capability/tools/materials, duration, product, cap, acquisition and derivation requirements. |
| Item | `wound` | Table/result, scar, anatomy, immediate and lasting effects, treatment track and day history. |
| ActiveEffect | `condition`, `benefit` | Individual typed source contributions, ratings, predicates and expiry anchors. |
| Combat / Combatant | Namespaced HOL flags | Starting side, acted set, turn serial, phase, action allowances and selection state. |
| ChatMessage | Namespaced action/roll flags | Immutable resolution snapshot, source IDs, choices, request and completion references. |
| JournalEntry / pages | Rules, DA reference, operation ledger, task/job state | Permissions at document boundaries; rich text plus validated structured flags where needed. |
| RollTable | Wound reference / approved random reference | Wound rows keyed by three-digit result; not uniformly sampled. |
| Region | Area/zone/hazard | Source operation, affected shape, level/elevation context, trigger frequency and cleanup. |

Start with the necessary subtypes for the first slice and add others with migrations. The full type set is the build target, not a requirement for a giant first commit. Do not invent separate spell-slot Items: magic is an ability tag and explicit behavior.

## 2. Shared provenance

Every shipped record has a stable source identity:

```json
{
  "source": {
    "id": "basic-melee",
    "repository": "bruceamoser/heroes-of-legend",
    "commit": "3a08c5b1aa68be45885e488479e4984d169cd115",
    "path": "design/cards/basic-melee.md",
    "hash": "<sha256 of pinned source bytes>",
    "decisionOverrides": [],
    "contentRevision": 1
  },
  "schemaVersion": 1
}
```

Placeholder hash above is illustrative and must never pass a production validator. Imported records also store the original packaged mechanical hash and a separate current mechanical hash to detect local edits. Name changes do not change IDs. Deletion/renaming maps must be explicit. Store source provenance on embedded copies as well as compendium records.

## 3. Character state

| Path / group | Type and persistence | Invariant |
|---|---|---|
| `attributes.<brawn|fortitude|agility|guile|knowledge|reason>.base` | Integer, persisted | Creation −2..+2 and sum +3; no automatic level increase. |
| `attributes.*.effective` | Derived integer | Apply explicit bonus/curse semantics; can exceed creation range. |
| `creation.snapshot` | Persisted attributes and source IDs | Used for original DP and HP contributions; later equipment does not rewrite history. |
| `creation.stage` | `draft`, `level0`, `level1`, `complete` | Stage closure expires unused pool once; cannot qualify earlier purchases retroactively. |
| `health.value`, `health.baseMax` | Persisted integers ≥0 | Base maximum includes fixed creation and purchased benefits; temporary max modifiers explicit. |
| `health.max` | Derived integer | Current value clamped through validated mutations, not silent repeated writes during preparation. |
| `grit.granted`, `grit.spent` | Persisted integers ≥0 | Current = granted − spent; milestone grants are separate one-time ledger entries. |
| `advancement.level`, `ledger[]` | Persisted | No duplicated milestone grants; current DP computed from stage-aware entries. |
| `identity` | Source IDs for ancestry, traits, origins, class | Exactly one class; two ancestry traits and legal origin pairs. |
| `survival.state` | `active`, `dying`, `stabilized`, `lastWords`, `dead` | Only valid transitions; no Grit/healing exit from Last Words without explicit rule. |
| `survival.deathMarks`, `lastWordsAnchor` | Persisted | 0..3 marks; deadline counts the appropriate following turns, not arbitrary global turns. |
| `derived.bulk`, `capacity`, `speed`, `stability`, `resistances`, `weaknesses` | Derived | Explain source contributions; aggregate using the appropriate rule. Damage/recovery bases snapshot reviewed automatic passive sources with the equipment revision. |

Ledger entry: ID, operation ID, actor UUID, stage/level, kind (`grant`, `purchase`, `expiry`, `award`, `correction`), source ID, prerequisite snapshot, DP delta, created embedded IDs, timestamp and correction reason where relevant. Bookkeeping is append-only through normal play; corrections retain prior history. Persist creation drafts separately from committed acquisitions.

Keep repeated equipment inventory as actual instances where state differs. Store owned discipline rank once per ID and a separate acquisition history. Wound count includes treated scars, not merely active penalties. Avoid two independently editable condition stores on Actor and ActiveEffect.

## 4. Ability contract

All abilities carry full narrative/rules and these structured fields:

| Group | Fields |
|---|---|
| Acquisition | `role`, `tier`, `minimumLevel`, `dpCost`, `classId`, prerequisite expression, grants, repeat-purchase limits. |
| Activity | Action category, full activity time, trigger, roll mode (`attribute`, `none`, `delegated`), attribute, defense attribute. |
| Requirements | Equipment compatibility, hand use, capability predicates and identified human rulings. |
| Targeting | Target kind/count, range, footprint kind/dimensions, sight/path, friend/enemy/all inclusion, origin/orientation. |
| Choices | Pre-roll options with explicit choices; post-roll choices only when printed. |
| Costs | Action reservation, HP payer/rule, inventory use, item consumption, command allowance and timing. |
| Outcomes | Weak/Standard/Strong complete effect lists, or a no-roll list; explicit attacker/defender orientation. |
| Timing | Source/target/controller anchors, duration, event, maintenance and use-limit reset. |
| Automation | Handler ID/version, supported primitives, coverage state and fixture IDs. |

Example Basic Melee outcome payload:

```json
{
  "orientation": "attacker",
  "weak": [{"kind": "damage", "components": [{"type": "physical", "amount": 2}]}],
  "standard": [{"kind": "damage", "components": [{"type": "physical", "amount": 3}]}],
  "strong": [{"kind": "damage", "components": [{"type": "physical", "amount": 5}]}]
}
```

This example follows the pinned approved catalog, not the old Quarto weapon table. Creature defense tables may contain different complete outcomes: import their actual entries; do not assume all monster attacks are this example reversed.

Initial allowed effect primitives: damage, heal, condition contribution/removal, benefit, forced/voluntary movement, resource payment/grant, inventory check, summon, command, transformation, granted attack, task progress, treatment and a named human choice. Compose explicit operations; unique abilities use a registered code handler with tests. Never execute arbitrary imported JavaScript or guess effects from words like “flame.”

Prerequisites are declarative: `all`, `any`, discipline-rank threshold, class, minimum level, capability and explicit acquisition constraints. A compound requirement preserves AND/OR meaning. No lower-tier ability prerequisites by default. Equipment ownership and permission to use are distinct.

## 5. Resolution and operation records

Resolution snapshot includes operation ID, actual initiating user, roller identity, acting actor/token, item/source revision, attack perspective, target UUIDs, chosen options, all modifier sources, original/retained dice, total, tier, natural result, per-target effects, costs and visibility mode. Natural 111/666 is derived from retained faces, not a total.

The pre-roll draft additionally stores dialog mode, triggering attack/response ID, defender token UUID, base attribute, permitted replacement source, selected ability UUIDs/options, costs pending commitment and modifier entries. Each modifier entry records source, Boon/Bane kind, amount, label, automatic/situational origin, applicability and editability. Automatic passives and selected abilities must not both add the same source. The roll UI shows a prefilled effective −3…+3 slider. Until moved it follows current source totals; once moved, store its desired final net and a computed compensating source against uncapped totals, with no written reason or duplicate addition. Snapshot the final draft on submission; rerendering the dialog does not mutate actor resources. Ability definitions declare their applicable roll/trigger window, replacement/exclusivity behavior and effect handler, so the dialog can filter and explain choices without parsing prose.

Creature attack chat stores a stable incoming operation and immutable `suggestedDefenderTokenUuids` captured from all native GM targets when Attack is clicked. New declarations also snapshot the DA's explicit `blockable` judgment and owning `combatId`; cards created before that field allow ordinary defense but have no blockability judgment. A reusable Defend action is open to any player, who can choose a suggested or additional defender. Per-defender response records contain actual rolling user ID separately from defender identity, plus response ID, actual target actor/token, required defense attribute, visible context, current state and resolving operation ID. Button payloads identify the attack and optionally a suggested defender/response; they do not supply trusted statistics or authority. Resolve from stored source documents and current validated state. Preserve original declaration/dice while refreshing pre-roll eligibility. Multiple players handling one defender share response receipts, while different defenders remain independent. Explicit additional attempts preserve prior results and require no written explanation. An unresolved dice attempt still needs DA recovery before another roll. Public chat contains only permission-safe projections; unrevealed attacker data must not be inserted into visible cards. Native hidden-record ownership is not a proven client-data confidentiality boundary; see [authority findings](research/authority-prototype.md). See [interaction design](interaction-design.md) for cancel, stale-context and per-target behavior.

A persisted operation record includes phase, authority epoch, expected document revisions, committed action, paid resources, roll snapshot, pending human choices, per-target before/after receipts, completed event IDs and failure/reconciliation state. Authority-specific mutation receipts live in a GM-controlled document; public chat is a filtered presentation. Large histories may be archived, but retain the IDs needed to reject replayed requests.

Authority transition has a testable lock/claim protocol before automation ships. A simplistic `if (game.user.isGM)` in every hook is insufficient. Do not claim the client-side protocol secures a hostile Foundry server or prevents a document owner from editing their own data; it protects legitimate workflow permissions, stale requests and duplicate execution.

## 6. Conditions and durations

Each condition contribution stores: source UUID, affected actor/token, condition ID, rating, persistence (`temporary`, `starred`, `maintained`, `binary`), application operation, controller anchor if any, removal rule, source-perception context and last processed event. Grapple contributions also reference both participants.

Derived effective state performs condition-specific aggregation. Persistent and temporary ratings cannot merge into one starred number. The UI shows both components where relevant. A wound source can emit an immediate one-shot operation plus a lasting effect; re-preparing the wound cannot re-emit its initial push or Bleeding.

Duration contract: anchor actor/token, optional combat UUID, source turn serial, event (`turnStart`, `turnEnd`, `worldTime`, `sceneEnd`, `explicit`), count/time, expiry policy and maintenance condition. Adapt this to V14's `start`/`duration` fields where supported, using custom expiry events only after the integration spike. Condition damage/decay is not delegated to two independent countdowns.

## 7. Combat and movement state

Combat flags contain opening roll, starting side, round, current side, eligible/acted Combatant IDs, chosen participant, monotonic phase serial and processing receipts. Combatant flags contain Main/Maneuver/Reaction counts, movement granted/spent, retained-category choice, reaction refresh serial and summon links. Summons do not appear as independent turn candidates.

Token movement operation contains voluntary/forced/teleport mode, actor and Token UUIDs, original footprint, scene/level, waypoints, entered-square costs, provoking boundaries, collision participants, Stability-charged set and legal endpoint. Do not store pixel distance as the rules distance. Use native coordinates through a conversion adapter; canonical rules use grid squares.

Regions store source ability/operation, level/elevation context, shapes, effect recipes, entry/exit/turn trigger policy, applied actor-event keys and cleanup policy. A visual area is not proof a token satisfies the card's target type or sight condition.

## 8. Content packs and migration policy

Proposed packs: character choices; universal/shared/signature abilities; equipment/recipes; wounds; creatures; monster abilities; player summons; player rules; DA rules; quickstart examples. Split by permissions and browsing workload, not one pack per individual record. Monster powers and player abilities remain distinct even if some effect primitives are shared.

Ship editable JSON intermediate sources and a stable ID map; generated LevelDB packs belong in release artifacts. Validate asset fields and rich HTML paths in `documentTypes`. Exclude unrevealed DA information from player-owned items; UI hiding does not make data secret.

Three separate versions: package SemVer, integer data schema, pinned content revision. Migrate schema sequentially, once per active authority, with dry-run summary, backup instructions, per-step checkpoints and idempotency. Cover world Actors/Items, embedded content, unlinked Token deltas and user-owned packs where supported. Never rewrite installed system packs in place or replace user edits without a diff. No prior-version migrations are needed for a brand-new world; add migrations only when a shipped HOL schema changes.

## Languages — completed-book intake

Persist known languages as stable campaign language IDs with a display name, form (`spoken`/`signed`/explicit campaign form), permissions (`understand`, `speak`, `read`, `write`) and grant source ID. Store the actual named regional language; a category placeholder is not a completed choice. Campaign definitions determine ordinary availability and Common's name. A spoken-only grant explicitly leaves read/write false. Creation and advancement use the same eligibility browser and preserve prior language grants on resume/rebuild. No attribute-derived free languages or implicit DP costs.

## Implemented creature profile (issues #62 and #122)

The native `creature` model stores signed `cv`, all six printed attributes,
`health.value/baseMax/max`, ordinary `speed` plus typed alternate Speeds,
footprint/size label, integer `armor` with its authored marker, `stability`,
separate `threat`/`evasion` Boons/Banes, numeric and narrative weaknesses and
resistances, immunities, and `basicMelee.weak/standard/strong` in explicit
player-defense orientation. It deliberately has no PC Grit ledger.

Imported Actors also retain exact printed source strings for attributes, HP,
Speed, size, Armor, Evasion and Threat. Authored action tables and details remain
Markdown. The sheet's read-only renderer escapes all source text and converts the
supported headings, tables, paragraphs, strong/emphasis and pinned-link subset
before Foundry enrichment; the specialty coverage is explicitly pending and has
no handler. The `heroes-of-legend` flags carry the catalog ID, pinned
`{ path, sha256 }` source, commit and related ability/summon references.

The existing damage resolver continues to use printed `armor` as Physical DR.
Imported numeric resistance/weakness data and narrative exceptions are not wired
into that resolver in this increment. Signed CV has no nonnegative schema clamp.
Changing size edits the profile, not existing Token dimensions, and artwork uses
the native fallback until approved asset paths are available.
