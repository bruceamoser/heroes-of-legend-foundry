# Heroes of Legend 2.6.0

This playtest release uses book v16.6.0, approved by Bruce after reviewing the full catalog. Source commit: `25b80c9fe77d7baaec3f3a8a548c9663d0f39a30`.

- Imports 427 abilities, including the approved discipline and Universal revisions, with current costs, levels, training requirements, evocative text and condition combinations.
- Refreshes ability/equipment packs, Workshop choices, creation and advancement, Player's Book and DA journals from the same source.
- Supplies the folding launcher and spring-hook bracer as grant-only gear. Ordinary market remains 44 items; no sale price is invented for those devices.
- A Party Piece chooses an owned instrument and supports Guile rolls while playing the held instrument. Current play inventory counts for advancement ownership.
- Bottled Morning and The Cleverest Mixture brew their named capped d4 supplies without an attribute roll. Other crafting, material handling and supply consumption retain their procedures.
- Workshop healing potions apply the character's current Life resistance through the shared healing rules before checking supply. Healing remains capped by missing HP.
- Registered summons track their controller and one command per controller turn. The initial registration records the creation command. At controller turn end, registered summons receiving no command disappear: tokens hide and execution is disabled, while world Actors remain available for deliberate reuse.

## Scope and existing content

Most specialty effects remain rules references to resolve at the table. Exact supported adapters are source-reviewed; importing text does not imply every condition, teleport, group payoff or spell is automated. Command payment, commanded activity, tether enforcement and summoned healing remain manual. Workshop has no summon-controller workflow; its summon maintenance is resolved at the table using the current journals. Re-summoning an expired form requires returning it to a creature, choosing its summon profile again, registering it and explicitly unhiding its token. Constant interaction and concentration explain maintenance without adding a concentration check.

Current-only Workshop saves use the new catalog. Existing committed Foundry Actors and edited world Items are preserved; compendium refresh does not silently overwrite their text or live HP, wounds and spent resources. Renames retain stable IDs. A Common Tongue replaces the retired Turn the Crowd ID. Workshop autosaves, named saves, imports and creation drafts automatically map that purchase and its acquisition choices to A Common Tongue at the same stage or level, using its current 8 DP price and Influence 3 requirement. Duplicate old/new purchase entries resolve to one current purchase; unrelated choices and play resources remain intact. Review an older world's owned Turn the Crowd reference deliberately when adopting the playtest catalog; committed Actors and owned references are not overwritten. Optional foraging/workshop consolidation was not applied.

## Verification

- Exact comparison: all 297 active discipline proposals match the approved book, with independent downstream source hashes and no missing IDs.
- Node24 full build, validation and test gate: 739/739 passed before candidate packaging.
- Local candidate on Foundry14.367: 2.5.1 upgrade preserves edited Actor/Item UUIDs, text, source provenance, HP and spent Grit. Native summon commands, unlinked-token expiry across reload, lasting-condition treatment and single end-turn decay pass with fixture cleanup.
- Workshop builder, full character workflow, play, resources and recovery browser gates pass. Current native creation/import/save/reload, advancement with exact DP/acquisition/resource preservation, attack/defense/damage/conditions/supplies, and potion self-use/replay checks pass with cleanup and zero browser errors. Final CI artifact installation and public deployment evidence are recorded separately in #252. No unexecuted scenario is certified by static results.

Tracking: #252; book bruceamoser/heroes-of-legend#1294 and PR#1295. Rollback: system2.5.1/book16.5.0.
