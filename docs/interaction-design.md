# Interaction design and visual identity

**Confirmed requirements from Bruce, October 17, 2026; tracked in #12.** These interactions are part of the core system, including the encounter alpha where the relevant mechanics are available. They extend the [system specification](system-specification.md); they are not optional polish after automation is complete.

## 1. The roll dialog is where players prepare an action

One shared dialog handles attacks, defenses and appropriate attribute checks. Open it from an owned ability, sheet attribute, hotbar shortcut, token control or defense request. Specialized wound/inventory rolls keep their own rules and do not acquire generic Boons/Banes.

Bruce's later October 17 correction (#129) prioritizes ease of play. Optional fear
perception and printed wound-context adjustments default off, do not block a roll,
and remain available when the table decides they apply. Genuine choices such as
ability use, recovery of unknown dice remain
explicit. This supersedes earlier requirements to answer every contextual question.

The dialog contains:

- **Context:** acting character/token, selected action and the native Foundry target as read-only context; no attack target dropdown. A single-target action with zero or multiple targets gives a short inline instruction to use Foundry targeting. Refresh on native target changes and validate the target snapshot before submission. For a defense, show the attacker and attack name; choosing an additional defender remains distinct from attack targeting.
- **Attribute:** printed/default attribute, current effective value and source. A defense starts with the incoming attack's required attribute. Only an applicable ability or explicit DA correction can replace it; the player does not freely substitute a preferred stat.
- **Applicable abilities:** selectable owned abilities/reactions and declared options that can affect this roll. Explain what each changes, its timing, cost, equipment/hand requirements and usage limit. Show why otherwise relevant options are unavailable. Automatic passive effects appear as already-applied sources, without charging or applying them again.
- **Boons and Banes:** one accessible integer slider from −3 (Banes) through 0 to +3 (Boons), with a signed current label. No reason fields. Prefill the effective net from current sources; it follows source/ability changes until moved. Moving the slider chooses the final net directly, with an internal audited adjustment instead of adding the displayed number twice. Preserve raw source totals, cancel/cap once and update the final dice preview immediately.
- **Cost/result preview:** actions or Reactions to be spent, HP/item costs, selected attribute replacements and modified outcomes. An ability can affect damage or riders without changing the dice; show those changes too.
- **Controls:** inspect an ability's full rules, select/deselect applicable options, confirm **Roll**, and cancel. Keep the primary button and formula visible while browsing long ability lists.

Recompute the preview when an ability or modifier changes. Validate applicability from the current trigger, actor, target, range, hands, remaining resources and source rules. Distinguish choosing the primary action from adding permitted modifiers: this is not permission to combine unrelated Main Actions into one roll. Mutually exclusive choices cannot coexist, duplicate benefits cannot stack, and free attacks cannot recurse.

Selection is initially a draft. Browsing/toggling an ability does not spend resources or create effects. At submission, revalidate, commit the selected ability's costs at its actual rules timing, and resolve the same operation once. Pre-roll reactions such as Shield Block are paid before the defense dice are rolled. If a separate immediate ability must resolve before the roll, expose a clearly labeled **Use ability** action with its own confirmation/result; canceling the later roll does not undo an already resolved ability. Post-roll-only abilities become available at their printed window, not prematurely. An out-of-window ability remains viewable with a rules explanation and an explicit DA-adjudicated exception path; encounter eligibility is guidance rather than a blanket hard gate.

Example: a creature attack calls for Agility defense. The dialog already includes the creature's Threat, the defender's conditions and an active Defend benefit. The player chooses Shield Block if eligible, sees its Reaction cost and added Boon, adds a DA-agreed situational Bane, and rolls. The system pays Shield Block once, uses the final canceled/capped dice pool, and resolves the incoming attack's defense outcome. The defense roll itself spends no Reaction.

## 2. Creature attacks create a Defend chat card

For a DA-controlled creature's attack requiring a defense roll:

1. The DA uses Foundry's native target UI (including multi-targeting), then clicks Attack. Capture **all targeted token UUIDs at that instant** as the declaration's suggested defenders. Later target changes do not rewrite the posted card. No separate GM targeting UI is required.
2. Post a persistent chat entry with the creature's player-visible identity/portrait, attack title, descriptive text, the captured suggested defenders and a reusable **Defend** action available to every player. Individual defender rows may also offer shortcuts, but they cannot restrict who may open or use the dialog. Keep unrevealed notes out of the visible card.
3. Any player clicks **Defend**. One captured target can prefill directly; several captured targets are clearly offered for selection. With no targets, open the defender chooser. The suggestions come from the GM's captured targets, not the clicking player's controlled token. Permit another/additional defender for a DA-adjudicated situation.
4. Prefill the selected defender's actual token/profile, incoming attack, printed defense attribute, effective value, Threat, conditions/benefits and other determined Boons/Banes. The player retains ability and situational choices. Explain uncertain/contextual rules; do not block rolling merely because the clicker is not the defender's owner or the defender was not in the original target list.
5. Record the actual rolling user separately from the defender. Apply the chosen outcome through permission-respecting mutation services, update that defender's response, and prevent accidental duplicate application. The attack card stays available for other defenses. Clicking Defend and submitting again creates a fresh roll for the same defender and attack, with editable ability choices and no repeat checkbox, explanation or DA approval. Preserve prior results; only retransmitting the same operation ID is idempotent. An older unknown result does not block a fresh operation, and recovering that old ID never secretly rolls it again.

