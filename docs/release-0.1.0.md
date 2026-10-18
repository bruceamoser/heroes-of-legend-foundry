# Release 0.1.0 checklist and evidence

This records the first full public release (#144):
[0.1.0](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/tag/v0.1.0).
The tagged CI artifact, native Setup installation and manifest-driven alpha
replacement have passed.
The final installed-package run passed all nine gameplay/visual checkpoints,
zero errors through teardown and exact cleanup; primary screenshot review passed.
Publication, anonymous public asset verification and native public Install
passed. Foundry 14.369 did not offer the development alpha through Update; the
accepted comparator limitation and reinstall path are recorded below. Licensing remains
undecided; preserve existing source/art notices without inventing grants.

## Release identity

- Version: `0.1.0` in package metadata, lockfile and the shipped manifest.
- Tag: `v0.1.0` at `bc251123e0ba5a9e0c90d7bec1975a4aec197a3c`.
- Foundry: V14; minimum 14.367, verified 14.369. Build/test runtime: pinned Node 24.22.0.
- Manifest: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json>
- ZIP: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v0.1.0/heroes-of-legend.zip>
- Four pack counts: 350 abilities, 43 equipment, 192 creatures, 73 summon profiles.
- Artwork: 192 mappings/192 immutable WebP assets, 93,699,982 source-locked runtime bytes.

The workflow builds and checks the tagged commit, generates a reproducible ZIP,
validates extracted bytes and manifest paths, uploads build artifacts and creates
an unpublished draft release with `system.json`, `heroes-of-legend.zip` and
`SHA256SUMS`. The workflow itself does not publish the draft. After native acceptance, the
same assets were published as a full latest release. Version 0.1.0 is a full release so the
stable latest-manifest URL can resolve after publication. GitHub excludes drafts
and prereleases from latest ([GitHub release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)).

## Acceptance record

| Step | Status | Recorded evidence |
|---|---|---|
| Final integrated main | Passed | Tagged `bc251123e0ba5a9e0c90d7bec1975a4aec197a3c` includes core play #138/#137/#121/#140/#15 and the normative documentation reconciliation. |
| Version, build, source/art validation and tests | Passed | Tagged [workflow run 39087097066](https://github.com/bruceamoser/heroes-of-legend-foundry/actions/runs/39087097066), Node 24.22.0: all 370 tests pass; build, source/art and manifest checks pass. |
| Exact candidate ZIP | Passed | Downloaded CI artifact: 352 files, 95,390,654 ZIP bytes; manifest/ZIP hashes verified against SHA256SUMS. See artifact identity below. This does not prove independent CLI/LevelDB build determinism. |
| Native Setup install | Passed locally | Foundry 14.369 installed the unchanged candidate ZIP through Setup using a loopback transport manifest, then launched `hol-release-acceptance` as version 0.1.0; browser errors empty. Native public Install verification is recorded separately below. |
| Manifest-driven alpha replacement and local edits | Passed locally | Setup Install replaced retained 0.1.0-alpha.1 with the candidate and preserved the edited Red Dragon Actor UUID/name, HP 9, biography, portrait/source and custom marker. This is an alpha-update fixture, not a prior public release. |
| Installed-package core play and visuals | Passed | Final native attempt 5 passed all nine checkpoints against the installed exact ZIP, with zero page errors through teardown. Cleanup verified 3 Actors, 2 Users, 1 Scene, 1 Combat and 24 messages. Primary reviewed final light/dark/narrow/detached and attack/defense PNGs, with the unobstructed narrow probe. See [installed acceptance](installed-core-acceptance.md). |
| Draft artifacts | Passed; subsequently published unchanged | Successful tagged workflow created the draft and all three assets; downloaded hashes verified. The accepted candidate remains these exact CI bytes. |
| Public publication and URLs | Passed | Full latest [v0.1.0 release](https://github.com/bruceamoser/heroes-of-legend-foundry/releases/tag/v0.1.0); anonymous GET of manifest, ZIP and SHA256SUMS succeeded and all assets are byte-equal to accepted CI artifacts. |
| Public Foundry Install / alpha Update discovery | Install passed; comparator limitation | Native public Install launched 0.1.0 on 14.369 and preserved the edited Actor with zero browser errors. Update fetched the correct public 0.1.0 manifest/ZIP but reported `isUpgrade: false` from local 0.1.0-alpha.1. No actual Update-button transition or prior public-release upgrade is claimed. |

Native evidence for earlier feature branches remains in `development.md`; it is
not evidence that a newly assembled release ZIP has been installed. Unpublished
assets are not public URLs. A local test manifest may change only transport URLs
to loopback while serving the unchanged candidate ZIP; record its original hash
and retain the public URL checks as pending until publication.

## Recorded artifact identity

The downloaded `v0.1.0` assets from workflow run `39087097066` are:

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `system.json` | 1,999 | `997bbd501a90cd994b6733ecfeadf905a6f2ca1137589a8dc17ad7f9a67d828d` |
| `heroes-of-legend.zip` | 95,390,654 | `8189bdb81cd1b33f4b7013b6aa4ff10f56480a1d4dd14f890a9158a390779388` |
| `SHA256SUMS` | 165 | `9c54413ec8223fa4df75ac11279ea5449a090e7e31035801ba58af499b8033c5` |

Recorded inputs: `/tmp/hol-release-ci-v0.1.0/verified-artifacts.json` and
`workflow.log`; `/tmp/hol-release-install-144/acceptance-state.json` and
`/tmp/hol144-candidate-native.log` establish local Setup installation/replacement.
The local manifest changed only outer transport URLs; the ZIP hash matches CI.
The earlier candidate records mark public URLs untested; subsequent
`/tmp/hol-release-public-v0.1.0/verified-public.json` records anonymous downloads
and exact accepted assets as passed. A draft URL alone was not public evidence.

## Public native installation and alpha Update limitation

`/tmp/hol-release-install-144/acceptance-state.json` and
`/tmp/hol144-public-native-5.log` record public manifest-driven Install on
Foundry 14.369, launching version 0.1.0 with no browser errors and preserving
`Actor.eYqyxsGSJXwm0amw` (name, HP 9, biography, portrait/source, marker and Items).
The preservation screenshot was viewed.

The actual Update check fetched the correct public manifest/version/ZIP but
returned `isUpgrade: false` for installed `0.1.0-alpha.1` versus `0.1.0`.
`publicUpdateDiscovery` records that platform comparator result; an Update-button
transition is not certified. There was no earlier public release. Local alpha
users can return to Setup → Game Systems → Install System and reinstall from the
published manifest URL; that public Install/preservation path passed. The
[README](../README.md#install-and-update) gives this migration instruction.

## Exact-package isolated procedure

1. Finish/rebase the release branch onto fully integrated main. Run code review,
   checks and local packaging validation. A repeated package operation validates
   archive repeatability for one built directory; it does not establish that
   independent official-CLI LevelDB builds produce identical bytes.
2. Create/push `v0.1.0` on that code/static-accepted commit and let the release
   workflow create an unpublished draft. Download its `system.json`, ZIP and
   SHA256SUMS together. Verify both hashes and tag/source SHA. These exact CI bytes
   are the candidate; do not rebuild or replace them after native acceptance.
3. Start a licensed Foundry 14.369 instance in a fresh disposable data directory,
   on a distinct loopback test port, initially at Setup. Use the licensed
   application separately; do not place application files or credentials in Git.
   Retain the pre-version alpha snapshot at `a5693f2` as an update fixture, not a
   claim of a previous public release.
4. Install the baseline through Setup using the temporary local manifest/ZIP.
   Create a blank HOL world. Import a creature, change its name/HP/biography and
   set a distinct custom flag; record its UUID and selected source fields.
5. Return to Setup, install the unchanged downloaded draft ZIP through its local
   transport manifest, and relaunch the same world. Verify the installed version,
   four pack indexes/portraits and retained Actor edits. This tests native
   manifest-driven replacement; it does not establish an Update-button transition.
6. Run the bounded #121 integrated play fixture against that installed package,
   review errors and screenshots, and preserve concise evidence. Stop the
   disposable instance before inspecting files. Keep world data for review.
7. After exact-artifact acceptance, publish the same draft assets as a full latest
   release. Verify the public manifest and ZIP anonymously against the accepted
   hashes, followed by native public Setup Install and actual Update discovery;
   record comparator limits instead of claiming an unperformed transition. If code/assets must
   change, create a new candidate and repeat the affected acceptance before
   publication; do not silently substitute a rebuilt ZIP.

## Local artifact transport

After packaging, run `node scripts/serve-release-candidate.mjs release-artifacts
/tmp/hol-release-baseline-a5693f2` (as one shell command). The loopback-only helper
verifies both original SHA256SUMS and the ZIP's embedded manifest before serving
anything. It prints candidate/baseline native Setup manifest URLs, unchanged ZIP
hashes and byte counts. It serves only those two artifacts and changes only the
outer manifest's transport URLs. Stop it with Ctrl-C after acceptance. This is an
artifact transport check, not evidence of native installation or public access.
