# Wound tables and player-owned rolls

Issue #230 follows Bruce’s October 20 request: Add wound opens a damage-type
choice, rolls once, applies the result and posts a compact chat card. The owner
can Undo that action. It does not require a connected GM or automation approval.
The native Wounds panel also retains older pending events and original-dice
recovery, so upgrading never forces a reroll.

The **Heroes of Legend Wound Tables** compendium contains five native RollTables:
Physical, Elemental, Mental, Radiant and Life. Each has all 56 canonical sorted
three-die keys. Fire, Cold and Lightning use Elemental; the applied condition
still follows the actual damage type. Sources remain pinned to the same approved
wound catalog as the system.

Foundry RollTable formulas use numeric ranges rather than sorted die strings.
The standalone tables therefore use `1d216`, with weights 1 for triples, 3 for
pairs and 6 for three different faces. These weights exactly reproduce the 216
equally likely ordinary 3d6 outcomes. A table description explains this encoding.
The character workflow rolls the actual canonical `3d6kh3`, `4d6kh3` or `5d6kh3`
according to prior wounds, saves all faces, keeps and sorts the highest three,
and draws the matching native result without a second random roll. Chat retains
the original dice, table identity and result identity.

A cause of injury can be supplied in the dialog. If a result requires a fear
source and none was supplied, the original result is saved and posted; the owner
names that source in Wounds before applying it. No source is invented and no
repeat roll is offered. Anatomical exceptions and token placement remain explicit
table decisions, without an owner/DA approval handoff.

Undo is an error correction, not wound treatment: it restores the saved state
from immediately before that wound, including its accumulated count. Treatment
still leaves the permanent scar/count. Undo checks the saved post-action state
and refuses to overwrite later HP, wound, survival or effect changes. Repeated
operations and repeated Undo calls are idempotent. Other character fields and
other system flags are preserved.
