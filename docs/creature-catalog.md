# Creature catalog intake — issues #118 and #122

`static/data/creatures.json` is the deterministic, source-locked reference
catalog for all 192 DA creatures. Issue #122 projects it into a native Actor
compendium. Specialty actions and their exceptions remain reference-only.

## Reproduction

Use Node 24 and a local copy of the book repository. The importer reads only Git
objects at the commit pinned by `content/source-lock.json`; it never reads the
book worktree files or writes to the book repository.

```sh
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend node scripts/import-creatures.mjs
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend node scripts/import-creatures.mjs --check
```

Equivalent package commands are:

```sh
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:creatures
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run validate:creatures
```

The checked-in native Actor projection is verified without writing files by:

```sh
node scripts/generate-creature-packs.mjs --check
```

The equivalent package commands are `npm run import:creature-packs` and
`npm run validate:creature-packs`.

The importer verifies the relevant locked hashes before parsing: all 192 creature
Markdown blobs, 192 portrait blobs, 73 summon-profile blobs, 93 monster-ability
blobs, the art manifest, prompt registry and DA source manifest. Output records
are sorted by stable authored ID. Metadata-only Git tree listings must also match
the locked creature, summon and monster-ability path rosters exactly.

## Contract

Each creature preserves its authored `creature-*` ID, deterministic namespaced
Foundry ID for later adapters, source commit/path/hash, attributes, maximum HP,
ordinary and alternate speeds, size/footprint, Armor DR marker, Evasion, Threat,
Stability, numeric weaknesses/resistances, special weakness references and
immunities.

Main-action tables remain in **player-defense** orientation. Every source cell
and complete table Markdown is retained; parsed outcomes are explicitly named
`weak`, `standard`, and `strong` player-defense outcomes. Maneuver and Reaction
tables are likewise complete and row-aligned. Authored flavor, each specialty
detail section, General details, and design notes remain as exact Markdown.
Specialty mechanics are therefore readable even where no native adapter exists.

`summonLinks` is a separate top-level collection. A creature carries only a
stable summon-link reference, eligibility and source text; it does not absorb or
reverse the attacker-oriented summon profile. `profileImported: true` points to
the separately generated `static/data/summons.json` reference catalog; the link
still contains no actions or native summon state.

Portrait records retain the pinned path/hash, dimensions, alpha flag, manifest
status, prompt ID, generated-source filename where recorded, and the upstream
provenance string. The catalog does not copy artwork binaries, create artwork,
or infer a license. Distribution licensing remains undecided.

Required stat lines and the three action-table headers must match the reviewed
schema. Missing or duplicate IDs, portrait/summon/ability references, malformed
speeds/sizes/mitigations, duplicate action/detail names and incomplete outcome
columns abort the import. There is no warn-and-skip path.

## Native Actor pack — issue #122

`content/packs/creatures/` contains 192 generated native `creature` Actor
documents. Their IDs are the catalog's namespaced 16-character IDs; their
`heroes-of-legend` flags retain the exact authored ID, `{ path, sha256 }` source,
pinned commit, classification, ability-source references and summoning metadata.
The shared `content/packs/index.json` records all three content packs, their
catalog versions, counts and semantic hashes.

The Actor data preserves attributes, maximum HP, signed CV, ordinary and alternate
Speeds, footprint/label, Armor DR marker, Evasion, Threat, Stability, numeric and
narrative weaknesses/resistances, immunities, Basic Melee and the player-defense
orientation. Numeric and special mitigation data is reference-only; this pack
does not add new damage-resolver behavior. Signed CV is already supported even
though the reviewed 192-record roster currently contains no negative-CV record.
The guarded native fixture therefore creates a clearly marked synthetic negative
Actor and deletes it immediately.

Actions, specialty details, General details and design notes are stored as
pinned Markdown with relative book links rewritten to immutable GitHub URLs. The
Actor sheet safely converts the supported authored subset to escaped HTML before
V14 TextEditor enrichment and renders the result in a read-only source-reference
section. Headings, tables, paragraphs, strong/emphasis text and pinned source
links are supported; hostile HTML, unknown protocols and other plain prose are
rendered as escaped text. The specialty coverage label and flags remain
`pending`; no imported prose supplies a handler. Existing Basic Melee
declaration/Defend and printed-Armor behavior remain in use.

Native prototype Token width and height use the printed footprint in grid squares;
rectangular footprints retain their source orientation. Creature Actors use Foundry's native fallback portrait. The pack does not copy
portrait binaries, set a book-local image path, or depend on the artwork pipeline
tracked separately by #119.

## Deliberately pending

- Monster ability Item import and typed specialty-action adapters.
- Native Basic Melee, Defend, Opportunity Attack and maneuver execution.
- Native summon spawning, command, tether and healing workflows (D06-D07);
  all 73 attacker-oriented profiles are imported into the separate
  `static/data/summons.json` reference catalog, but no native summon runtime
  exists yet.
- Automatic loot, approved artwork paths, encounter-budget integration, and
  runtime sheet rendering.

The native Actor pack is not a claim of completed specialty-action automation or
encounter playtesting. Generated-file and schema validation are source-level
evidence only; Foundry native import and sheet acceptance (T108) remain pending.
