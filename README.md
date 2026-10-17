# Heroes of Legend for Foundry VTT

Native Foundry Virtual Tabletop **V14** system for Bruce Moser's **Heroes of Legend**.

**Status: research and build specification, October 17, 2026.** There is no installable system release yet. The initial documentation is submitted for review on an issue branch.

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

Read [AGENTS.md](AGENTS.md). Work follows issue → branch → implementation → PR → independent review → squash merge. The first two issues track [research](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/1) and [specification](https://github.com/bruceamoser/heroes-of-legend-foundry/issues/2).

Code and content licensing will be selected separately before the first distributable release; this planning repository does not assign a new license to the rulebook or artwork.
