# Foundry V14 research

Research date: **October 17, 2026**. Supports issue #1. These are official sources; proposed HOL choices are explicitly identified. No running Foundry world was tested in this research pass.

## Version baseline

Foundry's release index lists **14.369 Stable**, released October 8, 2026. The API pages inspected identify their generated documentation as **14.368 Stable**. Therefore 14.369 is the first runtime validation target, with an explicit check for differences from the documented API. Do not equate a V14 manifest declaration with successful testing. Sources: [release index](https://foundryvtt.com/releases/), [14.369 notes](https://foundryvtt.com/releases/14.369), [versioned API](https://foundryvtt.com/api/v14/).

V14 dedicated servers require Node.js 24. Use Node 24 for HOL development/CI as a simplifying project choice as well; a browser bundle built on an older Node version is not thereby proven incompatible. Source: [14.356 runtime requirement](https://foundryvtt.com/releases/14.356).

## API map and implementation consequences

| Concern | Verified official surface | Proposed HOL use |
|---|---|---|
| Package definition | [`system.json`, `documentTypes`, `htmlFields`, `filePathFields`, compendiums](https://foundryvtt.com/article/system-development/) | Stable package ID `heroes-of-legend`; explicit subtype declarations and field paths; manifest/release validation. |
| Typed rules data | [`TypeDataModel` and schema registration](https://foundryvtt.com/article/system-data-models/) | Register per-type models in `CONFIG.<Document>.dataModels` at init; pure derived calculations; no `template.json` schema. |
| Character sheets | [`ActorSheetV2`](https://foundryvtt.com/api/v14/classes/foundry.applications.sheets.ActorSheetV2.html) | Handlebars V2 sheets; explicit actions and render context; test unlinked Token actors. |
| Item sheets | [`ItemSheetV2`](https://foundryvtt.com/api/v14/classes/foundry.applications.sheets.ItemSheetV2.html) | Typed editors sharing reusable parts, with full readable rules alongside structured automation. |
| Sheet registration | [`DocumentSheetConfig.registerSheet`](https://foundryvtt.com/api/v14/classes/foundry.applications.apps.DocumentSheetConfig.html#registerSheet) | Register for exact subtypes, make HOL sheets defaults. |
| Existing registration wrappers | [`Actors.registerSheet`](https://foundryvtt.com/api/v14/classes/foundry.documents.collections.Actors.html#registerSheet) | Still documented in V14. Neon Relic's use is not evidence of a removed API. |
| HTML enrichment | [`TextEditor.implementation.enrichHTML`](https://foundryvtt.com/api/v14/classes/foundry.applications.ux.TextEditor.html#enrichHTML) | Await enrichment in context preparation. Do not use a synchronous Handlebars helper expecting a string. |
| Rolls | [`foundry.dice.Roll`](https://foundryvtt.com/api/v14/classes/foundry.dice.Roll.html) | Preserve actual dice and retained results; evaluate asynchronously and serialize to chat. No Year Zero dice library. |
| Chat rendering | [`renderChatMessageHTML`](https://foundryvtt.com/api/v14/functions/hookEvents.renderChatMessageHTML.html) | Native HTML element listeners, ownership checks on actions, no parsing rendered HTML for rules state. |
| Combat | [`foundry.documents.Combat`](https://foundryvtt.com/api/v14/classes/foundry.documents.Combat.html) | Custom side-selection coordinator with persistent HOL state; preserve core document lifecycle and tracker integration. |
| Effects | [`ActiveEffect`](https://foundryvtt.com/api/v14/classes/foundry.documents.ActiveEffect.html), [`ActiveEffectData`](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.ActiveEffectData.html) | Persistent typed effects; `start` and `duration` are separate structures; status icons derive from effective condition state. |
| Duration | [`EffectDurationData`](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.EffectDurationData.html) | V14 duration fields include `value`, `units`, `expiry`, `expired`. Do not design around V13 `duration.rounds/startRound/startTurn` payloads. |
| Expiration | [`ActiveEffectRegistry.refresh`](https://foundryvtt.com/api/v14/classes/foundry.helpers.ActiveEffectRegistry.html#refresh), [`CONFIG.ActiveEffect`](https://foundryvtt.com/api/v14/variables/CONFIG.ActiveEffect.html) | Bridge HOL turn anchors to registry events where appropriate; keep condition tick/decay under one owner so core and HOL cannot process it twice. |
| Token movement | [`TokenDocument.move`, measurement and movement hooks](https://foundryvtt.com/api/v14/classes/foundry.documents.TokenDocument.html#move) | Integrate with documented waypoints, pause/resume and completion results. Revalidate after interruption; do not animate then teleport independently. |
| Scene areas | [`RegionDocument`](https://foundryvtt.com/api/v14/classes/foundry.documents.RegionDocument.html) | Evaluate region shapes and attached emanations for lasting areas, with a HOL square footprint as rules truth. Prototype the exact placement workflow. |
| Pack tooling | [Official Foundry CLI](https://github.com/foundryvtt/foundryvtt-cli) | Prefer its pack/unpack interfaces; pin a validated version. Test Actors with embedded Items and Journal pages before adopting it. |

These sources identify supported extension points, not a ready-made HOL engine. Side initiative, action conversions, damage semantics, command economy and approval rules are HOL design work.

## V14-first approach

1. Build the smallest native package: manifest, one character model, one ability model, a V2 sheet and a native roll card.
2. Verify package load, create/edit/reload, console warnings and a second client in a clean V14 world.
3. Prove the four integration risks separately: alternating-side combat; condition timing plus core effect expiration; interrupted movement plus scene levels; compendium round trip with stable IDs.
4. Expand only after those contracts are demonstrated. Keep the first release single-level/square-grid automation, with explicit manual adjudication for unsupported geometry.

The general system tutorial contains examples from multiple eras. Prefer versioned API signatures when details disagree. Do not label every older-looking method as obsolete, nor use deprecated compatibility shims merely because they still execute. The release's [breaking-change project](https://github.com/orgs/foundryvtt/projects/67/views/8) is a follow-up checklist, not a substitute for testing.

## Distribution contract

Use a stable latest-manifest URL and an immutable, version-specific ZIP download URL in each released manifest. Validate both manifest copies, matching versions, packaged paths and pack contents. Archive root contains `system.json` and referenced package files. The source repository itself is not an install URL. Foundry's [system development guide](https://foundryvtt.com/article/system-development/) describes manual, manifest and directory distribution; directory listing is a separate later submission.

Proposed compatibility policy: V14 only, initially require the tested 14.369 build, and advertise the exact verified build only after testing. Broaden the minimum only after testing that older build. Future major versions require a separate validation effort.

## Evidence gaps to close in implementation

- Run in licensed Foundry 14.369; record actual OS/browser/Node build and deprecation output.
- Confirm all sheet parts, form handlers, drag/drop and detached windows behave correctly.
- Confirm permissions and synthetic Token actors across GM/player clients.
- Confirm custom combat events do not double-fire effects or skip anchors after reload/turn correction.
- Confirm square shapes, terrain and levels do not grant illegal targeting or tether distances.
- Pin and test the official CLI's concrete commands and Node 24 support; no database format assumption is accepted merely because a custom LevelDB writer produces files.

Issue #129 roll previews subscribe to the public V14
[`targetToken(user, token, targeted)` hook](https://foundryvtt.com/api/v14/functions/hookEvents.targetToken.html),
which fires on targeting and untargeting. Refresh only for the local user and
unregister on dialog close. Read `game.user.targets` again at submission; no
attack-target selector or inferred single-scene candidate replaces native targets.


Issue #134 uses the public V14 [`ChatMessage.applyMode`](https://foundryvtt.com/api/v14/classes/foundry.documents.ChatMessage.html#applyMode) for reference posts and keeps roll attachments on the existing message. `isContentVisible` guards the entire rendered roll summary. Full reference text is rebuilt from an inert HTML subset before posting; TextEditor enrichment alone is not treated as an HTML sanitizer. Item links use native `content-link` UUID anchors.
