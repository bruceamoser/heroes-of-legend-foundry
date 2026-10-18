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
| Main        | Concise Main Action, Maneuver, Reaction and Passive tables; movement/other timings stay explicit. Owned-weapon basics, ancestry traits, recipe rolls, defenses and carrying statistics. |
| Abilities   | Searchable learned abilities, discipline filtering and universal actions.                                                                                                               |
| Inventory   | All grants and purchases, source names, supply dice, quantities, Bulk, carried/worn/held controls and recipes.                                                                          |
| Character   | Ancestry, culture, background, traits, languages, pronouns, player and story.                                                                                                           |
| Development | Current, spent and total DP; level plus/minus; advancement learning; collapsible creation and advancement ledgers.                                                                      |

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

The portable format is `heroes-of-legend-character`, schema version 2 (version 1 remains readable), with a
pinned source commit, creation choices, per-level advancement plans, stable
shopping identities, equipment arrangements, basic-action visibility and an
explicit coin-limit override. The importer whitelists the supported
fields, recomputes eligibility and grants, and never accepts derived Actor
statistics, world IDs, ownership or executable content. Incomplete drafts remain
exportable. Ready-character export requires valid creation and active advancement choices. A different
source edition is rejected without changing the current character. Campaign
language differences remain repairable choices, not imported world settings.

Native transfer: open **Create a Hero** on a new character, select **Import
character JSON**, review, then complete the existing creation workflow. It saves
the imported creation draft; it does not bypass the authority/commit service.
Pronouns/player/story are retained in the portable draft; the current native
sheet does not yet display those new presentation fields. Browser equipment
arrangements and action visibility remain in the saved draft; native import
explicitly tells users to equip Items on the Foundry sheet. Later-level browser
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

The viewport is fixed. Only the content pane scrolls; the common header, icon
rail, wizard footer and contextual strip remain outside it. Learning keeps its
DP balance and current discipline ranks visible. Culture/background options
include the complete discipline/ability grant pair before selection. Attribute
inputs update the shared header immediately. Equipment shows granted weapons,
ammunition, armor and supply dice before the market list.

Main uses action tables with two-line summaries and complete local reference
windows. Edit mode exposes per-action and per-timing-group basic-action visibility
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
eligibility requirements and signature choices. Current DP is available
advancement DP; spent/total include creation, with expired creation DP separately
identified. The creation ledger stays useful here; do not copy it into the
future native Development tab.

Wear Light Armor is absent from the pinned approved catalog and the current
book design files inspected for #158. A search for it explains that the edition
contains Wear Medium Armor and Wear Heavy Armor. No new rule was invented.

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
