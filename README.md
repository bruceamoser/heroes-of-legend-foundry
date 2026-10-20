# Heroes of Legend for Foundry VTT

Bruce Moser's **Heroes of Legend**, for Foundry Virtual Tabletop **V14**.
Version **1.0.1** is published for Foundry **14.369**, completing the **1.0 major release** with an item-card visual correction. See the [1.0.1 release evidence](docs/release-1.0.1.md) and [1.0.0 major release evidence](docs/release-1.0.0.md).

## Install and update

In Foundry **Setup → Game Systems → Install System**, paste this manifest URL:

```text
https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json
```

Select **Install**, then create a world using **Heroes of Legend**. The full release is published on [GitHub Releases](https://github.com/bruceamoser/heroes-of-legend-foundry/releases). No account on another service or external module is required.

Before updating, back up your world and return to Setup. Use the system's **Update** control when Foundry offers a newer version, then launch the world again.

**Local development alpha:** Foundry 14.369 does not flag `0.1.0` as newer than `0.1.0-alpha.1`. Reinstall through **Setup → Game Systems → Install System** using the manifest URL above. This public installation path was verified with edited world-Actor preservation; an Update-button transition from the alpha is not claimed.

The latest published ZIP is version-specific:

```text
https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.1/heroes-of-legend.zip
```

Version 1.0.1 changes only item-card readability and the equipment type label; it preserves the published 1.0.0 assets. If GitHub temporarily caches the preceding stable manifest after publication, use the [version-specific 1.0.1 manifest](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.1/system.json).

For a local candidate, extract the ZIP directly into your isolated test data directory's `Data/systems/heroes-of-legend/`, with `system.json` immediately inside that directory. Never replace a running system's files. Public manifest/update checks and the exact-package isolated test are separate steps in the release checklist.

## Start playing

1. Install the system as described above, then create a Foundry V14 world using
   **Heroes of Legend**. For a local development build, follow
   [development setup](docs/development.md).
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

## Included content and manual resolution

- Import 419 abilities, 44 equipment entries, 192 creatures and 73 summon profiles from the four content compendiums. Creature action cards use their printed defense attribute and exact player-defense outcomes.
- Open the **Rules Library** for searchable local references: 610 player rules and 408 DA references in two additional JournalEntry compendiums. The DA can explicitly import world journals; repeated imports preserve existing source identities and edits.
- Use the native character, NPC/creature and item cards, Favorites and creation/advancement markets. Owners can select sheet portraits through Foundry’s image picker and **Save portrait**; custom item artwork is preserved when generic bag icons are refreshed.
- Creature artwork fits a 768px maximum edge with transparency retained. The 192 packaged portraits total 41.7 MB, 55.5% smaller than the previous derivatives.
- Use the implemented condition, wound, survival, equipment, resupply, healing-potion and crafting workflows where applicable. Crafting records immediate progress and catalog products; printed time, tools and optional carried materials remain table-resolved.

Specialty action cards and optional ability references support **manual costs and effects**. They do not automatically interpret every condition, movement clause or special rule. Summons have distinct native reference profiles, portraits and attacker-oriented outcomes; spawning, controller commands, tether checks and lifecycle management remain with the DA. This release does not claim all-ability automation.

World Actors and Items imported from compendiums are editable snapshots. Updating the system does not silently replace them with new compendium records. Review source changes before importing or applying an update to an existing world document.

## Development and sources

Use Node 24 (`.node-version`), `npm ci`, then `npm run check`. Build output is `dist/heroes-of-legend/`; `npm run package:release` creates the install artifacts. Read [AGENTS.md](AGENTS.md), [development and native test evidence](docs/development.md), [data contracts](docs/data-contracts.md) and [acceptance scenarios](docs/acceptance-scenarios.md).

Rules are authored in the [Heroes of Legend book repository](https://github.com/bruceamoser/heroes-of-legend). The system uses the pinned approved player/DA source baseline recorded in [rules authority](docs/rules-authority.md) and `content/source-lock.json`. [Interaction design](docs/interaction-design.md) and the [decision register](docs/decisions.md) describe the current scope.

Code and content licensing remain undecided. Retained source, artwork and provenance notices do not create additional license grants or assign a new license to the books or artwork.
