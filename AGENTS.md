# Working on Heroes of Legend Foundry

This is the software companion to the Heroes of Legend rulebook. Bruce is the final authority on game design. The specification is a proposed implementation contract, not permission to change the game.

## Read first

- `docs/rules-authority.md` and `docs/decisions.md` establish current rules and boundaries.
- `docs/system-specification.md`, `docs/data-contracts.md`, and `docs/acceptance-scenarios.md` define implementation behavior.
- `docs/research/foundry-v14.md` establishes the V14 baseline. Recheck official versioned APIs when implementing.

## Workflow

1. Create or select a numbered issue before making changes; keep implementation issues small.
2. Branch `issue/<number>-<description>` from `main`. All content/code changes go through PRs.
3. Scope changes to the issue. Do not edit the sibling rulebook or Neon Relic repositories as part of system work.
4. Add relevant validation. Use `Closes #N` in the PR and report actual results, distinguishing static checks from Foundry runtime tests.
5. Bruce authorized author review and merge for this system project on October 17, 2026. Review the complete diff, fix findings, and require passing applicable checks before squash merging. Record this accurately as author review, never independent approval.
6. Squash merge approved work and verify issue closure.
7. Correct these instructions when a verified omission causes a mistake; track the correction in the same scoped PR or a separate issue.

## Coding delegation

Bruce authorized DeepSeek coding workers on October 17, 2026. Use them for
bounded implementation, bug-fixing, integration and test-writing tasks with
maximum reasoning effort (Bruce's explicit preference). The primary agent handles
architecture, rules interpretation, review and final acceptance. Define integration
contracts and acceptance criteria in numbered issues. The primary launches workers;
workers implement directly without recursively spawning other agents. Give each worker
an explicit scope, acceptance criteria and writable checkout. Workers must not
commit, publish or merge unless separately instructed. Review their full diff
and run applicable checks before integrating. Serialize Foundry runtime tests
against the shared disposable world. Keep API keys and worker configuration
outside the repository; never include them in prompts, logs or Git.

## Implementation boundaries

- V14 only initially. No V13 compatibility layer or copied Neon Relic game mechanics.
- Current design rules supersede legacy Quarto instructions. Check dated approvals before interpreting an old “proposal” label.
- No numerical skill bonus, opposed attack/defense pair, random weapon damage, spell slots, mana or prerequisite-card chains.
- Use Foundry public APIs, TypeDataModel and ApplicationV2. Namespace all settings, flags, styles and localization with the package ID.
- Each Handlebars ApplicationV2 part must have one root HTML element. Do not assign read-only application properties such as `rendered`. Match embedded creation results by document identity, never array position.
- Native fixtures must supply valid character Speed metadata or an explicit DA ruling, track created documents before later steps can fail, and report cleanup failures.
- Keep rules calculation independent of sheets; all state changes pass through permission-checked document services.
- Never assume all connected clients should apply the same effect. Use a single authoritative execution path and persistent operation IDs.
- Imported content requires a pinned source commit, stable IDs and reviewable changes. Generated packs are not authoring sources.
- Published and user-edited world content must not be silently overwritten by an import or migration.
- No Foundry application distribution, credentials, real world databases or licensed third-party content in Git.

## Validation

Use Node 24 (see `.node-version`), `npm ci`, then `npm run check`. Run `npm run test:runtime` only against an isolated local Foundry development world with `HOL_TEST_URL` set explicitly. See `docs/development.md` for setup and the limits of current runtime evidence. Never use live campaign data for automated testing.
