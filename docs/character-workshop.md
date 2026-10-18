# Character workshop

Issue #155 establishes a browser workspace for refining the character interface.
Bruce requested direct implementation without delegated workers, book-inspired
style rather than pixel matching, and a common hero header above proper tabs.
The interface does not carry preview warnings or explanatory disclaimers.

## Information architecture

The shared header contains the top-left Edit toggle, name, ancestry, class,
level, HP maximum, Grit, Speed, armor DR and six attributes. The tabs organize by activity:

Both sheet tabs and creation steps use a narrow vertical icon rail hanging off
the left edge. Labels appear on hover and keyboard focus; accessible names remain
available to screen readers. No full-width labeled sidebar consumes the panel.

| Tab         | Contents                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main        | Concise Main Action, Maneuver, Reaction and Passive tables; movement/other timings stay explicit. Owned-weapon basics, ancestry traits, defenses, carrying statistics and editable conditions. |
| Abilities   | Known disciplines and ranks first, followed by searchable learned-ability tables with local detail dialogs, discipline filtering and universal actions.                                                                                                               |
| Inventory   | Grants, purchases and play additions, add/delete controls, sources, supply dice, quantities, Bulk and carried/worn/held controls.                                                                          |
| Recipes     | Visible only when recipes are owned; local recipe details, related crafting abilities and repeatable rolls. |
| Character   | Ancestry, culture, background, traits, editable languages, player and story.                                                                                                           |
| Development | Current, spent and total DP; level plus/minus; Spend DP and separate missing-signature choices; collapsible creation and advancement ledgers.                                                                      |

Creation is a separate eight-step flow. Changing earlier choices retains later
choices for explicit repair. Eligible learning cards precede visible disabled
ones. Both groups expand progressively instead of dumping the entire catalog on
the screen. Read controls remain usable for unavailable choices. Keyboard tabs,
visible focus, dialog Escape, narrow layouts and button alternatives to card
drag/drop are supported. Structural Edit mode must not become a gate on ordinary
play controls when this design is adapted to Foundry.

## Shared behavior and transfer

`scripts/build-workshop.mjs` copies the existing pure rules modules and exact
catalogs into a static site. There is no second creation calculation engine.
The browser renderer is currently in `web/`; native sheets have not yet adopted
it. UI adaptation should reuse its presentation primitives and design tokens,
while replacing browser persistence with permission-checked document services.

The portable format is `heroes-of-legend-character`, schema version 3 (versions 1 and 2 remain readable), with a
pinned source commit, creation choices, per-level advancement plans, stable
shopping identities, equipment arrangements, basic-action visibility and an
explicit coin-limit override. Version 3 adds bounded play inventory edits, languages and condition contributions. The importer whitelists the supported
fields, recomputes eligibility and grants, and never accepts derived Actor
statistics, world IDs, ownership or executable content. Incomplete drafts remain
exportable. Ready-character export requires valid creation and active advancement choices. A different
source edition is rejected without changing the current character. Campaign
language differences remain repairable choices, not imported world settings.

Native transfer: open **Create a Hero** on a new character, select **Import
character JSON**, review, then complete the existing creation workflow. It saves
the imported creation draft; it does not bypass the authority/commit service.
Player/story and any legacy pronouns value are retained in the portable draft; the current native
sheet does not yet display those new presentation fields. Browser equipment
arrangements, action visibility and play edits remain in the saved draft; native import
explicitly tells users these controls are not yet applied to native documents. Later-level browser
plans are rejected before mutating the native creation draft, rather than being
silently reduced to level 1. The published 0.1.0 system predates this importer;
these native features are development-build validation, not a new release.

All six approved reference heroes round-trip through this format. The browser
opens Borin as an example on first use; New hero starts a blank draft. Local
storage keeps both an automatic working draft and a named-character library.
Save updates the selected named copy; Save a copy creates another. Load opens
any named copy; deleting one requires confirmation. Nothing is sent to a server.
JSON remains the portable backup; browser data belongs to that origin/profile.

