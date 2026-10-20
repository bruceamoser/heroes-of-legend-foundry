# Native Item illustrations

Issue #224 replaces the temporary category SVG defaults with Foundry VTT core
fantasy illustrations. The explicit mapping lives in `src/rules/item-icons.mjs`.
All 44 equipment records and universal abilities receive a reviewed category;
discipline and class signature marks retain the approved HOL WEBP artwork.
Muted leather, green cloth, brass and gold objects complement the book palette.
The sword, brass spyglass, green book, ration bundle, scale armor and wooden
shield were inspected visually against the installed core artwork before accepting
this family of illustrations. The core icons are 256-pixel inventory illustrations;
HOL creature portraits retain the existing 768-pixel maximum edge.

`foundry-core-illustrations.json` records the exact paths verified in Foundry
14.369. These paths reference the host's built-in `icons/` library. No Foundry
artwork files are copied into this repository or distributed in its packages;
Foundry's own licensing and attribution govern those assets. This mapping grants
no additional rights to them. CI checks the verified manifest without requiring a
licensed installation. Local validation can set `HOL_CORE_ASSETS` to the public
asset directory to verify every referenced file exists.

World migration changes only generic core defaults or the exact former SVG
default for that Item's known catalog ID. A different SVG, a custom path, approved
discipline/signature artwork, and unrecognized catalog IDs retain chosen images.
Normal document ownership still controls cosmetic updates. Compendium documents
are regenerated from catalog sources rather than altered by world migration.
