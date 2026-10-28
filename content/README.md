# Pinned content metadata

`source-lock.json` records immutable book inputs, hashes, portrait provenance and summon links. The current approved source is `d67e046466bdd5052360b96ed91861d607091446` (book PR #1278; Foundry issue #171). `static/data/choices.json` is the generated learning catalog used by character development: 419 ability records (18 universal, 401 purchasable), 4 ancestries, 20 traits, 50 origins, 10 classes and 18 disciplines.

`static/data/creatures.json` is the separately generated intake catalog for all
192 creatures, with complete player-defense action tables, authored reference
text, exact portrait provenance and distinct summon links. It deliberately does
not build native creature/summon packs or claim specialty-action automation. See
[the creature catalog contract](../docs/creature-catalog.md) for reproduction,
failure behavior and pending adapters.

`static/data/summons.json` is the separately generated reference catalog for all
73 summoned forms. It preserves complete pinned Markdown, typed profile stats,
attacker-oriented attack rows, target/rider prose, command/controller/tether and
healing limitations, and explicit Basic Melee and Defend references. It does not
create a separate summon Actor or compendium. A summon is a standard creature
Actor carrying a summon profile flag; spawn, command, tether and healing
automation remain table-managed. See [summon profiles](../docs/summon-profiles.md).

Rebuild with Node 24 and `HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:choices`; verify with `npm run validate:choices` using the same environment. The importer reads Git objects at the locked commit and verifies every source hash. Display-name changes do not change an authored ability's ID. Foundry IDs are deterministic 16-character hashes of the namespaced stable identity; collisions fail validation. Sources without an authored ID use their explicitly recorded path-derived identity, so a future file rename requires a reviewed alias/migration rather than implicit identity replacement.

The catalog includes creation grants, class rank prices/signature options, coin/HP/Speed contributions and learning requirements. Ability records also carry a separate `reference` payload with authored flavor and structured plain-text rules: action, attribute, target, time, duration, acquisition details, limits, rule paragraphs, exact Weak/Standard/Strong outcomes and explicit addenda. Source HTML is data only and is escaped by the native templates. Reference prose never changes parsed eligibility or automation metadata. The reviewed Use a Healing Potion source removes the contradictory spell paragraph; the importer preserves that corrected text rather than restoring it from history.

This is reference text and learning metadata, not imported art or complete per-card automation. Every record is explicitly marked `automation: pending`; the creation/advancement acquisition UI separately identifies the two reviewed native actions and labels all other records as play automation in progress. Universal actions are never purchasable. Purchase repeatability distinguishes once-only abilities, Conditioned Body's per-level limit and Ordinary Recipe Study's new-recipe choices. Ordinary repeatable *use* is not repeatable purchase. Known-compatible crafting is a capability requirement, not a fabricated named-card chain. Trait effects, acquisition equipment/recipe choices, costs during use and outcome handlers need their reviewed adapters. Licensing remains undecided; no release package is published by these scripts.

## Native Item pack sources — issue #115

`packs/abilities/` contains one generated authored source per all 419 source-locked ability records, including the 18 universal references. `packs/equipment/` contains one source per all 44 source-locked equipment records. `packs/index.json` records the shared source commit, supported catalog schemas, counts and semantic hashes for both Item packs.

Regenerate after an intentional catalog change with Node 24:

```sh
node scripts/generate-item-packs.mjs
node scripts/generate-item-packs.mjs --check
```

The generator fails unless `choices.json`, `inventory.json` and `source-lock.json` agree on the same commit, every record source exactly matches its lock entry, the counts remain 419/18 and 44, and every stable Foundry ID is a unique 16-character hash of `heroes-of-legend:<catalogId>`. Ability IDs must also match the existing `foundryId` in the learning catalog. Authored filenames use the stable HOL catalog ID; document IDs do not depend on display names.

Each Item stores its exact source path/hash and immutable source commit in `flags.heroes-of-legend`, using the same `catalogId`, `source` and pack model shape as creation/advancement Items. A compendium Item by itself is only a copyable prototype: it carries no creation grant, acquisition receipt, quantity grant, embedded effect or free-use transaction. Equipment prototypes default to quantity 1, Bulk from the inventory catalog, hands 0, held false, worn false and the catalog's normal supply die (or 0 when none is recorded).

Ability `system.description` is generated rich HTML from the complete authored reference: flavor, metadata, rule paragraphs/lists, exact outcomes, addenda and source link. Every authored string is escaped before the fixed HTML structure is added, and the manifest declares `system.description` as an HTML field for native sanitization. This text is display/reference data; it does not turn prose into an automation handler. The reviewed Defend and Shield Block definitions supply their explicit labels and handler identities. Every other Item is labeled as reference-only/play automation in progress and has no invented handler.

The editable JSON is the only pack source in Git. `scripts/build.mjs` verifies it against the locked catalogs and compiles both packs with the pinned official Foundry CLI into `dist/heroes-of-legend/packs/`; compiled LevelDB databases are not tracked. The system manifest exposes them as `heroes-of-legend.abilities` and `heroes-of-legend.equipment`.

## Creature runtime art — issue #119

`static/assets/creatures/` contains one WebP derivative for each distinct approved portrait blob in the source lock. Paths are stable content addresses (`<source-sha256>.webp`), so future mappings that share identical source bytes share the same runtime file. `manifest.json` sorts asset and portrait records and records the pinned source commit/path/hash/provenance, original and derived dimensions, alpha facts, output hash/bytes, encoder versions and settings. It makes no distribution-license assumption; rights remain undecided.

The current baseline maps 192 portraits to 192 unique assets totaling **41,666,026 bytes**. Issue #213 fits each derivative inside a 768px maximum edge using Lanczos resampling, preserving the full aspect ratio without cropping and never upscaling smaller sources. Original dimensions remain in portrait provenance; asset dimensions describe the runtime output. Sources include one non-square portrait. The initial encoding is lossy WebP quality 85 with method 6, exact transparent-RGB preservation and alpha quality 100. Source metadata is not copied. The resized alpha channel and decoded WebP alpha bytes are checked for exact equality; source originals and their pinned hashes remain unchanged.

Regenerate only from the pinned Git blobs, using a local virtual environment so no system-wide Python packages are installed:

```sh
python3 -m venv /tmp/hol-creature-art-venv
/tmp/hol-creature-art-venv/bin/python -m pip install -r requirements-art.txt
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend \
  /tmp/hol-creature-art-venv/bin/python scripts/build-creature-art.py
```

Encoding uses at most eight worker processes after the parent verifies every source hash and original image metadata. Results and manifest records retain deterministic ordering; `--workers 1` reproduces the same bytes sequentially. Worker failures abort before any artifact writes. Progress is printed every 16 encoded assets.

`requirements-art.txt` pins Pillow 12.1.1 and `.python-version` pins Python 3.14.4; the manifest separately records the encoder provenance, including the linked WebP 1.5.0 library. `python3 scripts/build-creature-art.py --check` validates the manifest's exact encoder versions, then uses the available WebP decoder to verify the checked-in asset set, dimensions, alpha, hashes, sizes and canonical serialization without source access. A different capable Pillow or linked WebP decoder may perform that read-only verification; it does not replace the encoded provenance. Regeneration records the environment's actual Pillow and WebP encoder versions, so any version change appears in the reviewed manifest diff. `node scripts/validate-creature-art.mjs` additionally performs release-oriented container and cross-reference checks against the pinned encoder baseline. Missing, extra, stale or unreferenced assets fail; PNG/lossless masters and QA/reference images are never part of this directory.
