# Rules authority and content intake

## Authority confirmed by Bruce

On **October 17, 2026**, Bruce selected the current `design/player-book` and `design/rules` materials as the system baseline and said the DA/bestiary book is being completed in another chat today. He subsequently requested as much automation as possible using Foundry's features.

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
