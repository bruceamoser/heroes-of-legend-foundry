# Rules authority and content intake

## Authority confirmed by Bruce

On **October 17, 2026**, Bruce selected the current `design/player-book` and `design/rules` materials as the system baseline and said the DA/bestiary book is being completed in another chat today. He subsequently requested as much automation as possible using Foundry's features, then confirmed in-dialog abilities and Boons/Banes, prefilled Defend chat workflows, drag/drop and preservation of HOL's visual identity. See [interaction design](interaction-design.md).

Order of authority:

1. Bruce's latest explicit decisions.
2. Dated approval/correction records, especially the [player-book decision log](https://github.com/bruceamoser/heroes-of-legend/blob/3a08c5b1aa68be45885e488479e4984d169cd115/design/player-book/decision-log.md).
3. Current approved design rules, player manuscript, shared cards and catalogs; apply later corrections where the released PDF lags.
4. The completed DA/bestiary sources once their revision and approval are recorded.
5. Historical prose only as context. Legacy Quarto rules, old playtests and superseded GitHub specification issues do not override current decisions.

The [player-book README](https://github.com/bruceamoser/heroes-of-legend/blob/3a08c5b1aa68be45885e488479e4984d169cd115/design/player-book/README.md) records approval of all active open proposals on October 15. Old per-card “Proposal” labels are retained historical metadata, not a reason to reopen every entry. Withdrawn proposals remain withdrawn. The October 16 decisions include weakness, collision placement, minimum-damage wound selection, NPC-only resolution, summon healing payment, tangible energy forms and nearest-square tether measurement.

## Reproducible research baseline

The published book-repository main inspected was commit **`3a08c5b1aa68be45885e488479e4984d169cd115`**. The working checkout also contained later DA PDF work and uncommitted changes owned by the other chat. Those changes were not edited or imported. This is a baseline for planning, not a claim that the DA book is finished.

[`source-baseline.json`](source-baseline.json) records the revision and source families. Before the production content import, replace the pending DA revision with its actual completed commit/release and review a diff. Do not continuously pull moving `main` during builds or silently change rules when a PDF is rebuilt.

| Source family | System responsibility |
|---|---|
| `design/rules/foundations.md`, `session-resolution.md`, `stability.md` | Rolls, attack perspective, damage, weakness, movement, interruption and latest corrections. |
| `design/rules/conditions.md`, `recovery.md`, `wounds.md` | Conditions, death, Grit, 5 wound tables, treatment and scars. |
| `design/development.md`, player creation/discipline chapters | Staged creation, class prices, DP ledger and advancement. |
| `design/card-conventions.md`, `design/cards/*.md` | Shared action contract, complete outcomes, costs, timing and individual abilities. |
| `design/ancestries`, `origins`, `classes`, `disciplines`, `equipment`, `recipes` | Character choices and grants, inventory and crafting. |
| `design/player-book/manuscript`, presentation overrides and decision log | Approved reader-facing explanations and known editorial corrections. |
| `design/bestiary/creatures`, `design/monster-abilities`, `summons`, `procedure.md` | DA attacks, explicit summon profiles and perspective mapping. |
| Completed `design/da-book` sources and shared source manifest | DA reference, encounters, adventure content, artwork links and final coverage. |

At the pinned revision there are 350 card files, 10 class files, 18 discipline files, 24 ancestry files (ancestry entries plus traits), 50 origin files, 43 equipment files, 10 recipe files, 192 creature files, 94 monster-ability-directory files (including its README) and 73 summon files. These are planning inventories, not hard-coded release totals or a balance certification. Enumerate stable record IDs and actual kinds during intake; do not infer them from filenames or assume each Markdown file is one Foundry document.

## Content pipeline

1. **Fetch a pinned revision.** Record repository, commit, path, stable HOL ID, source hash, applicable decision overrides and rights/attribution for every record.
2. **Parse into reviewable intermediate records.** Keep narrative and full rules separate. Extract structured metadata, but never infer automation from flavor prose. An unsupported or ambiguous field produces an explicit review error.
3. **Author an automation adapter per behavior.** Use typed outcomes, conditions, costs, targeting and event triggers. Unique behavior gets a reviewed handler keyed by a stable identifier. No arbitrary script strings in imported content.
4. **Apply documented editorial overrides.** Example: the decision log excludes a contradictory “this spell” paragraph from the universal potion card. Preserve that correction instead of importing the raw card blindly.
5. **Validate references and coverage.** Every grant, class signature, prerequisite, recipe product, summon category/profile, wound remedy, image and UUID must resolve. Every entry receives an automation coverage classification and acceptance fixtures.
6. **Compile and round-trip packs.** Use a validated official CLI version; check embedded Items, effects and Journal pages survive. Stable Foundry IDs derive from HOL ID plus pack namespace through a checked mapping, never display names.
7. **Review content changes before release.** Report additions/removals, mechanics changes, hashes and changed automation. World items remain owned snapshots; present an explicit update diff and preserve local edits.

The importer reads authored Markdown and source metadata, not extracted PDF layout. The PDF is useful for visual comparison. The completed DA book may reorganize presentation without changing shared IDs; its source manifest is the reconciliation input.

## DA/bestiary completion gate

The repository has a dedicated follow-up issue for final intake. Completion requires the final source commit, confirmation of which artifacts are approved, inventory reconciliation, player/DA attack-table orientation checks, summon eligibility and exclusions, asset-path checks and a playable encounter fixture. Existing 192/73 counts must be rechecked. No need to delay the core rules engine while this gate is pending.

## Completed-book intake — October 17, 2026

Bruce confirmed both books complete and authorized continued implementation. The new immutable baseline is **9f1663f774164a014edcb879c50fcf02989d791b**. [`content/source-lock.json`](../content/source-lock.json) supersedes the historical research hashes for content work. It records source hashes, authored IDs, 192 portrait hashes/provenance entries, and the 73 explicit summon-to-creature links. The author's working checkout contains unrelated changes; intake reads Git objects at the pinned commit without modifying that checkout.

Compared with 3a08c5b, all 192 creature records, 93 monster ability records and 73 summon profiles are unchanged. Creature tables retain player-defense orientation; summon profiles retain attacker orientation, explicit eligibility, no healing and no independent Reactions. October 16 corrections remain in force. DA presentation now explains the universal Basic Melee, Defend and Opportunity Attack choices; do not lose those actions when importing compact PDF layouts. Import authored Markdown, not the PDF's presentation omissions.

The material rules addition is the shared language reference: Common plus one named ordinary home language, explicit extra grants, spoken-only restrictions and campaign-adjustable availability. Six reference characters now include languages. Translate the Fragment clarifies that translation does not teach a language. The new text retains an upstream review-status banner; Bruce's later completed-book direction is the intake authority, while the DA can configure campaign alternatives as the text permits. No invented DP price or automatic attribute-based language grants.

The new art catalog maps each portrait by authored creature ID. Hashes are verified directly against Git blobs; image dimensions/transparency are recorded from the upstream manifest, not independently re-certified by this intake. No portrait binaries or book prose are distributed in the system yet. Licensing remains undecided.

Reproduce the immutable audit with `HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend node scripts/lock-book-sources.mjs --check` under Node 24. It fails on changed hashes, duplicate IDs, missing art, missing summon links, unknown perspective or missing summon restrictions. This is source intake, not completed automation coverage or encounter playtesting.

## Current approved baseline: two-book v16.1.0

Issue #72 reconciles the current source at **9bc9b4fe3256e68880b92c45facf0f25b98a1ea3**. The current `design/**` catalog and book sources take precedence over historical research snapshots. See [reviewed changes and compatibility](research/book-baseline-v16.1.0.md). The lock still covers 919 source files, 192 portrait records and 73 summon links; no book checkout or existing world content is modified.

## October 18 armor and one-DP additions

The current pin is **64089a1c8961d7faff172f179448a8b6e57827ef**, following Bruce's
confirmation and the merged book PRs #1272/#1274. It supersedes the v16.1.0 pin
above for new content and development choices. See [source update and existing
character handling](research/book-update-one-dp-armor.md). The new lock covers
927 sources; creature/summon/art mechanics and portrait bytes are unchanged.

## October 18 discipline expansion — v16.3.0

Issue #171 follows approved, merged book PR #1278 at
**d67e046466bdd5052360b96ed91861d607091446**, superseding the pin above for current
content. It adds 62 shared abilities and revises 12 origins. The six one-DP cards,
light-armor correction, Universal actions, signatures, class prices and normal
resource rules remain intact. See the [intake, behavior and migration audit](research/discipline-expansion-v16.3.0.md).

## Current-only application (#173)

Bruce's latest instruction supersedes the optional historical-origin behavior of
#171: the current approved catalog is the only rules version. Saved character
choices are resolved against it automatically. Do not offer old origin pairs or
ask players to approve a rules-version switch.


## October 18 creature action expansion (#175)

The current approved pin is **bdfd18ed535fbd0e1892b9344444abf6da644809**,
merged book PR #1280. It supersedes d67e046 for all current catalogs and web
references: 126 monster templates, 192 creatures, 73 summons, and 419 character
abilities. See the [intake and runtime boundaries](research/creature-action-expansion.md).
Current-only character rules remain automatic. Existing world creature/summon
updates preserve live state and local edits through the sheet's Update profile action.

## October 28 ancestry and class signature review: v16.5.0

The current approved pin is **295e858c1b6fee044a0261bf9f437636efeff2bf**,
book release v16.5.0. It supersedes bdfd18e for all current catalogs and web
references: 20 ancestry traits and 90 class signatures, with stable IDs, levels
and acquisition requirements preserved. Creature, summon, monster-ability and
portrait counts are unchanged. See the v16.5.0 production baseline.
