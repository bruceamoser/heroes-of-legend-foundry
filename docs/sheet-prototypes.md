# Web sheet prototypes

The Pages workshop connects Character (`index.html`), NPC (`npc.html`),
Creature (`creature.html`), Item (`item.html`) and the [roll dialog](roll-dialog-design.md)
(`roll.html`), [chat cards](chat-card-design.md) (`chat.html`) and
[play tools](play-tools-design.md) (combat, journals, recovery and crafting). The NPC, creature and item pages
share `web/sheets.mjs` and `web/sheets.css`, plus the character workshop's theme,
fonts and controls. These pages preview future native sheet design; no Foundry
world or campaign data is accessed.

NPCs and creatures use one compact card without tabs. The image, editable HP,
Speed, CV, six rollable attributes and all seven combat statistics remain above
the internally scrolling action list: Armor DR, Evasion, Threat, Stability,
Resistance, Weakness and Immunity. Printed modifiers and explicit None values
are preserved. Main actions, maneuvers, reactions, specialty reference buttons,
size, movement modes and conditions are on the same surface. Action rows include
printed targets, damage types and limits where provided; clicking opens full rules.
Portrayal/profile, world details and notes are collapsible secondary sections.

Items use a narrower single card with one title, a discipline/equipment icon,
compact rules and outcomes, requirements, properties and supply controls.
Cards grow with their content up to the viewport bound rather than filling an
empty fixed-height window. Header information stays outside the scrolling pane.

Each sheet has an edit toggle, independent browser autosave, named snapshots and
import/export. Source catalogs are immutable: edits are local overrides. NPC Edda
Vale is illustrative worksheet content linked initially to the approved Shield
Soldier profile. Changing the profile preserves portrayal. NPCs are not given a
fabricated character class or skill system.

Creature attack columns preserve the book's **player defense** orientation.
Clicking an action opens the full card and a repeatable Defend roll with the
printed attribute, editable attribute value and net slider. Ordinary attribute
rolls use the shared 3d6 classifier. These interactions are local previews, not
Foundry chat/socket delivery, targeting, resource automation or damage application.
Conditions can be added/removed; they do not create an encounter clock. Item
supply checks use the shared supply-die rule and retain the final use.

Exports use `format: hol.sheet.prototype`, version 1, a sheet kind, source commit
and local state. They round-trip through the matching web page. They are not
native Actor/Item import files. Unknown catalog IDs, wrong kinds, malformed
numeric fields and oversized files are rejected; rendered user text is escaped.
Character workshop files/storage remain independent.

## Content and artwork

The build copies the pinned creature catalog alongside choices, inventory and
embedded rules references. All 192 creature profiles are available. Existing
approved portrait derivatives provide transparent WebP previews, at most 384px,
produced by `python3 scripts/build-sheet-art.py` with Pillow. Their manifest records
source and preview hashes. Total previews are approximately 11.8 MB instead of
93.7 MB of runtime portraits; catalog images load lazily. No new artwork or rules
were authored. The original art and licensing metadata remain unchanged.

## Validation

`npm run test:sheet-prototypes` covers NPC editing/profile changes, independent
saves, visible combat statistics and actions without tabs, compact bounds, HP,
conditions, repeatable defense rolls, catalog selection,
portrait size, item outcomes and supply checks, JSON round-trip/kind rejection,
remembered collapse, escaped edits and 760/390px layouts. CI and Pages require this
suite in addition to the existing five workshop suites. Pure checks verify each
preview's catalog coverage, pinned provenance, exact hash and total size. All 192
previews were also decoded with Pillow and checked against the size bound.

## Character crafting tab

Characters with known recipes have a hanging Crafting tab. Its compact table
shows each recipe, the character's learned crafting ability, printed attempt
duration and the corresponding roll. Recipe and ability names open full details.
Known recipes whose crafting permission has not been learned remain visible,
without a roll action. Characters without recipes have no Crafting tab.
Existing browser saves selecting the former Recipes tab reopen Crafting.
This character-backed sheet view is separate from the disposable example jobs
on the standalone crafting design page.

Crafting attempts can be rerolled before choosing Record attempt. Recording
saves per-recipe progress, attempt count and completed permanent products with
the character (autosave, named saves and portable JSON). Reaching a permanent
project target adds one catalog product when defined; the next attempt begins a
new project. Recipes without a catalog product record completion only. Supply
recipes raise the selected matching inventory supply, or create a new one from
empty, up to the printed recipe cap. Existing higher dice are never reduced.
Tools, materials and elapsed time remain governed by the recipe at the table.
