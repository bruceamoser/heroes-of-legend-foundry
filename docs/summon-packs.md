# Native summon profile references — issue #128

The `summons` Actor compendium contains 73 distinct summoned-form references from
`static/data/summons.json`, pinned to book commit
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3`. Their stable identities differ from the
linked ordinary creature entries. Generation verifies each complete Markdown
source hash and reparses it against the source lock before accepting typed fields.
It preserves the complete source, eligibility, six attributes, HP, movement,
footprint, printed defense modifier, Stability, mitigations and attacker outcomes.
Basic Melee's printed variants are 1/1/2, 1/2/4 and 2/3/5 Physical damage.

Import a profile from the compendium to read its HOL sheet. The source reference
uses escaped text, formatted tables and pinned book links. Ordinary character
creation, advancement and healing controls are absent. Native prototype Tokens
carry the printed width and height; importing a reference creates no Token,
controller identity, command budget or active effect. Existing world Actors are
never refreshed or overwritten by generation. Fallback icons are intentional;
shared portrait mapping belongs to issue #124.

Command/spawn/controller/tether and specialty handlers remain pending. The sheet
keeps the command packages, one command per controller turn, no uncommanded
activity or alerts, no independent Reactions or opportunity attacks, controller
turn anchors, six-square nearest-occupied-square tether, controller/0-HP
disappearance, no healing and no permanent loot restrictions readable. Table
judgment and manual handling remain appropriate while lifecycle automation is
separate work. A reference import does not grant a general creature or character
attack workflow to a summon.

`npm run import:summon-packs` regenerates the shared authored pack tree;
`npm run validate:summon-packs` checks exact sources. The shared build compiles
Items, creatures and summons through the official Foundry CLI. Automated tests
cover every profile and semantic CLI round trips without changing the book.
Distribution licensing remains undecided.

Native acceptance is pending. Run `npm run test:summon-packs` only with explicit
`HOL_TEST_URL`, `HOL_TEST_ALLOW_WRITES=1` and `HOL_TEST_ISOLATED_WORLD=1` against an
unoccupied disposable Foundry 14.369 world. The fixture validates all 73 native
models, imports their stable IDs, checks representative sheets and ordinary
Actor-directory drag/drop, then deletes only its tracked Actors and verifies
preexisting Actors and scene Token identities are unchanged. Inspect its sheet
screenshots as well as the process exit and cleanup report. This fixture has not
yet been run for issue #128.

Local validation on the issue #122 integration base `804d273`: Node 24.22.0
`npm run check` passed build, package/artwork validation and 264 tests, including
two official CLI semantic round trips for all 73 summon documents. A read-only
`HOL_BOOK_REPOSITORY=… node scripts/import-summons.mjs --check` also verified the
73 pinned profiles and linked creature/rules Git blobs. This records local checks,
not native Foundry acceptance. Rebase onto the subsequently merged Basic Melee
and creature-footprint work remains an integration step before native testing.
