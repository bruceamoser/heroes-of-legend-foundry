import { selectTestUser } from "./helpers/login.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";

// Run only against a disposable, already-created HOL development world.
const url = process.env.HOL_TEST_URL;
if (!url) throw new Error("Set HOL_TEST_URL to your isolated Foundry test server");
const target = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
  throw new Error("Runtime smoke test only accepts a local test server");
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  const startup = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.text().includes("heroes-of-legend")) startup.push(message.text());
  });
  await page.goto(url);
  if (new URL(page.url()).pathname === "/join") {
    await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
    await page.locator("input[name=password]").fill(process.env.HOL_TEST_PASSWORD ?? "");
    await page.locator("button[name=join]").click();
  }
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 30000 });
  const state = await page.evaluate(() => ({
    system: game.system.id,
    version: game.system.version,
    foundry: game.version,
    user: game.user.name,
    preview: game.i18n.localize("HOL.Preview")
  }));
  assert.equal(state.system, "heroes-of-legend");
  assert.notEqual(state.preview, "HOL.Preview");
  assert(startup.some(line => line.includes("Initializing package foundation")));
  assert.deepEqual(errors, []);
  console.info(JSON.stringify({ state, startup, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
