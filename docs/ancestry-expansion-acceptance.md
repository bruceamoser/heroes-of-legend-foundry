# Ancestry expansion acceptance — #259

Source: book v16.7.0, `f3fb98ca03b046335fcc730c1b05689bebf091b4`.
Target release: system 2.7.1 and GitHub Pages Character Workshop.

## Content and compatibility

Ten ancestries and fifty traits use complete approved narrative/rules text.
All 529 previously published choice IDs and 1,026 native journal source-page IDs
remain stable; 36 choices and 39 source pages are added. `ancestry-elf` and
`ancestry-dwarf` display Wood Elf and Hill Dwarf. Descriptive import aliases map
to those published identities. Every new grant is selected by stable ID, never
by interpreting narrative text.

All catalogs, packs, journals and web references use the same immutable source
commit. Existing ability hashes, acquisition adapters, creature actions and
portrait bytes were verified before advancing provenance. No art binaries changed.
World documents and personal Items are not overwritten by catalog intake.

The book's Oren reference draft still contains the obsolete two-language choice
for A Foot in Two Worlds and lacks a borrowed ancestry/trait. Tests retain that
source and assert actionable incomplete choices; they do not invent player choices.
Mara's handwritten Speed is superseded by the approved Adaptable trait. Synthetic
mixed-ancestry fixtures explicitly choose their ancestry, trait and native language.

## Automated and table-driven behavior

Permanent HP, Speed, Capacity, Stability, Adaptable DP and Small Target are derived
from selected traits. Low-light vision ratings and Seismic Vision 6 are exposed
as rule facts, without darkness sight. Conditional Boons, the conditions for
perception and targeting, Long Reach applicability and once-per-day narrative
trait uses remain table judgments using their complete printed references.

The Workshop rerolls its original attribute pool for The Debt Comes Due.
Native ordinary attribute checks have the same chat reroll workflow with durable
payment/result receipts. Coordinated ability/attack/defense/crafting operations
use explicit manual reroll guidance and payment accounting to preserve their
existing authoritative settlement receipts. DA recovery of interrupted native
retained dice never repeats payment or generates another roll.

Recovery, Grit, safe breaths and healing potions honor unavailable HP. Dawn
refreshes the trait and unlocks healing without restoring HP or clearing survival
state. Payment leaves at least 1 HP. Oath-Bound use ordinary hero procedures.

## Verification

Node 24.22.1: build, package validation and all 768 tests pass. Package ZIP
round-trip and repeated packaging are byte-identical. All importer drift checks pass.

Actual Workshop browser checks pass: existing Workshop, play, resources, recovery,
builder, sheet prototypes and roll/chat/tools previews. `test:ancestry-workshop`
checks ten ancestries/fifty exact trait references, full narratives, old-ID
save/import/reload, mixed ancestry controls and derived benefits, shared vision
references, original-pool Debt reroll, once-per-day payment, persistent recovery,
Grit ceiling and dawn without healing. Captures are under
`test-results/ancestry-workshop/` and existing suite directories.

Native package, deployment and publication results are recorded below after
execution. Author review is performed by the implementing primary agent under
the repository's explicit authorization; it is not independent review.

### Isolated native candidate

The exact locally packaged 2.7.0 ZIP was installed into the stopped disposable
Foundry 14.367 world `hol-release-clean-260b` on localhost:30016. System/world
backups are outside Git under `/mnt/disk4/tmp/hol270/`.

`test:ancestry-native` passes: all ten native ancestry cards and five choices each,
explicit mixed ancestry/trait/language save and reload, derived Capacity 16,
Small Target defense Boon and player-attacker Bane, Tallfolk capacity/Speed,
Deep Dwarf vision ratings and shared source references, preserved live HP/Grit,
and stable Elf/Dwarf IDs with current names. Rendered captures were inspected;
the sheet now shows full trait summaries, matching the Workshop. All eleven
Actors and the Scene were cleaned up without browser errors.

`test:debt-native` passes: actual chat reroll preserves the original attribute/pool,
replaces native retained dice, pays once and replays safely. Native reload,
healing ceiling, Recovery's Next dawn without healing and subsequent Safe breath
pass. An unlinked token mutates only its synthetic Actor and preserves its base
Actor. Same-client replay uses saved results; old-client dispatch after reload
is rejected without writes, preserving the existing authority isolation. All
Actors, Scenes and messages were cleaned up without browser errors.

Native harness fixes resolved duplicate header/footer selectors, awaited each
autosave before selecting the next field, opened collapsed Roll details and
respected existing client-bound request routing. These are test-harness fixes;
the rendered trait-summary omission was a production finding and was corrected.

`test:current-charactermancer` also passes on the same candidate: incomplete
creation validation; owner UI portable import/edit/Save, returned sheet/reload;
owner Add level, disabled ineligible choice, local rules reference, required
instrument acquisition and Done. Exact DP/HP/Grit and equipment persistence pass
without duplicate grants. This does not claim all historical broad creation,
advancement or canvas suites were rerun.

### Final compatibility correction (#261)

Final review found that Workshop legacy two-language arrays had no visible
retirement control after choosing the replacement benefit. The unpublished
2.7.0 system candidate was withdrawn; the Pages deployment will be superseded
by the compatibility fix. Corrected 2.7.1
retires those obsolete selections only after an explicit replacement/removal
action; browser coverage includes old saved choices and reload.
