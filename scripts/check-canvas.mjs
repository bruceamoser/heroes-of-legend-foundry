import assert from "node:assert/strict";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Select a disposable local world and enable writes");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 800 },
});
await context.addInitScript(() => {
  localStorage.setItem("core.noCanvas", "false");
  localStorage.setItem("core.maxFPS", "10");
  localStorage.setItem("core.performanceMode", "0");
});
const p = await context.newPage();
p.setDefaultTimeout(45000);
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
let fixture;
try {
  await p.goto(url);
  await selectTestUser(p, process.env.HOL_TEST_USER ?? "Gamemaster");
  await p.locator("button[name=join]").click();
  await p.waitForFunction(
    () => game.ready && canvas.initialized && !canvas.loading,
  );
  fixture = await p.evaluate(async () => {
    const a = await Actor.create({ name: "Canvas fixture", type: "character" });
    const s = await Scene.create({
      name: "HOL Canvas probe",
      width: 800,
      height: 800,
      padding: 0,
      grid: { type: 1, size: 100, distance: 1, units: "sq" },
      tokenVision: false,
      levels: [
        { name: "Lower", elevation: { bottom: 0, top: 10 } },
        { name: "Upper", elevation: { bottom: 10, top: 20 } },
      ],
    });
    const [lower, upper] = s.levels.contents;
    await s.updateEmbeddedDocuments("Level", [
      { _id: lower.id, "visibility.levels": [upper.id] },
      { _id: upper.id, "visibility.levels": [lower.id] },
    ]);
    const tokens = await s.createEmbeddedDocuments("Token", [
      {
        name: "Lower fixture",
        actorId: a.id,
        actorLink: true,
        x: 100,
        y: 100,
        elevation: 0,
        level: lower.id,
      },
      {
        name: "Upper fixture",
        actorId: a.id,
        actorLink: true,
        x: 400,
        y: 100,
        elevation: 10,
        level: upper.id,
      },
    ]);
    const regions = await s.createEmbeddedDocuments("Region", [
      {
        name: "Square area",
        shapes: [
          { type: "rectangle", x: 200, y: 200, width: 200, height: 200 },
        ],
        elevation: { bottom: 0, top: 10 },
        levels: [lower.id],
      },
      {
        name: "Ceiling",
        shapes: [{ type: "rectangle", x: 0, y: 0, width: 800, height: 800 }],
        elevation: { bottom: 10, top: 10 },
        levels: [lower.id, upper.id],
        behaviors: [
          {
            name: "Floor",
            type: "defineSurface",
            system: { placement: "bottom", culling: true },
          },
        ],
      },
    ]);
    await s.view({ level: lower.id });
    return {
      scene: s.id,
      actor: a.id,
      tokens: tokens.map((t) => t.id),
      regions: regions.map((r) => r.id),
      levels: [lower.id, upper.id],
    };
  });
  await p.waitForFunction(
    (id) => canvas.ready && canvas.scene?.id === id,
    fixture.scene,
  );
  const geometry = await p.evaluate((f) => {
    const s = game.scenes.get(f.scene),
      r = s.regions.get(f.regions[0]);
    return {
      ready: canvas.ready,
      rendered: s.tokens.contents.map((t) => ({
        id: t.id,
        level: t.level,
        rendered: t.rendered,
      })),
      view: canvas.level.id,
      lower: s.tokens.get(f.tokens[0]).object?.isVisible,
      upper: s.tokens.get(f.tokens[1]).object?.isVisible,
      cells: [
        [250, 250],
        [350, 250],
        [250, 350],
        [350, 350],
        [450, 350],
      ].map(([x, y]) => r.testPoint({ x, y, elevation: 0 })),
      otherFloor: r.testPoint({ x: 250, y: 250, elevation: 10 }),
    };
  }, fixture);
  assert.equal(geometry.ready, true);
  assert.equal(geometry.lower, true);
  assert.equal(geometry.upper, false);
  assert(geometry.rendered.every((t) => t.rendered));
  assert.deepEqual(geometry.cells, [true, true, true, true, false]);
  assert.equal(geometry.otherFloor, false);
  await p.evaluate((f) => {
    const t = game.scenes.get(f.scene).tokens.get(f.tokens[0]);
    window.holProbe = {};
    const hook = Hooks.on("moveToken", (doc, move, op, user) => {
      if (doc.id === t.id && user.isSelf && !window.holProbe.resume) {
        window.holProbe.resume = doc.pauseMovement();
        window.holProbe.pausedAt = [doc.x, doc.y];
        Hooks.off("moveToken", hook);
      }
    });
    window.holProbe.promise = t
      .move(
        [
          { x: 200, y: 100, checkpoint: true },
          { x: 300, y: 100 },
        ],
        { animate: false },
      )
      .then((result) => (window.holProbe.complete = result));
  }, fixture);
  await p.waitForFunction(() => window.holProbe.resume);
  assert.deepEqual(
    await p.evaluate(() => ({
      at: window.holProbe.pausedAt,
      complete: window.holProbe.complete,
    })),
    { at: [200, 100], complete: undefined },
  );
  await p.evaluate(async () => {
    await window.holProbe.resume();
    await window.holProbe.promise;
  });
  assert.deepEqual(
    await p.evaluate(
      (f) => ({
        complete: window.holProbe.complete,
        x: game.scenes.get(f.scene).tokens.get(f.tokens[0]).x,
      }),
      fixture,
    ),
    { complete: true, x: 300 },
  );
  const terrainWall = await p.evaluate(async (f) => {
    const s = game.scenes.get(f.scene),
      t = s.tokens.get(f.tokens[0]),
      r = s.regions.get(f.regions[0]);
    const path = [
      { x: 300, y: 100 },
      { x: 300, y: 300 },
    ];
    const before = t.object.measureMovementPath(
      t.object.createTerrainMovementPath(path),
    );
    await r.createEmbeddedDocuments("RegionBehavior", [
      {
        name: "Difficult",
        type: "modifyMovementCost",
        system: { difficulties: { walk: 2 } },
      },
    ]);
    const after = t.object.measureMovementPath(
      t.object.createTerrainMovementPath(path),
    );
    await s.createEmbeddedDocuments("Wall", [
      {
        c: [400, 0, 400, 400],
        move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
        levels: [f.levels[0]],
      },
    ]);
    const complete = await t.move({ x: 500, y: 100 }, { animate: false });
    return {
      before: { cost: before.cost, distance: before.distance },
      after: { cost: after.cost, distance: after.distance },
      complete,
      x: t.x,
    };
  }, fixture);
  assert.deepEqual(terrainWall.before, { cost: 2, distance: 2 });
  assert.deepEqual(terrainWall.after, { cost: 4, distance: 2 });
  assert.equal(terrainWall.complete, false);
  assert(terrainWall.x >= 300 && terrainWall.x < 400);
  const levels = await p.evaluate(async (f) => {
    const s = game.scenes.get(f.scene);
    await s.view({ level: f.levels[1] });
    const result = {
      lower: s.tokens.get(f.tokens[0]).object.isVisible,
      upper: s.tokens.get(f.tokens[1]).object.isVisible,
    };
    return result;
  }, fixture);
  assert.deepEqual(levels, { lower: false, upper: true });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native waypoint pause/resume, four-cell area, terrain cost 2→4, wall stop, and two-level surface culling; no page errors.",
  );
} finally {
  if (fixture)
    await p
      .evaluate(async (f) => {
        await game.scenes.get(f.scene)?.delete();
        await game.actors.get(f.actor)?.delete();
      }, fixture)
      .catch(() => {});
  await browser.close();
}