## Compact tool behavior (#158)

The sheet is capped at 900px wide and 900px tall, fitting the viewport on smaller screens. The viewport is fixed. Only the content pane scrolls; the common header, icon
rail, wizard footer and contextual strip remain outside it. Learning keeps its
DP balance and current discipline ranks visible. Culture/background options
include the complete discipline/ability grant pair before selection. Attribute
inputs update the shared header immediately. Equipment shows granted weapons,
ammunition, armor and supply dice before the market list.

Main uses compact action tables with one-line desktop summaries and complete local reference
windows. Narrow layouts retain two summary lines. Edit mode exposes per-action and per-timing-group basic-action visibility
controls; those are preferences, not permission gates. Known recipe entries
show the relevant learned crafting ability and an attribute roll with a single
−3…+3 Boon/Bane slider. Rolls may be repeated; the web tool does not consume
materials or create products from a roll.

Equip/remove updates reviewed worn-item defenses (medium/heavy armor with its
matching ability, Winter Lining, Gravebound Brooch). Carried toggles change Bulk,
encumbrance and Speed; removing armor does not magically remove its carried
weight. Other item effects remain in their local references. Every inventory
row includes quantity, Bulk, supply die and grant/purchase source. An explicit
coin override permits overspending and retains the negative balance instead of
inventing extra coins.

The browser replays each level from its saved choices through the shared
advancement rules. Level changes preserve later plans and reconstruct awards,
abilities, HP, Grit and acquisitions without duplicate grants. Learning retains
eligibility requirements; missing signatures have their own screens. Current DP is available
advancement DP; spent/total include creation, with expired creation DP separately
identified. The creation ledger stays useful here; do not copy it into the
future native Development tab.

The October 18 source update now includes Wear Light Armor and the corrected
three-tier armor progression. Learning finds light training normally, and Walled
Communities visibly grants it with ordinary light armor.

## Local references and assets

Ability cards render the existing bundled narrative, details, outcomes and
rulings. Other creation choices use `web/data/references.json`, containing the
catalog's pinned source text and hashes. In-page reference windows do not send
players to GitHub. These browser references do not replace the required native
rules JournalEntry compendium and accessible world-journal import workflow.

The forest/gold/parchment palette, Cinzel and EB Garamond, tier diamonds and
discipline symbols derive from the book. `web/assets/provenance.json` records
the exact source commit and original image hashes. The crest is resized to
240px and symbols to 80px WebP; no creature-portrait pack is shipped to the web
builder. Existing font OFL notices are copied. HOL licensing remains undecided.

## Build, tests and publishing

Use Node 24 and `npm ci`, then:

```sh
npm run build:workshop
npm run test:workshop
```

The browser fixture serves under `/heroes-of-legend-foundry/` to exercise the
GitHub Pages base path. It checks keyboard tabs, editing, references, eligibility,
JSON download/import, reload persistence, new-character creation and 390px
layout, and records screenshots under `test-results/workshop/`.

Native import validation requires a freshly launched isolated test world with
former coordinator browser windows closed:

```sh
HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 node scripts/check-workshop-import.mjs
```

It imports through the actual file chooser, reviews and commits through the
normal service, checks HP 25 and granted Items for Borin, then removes fixture
Actors/messages and restores coordinator settings. It must not run against a
campaign world.

The Pages workflow runs browser checks before deploying `dist/workshop` from
main. PR validation also runs those checks. Repository Pages uses Actions as its
publishing source. No system release is created by publishing the workshop.

## Validation recorded for #155

- Node 24 `npm run check`: 375 tests passed, including all six portable reference
  heroes, incomplete draft round trips, malformed-input rejection and campaign
  language differences.
