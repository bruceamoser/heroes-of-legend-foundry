# Release 0.1.0 checklist and evidence

This is the first public release preparation (#144), not a publication record.
Tagging/draft creation follows integrated code and static acceptance; publication
remains pending exact draft-artifact native acceptance. Licensing remains
undecided; preserve existing source/art notices without inventing grants.

## Candidate identity

- Version: `0.1.0` in package metadata, lockfile and the shipped manifest.
- Tag: `v0.1.0`, created after integrated code/static acceptance on the final main commit.
- Foundry: V14; minimum 14.367, verified 14.369. Build/test runtime: pinned Node 24.
- Manifest: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/latest/download/system.json>
- ZIP: <https://github.com/bruceamoser/heroes-of-legend-foundry/releases/download/v0.1.0/heroes-of-legend.zip>
- Four pack counts: 350 abilities, 43 equipment, 192 creatures, 73 summon profiles.
- Artwork: 192 mappings/192 immutable WebP assets, 93,699,982 source-locked runtime bytes.

The workflow builds and checks the tagged commit, generates a reproducible ZIP,
validates extracted bytes and manifest paths, uploads build artifacts and creates
an unpublished draft release with `system.json`, `heroes-of-legend.zip` and
`SHA256SUMS`. It does not publish the draft. Version 0.1.0 is a full release so the
stable latest-manifest URL can resolve after publication. GitHub excludes drafts
and prereleases from latest ([GitHub release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)).

## Acceptance record

| Step | Status | Evidence required |
|---|---|---|
| Final integrated main | Pending | Include core-play branches 138, 137, 121, 140; record commit SHA and review results. |
| Version, build, source/art validation and tests | Pending | `npm ci && npm run check`, Node version, full test count/log on final candidate. |
| Exact candidate ZIP | Pending | Download the draft workflow assets; verify SHA256SUMS, record source/tag SHA and byte/file counts. Repacking one built directory proves archive repeatability, not independent CLI/LevelDB build determinism. |
| Native Setup install | Pending | Install the exact ZIP into a separate disposable data directory through a transient local manifest; verify installed version/packs/art and world launch. |
| Native Setup update and local edits | Pending | Upgrade from the retained development-alpha package; preserve an edited imported world Actor's identity, name, HP, biography and custom flag. |
| Installed-package core play | Pending | Run the agreed bounded integrated workflows against the extracted/installed package, including creation, references, creature Defend, potions and source compendiums; no source-worktree symlink. |
| Draft artifacts | Pending | Tag the integrated code/static-accepted commit, wait for workflow success, download all three draft assets and verify their recorded hashes. Use this exact ZIP for native acceptance. |
| Public publication and URLs | Pending | Publish only after integrated acceptance, as a full latest release; fetch public manifest/ZIP, compare checksums and version/link consistency. |
| Public Foundry install/update | Pending | Confirm normal Setup manifest installation/update against published URLs; record 14.369 launch and edited-Actor preservation. |

Native evidence for earlier feature branches remains in `development.md`; it is
not evidence that a newly assembled release ZIP has been installed. Unpublished
assets are not public URLs. A local test manifest may change only transport URLs
to loopback while serving the unchanged candidate ZIP; record its original hash
and retain the public URL checks as pending until publication.

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
   four pack indexes/portraits and retained Actor edits. This tests a native
   manifest-driven upgrade; public automatic-update discovery remains separate.
6. Run the bounded #121 integrated play fixture against that installed package,
   review errors and screenshots, and preserve concise evidence. Stop the
   disposable instance before inspecting files. Keep world data for review.
7. After exact-artifact acceptance, publish the same draft assets as a full latest
   release. Verify the public manifest and ZIP anonymously against the accepted
   hashes, followed by normal public Setup install/update. If code/assets must
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
