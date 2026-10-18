import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1" ||
  process.env.HOL_TEST_ISOLATED_WORLD !== "1"
) throw new Error("Use an authorized isolated local world.");

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("test-results", { recursive: true });
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(
    () => game.ready && game.canvas.initialized && !game.canvas.loading,
  );
  await page.evaluate(async () => {
    const fixture = globalThis.__hol122Visual = {
      actors: [], scene: null, previous: canvas.scene?.id,
    };
    const pack = game.packs.get("heroes-of-legend.creatures");
    fixture.source = pack.index.find((entry) => entry.name === "Red Dragon")._id;
    fixture.hook = Hooks.on("createActor", (actor) => {
      if (actor.getFlag("heroes-of-legend", "catalogId") === "creature-red-dragon")
        fixture.actors.push(actor.id);
    });
    const scene = await Scene.create({
      name: "HOL122 native compendium drop fixture", active: false,
      width: 1600, height: 1200, grid: { size: 100 },
    });
    fixture.scene = scene.id;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await scene.view();
    if (canvas.scene.id !== scene.id || canvas.loading)
      throw new Error("Fixture scene not ready.");
  });
  // Dispatch an actual DOM drop so core resolves the compendium UUID, imports
  // the Actor and creates its Token using the native prototype settings.
  await page.evaluate(() => {
    const board = document.querySelector("#board");
    if (!board) throw new Error("Native canvas board missing.");
    const data = new DataTransfer();
    data.setData("text/plain", JSON.stringify({
      type: "Actor",
      uuid: `Compendium.heroes-of-legend.creatures.Actor.${__hol122Visual.source}`,
    }));
    const rect = board.getBoundingClientRect();
    board.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: data,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  });
  await page.waitForFunction(
    () => game.scenes.get(__hol122Visual.scene).tokens.size === 1,
  );
  const result = await page.evaluate(async () => {
    const fixture = __hol122Visual;
    const token = game.scenes.get(fixture.scene).tokens.contents[0];
    const actor = token.actor;
    actor.validate({ strict: true, fallback: false });
    await actor.sheet.render({ force: true });
    return {
      name: actor.name, type: actor.type,
      catalog: actor.getFlag("heroes-of-legend", "catalogId"),
      hp: actor.system.health.baseMax,
      created: fixture.actors.includes(token.actorId),
      width: token.width, height: token.height,
    };
  });
  assert.deepEqual(result, {
    name: "Red Dragon", type: "creature", catalog: "creature-red-dragon",
    hp: 56, created: true, width: 3, height: 3,
  });
  await page.locator(".hol-creature-sheet").screenshot({
    path: "test-results/creature-pack-dragon.png",
  });
  await page.evaluate(() => {
    document.querySelector(".hol-creature-reference").scrollIntoView();
  });
  await page.locator(".hol-creature-sheet").screenshot({
    path: "test-results/creature-pack-reference.png",
  });
  await page.evaluate(() => {
    const actor = game.scenes.get(__hol122Visual.scene).tokens.contents[0].actor;
    actor.sheet.setPosition({ width: 500, height: 900 });
  });
  await page.locator(".hol-creature-sheet").screenshot({
    path: "test-results/creature-pack-narrow.png",
  });
} finally {
  try {
    await page.evaluate(async () => {
      const fixture = globalThis.__hol122Visual;
      if (!fixture) return;
      if (fixture.hook) Hooks.off("createActor", fixture.hook);
      await new Promise((resolve) => setTimeout(resolve, 2100));
      if (fixture.previous && game.scenes.has(fixture.previous))
        await game.scenes.get(fixture.previous).view();
      else await canvas.draw(null);
      if (fixture.scene) await game.scenes.get(fixture.scene)?.delete();
      for (const id of fixture.actors) await game.actors.get(id)?.delete();
      if (fixture.actors.some((id) => game.actors.has(id)) || game.scenes.has(fixture.scene))
        throw new Error("Native drop fixture cleanup failed.");
    });
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
console.info("PASS: native compendium drop creates a strictly valid Red Dragon Actor and 3x3 Token; normal/narrow sheet references captured; fixtures cleaned; zero page errors.");
