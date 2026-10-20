# Web roll dialog design

The `roll.html` Pages entry opens a working roll dialog with the book's Borin
Bridgekeeper example. Close it to switch between an attribute check, Hook and
Drive, and defense against the pinned Goblin Scrapper's Scrap knife. It reads the
same choices, creature and example catalogs as the other previews; selected
ability rules are embedded, and it does not modify character saves.

The layout reference is Bruce's Neon Relic system, specifically
`src/templates/roll/roll-dialog.hbs` and the roll-dialog section of
`src/styles/_sheets.scss`: grouped compact fields, a prominent dice summary,
ability options and one primary roll action. HOL retains its own palette,
typography and 3d6 rules. No Neon Relic skill, gear bonus, difficulty or dice-pool
mechanics are introduced.

`web/roll-ui.mjs` and `web/roll-ui.css` provide shared presentation for the preview,
character attribute/ability/defense/death dialogs and creature/NPC roll dialogs.
Crafting uses the same slider. The native Foundry templates and execution services
are unchanged in this web design pass.

The Bane/Boon control retains a native −3…+3 range input with arrow/Home/End
keyboard support. Seven labeled buttons offer direct selection. Banes are on the
left, Boons on the right; a center mark, active tick, text label and colored fill
make state readable without relying on color. The dice-count/formula summary uses
the shared `rollPlan` helper and updates with both the attribute and net modifier.
Rolls remain repeatable. No target dropdown, modifier-reason fields or new play
gates are added.

Known abilities are selectable references; selecting one does not invent a
numeric bonus or automatically spend its resources in these web previews.
Apply printed effects using the existing controls and net slider. The native
system's ability execution and authority rules remain separate from this design.

Validation: `npm run test:roll-preview` exercises keyboard and pointer selection,
formula/attribute updates, ability selection and embedded rules, repeated rolls,
defense source outcomes, and 760/390/320px layouts. Existing workshop and sheet
suites exercise the shared controls in their actual entry points. Screenshots are
written to `test-results/roll/` and collected by validation CI.
