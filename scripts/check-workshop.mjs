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
const output = resolve("test-results/workshop");
await mkdir(output, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("tab").count(), 5);
  const edge = await page
    .getByRole("tab", { name: "Abilities", exact: true })
    .boundingBox();
  const sheet = await page.locator("#app").boundingBox();
  assert(
    edge.x < sheet.x && edge.x + edge.width <= sheet.x + 1,
    "tabs must hang outside the sheet",
  );
  await page.getByRole("tab", { name: "Abilities", exact: true }).hover();
  assert(
    await page
      .getByRole("tab", { name: "Abilities", exact: true })
      .locator(".nav-tooltip")
      .isVisible(),
  );
  await page.locator(".brand").hover();
  await page.screenshot({
    path: `${output}/desktop-encounter.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Belongings", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page.getByLabel("Pronouns", { exact: true }).fill("they/them");
  await page.getByLabel("Pronouns", { exact: true }).press("Tab");
  await page
    .getByRole("button", { name: "✓ Finish editing", exact: true })
    .click();
  assert(await page.getByText("they/them", { exact: true }).isVisible());
  await page.getByRole("tab", { name: "Encounter", exact: true }).click();
  await page
    .getByRole("button", { name: "Read rules", exact: true })
    .first()
    .click();
  assert(await page.getByRole("dialog").isVisible());
  assert.equal(
    await page.getByRole("dialog").locator('a[href*="github.com"]').count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open character builder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "4 Early learning", exact: true })
    .click();
  await page.screenshot({
    path: `${output}/desktop-learning.png`,
    fullPage: false,
  });
  assert(
    await page
      .locator('[data-eligible="false"] button[data-action="purchase"]')
      .first()
      .isDisabled(),
  );
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Export character JSON", exact: true })
      .isEnabled(),
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export character JSON", exact: true })
    .click();
  const download = await downloaded;
  const file = `${output}/borin.hol.json`;
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  assert.equal(exported.draft.profile.pronouns, "they/them");
  await page.getByRole("button", { name: "New hero", exact: true }).click();
  assert(
    await page
      .getByRole("heading", { name: "Your new hero", exact: true })
      .isVisible(),
  );
  await page.getByLabel("Character name", { exact: true }).fill("Moss Rowan");
  await page.getByLabel("Character name", { exact: true }).press("Tab");
  await page.reload();
  await page
    .getByRole("heading", { name: "Moss Rowan", exact: true })
    .waitFor();
  await page.locator("#import-file").setInputFiles(file);
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Export character JSON", exact: true })
      .isEnabled(),
  );
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile-sheet.png`, fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile overflow",
  );
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  await page.getByLabel("Search abilities", { exact: true }).fill("shield");
  assert(await page.locator("#results").innerText());
  await page.screenshot({
    path: `${output}/mobile-abilities.png`,
    fullPage: true,
  });
  // Build a fresh hero through actual controls, including granted recipes.
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "New hero", exact: true }).click();
  for (const [label, value] of [
    ["Character name", "Reed"],
    ["Brawn", "1"],
    ["Knowledge", "1"],
    ["Reason", "1"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).press("Tab");
  }
  await page.getByRole("button", { name: "2 Ancestry", exact: true }).click();
  await page
    .locator('[data-action="ancestry"][data-id="ancestry-human"]')
    .click();
  await page.locator('input[value="trait-human-weathered"]').check();
  await page.locator('input[value="trait-human-far-walker"]').check();
  await page
    .getByLabel("Home language", { exact: true })
    .selectOption("dwarven");
  await page.getByRole("button", { name: "3 Origins", exact: true }).click();
  await page
    .getByLabel("Culture", { exact: true })
    .selectOption("origin-culture-deep-halls");
  await page.locator('input[name="culture-pair"][value="0"]').check();
  await page
    .getByLabel("Background", { exact: true })
    .selectOption("origin-background-bridge-worker");
  await page.locator('input[name="background-pair"][value="0"]').check();
  await page.getByRole("button", { name: "5 Class", exact: true }).click();
  await page
    .locator('[data-action="class"][data-id="class-intellect"]')
    .click();
  await page.locator('input[value="discipline-craft"]').check();
  await page.locator('input[value="discipline-scholarship"]').check();
  await page
    .locator(
      '[data-action="signature"][data-id="ability-signature-intellect-spot-the-leverage"]',
    )
    .click();
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  await page.locator('input[value="recipe-travel-food"]').check();
  await page.locator('input[value="recipe-bound-torches"]').check();
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Export character JSON", exact: true })
      .isEnabled(),
    "fresh hero must finish creation",
  );
  assert.deepEqual(failures, []);
  console.info(
    "Workshop passed: tabs/keyboard, edit mode, local references, eligibility, export/import, resume and 390px layout; no browser errors.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
