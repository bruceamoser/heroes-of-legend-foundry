# Interaction design and visual identity

**Confirmed requirements from Bruce, October 17, 2026; tracked in #12.** These interactions are part of the core system, including the encounter alpha where the relevant mechanics are available. They extend the [system specification](system-specification.md); they are not optional polish after automation is complete.

## 1. The roll dialog is where players prepare an action

One shared dialog handles attacks, defenses and appropriate attribute checks. Open it from an owned ability, sheet attribute, hotbar shortcut, token control or defense request. Specialized wound/inventory rolls keep their own rules and do not acquire generic Boons/Banes.

The dialog contains:

- **Context:** acting character/token, selected action, targets, attack or defense perspective and relevant triggering attack. For a defense, show the attacker and attack name and its player-visible description.
- **Attribute:** printed/default attribute, current effective value and source. A defense starts with the incoming attack's required attribute. Only an applicable ability or explicit DA correction can replace it; the player does not freely substitute a preferred stat.
- **Applicable abilities:** selectable owned abilities/reactions and declared options that can affect this roll. Explain what each changes, its timing, cost, equipment/hand requirements and usage limit. Show why otherwise relevant options are unavailable. Automatic passive effects appear as already-applied sources, without charging or applying them again.
- **Boons and Banes:** separate totals with a source list, plus player controls to add/remove situational adjustments with a label. Automatically derived sources remain identifiable; an ordinary adjustment does not delete an enforced condition penalty. Display cancellation, capped net extras and the resulting keep-high/keep-low formula immediately.
- **Cost/result preview:** actions or Reactions to be spent, HP/item costs, selected attribute replacements and modified outcomes. An ability can affect damage or riders without changing the dice; show those changes too.
- **Controls:** inspect an ability's full rules, select/deselect applicable options, confirm **Roll**, and cancel. Keep the primary button and formula visible while browsing long ability lists.

Recompute the preview when an ability or modifier changes. Validate applicability from the current trigger, actor, target, range, hands, remaining resources and source rules. Distinguish choosing the primary action from adding permitted modifiers: this is not permission to combine unrelated Main Actions into one roll. Mutually exclusive choices cannot coexist, duplicate benefits cannot stack, and free attacks cannot recurse.

Selection is initially a draft. Browsing/toggling an ability does not spend resources or create effects. At submission, revalidate, commit the selected ability's costs at its actual rules timing, and resolve the same operation once. Pre-roll reactions such as Shield Block are paid before the defense dice are rolled. If a separate immediate ability must resolve before the roll, expose a clearly labeled **Use ability** action with its own confirmation/result; canceling the later roll does not undo an already resolved ability. Post-roll-only abilities become available at their printed window, not prematurely. An out-of-window ability remains viewable with a reason it cannot be used.

Example: a creature attack calls for Agility defense. The dialog already includes the creature's Threat, the defender's conditions and an active Defend benefit. The player chooses Shield Block if eligible, sees its Reaction cost and added Boon, adds a DA-agreed situational Bane, and rolls. The system pays Shield Block once, uses the final canceled/capped dice pool, and resolves the incoming attack's defense outcome. The defense roll itself spends no Reaction.

## 2. Creature attacks create a Defend chat card

For a DA-controlled creature's attack requiring a defense roll:

1. The DA chooses the attack and targets. Resolve declaration validation/costs and relevant interruption windows at the usual timing.
2. Post a persistent chat entry with the creature's player-visible identity/portrait, attack title, descriptive text, targeted defenders, applicable visible requirements and a **Defend** button for each pending defender. Keep unrevealed DA notes and hidden statistics out of player-readable payloads.
3. The defender clicks **Defend**. Open the shared dialog with the correct defender token, incoming attack, printed defense attribute, effective attribute value, Threat, applicable conditions/benefits, range/cover context and other determined Boons/Banes prefilled. Do not require players to rebuild those modifiers manually.
4. The player selects applicable abilities and situational adjustments in that dialog, reviews costs and rolls. This click opens preparation; it does not immediately roll or auto-spend a Reaction.
5. Apply the selected defense outcome and authorized consequences automatically. Update the chat entry with the result and resolution state, and prevent reusing the completed response.

For multiple targets, show individually labeled defender rows and states: **Awaiting defense**, **Preparing**, **Resolving**, **Resolved**, or **Needs attention**. Each affected defender retains their own roll and abilities. A failed/disconnected attempt must be recoverable; opening the dialog does not permanently lock a response. Canceling before commitment returns it to pending. Once dice or payments are committed, retries resume that operation rather than resetting it.

Only the defender's authorized owner/controller or DA can submit that defense. A summon uses its actual profile/attribute and controller permissions. Two owners clicking the same response cannot create two rolls or duplicate payment. Reopening chat after reload uses the persisted response ID and state, never a new request. Recheck conditions/resources before commit and show any changed preview to the player; do not silently roll using newly changed options. Handle missing/deleted targets with a visible DA correction path.

The Defend workflow follows **control perspective**, not the Actor type name: a player-controlled creature attacking another character still makes its normal attacker roll and must not create an extra defense roll. NPC-versus-NPC can use the same pending defense workflow with the authorized DA/player roller; dice handling does not transfer ownership. No-roll attacks show their actual resolve/choice workflow instead of inventing a Defend save.

Suggested visible card structure:

```text
[Creature portrait]  Creature — Attack name
Descriptive attack text
Target: Hero    Defense: Agility    [View attack]
Awaiting defense                           [Defend]
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
