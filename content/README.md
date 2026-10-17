# Pinned content metadata

`source-lock.json` records immutable book inputs, hashes, portrait provenance and summon links. `static/data/choices.json` is the generated learning catalog used by character development: 350 ability records (18 universal, 332 purchasable), 4 ancestries, 20 traits, 50 origins, 10 classes and 18 disciplines.

Rebuild with Node 24 and `HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:choices`; verify with `npm run validate:choices` using the same environment. The importer reads Git objects at the locked commit and verifies every source hash. Display-name changes do not change an authored ability's ID. Foundry IDs are deterministic 16-character hashes of the namespaced stable identity; collisions fail validation. Sources without an authored ID use their explicitly recorded path-derived identity, so a future file rename requires a reviewed alias/migration rather than implicit identity replacement.

The catalog includes creation grants, class rank prices/signature options, coin/HP/Speed contributions and learning requirements. Universal actions are never purchasable. Purchase repeatability distinguishes once-only abilities, Conditioned Body's per-level limit and Ordinary Recipe Study's new-recipe choices. Ordinary repeatable *use* is not repeatable purchase. Known-compatible crafting is a capability requirement, not a fabricated named-card chain.

This is factual learning metadata, not imported book prose/art or complete per-card automation. Every record is explicitly marked `automation: pending`. Trait effects, acquisition equipment/recipe choices, costs during use and outcome handlers need their reviewed adapters. Licensing remains undecided; no release package is published by these scripts.
