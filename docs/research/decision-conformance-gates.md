# Decision conformance verification (#263)

Successful source locking, builds and artifact equality do not establish that a
recorded decision survived its source, parser, renderer and supported runtime
adapter. Keep those checks and run the independent gates below before a release.
Use Node 24 and set `HOL_BOOK_REPOSITORY` to the canonical book checkout containing
the immutable commit recorded in `content/source-lock.json`.

## Before publication

After intake and authored Item-pack regeneration:

```sh
node scripts/audit-rule-rendering.mjs
node --test tests/decision-rule-rendering.test.mjs tests/inline-roll-profiles.test.mjs tests/rule-rendering-audit.test.mjs
```

The first command independently extracts Rules paragraphs/options from all 427
ability and 50 trait Git blobs, verifies their source hashes and requires them
in actual web/native HTML renderer DOM text. It also reads the generated native
Item JSON descriptions, rather than regenerating its own expected descriptions.
Traits are not ability Items; their native reference renderer is checked instead.
The gate checks all 36 manually reviewed, source-guarded inline roll profiles,
both Triage healing branches, Twin Strike's values and all 21 reviewed common
procedures outside Strong-only fields. Report:
`test-results/decision-audit/rule-rendering.json`. Any failure exits nonzero.

Expected rules are extracted without calling the importer. The source fixtures
are audit evidence, not a substitute for approval records. The small regression
tests demonstrate that omitted HP costs, healing values, common restrictions,
options and incorrect Low-Light Vision ratings cannot silently pass.

## After publication

Set the exact corrected versions explicitly; defaults retain the original audit
baseline so historical evidence remains reproducible. Use a fresh cache for each
release to avoid mixing downloaded artifacts.

```sh
HOL_AUDIT_BOOK_COMMIT=<full-book-commit> HOL_AUDIT_RELEASE=<system-tag> HOL_AUDIT_SITE=https://bruceamoser.github.io/heroes-of-legend-foundry/ HOL_PUBLISHED_AUDIT_CACHE=/tmp/hol-audit-corrected node scripts/audit-published-conformance.mjs
HOL_AUDIT_BOOK_COMMIT=<full-book-commit> HOL_AUDIT_RELEASE=<system-tag> HOL_AUDIT_SITE=https://bruceamoser.github.io/heroes-of-legend-foundry/ HOL_PUBLISHED_AUDIT_CACHE=/tmp/hol-audit-corrected node scripts/audit-inline-outcomes.mjs
```

The public audit downloads the real system ZIP, decodes its packs, fetches deployed
web assets and runs the complete authored-text/profile gate using those actual
artifacts and renderer modules. The inline audit retains each reviewed source
hash and common-scope annotation even when the old incorrect Strong cell no
longer exists. It captures the actual Triage, Twin Strike, Reckless Charge and
Mend Item views.

These checks establish transcription, reviewed outcome association and rendering
coverage. They do not replace ledger-to-source review, secondary-reference review,
entry-local PDF checks, actual Foundry adapter/creation acceptance, or playtesting.
Out of Body's current barrier restriction and Snap Back fallback were separately
reconfirmed by Bruce on November 3 (CHG-ODD-014-CONFIRM-20261103); its option-list
rendering correction preserves that text.

## Existing Foundry abilities

Saved world/owned ability copies are preserved. Owners can open an affected
ability and choose **Update rules**, review Current/Updated fields, and apply
corrections explicitly. Only fields still matching the exact v2.7.1 generated
baseline are updated. Customized fields are listed and retained; unknown source
editions are preserved. Names, IDs, notes, grants, effects and character resources
are excluded. Reproduce the 40 baseline records with
`node scripts/build-ability-update-bases.mjs --check`. Native acceptance uses
`check-ability-rule-update.mjs` in an explicitly isolated disposable world.

Relative damage bonuses and unsupported damage labels remain printed for table
resolution; they are not offered as standalone absolute damage buttons.

The validation, Pages and release workflows now fetch the exact locked book
revision with a sparse source checkout and require the full rendered-rule gate.
A matching catalog hash or passing unit suite alone cannot publish these outputs.

Native HTML-field canonicalization is covered by two saved disposable copies of
each of the 40 immutable v2.7.1 Items. Seven descriptions decode apostrophe
entities on save. The update manifest accepts only the original fingerprint or
that exact verified persisted fingerprint; it never normalizes a user's value.
The capture records its Foundry version, raw Git blob hashes and successful cleanup.

Editable world books also remain snapshots. Their inline reader identifies a
saved world copy and offers **Read current published rules**, with a return to
the world copy. Full-book navigation keeps that explicit edition choice. The
current language reference was exercised in the native reader without changing
the saved journal. Use `node scripts/check-published-rule-choice.mjs` with the
same isolated-world safeguards for this acceptance check.
