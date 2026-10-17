# Approved book baseline reconciliation — October 17, 2026

Issue #72 advances the immutable content source from `9f1663f774164a014edcb879c50fcf02989d791b` to `9bc9b4fe3256e68880b92c45facf0f25b98a1ea3` (two-book starter kit v16.1.0). Imports read Git objects, never modify the author's checkout, and never rewrite owned Foundry documents.

Reviewed changes:

- Retired proposal/review prose and links were removed across catalogs; class fields now say Starting disciplines and Discipline pricing. No numerical creation, choice or acquisition changes appeared in the generated records after excluding source hashes/commit. All 452 choice IDs, 43 equipment records, 10 recipes and 350 acquisition adapters retain their mechanics.
- All 192 creature stat blocks and 93 monster ability records retain their mechanics; removed status text changes their hashes. The 192 portrait/provenance records and all 73 summon links are exactly unchanged.
- The current discipline files no longer print the old inline ID/status line. The importer preserves the same 18 stable discipline IDs through its existing filename mapping; the source lock does not falsely claim those IDs are authored in the new bytes.
- Careful Transfer and Restore Composure now explicitly reconcile willing-target prose with their existing offensive-healing exception. Use a Healing Potion removes the erroneous spell/offensive-healing paragraph. The existing system policy already separates potions from offensive spells; these changes must govern subsequent healing adapters.
- Player teaching now includes NPC-only resolution, weakness before resistance, last-legal-position collision placement, tangible/unhealable summons, nearest-occupied-square tether and controller-paid healing. These match the already recorded implementation contract; they do not introduce a second dice roll, extra summon Reaction or free healing.
- Searching/hiding during combat and mixed condition tracking are stated as approved rules. Language defaults are Common plus a named ordinary home language, followed by explicit extras. Full language UI remains part of charactermancer completeness.
- The former decision log is now a current-rule navigation page. Historical research links remain historical evidence, not competing rules sources.

Defend's only source change is removal of status text. Its adapter uses the new hash and explicitly accepts the one previously reviewed equivalent hash, preserving already-owned preview items. Arbitrary other hashes remain rejected. No generic hash bypass or automatic world-content update was added.

Validation: regenerate and check all source/catalog hashes; compare generated mechanics excluding provenance; retain existing pure-rule tests; run native Defend and creation/advancement regressions. Source metadata reconciliation is not full content automation certification.
