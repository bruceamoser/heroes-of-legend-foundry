# Native integration of the approved web designs

Issues #209–#214 and #156 carry the approved web screens at `a9ae8a2` into the
Foundry V14 system. The rules/content baseline remains the pinned commit in
`content/source-lock.json`; no rulebook or catalog mechanics were changed.

| Web surface | Native implementation |
| --- | --- |
| Character | Fixed hero header, hanging tabs, play/edit modes, Favorites, Story, inventory quantities, supplies, defenses, wounds, Development and conditional Crafting. Native Actor/Item documents replace browser saves. |
| Creation and advancement | Current Build with unresolved grants beneath their ability, required-choice navigation, separate persistent learning/equipment dialogs, known ranks, discipline filters and repeated overspend confirmation. Existing eligibility and commitment services remain authoritative. |
| NPC and creature | Compact card with fixed attributes and seven combat statistics, scrolling action tables, full rules, native attack declarations, editable portrayal and explicit profile selection. NPC portrayal is an optional view of the existing creature Actor type. Hiding a profile preserves its statistics. |
| Ability and equipment | Compact content-sized cards, discipline/category icons on native Items, explicit Edit, native rules/chat/action controls and capped resupply. |
| Rolls and chat | Native targeting and existing action handlers, seven direct net choices alongside the slider, retained/discarded dice by original index, readable outcome cards and existing privacy checks. |
| Combat | Native tracker rows grouped by side, visible action budgets and existing choose/finish/conversion controls. Core token controls and hidden-participant restrictions remain. |
| Recovery and wounds | Owner healing, safe breath and confirmed Grit expenditure; explicit additional-wound recording; owner ordinary wound application; treatment progress reaching RV removes only treatable effects and retains scars. DA anatomy exceptions, lost-dice recovery and corrections remain explicit. |
| Conditions | Owner source editing and repeatable combined Burning/Freezing/Bleeding damage. Apply does not decay sources; Bleeding bypasses resistance. Ordinary turn processing remains separate. |
| Crafting | Known recipes and learned crafting permissions, persistent projects, immediate rolled progress and catalog products/supply steps, saved-result continuation and DA recovery of uncertain retained dice. |
| Rules library | Searchable native JournalEntry packs for all 1,018 pinned Markdown references, with player/DA audiences, local links, collection/full-text search and explicit imports preserving existing edited world entries. Deterministic IDs prevent duplicate concurrent imports. |

Zero quantity is a retained inventory stack. It contributes no Bulk, hand use,
armor/shield benefits, weapon attack or potion use. Resupply can correct its die
without creating quantity. New resource operations use the existing single-writer
coordinator and persistent receipts; crafting reserves dice before evaluating them.

The UI does not imply generic automation for every specialty card. Printed time,
tools, materials, geometry and specialty outcomes remain table judgments where
there is no reviewed native handler. Crafting does not advance world time or
automatically consume optional carried materials. Existing inventory checks remain
available for those uses. Summon lifecycle remains manual.

## Building and validation

`npm run import:native-journals` regenerates the journal sources from immutable Git
objects in `HOL_RULES_REPO` (default: the sibling rulebook checkout), checking every
source hash. Normal builds require no rulebook/network access and verify coverage,
audiences and generated document hashes before compiling both journal packs.

Run `npm run check` with Node 24. Native integration acceptance is:

```sh
HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 \
HOL_TEST_ISOLATED_WORLD=1 npm run test:native-design
```

This fixture is restricted to an explicitly isolated local world. It creates and
cleans exact test documents, exercises GM/owner/observer behavior, and checks stable
window bounds. `HOL_TEST_SCREENSHOTS=1` additionally captures the native surfaces.
Use a disk-backed `TMPDIR` if the host's temporary filesystem quota is limited.

Author review found and corrected quantity-zero hand/benefit/potion paths,
condition revision updates on treatment, and concurrent journal-import identity.
The startup smoke assertion now checks a current localization key rather than the
removed development-preview label.

Foundry 14.369 acceptance passed with separate GM, player-owner and observer clients:
Grit, crafting, additional wound recording/application, exact-RV treatment, condition
damage, retained empty stacks/resupply/Favorites, observer denial, all 1,018 journal
imports, repeat-import preservation and player local-rule access. No browser errors
were observed; fixture cleanup removed exactly its eight messages, 1,018 journals,
two actors and two users. Node 24 build, validation and all 508 automated tests pass.

Character, NPC/creature and summon portraits use Foundry's inherited image picker.
Owners click the portrait, select an image and use **Save portrait**; this updates
only the image. Observers retain the native full-image viewer. Item directories,
hotbars and cards use approved discipline marks or category illustrations. Existing
core bag defaults are refreshed cosmetically; user-selected artwork is retained.

Native creation and advancement market walkthroughs, sourced-condition editing
(including observer denial and unlinked tokens), and the startup smoke check also
passed on Foundry 14.369.

The 192 runtime creature portraits now fit a 768px maximum edge (Ettin 640×768),
without cropping or upscaling, with resampled alpha preserved. Total runtime art
is 41,666,026 bytes versus 93,699,982 bytes before resizing (55.53% smaller).
Pinned source originals and source hashes remain unchanged. Regeneration supports
1–8 bounded workers with deterministic output; ordinary builds use the checked-in
derivatives. All nine existing web browser suites also passed. CI exposed a builder-view
persistence assertion running before the asynchronous reload render; it now waits
for the exact restored control to become visible.
