# Release 1.0.1 evidence

Published October 20, 2026 at 21:40:18 UTC as
[v1.0.1](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/tag/v1.0.1),
the latest patch on the 1.0 major release line requested in #216.
Issue #218 records two installed 1.0.0 visual findings: pale read-only item
statistics and an untranslated `TYPES.Item.equipment` title. Version 1.0.1 fixes
both. The published 1.0.0 assets remain unchanged.

## Identity and scope

- Tag `v1.0.1` at `42f7580cc561f1b7cc51065d24f179f34cecc548`, prepared in [#219](https://github.com/bruceamoser/heroes-of-legend-foundry/pull/219).
- Foundry V14; verified with licensed **14.369** in disposable installations.
- [Stable update manifest](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json).
- [Version-specific install manifest](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.1/system.json).
- [Immutable ZIP](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v1.0.1/heroes-of-legend.zip).

Item-stat labels and values explicitly use HOL ink on ivory without inherited
text shadow, in either Foundry theme. Equipment titles use the native translated
type label. The core rules, document services, content, permissions and operation
receipts are unchanged. Specialty outcomes and summon lifecycle retain their
manual boundaries described in the [major release evidence](release-1.0.0.md).

Archive comparison found only the manifest, `styles/native-cards.css`,
`lang/en.json` and six LevelDB diagnostic `LOG` files differ from 1.0.0. The LOG
files contain packing timestamps/thread identities; all runtime modules,
templates, assets and compendium database bytes match the accepted major release.

## Acceptance

| Gate | Result |
|---|---|
| Source review | Complete diff reviewed by primary under author-review authorization, with a bounded read-only worker review; no material findings. No independent approval claimed. |
| Build and CI | Node 24 `npm run check`: 508 tests passed. Both #219 CI runs, merged main/tag validation and [tagged release workflow 39501778355](https://github.com/bruceamoser/heroes-of-legend-foundry/actions/runs/39501778355) passed. |
| Exact tagged artifacts | All three draft assets downloaded; both SHA256SUMS entries verified. The accepted ZIP was not rebuilt or replaced for publication. |
| Native Setup upgrade | Actual native Update control installed 1.0.1 over 1.0.0. The earlier 0.1.0→1.0.0 world launched again with preserved Actor UUID/name/HP9/attributes/biography/ownership/custom portrait/source marker, custom Item artwork/data and edited campaign journal identity/text/permissions. Both explicit rules imports retained all 1,018 identities and created no duplicates. |
| Fresh native Setup install | Separate disposable installation with no installed worlds/systems installed the exact draft via Setup, reported 1.0.1 and zero worlds, then created/launched `hol-release-patch-fresh` through the native world wizard. |
| Installed file identity | All 421 non-pack installed files compared with the accepted ZIP, including both changed CSS/localization files; only transport manifest tracking URLs were excluded. Compendium database bytes match the accepted 1.0.0 archive. |
| Installed visual acceptance | Light and dark equipment sheet titles read **Equipment: Ammunition Bundle**. Quantity 3, Bulk 1, Hands 0 and Supply d8 render correctly. All eight labels/values have computed foreground `rgb(40,37,28)` on `rgb(241,230,206)`, contrast **12.3578:1**. Both screenshots inspected; fixture Item deleted. Final session had no browser errors. |
| Publication | Full public release at 21:40:18 UTC. Anonymous public versioned manifest/ZIP/checksums match the accepted draft exactly. Manifest pins the immutable 1.0.1 ZIP. The final bare stable manifest resolves 1.0.1 and matches the versioned manifest bytes. Its initial request briefly returned cached 1.0.0; the cache-refreshed URL and subsequent bare recheck both passed. |

The first fresh-world visual session passed the title/contrast assertions but
reported a canvas `_viewPosition` null error. A new browser session repeated the
full light/dark test without suppressing errors and passed with none. No production
code changed between those attempts. This transient is recorded separately from
the clean final acceptance.

Draft Setup tests used an outer loopback transport manifest serving unchanged CI
ZIP bytes. Only the stopped baseline's tracking URL was redirected for the update
check. Public artifact verification was separate. A stopped-world copy was retained
before migration; no live campaign data or proprietary Foundry files enter Git.

## Published artifact identity

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `system.json` | 2,818 | `d1a8f92d86d8dc9bb88b2fb71f7c97e8f50d6609b776ecc6255b266a3af8177d` |
| `heroes-of-legend.zip` | 45,354,409 | `60a6194bfd431e8d9b49afbfe4360537a85cb3ab6dbd849891b50c7d94a359a6` |
| `SHA256SUMS` | 165 | `772955769c20d2a6cf16cf09680dac9dc274ad29d1fcdb302ac86f4f1c551141` |

Local evidence under `/mnt/disk4/tmp/hol216/`: `candidate-1.0.1/`,
`patch-upgrade-setup.json`, `patch-upgrade-preservation.json`,
`patch-fresh-install.log`, `patch-world-create.log`, `patch-byte-comparison.json`,
`patch-installed-comparison.json`, `patch-visual.json`, `patch-item-light.png`,
`patch-item-dark.png` and `public-1.0.1/verified-public.json`.

Back up and stop the world before updating through Foundry Setup. Updates do not
rebuild editable world Actors, Items or journals. Preserve custom artwork and
source identities. Retain source/art/provenance notices; code/content licensing
remains undecided. No new license grant or Foundry directory approval is claimed.
