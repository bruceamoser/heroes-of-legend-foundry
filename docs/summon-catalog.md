# Summon reference catalog — issue #123

`static/data/summons.json` is the deterministic, source-locked reference catalog
for all 73 player-eligible summon profiles. It is deliberately separate from
`creature` Actors and from the DA creature catalog. A record is a profile
reference (`kind: "summon-profile-reference"`), not a spawn, an Actor, an Item or
a compendium document.

## Reproduction

Use Node 24 and a local copy of the book repository. The importer reads only Git
objects at the commit pinned by `content/source-lock.json`; it does not read the
author's working-tree edits or write to the book repository.

```sh
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend node scripts/import-summons.mjs
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend node scripts/import-summons.mjs --check
```

Equivalent package commands are:

```sh
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run import:summons
HOL_BOOK_REPOSITORY=/path/to/heroes-of-legend npm run validate:summons
```

Before parsing, the importer verifies the exact Git tree and SHA-256 hashes for
all 73 summon profiles, all 73 linked creature cards and the shared summoning
rules source. It rejects duplicate profile IDs, paths or creature links; missing
or extra roster entries; unknown attacker orientation; malformed eligibility;
missing source links; and hash drift. There is no warn-and-skip path.

## Record contract

Every record preserves:

- The stable `summon-*` ID from `source-lock.json`, a deterministic namespaced
  Foundry ID for later adapters, and the linked stable creature ID.
- The pinned repository, commit, source path and SHA-256 hash, plus pinned
  creature-card and summoning-rules references.
- The complete authored Markdown in `reference.sourceMarkdown`, including prose,
  tables, headings and trailing source links.
- Six attributes, maximum HP, ordinary and alternate Speed, square footprint,
  printed defense modifier, Stability and its authored qualifier.
- Numeric resistances as typed `ordinary` entries, condition immunities, and
  nonschema weakness/rider prose as typed `special` references. Special prose is
  retained verbatim and is not guessed into damage arithmetic.
- Senses, communication, eligibility, carrying capacity and anatomy limits.
- A structured command limit and controller anchor, one-command-per-controller-
  turn limit, immediate-summoning count, no uncommanded activity or alerts, no
  Reactions or opportunity attacks, controller-turn ticking, six-square tether
  boundary, disappearance conditions, zero-HP no-body behavior, no permanent
  loot and only explicitly stated summon-chain restrictions.
- The complete healing restriction, including potion prohibition or the explicit
  healing-harmed conversion, and any authored offensive-healing defense prose.
- Full attacker-oriented specialty attack tables, exact Weak/Standard/Strong
  cells, attack attributes/modifiers, and one complete target/rider prose
  reference per row.
- The complete source-specific Basic Melee reference, including the printed
  `1/2/4`, `2/3/5` and `1/1/2` outcome variants, plus the complete per-profile
  Defend reference.
- Specialty Main Actions, Maneuvers, passives and note prose as separate
  reference records with an explicit pending automation state.

Summon tables remain in **attacker** orientation. Creature tables remain in
**player-defense** orientation. The importer never reuses, mirrors or infers one
table from the other.

Required metadata, action-table headers and columns, fields, source links,
profile layout, command/controller/tether paragraph, healing pattern, Defend
text, Basic Melee grammar and known printed outcome variants fail closed on an
unknown form. `scripts/content/summons.mjs` exposes the pure parser and catalog
summary for tests.

## Validation

`tests/summons.test.mjs` checks six byte-exact source fixtures, offline
reconciliation of all 73 generated records, complete-source hashes reconstructed
from `reference.sourceMarkdown`, attack-row/detail alignment, references, typed
mitigation, source-specific Basic Melee values and adversarial schema, hash,
duplicate and link failures.

The catalog makes no claim of native automation. Summon Actor construction,
spawning, command spending, controller phases, nearest-square tether enforcement,
healing payment, disappearance cleanup and compendium packaging remain later
issues. Artwork, licenses or distribution rights are not inferred.
