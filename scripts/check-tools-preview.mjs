import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const root = resolve("dist/workshop"),
  prefix = "/heroes-of-legend-foundry/";
const types = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) throw new Error("wrong base path");
    const file = resolve(
      root,
      url.pathname.slice(prefix.length) || "index.html",
    );
    if (!file.startsWith(root + "/")) throw new Error("invalid path");
    res.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
page.on("dialog", (d) => d.accept());
const output = resolve("test-results/tools");
await mkdir(output, { recursive: true });
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
try {
  await page.goto(base + "combat.html");
  await page.getByRole("heading", { name: "Round 1", exact: true }).waitFor();
  assert.equal(await page.locator(".combat-row").count(), 4);
  await page
    .locator('[data-action="choose"][data-id="borin-bridgekeeper"]')
    .click();
  assert(
    await page
      .locator(".combat-row.active")
      .getByText("Borin Bridgekeeper", { exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Main → Maneuver", exact: true })
    .click();
  assert.match(
    await page
      .getByRole("button", { name: "Spend main", exact: true })
      .innerText(),
    /0/,
  );
  assert.match(
    await page
      .getByRole("button", { name: "Spend maneuver", exact: true })
      .innerText(),
    /2/,
  );
  await page
    .getByRole("button", { name: "Maneuver → Move", exact: true })
    .click();
  assert.match(
    await page
      .getByRole("button", { name: "Use one square of movement", exact: true })
      .innerText(),
    /10/,
  );
  await page.screenshot({ path: `${output}/combat-active.png` });
  await page.getByRole("button", { name: "Finish turn", exact: true }).click();
  assert.match(
    await page.locator(".tool-banner").innerText(),
    /Opposition choose next/,
  );
  await page
    .getByRole("button", { name: "Hide Goblin Scrapper", exact: true })
    .click();
  await page.getByRole("button", { name: "Player view", exact: true }).click();
  assert.doesNotMatch(
    await page.locator(".combat-roster").innerText(),
    /Goblin Scrapper/,
  );
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/combat-${width}.png` });
  }
  await page.getByRole("button", { name: "DA view", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-action="choose"]').first().click();
    await page
      .getByRole("button", { name: "Finish turn", exact: true })
      .click();
  }
  assert.match(await page.locator(".tool-banner").innerText(), /Round 2/);
  assert.match(
    await page.locator(".tool-banner").innerText(),
    /Players choose next/,
  );
  await page.goto(base + "journal.html");
  await page
    .getByRole("article", { name: "Rule entry", exact: true })
    .getByRole("heading")
    .first()
    .waitFor();
  assert.match(await page.locator(".journal-page").innerText(), /3d6/);
  await page.getByLabel("Find rules", { exact: true }).fill("safe breath");
  assert((await page.locator(".journal-list button").count()) > 0);
  await page.getByLabel("Find rules", { exact: true }).fill("");
  await page
    .getByLabel("Collection", { exact: true })
    .selectOption("Abilities");
  await page.getByLabel("Find rules", { exact: true }).fill("Hook and Drive");
  await page.locator('[data-entry="ability-hook-and-drive"]').click();
  assert.match(await page.locator(".journal-page").innerText(), /pull 1/);
  assert.equal(
    await page.locator('.journal-page a[href*="github"]').count(),
    0,
  );
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/journal-${width}.png` });
  }
  await page.goto(base + "recovery.html");
  await page.getByRole("button", { name: "Healing", exact: true }).click();
  await page.getByLabel("Life resistance", { exact: true }).fill("2");
  assert.match(
    await page.locator("#healing-preview").innerText(),
    /Restore 4 HP/,
  );
  await page
    .getByRole("button", { name: "Apply to preview", exact: true })
    .click();
  assert.match(await page.locator(".tool-stats").innerText(), /7 \/ 25/);
  await page.getByRole("button", { name: "Safe breath", exact: true }).click();
  assert.match(await page.locator(".tool-stats").innerText(), /25 \/ 25/);
  await page.getByRole("button", { name: "Treat", exact: true }).click();
  await page.getByRole("button", { name: "2 progress", exact: true }).click();
  assert.match(
    await page.locator(".tool-wounds").innerText(),
    /Removed · scar remains/,
  );
  assert.match(
    await page.locator(".tool-wounds").innerText(),
    /Face: jagged cheek scar/,
  );
  await page
    .getByRole("button", { name: "Preview Dying", exact: true })
    .click();
  await page.getByRole("button", { name: "Stabilize", exact: true }).click();
  assert.match(
    await page.locator(".tool-result").innerText(),
    /Stabilized at 0 HP · 0 death marks/,
  );
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(
      await page
        .locator(".tools-content")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    await page.screenshot({ path: `${output}/recovery-${width}.png` });
  }
  await page.goto(base + "crafting.html");
  await page
    .getByRole("button", { name: "Begin attempt", exact: true })
    .click();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  assert.match(await page.getByRole("dialog").innerText(), /60 min/);
  await page
    .locator("#reference")
    .getByRole("button", { name: "Read rules", exact: true })
    .click();
  await page
    .locator("#rules-reference")
    .getByRole("heading", { name: "Travel Food", exact: true })
    .first()
    .waitFor();
  await page
    .locator("#rules-reference")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.evaluate(() => {
    globalThis.toolDice = crypto.getRandomValues;
    crypto.getRandomValues = (a) => {
      a[0] = 5;
      return a;
    };
  });
  await page
    .getByRole("button", { name: "Complete attempt", exact: true })
    .click();
  await page.evaluate(() => (crypto.getRandomValues = globalThis.toolDice));
  assert.equal(await page.locator("[data-stock]").innerText(), "d8");
  assert.match(
    await page.locator(".tool-result").innerText(),
    /strong: 3 steps/,
  );
  await page
    .getByRole("button", { name: "Begin attempt", exact: true })
    .click();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete attempt", exact: true })
    .click();
  assert.equal(await page.locator("[data-stock]").innerText(), "d8");
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(
      await page
        .locator(".tools-content")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    await page.screenshot({ path: `${output}/crafting-${width}.png` });
  }
  // Resolving an older queued recipe must show that recipe's resulting stock.
  await page
    .getByRole("button", { name: "Begin attempt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bound Torches", exact: true })
    .click();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete attempt", exact: true })
    .click();
  assert(
    await page
      .getByRole("heading", { name: "Travel Food", exact: true })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Twisted Cord", exact: true }).click();
  await page.evaluate(() => {
    globalThis.projectDice = crypto.getRandomValues;
    crypto.getRandomValues = (a) => {
      a[0] = 5;
      return a;
    };
  });
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Begin attempt", exact: true })
      .click();
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await page
      .getByRole("button", { name: "Complete attempt", exact: true })
      .click();
  }
  await page.evaluate(() => (crypto.getRandomValues = globalThis.projectDice));
  assert.equal(
    await page.locator("[data-project-progress]").innerText(),
    "4 / 4",
  );
  assert.match(
    await page.locator(".tool-result").innerText(),
    /One product finished/,
  );
  await page.screenshot({ path: `${output}/crafting-project.png` });
  assert.deepEqual(failures, []);
  console.log(
    "PASS tools: alternating sides, budgets/conversions, hidden roster, embedded journal search, healing resistance/safe breath, exact wound recovery/scars, crafting time/rules/steps/cap and compact layouts; zero browser errors.",
  );
} catch (e) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw e;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