- Chromium: desktop and 390px screenshots inspected; icon navigation, keyboard
  tabs, local rules, edit mode, browser persistence, download/reimport, disabled
  ineligible choices and a fresh Reed build passed with no browser errors.
- Foundry 14.369 in the disposable `hol-development` world: actual file chooser
  import, review and existing authority commit produced Borin with HP 25 and
  granted Items. Fixture Actors/messages were removed and settings restored.
- Author review, not independent review. No workers were delegated this issue.

## Validation recorded for #158

- Node 24 full build, data validation and unit suite: 380 tests passed.
- Expanded Chromium fixture: fixed panel scrolling and stationary DP/header/tabs;
  immediate attribute updates; readable origin grant options; granted armor,
  ranged weapon and ammunition on Equipment; supply dice and Bulk; equip/remove
  DR changes; basic-action visibility; repeated crafting rolls; level DP spending
  and reversible level plans; explicit coin override; named Save/Load across
  reloads; existing keyboard/reference/import/export and narrow-layout checks.
- Desktop Main, learning, Equipment and library screenshots plus 390px sheet
  and abilities screenshots inspected. No browser errors.
- Foundry 14.369: later-level file rejected before draft mutation; level-1 file
  chooser import, Review and normal authority commit passed with Borin HP 25
  and granted Items. Fixture documents removed and coordinator settings restored.
- Direct implementation and author review; no delegated workers.

## Play controls and signature choices (#162)

Pronouns are no longer a visible field. Abilities uses compact action tables;
clicking a name opens its complete local reference. Inventory allows adding a
catalog item and quantity directly, or deleting any row, including grants.
These edits preserve the creation ledger and do not rerun grants, spend coins or
charge DP. All item types have Held, Worn and Carried checkboxes. Clearing Carried
clears Held and Worn; setting either marks the item carried. Only carried items
contribute Bulk, with the existing single worn-outfit exemption. Armor still
requires the matching training to grant resistance.

Character allows adding/removing known or custom languages with spoken/signed
and written permissions. Main has a compact Conditions box with add/remove
controls, rating or duration, and starred persistence where applicable. Conditions
use the shared condition vocabulary and validation. This browser tracker is
manual: adding a condition does not run native turn timing, damage or enforcement.
Play edits survive autosave, named saves and portable JSON without rewriting the
hero's creation identity.

Development uses **Spend DP** whenever current advancement DP is positive. It
also remains available to revisit purchases already planned at that level.
Missing level 1, 3 and 7 signatures each get their own **Choose level N signature**
button and screen, independent of spending DP. Choosing a missed signature at a
later level records it at its actual tier, without extra awards or duplicate
acquisitions. Missing signatures do not block learning purchases.

