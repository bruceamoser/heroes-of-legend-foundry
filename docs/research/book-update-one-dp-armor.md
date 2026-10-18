# One-DP abilities and armor source update

Issues #168 and #169 import the reviewed book PRs #1272 and #1274 at
`64089a1c8961d7faff172f179448a8b6e57827ef`, replacing the previous
`9bc9b4fe3256e68880b92c45facf0f25b98a1ea3` baseline. Import reads immutable Git
objects and never the author's working checkout. Code and content licensing remain
undecided.

## Catalog changes

- Six shared abilities cost 1 DP: Another Tongue, Message by Heart, Catch That!,
  A Party Piece, Quick Exit, and Look Over Here! All are level 1 with normal
  level-0 Novice access, no discipline prerequisite, and purchase once. They grant
  no equipment. All other ability tier prices remain 2/4/8; the 18 Universal
  actions remain outside DP purchasing.
- Light/medium/heavy armor training requires Armor ranks 1/2/3, levels 1/3/7,
  costs 2/4/8 DP and grants physical resistance 1/2/3 while wearing matching armor.
  Ordinary armor is Bulk 1 and costs 10/40/90 coins. Walled Communities now grants
  light training and its absent-item equipment grant.
- Canonical reference heroes incorporate the armor correction and the new printed
  purchases. No user character receives these example purchases automatically.

The lock contains 927 source records. Choice records total 459, including 357
abilities; inventory has 44 equipment records and 10 recipes. All 192 creature
records, 93 monster abilities, 73 summons and 192 portrait sources are unchanged.
Portrait derivatives are byte-identical; only their source commit/lock provenance
is refreshed. All generated compendium records and bundled browser references use
the same pin, with stable IDs for existing records. Wound, potion and treatment
source mechanics are unchanged.

## Learning and play

Creation and advancement spend the actual printed price. Another Tongue chooses
an ordinary campaign language not already known, including its usual script;
A Party Piece records one performance specialty. Choices survive save/load,
advancement, and portable JSON. Language configuration changes require a fresh
review before native advancement commitment. The native sheet shows acquired
languages/specialty; both interfaces provide a saved Message by Heart text field.

Native Disengage records the Maneuver and the turn's protection. Quick Exit adds
one extra square to that turn's available movement, once, respecting normal
movement restrictions and terrain spending. It does not increase Speed or each
converted movement allowance, and unused movement expires at turn end.
Catch That! and Look Over Here! record normal Reactions. The latter uses a native
ally target; the ally can select the contextual Boon in the incoming defense
dialog. A Party Piece is an optional contextual Boon on a Guile task. Normal
Boon/Bane cancellation and limits apply. These choices do not restrict repeat
defense rolls or restrict who can press Defend.

Item placement for Catch That!, free-hand/reach adjudication, and Look Over Here's
adjacency/sight-dependent trigger remain table judgment, taught in the local
rules and chat. The Boon is selected by the defender; it is not automatically
consumed or tied to a single permitted roll. No cover, Hidden, attack cancellation,
extra Reaction, translation or general skill modifier is granted.

## Existing characters

There is no automatic world Actor rewrite. Existing world Items retain their owned
snapshots and acquisition receipts. Explicit reviewed legacy medium/heavy armor
hashes continue to yield their original resistance 2/3; no new light armor or new
abilities are injected into an existing Actor. A DA can deliberately replace its
training/equipment after reviewing the new rules. User-edited unrecognized source
hashes still need review.

The browser accepts a previous-baseline character through an explicit rules-update
review. It stores an original named backup before accepting the revised working
copy. Walled Communities' granted armor arrangement and removed-item marker move
to the new light grant; purchased equipment and purchases remain intact. Now-illegal
purchases remain visible for repair, with new rank/level/DP requirements applied.
No one-DP purchase is added automatically. Unknown editions remain rejected.
Original named saves are preserved until the user explicitly overwrites/deletes
them; a converted save starts as a separate copy.

Native JSON import continues to require the matching source edition and a new
level-1 Actor. Review/export an older file through the workshop first. Existing
native creation drafts need review against the new catalog before commitment.
Later-level web plans are still not a native advancement-import feature.

## Validation — October 18, 2026

- Node 24 `npm run check`: build, package validation and all 403 tests passed.
  Includes one-DP pricing/acquisition, armor tiers and legacy snapshots,
  movement/contextual Boons, portable choices and source-update preservation.
- Immutable source-lock verification and choice, inventory and Item-pack
  reproduction passed at the new pin. Existing pack changes outside armor and
  Disengage automation are source-provenance updates; portrait bytes are unchanged.
- Full Playwright workshop flow passed without browser errors, including all six
  new purchases, ordinary-language/specialty choices, message save/reload,
  portable export, old-save review/backup, light armor and narrow layouts.
- Disposable Foundry **14.369**: all six reference heroes completed creation
  through their player owner's Review button. Persisted statistics, acquisition
  grants, languages and ledgers matched the canonical fixtures after reload and
  receipt replay.
- Native advancement passed, including actual language/specialty widgets, visible
  disabled known/uncommon languages, saved choices and normal authority commit.
  Native file-chooser import retained Message by Heart through commit and reload.
- Native action fixture passed: Disengage/Quick Exit, movement conversion, normal
  Reactions, ally target identity, retransmission and optional contextual Boons.
  Fixture documents were removed and original coordinator settings restored.

Author review checked source changes, generated records, pure rules, document
services, templates, browser conversion and validation evidence. This is author
review under Bruce's approval, not an independent approval or a new release.
