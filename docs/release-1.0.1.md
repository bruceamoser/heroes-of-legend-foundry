# Release 1.0.1 visual patch checklist

Issue #218 records two findings from the installed 1.0.0 item-card review:
read-only item-stat values inherited a pale Foundry foreground on the HOL ivory
surface, and the window title displayed the untranslated `TYPES.Item.equipment`
key. Version 1.0.1 corrects the scoped item-stat label/value foreground and adds
the missing **Equipment** localization.

This is a patch candidate. **The tagged artifact, native Setup installation,
upgrade and public publication checks are pending.** The public 1.0.0 release and
its accepted assets remain unchanged.

## Scope

- Item-stat labels and values use the existing HOL ink token against the existing
  ivory background, with no inherited text shadow, in either Foundry theme.
- Equipment sheet titles use the translated equipment type label.
- Package metadata, lockfile and manifest version are `1.0.1`.
- The patch ZIP URL is immutable:
  <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.1/heroes-of-legend.zip>.
- The stable manifest remains:
  <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json>.

The 1.0.0 core rules, document services, content, permissions and operation
receipts are unchanged by this patch. Existing 1.0.0 gameplay validation is
recorded in the [major release evidence](release-1.0.0.md); it does not establish
visual acceptance or installation of the new 1.0.1 ZIP. Specialty outcomes and
summon lifecycle retain their documented manual boundaries.

## Acceptance record

| Gate | Status | Evidence required |
|---|---|---|
| Source review | Pending | Confirm the two UI corrections and version/URL diff without changing gameplay or prior public assets. |
| Build, validation and tests | Pending | Run the applicable release package checks on the candidate. |
| Installed visual acceptance | Pending | In licensed Foundry14.369, open read-only equipment cards in light/dark themes and assert computed foreground/background contrast and translated window title; inspect screenshots. |
| Tagged draft | Pending | Tag the reviewed merged commit, then download and verify the exact workflow manifest, ZIP and SHA256SUMS. |
| Native Setup installation/upgrade | Pending | Install the unchanged candidate ZIP in a disposable installation and verify the patch version, corrected cards and retained local edits. |
| Publication | Pending | Publish accepted draft unchanged; anonymously verify public hashes and manifest download URL, then record the final manifest. |

Back up and stop the world before updating through Foundry Setup. System updates
do not rebuild editable world Actors, Items or journals. Preserve custom artwork
and existing source identities. Code/content licensing remains undecided; this
patch adds no license grant or directory-approval claim.