Guard rank itself grants no equipment. Shielding Step grants an ordinary shield
if absent. Walled Communities' Guard + Shielding Step alternative therefore
supplies a shield. The Armor alternative is awaiting canonical correction in
[book issue #1270](https://github.com/bruceamoser/heroes-of-legend/issues/1270):
Bruce directed it to grant Wear Light Armor, and medium armor to require multiple
Armor ranks. The issue now contains the inferred three-step progression and
required Borin/catalog updates; the web build still uses the pinned pre-correction
book edition. This is a known content dependency, not a completed light armor fix.


### Validation for #162

- Node 24 full build, catalog validation and unit suite: 385 tests passed.
- Chromium: tabular abilities and local detail dialogs; all-item Held/Worn/Carried
  behavior; inventory add/delete including grants; editable languages and
  conditions across reload/JSON transfer; independent signatures and unfinished
  signature acquisitions; 900px/970px viewport checks plus 390px layout.
- Main, Inventory, signature choice and Foundry-sized sheet screenshots inspected.
- Foundry 14.369: schema-3 file chooser import retained play edits in the saved
  draft; Review and normal authority commit produced Borin HP 25 with granted
  Items. Later-level import rejection remained intact. Fixture Actors/messages
  removed, settings restored and the isolated test server stopped.
- Direct implementation and author review; no delegated workers. Review caught
  and fixed access to an unfinished signature equipment choice and edge-tab
  clipping at viewport widths just above the centered-sheet breakpoint.


## Main density and creation purchase removal (#164)

Main starts immediately with action tables; its redundant title and Create /
develop button are removed. Creation and advancement remain accessible from
Development. The right column is ordered **Passives, Ancestry traits, Defenses,
Conditions, Movement & carrying, Supplies**. Passives and traits retain compact
clickable rows with local details. Condition controls stay together inside their
box below Defenses. Desktop action rows, headings and supporting boxes use tighter
spacing; the common header, hanging tabs and independent content scrolling remain.

The creation Equipment step places a remove button on each purchased starting
inventory row. It removes that specific purchase and refunds its full coin cost,
without deleting a granted copy of the same equipment. The separate removal list
is gone. Creation inventory and its balance show the original creation receipts,
so a subsequent sheet-side removal cannot hide a purchase from correction.

Bruce confirmed that the current universal Shield Block rule resolves his shield
question; no new training requirement or shield labels were added. The temporary
book clarification issue #1271 was closed as answered.

Validation: Node 24 build/catalog checks and all 385 unit tests passed.
Expanded Chromium checks cover right-column order, passive/trait
detail dialogs, keyboard return to Main, and direct purchase removal after a
sheet-side deletion (including preservation of a same-type granted shield and
coin/Bulk restoration). Desktop, 900px window and mobile screenshots inspected.
No native Foundry behavior or portable schema changes in this pass.


## Recipes and compact tables (#166)

Recipes have a dedicated hanging tab, visible only while the character owns at
least one recipe. Recipe entries are removed from Main and Inventory. Each owned
recipe remains visible even without a matching learned crafting ability; available
crafting rolls and local references live together here. Keyboard navigation follows
the visible tabs, reload retains the selected tab, and a saved Recipes selection
falls back to Main when the current character has no recipes.

Abilities starts with a compact table of known disciplines and their actual ranks,
with names opening local references. It remains visible above search and filtering.
Inventory uses narrower numeric/control columns and tighter rows while retaining
sources, supply dice and all play controls. Abilities uses tighter controls and
brief summaries, with full text available by clicking a name.

Crafting roll sliders label **Banes** on the left and **Boons** on the right. The
center shows the selected count (or Even), also exposed as the accessible slider
value. Negative values remain Banes and positive values remain Boons.

Validation: Node 24 full checks passed, including all 385 unit tests. Chromium
checks cover conditional tabs, keyboard navigation, reload and stale-tab fallback,
discipline references, both slider ends and repeated rolls. Desktop Abilities,
Inventory, the roll dialog and 390px Recipes screenshots were inspected. No native
Foundry behavior or portable schema changes in this pass.


## One-DP abilities and rules update (#168, #169)

The six approved shared abilities are purchasable for their printed 1 DP at level
0, level 1 and later. Another Tongue and A Party Piece expose their language and
performance choices next to the learning choices. Known languages appear disabled;
ordinary unknown languages remain selectable. Clicking a learned Party Piece shows
the recorded specialty. Clicking learned Message by Heart opens the usual local
reference with a saved message field (up to 50 words). These values survive browser
reload and portable export/import.

Old-baseline saves receive an explicit rules-update review and an original named
backup. Walled Communities uses the corrected light-armor grant; purchased choices
remain for repair rather than silently being replaced. See the [source update](research/book-update-one-dp-armor.md)
for existing Actor behavior and the native JSON import boundary.

The v16.3.0 discipline expansion adds 62 shared abilities and updated culture and
background pairs. Previous-edition characters keep their original selected pair
through an explicit rules review, with a named original backup. The origin
selector marks that retained choice and offers the current alternatives. New
characters see only the current pairs. Saved purchases, play notes and equipment
arrangements survive the update; no new ability is bought automatically.