For multiple targets, show individually labeled defender rows and states: **Awaiting defense**, **Preparing**, **Resolving**, **Resolved**, or **Needs attention**. Each affected defender has an independent roll and ability choices. Opening or canceling never consumes the card, spends resources or locks another player out. A wrong click can be corrected in the dialog. A failed/disconnected committed operation resumes from its receipts rather than paying or applying again.

Encounter rules guide and explain; the DA adjudicates exceptions. Do not implement original-target, owner/controller or ordinary rule-eligibility checks as blanket gates on opening/using Defend. Foundry document write permissions, validation against malformed requests and duplicate-effect protection remain distinct technical boundaries. Recheck changed statistics/resources and show the updated preview; do not silently alter a submitted roll. Missing/deleted suggested tokens lead to a visible correction/defender choice, not a permanently unusable card. The charactermancer's disabled ineligible acquisition choices remain as separately requested by Bruce.

The Defend workflow follows **control perspective**, not the Actor type name: a player-controlled creature attacking another character still makes its normal attacker roll and must not create an extra defense roll. NPC-versus-NPC can use the same pending defense workflow with the authorized DA/player roller; dice handling does not transfer ownership. No-roll attacks show their actual resolve/choice workflow instead of inventing a Defend save.

Suggested visible card structure:

```text
[Creature portrait]  Creature — Attack name
Descriptive attack text
Target: Hero    Defense: Agility    [View attack]
Suggested defenders: all captured GM targets
Defenses: per-character state              [Defend]
```

The actual presentation uses HOL cards, typography and colors below. This text outline specifies information order, not final layout.

## 3. Drag-and-drop is a primary input

Use native document UUID drag data and contextual drop zones. Provide visible valid/invalid feedback while dragging, a preview when a choice or expenditure is needed, and a specific rejection reason. Dropping a record must use the same validation/service as clicking it.

| Source → destination | Expected behavior |
|---|---|
| Compendium/browser ability → character's abilities | Open grant/purchase eligibility and DP preview; commit once when confirmed. Owning a raw Item is not a free learned ability. |
| Ancestry, trait, origin, class or discipline → builder | Apply to the matching stage/slot through the creation ledger; show prerequisites and incompatible/replaced choices before changing state. |
| Owned ability → open roll dialog | Select it if relevant to this roll; preview effects/costs. Reject unavailable/unowned modifiers. Dropping a compendium ability does not bypass acquisition. |
| Owned ability → hotbar | Create an actor-aware shortcut referencing the ability; retain original actor/token context and handle deletion intelligibly. |
| Equipment → inventory or held/worn zone | Preview quantity, acquisition mode and hand/Bulk impact; check permissions and availability. No accidental duplicate grants. |
| Item between owned inventory lists/containers | Reorder or change carried location without duplicating the Item or erasing contents' Bulk. Explicit container rules govern compatibility. |
| Equipment between characters | Transfer the actual selected instance/quantity through authorized ownership/DA mediation; receive once and debit once. Preserve supply state and source provenance. |
| Creature/summon browser → scene | Creature drop creates the intended token instance with printed defaults. Summon drop opens the summoning eligibility/action/placement workflow; it cannot spawn a free uncontrolled summon. |
| Actor/token → target or participant slot | Set explicit target/participant context, then validate range/type/control. Never silently swap the acting character. |
| Rules/reference record → chat or journal | Create a native link/card that respects document permissions; posting a reference does not acquire or activate it. |

Known spells, abilities and inventory can be sorted and favorited without changing mechanical ownership or limiting repertoire. Do not introduce a prepared-hand mechanic. A move and a copy are distinguishable operations; cross-character transfer must never be an implicit clone. If the destination lacks permission or the operation is interrupted, report state rather than silently dropping data.

Support drop handling on re-rendered sheet parts and detached windows. Resolve actual documents from UUIDs and validate the live record; never trust serialized dragged stats or embedded script. Retain equivalent click/keyboard workflows for users who cannot drag.

