# Creature catalog intake — issue #118

`static/data/creatures.json` is the deterministic, source-locked reference
catalog for all 192 DA creatures. It does not create Actors, Items, compendiums,
or gameplay automation.

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

## Deliberately pending

- Native creature Actor and compendium construction.
- Monster ability Item import and typed specialty-action adapters.
- Native Basic Melee, Defend, Opportunity Attack and maneuver execution.
- Native summon spawning, command, tether and healing workflows (D06-D07).
- Automatic loot, encounter-budget integration, and runtime sheet rendering.

These are reference catalog records, not a claim of completed specialty action
automation or encounter playtesting.
