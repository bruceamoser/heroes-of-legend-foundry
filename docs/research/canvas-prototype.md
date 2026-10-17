# V14 canvas integration proof

F07 / issue #10, October 17, 2026. Run `HOL_TEST_URL=http://127.0.0.1:30014 HOL_TEST_ALLOW_WRITES=1 npm run test:canvas` in the isolated development world. Tested on **Foundry 14.369**, Node 24.22.0, headless Chromium. Canvas remains enabled; fixtures use a small blank square-grid Scene and are removed afterward.

## Verified APIs and results

- `Scene.create` with embedded `Level` records; `scene.view({level})` after canvas initialization. A document on an excluded level can have `object === null`; do not assume every Token document is rendered.
- `TokenDocument.move` with a checkpoint at (200,100) and destination (300,100). The initiating client's `moveToken` hook calls `pauseMovement()`. While paused the document is at the checkpoint and the completion promise remains pending. Calling the returned resume callback completes the remaining path and resolves true.
- A native rectangle Region from (200,200) with width/height 200 on a 100-pixel grid contains the four intended cell centers and excludes the neighboring center and the upper floor. This proves native square preview geometry; HOL area-selection UI and large-token inclusion policies remain D03 work.
- A native `modifyMovementCost` Region Behavior with walk difficulty 2 changes a two-square route's cost from 2 to 4 without changing its distance. **Call `Token.createTerrainMovementPath` before `Token.measureMovementPath`.** Measuring the raw waypoints alone returned cost 2 and ignored the terrain annotation.
- A normal movement Wall blocks the route to (500,100). The movement resolves false and stops before x=400 (observed x=349). Core wall clipping is pixel-precise; HOL must separately enforce legal grid arrangements rather than treating this endpoint as a legal snapped square.
- Two mutually visible levels separated by a native `defineSurface` Region Behavior with culling enabled hide the upper Token when viewing below and hide the lower Token when viewing above. Both Token objects are rendered, so this is actual surface culling rather than merely excluding the other level's documents.
- No uncaught browser errors.

References: [TokenDocument](https://foundryvtt.com/api/v14/classes/foundry.documents.TokenDocument.html), [Token](https://foundryvtt.com/api/v14/classes/foundry.canvas.placeables.Token.html), [RegionDocument](https://foundryvtt.com/api/v14/classes/foundry.documents.RegionDocument.html), [Scene](https://foundryvtt.com/api/v14/classes/foundry.documents.Scene.html). Signatures and behavior were checked against installed 14.369 source and the executable fixture.

## Boundaries for implementation

No teleport-after-animation workaround, custom wall engine or legacy level module is needed. Use the initiating client's pause callback for interruption windows and consume only completed movement. Server-side/GM document validation must still enforce HOL movement allowances and receipts; this test does not make arbitrary client movement authoritative.

Native visibility is not a complete targeting or distance rule. Cross-floor reach, vertical tether distance, non-square grids and airborne incapacity still need explicit DA adjudication where the books do not define them. Do not infer those mechanics from pixel distance or token visibility. The full movement/reaction/area/summon implementations remain D01–D07 and A07.
