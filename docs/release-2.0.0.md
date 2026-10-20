# Heroes of Legend 2.0.0

Issues #221–#226 correct the native/web
interface and workflow gaps reported against 1.0.1. Final validation is recorded
in [native parity acceptance](native-parity-acceptance.md).

## Changes

- Character creation and advancement use the web application's layout, choice
  validation and coordinated saves. Import maps portable progression and live
  play data to native Actors, Items and effects; the sheet opens after the saved
  creation receipt completes.
- Character, NPC, creature, item, roll and chat presentations follow the actual
  web reference. Portrait selection uses Foundry's standard image browser and
  saves immediately. Reviewed fantasy illustrations replace the temporary item
  icons while preserving custom artwork.
- Defend selects the player's assigned Actor or the GM's selected token Actor.
  Missing or ambiguous selection gives a message. Numeric damage is recorded
  with the result and persistent receipts prevent replayed damage.
- Rules are two native paged books: 610 Player's Book reference pages and 408 DA
  reference pages, plus 15 section pages in each book.
  Native contents, search and page navigation work with the HOL typography.
  Inline Read preserves edited world-book content; full-book navigation is
  explicit. Player access excludes the DA book.
- Recovery, crafting and encounter controls use the web presentation with native
  document permissions and recorded operations. Selected crafting material
  checks retain their rolled result across retries.
- The Foundry interface theme and editable **The gathering** landing scene use
  the approved HOL palette, crest and Player's Book artwork. Setup preserves
  existing scene edits and does not activate the scene automatically.

## Updating

Back up the world and return to Setup before updating. Existing world Actors,
Items, scenes and edited journals are preserved. Use the Rules Library's import
control to add the native books; legacy individual imported rule entries remain
available rather than being silently deleted. World content remains an editable
snapshot, separate from updated compendiums.

Remote clients require HTTPS; localhost also works. A connected GM processes
coordinated operations. An expired idle coordinator can be reclaimed by a fresh
GM browser; uncertain in-flight operations still require explicit reconciliation.

Specialty rules still use the established table-resolution boundaries documented
in the system. This release does not claim an automatic interpreter for every
ability or summon lifecycle rule.

## Validation

Build and content validation, 585 automated tests, and the web browser checks passed.
The exact 483-file release archive passed extraction and byte comparison. Native
GM/player import, saving, advancement, combat, rules, tools and visual comparisons
were exercised in an isolated licensed Foundry 14.369 world. See the linked
acceptance record for the precise scenarios and manual boundaries.

Reviewed as author review under the repository’s authorization; no independent
approval is claimed. The release workflow builds a draft before final publication.
