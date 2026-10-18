# Heroes of Legend for Foundry VTT

Native Foundry Virtual Tabletop **V14** system for Bruce Moser's **Heroes of Legend**.

**Development preview for Foundry V14.** Character creation, advancement,
native rolls, encounter actions, damage, conditions and healing potions are
implemented. Some specialty abilities remain readable references for table
resolution; a reference does not promise automated mechanics. Release package
installation is still being validated.

## Start playing

1. Install the preview package when its release manifest is available, then create
   a Foundry V14 world using **Heroes of Legend**. For a local development build,
   follow [development setup](docs/development.md).
2. Join as the GM. A fresh world starts request processing automatically in the
   active GM's window; players do not need to enable a service or seek approval
   for ordinary actions. Keep that GM window connected while playing. A clean
   daily restart resumes in that same GM browser automatically.
3. Create a character with the guided creation flow, then equip its owned Items
   and place its native Token. Legal creation and advancement options appear
   first; unavailable choices remain visible with their reasons.
4. Use the attack, roll or potion buttons on the relevant Actor or Item sheet
   for supported actions. Open other ability references from their rows or the
   roll dialog to read their effects; resolve specialty mechanics at the table
   unless a dedicated action button automates them. Select recipients with
   Foundry's native token targeting. Use the −3…+3 slider to adjust Boons/Banes;
   ordinary play does not require written reasons. Freely repeat a fresh Defend
   roll when the table needs a correction.
5. For a healing potion, target one other Token or leave targets clear for
   self-use. Another owner's character receives a one-click consent offer.
   Encounter costs remain tracked during an active encounter; free play does
   not create a Combat or artificial action budgets.

If processing needs recovery, the GM can open **Game Settings → Manage automation**.
Use its existing handoff and recovery controls when changing GM windows or
resuming interrupted work; do not clear saved state or reroll an uncertain old
operation to force it through. A fresh intentional use or roll is a new action.
GM processing requires HTTPS or localhost for the browser's exclusive-tab lock.

## Read the specification

1. [System specification](docs/system-specification.md) — scope, rules, workflows and architecture.
2. [Data contracts](docs/data-contracts.md) — documents, actions, effects and provenance.
3. [Implementation plan](docs/implementation-plan.md) — small deliverables, dependencies and release gates.
4. [Acceptance scenarios](docs/acceptance-scenarios.md) — concrete examples the implementation must pass.
5. [Foundry V14 research](docs/research/foundry-v14.md) — dated official API findings.
6. [Neon Relic audit](docs/research/neon-relic-audit.md) — reusable patterns and carryover risks.
7. [Rules authority and content intake](docs/rules-authority.md) — approved rules, source revisions and the incoming DA/bestiary book.
8. [Decision register](docs/decisions.md) — proposed engineering choices and remaining boundaries.
9. [Interaction design and visual identity](docs/interaction-design.md) — abilities/modifiers in the roll dialog, creature attack → Defend workflow, drag/drop and the established HOL theme.

The rules are authored in the [Heroes of Legend book repository](https://github.com/bruceamoser/heroes-of-legend). Bruce confirmed that this system implements the current `design/player-book` and `design/rules` materials, with the completed DA/bestiary book to follow. The older Quarto mechanics are historical references.

Neon Relic is an implementation reference, not this system's code base. HOL uses 3d6 plus one attribute, Boons/Banes, fixed outcome effects, disciplines, alternating sides, persistent wounds and command-driven summons.

## Contributing

Read [AGENTS.md](AGENTS.md). Work follows issue → branch → implementation → PR → review → squash merge. The first two issues track [research](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/1) and [specification](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/2).

Licensing remains undecided. This preview grants no new rights to the code, rulebook content or artwork.

## Development

See [development setup and test evidence](docs/development.md). Build with Node 24
using `npm ci` and `npm run check`; output is `dist/heroes-of-legend/`. Static test
results and native runtime evidence are recorded separately. All runtime fixtures
use a disposable development world, never a live campaign.