## 4. Preserve the HOL Great Library identity

Use the existing book's visual identity throughout sheets, roll dialogs, attack/defense chat, content browsers, tooltips and token controls. The reference is the approved HOL book, not Neon Relic's interface.

Pinned sources: [player-book template](https://github.com/bruceamoser/heroes-of-legend/blob/3a08c5b1aa68be45885e488479e4984d169cd115/design/player-book/template.typ), [layout notes](https://github.com/bruceamoser/heroes-of-legend/blob/3a08c5b1aa68be45885e488479e4984d169cd115/design/player-book/layout-notes.md), and [art direction](https://github.com/bruceamoser/heroes-of-legend/blob/3a08c5b1aa68be45885e488479e4984d169cd115/design/player-book/art-direction.md). Include their hashes in the source baseline. Reconcile completed DA visual assets with this identity during intake.

| Design token | Existing value | Interface role |
|---|---|---|
| Forest | `#15221c` | Headers, strong frames, dark surfaces. |
| Antique gold | `#b39253` | Borders, dividers, discipline accents; use legible contrasting text for controls. |
| Ivory | `#f1e6ce` | Callouts and grouped information. |
| Paper | `#f7f3e9` | Default light reading surface. |
| Ink | `#28251c` | Main text on light surfaces. |

Use **Cinzel** for display headings, **EB Garamond** for readable narrative/rules, and **Almendra** only for the established title/branding role. Scale typography for screens rather than copying small print point sizes. Dense controls and numerals may use a compatible readable UI fallback while preserving hierarchy; test all key labels at actual dialog sizes. Bundle permitted font assets with notices and local fallbacks.

Keep forest card headers, antique-gold borders, the numbered tier diamond, distinct gold discipline silhouettes and high-contrast rank numerals. Show narrative separately from exact rules and Weak/Standard/Strong outcomes. Use approved crest, portraits and illustrations with provenance; retain transparent cutouts and keep decorative art away from controls. Repeated functional symbols are appropriate; arbitrary repeated scenic wallpaper is not.

Define shared scoped CSS tokens and reusable components before building separate sheets/dialogs. A dark variant translates these same roles to readable surfaces; it does not replace the established theme with another palette. Gold is an accent, not assumed readable body text on parchment. State labels, focus outlines and tier numerals must work without color alone. Preserve Foundry's functional controls and avoid broad global CSS overrides.

The first implementation proof should show the character header, an ability card, roll dialog with ability/modifier selection, and creature attack/Defend chat card together for visual review. Compare against the actual book and approved art at a usable screen size; a list of hex values alone is not visual acceptance. Test light/dark themes, narrow windows, keyboard focus and detached windows.

## Guided charactermancer — creation and advancement

Confirmed by Bruce on October 17, 2026; tracked in [#18](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/18). Ease of use is a primary acceptance requirement. The draft editor is not a substitute for this workflow.

Present one decision at a time with a persistent character summary, step navigation, explicit stage budgets and plain-language explanations of grants and tradeoffs. Cover attributes, ancestry/traits, paired origins, class, disciplines, abilities, equipment and final derived statistics. Provide optional recommendations and searchable comparisons while preserving player choice. Any recommendations must state their basis and never select or spend silently.

**Eligibility ordering:** show eligible options first. Ineligible options remain visible below them, disabled, with exact unmet requirements. Do not hide them through a default eligibility filter. Distinguish prerequisites from affordability, timing and other temporary restrictions. Requirements should be readable with keyboard focus or adjacent text, not a hover-only tooltip on a disabled control. Recompute the ordering and reasons whenever the draft changes.

Persist drafts and support back/forward navigation and resume after reload. Changing an earlier choice must identify affected downstream choices, preserve all still-valid work and let the player repair the remaining choices. No silent purchases, point loss or wholesale draft reset. Stage-specific rules remain authoritative; a draft does not permit retroactive prerequisites or carrying points across an expiring creation stage.

Review the full character and all grants/costs before commitment. Canceling a draft has no mechanical effect. Commit through the same acquisition services used by drag/drop and keyboard actions, with validation, revision checks and persistent operation receipts. Two owners and retrying clients cannot double-apply purchases or grants.

The advancement mode starts from committed character state, shows the new level's exact grants and available purchases, preserves banked advancement DP, explains safe-place spending restrictions and displays a before/after review. Milestone HP/Grit/signature grants apply once. Keep the creation/advancement history accessible. Later corrections must preserve an audit trail rather than rewrite past choices invisibly.

Usability testing includes a complete first-character journey and a level-up journey: discoverability, comparison, blocked-reason comprehension, backtracking, reload recovery, drag/drop/keyboard parity and minimum manual arithmetic. Validate final characters against the approved six reference builds.
