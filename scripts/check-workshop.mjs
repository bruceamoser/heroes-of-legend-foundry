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
      .getByRole("tab", { name: "Inventory", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  // Equipment changes update play statistics, while grants and dice remain visible.
  const armorRow = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Ordinary Medium Armor" });
  assert.match(await armorRow.innerText(), /Wear Medium Armor/);
  assert.match(await page.locator(".inventory-table").innerText(), /d8/);
  await page
    .getByRole("button", { name: "Wear Ordinary Medium Armor", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".vital")
      .filter({ hasText: "Armor DR" })
      .locator("strong")
      .innerText(),
    "2",
  );
  await page
    .getByRole("button", { name: "Remove Ordinary Medium Armor", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".vital")
      .filter({ hasText: "Armor DR" })
      .locator("strong")
      .innerText(),
    "0",
  );
  await page
    .getByLabel("Carry Ordinary Medium Armor", { exact: true })
    .uncheck();
  assert.match(await page.locator(".inventory-stats").innerText(), /10 \/ 13/);
  await page.getByLabel("Carry Ordinary Medium Armor", { exact: true }).check();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page.getByLabel("Show Basic Melee", { exact: true }).uncheck();
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.basic),
    "ability-basic-melee",
  );
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  assert.equal(
    await page.locator('.action-table [data-id="ability-basic-melee"]').count(),
    0,
  );
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page.getByLabel("Show Basic Melee", { exact: true }).check();
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  assert.equal(await page.locator('[data-dp="spent"]').innerText(), "21");
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  assert.equal(await page.locator('[data-dp="current"]').innerText(), "10");
  await page
    .getByRole("button", { name: "Develop level 2", exact: true })
    .click();
  await page
    .getByLabel("Search abilities", { exact: true })
    .fill("Conditioned Body");
  await page
    .locator('[data-action="purchase"][data-id="ability-conditioned-body"]')
    .click();
  assert.equal(
    await page.locator("[data-dp-remaining]").innerText(),
    "8 DP remaining",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.locator('[data-dp="spent"]').innerText(), "23");
  await page
    .getByRole("button", { name: "Decrease level", exact: true })
    .click();
  assert.equal(await page.locator('[data-dp="current"]').innerText(), "0");
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  assert.equal(await page.locator('[data-dp="current"]').innerText(), "8");
  await page
    .getByRole("button", { name: "Decrease level", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save character", exact: true })
    .click();
  await page.getByLabel("Save name", { exact: true }).fill("Borin original");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page.getByLabel("Pronouns", { exact: true }).fill("they/them");
  await page.getByLabel("Pronouns", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  assert(await page.getByText("they/them", { exact: true }).isVisible());
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page
    .getByRole("button", { name: "Basic Melee", exact: true })
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
  // Only the panel scrolls: header, balance and hanging icon rail keep position.
  assert.match(
    await page.locator('[aria-label="Current disciplines"]').innerText(),
    /Armor 1/,
  );
  await page
    .getByRole("button", { name: "Show more future choices", exact: true })
    .click();
  const fixedBefore = await page.evaluate(() =>
    [".workshop-header", ".context-strip", ".edge-tabs"].map(
      (s) => document.querySelector(s).getBoundingClientRect().top,
    ),
  );
  await page.locator("#panel").evaluate((el) => (el.scrollTop = 500));
  assert(await page.locator("#panel").evaluate((el) => el.scrollTop > 0));
  assert.deepEqual(
    await page.evaluate(() =>
      [".workshop-header", ".context-strip", ".edge-tabs"].map(
        (s) => document.querySelector(s).getBoundingClientRect().top,
      ),
    ),
    fixedBefore,
  );
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.locator("#panel").evaluate((el) => (el.scrollTop = 0));
  await page.locator(".brand").hover();
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
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  assert.match(
    await page.locator(".inventory-table").innerText(),
    /Ordinary Medium Armor/,
  );
  await page.screenshot({ path: `${output}/desktop-equipment.png` });
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
      .getByRole("heading", { name: "New hero", exact: true })
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
    if (label !== "Character name")
      assert.equal(
        await page
          .locator(`[data-attribute="${label.toLowerCase()}"]`)
          .innerText(),
        "+1",
      );
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
  assert.match(
    await page
      .getByLabel("Culture", { exact: true })
      .locator("option")
      .allTextContents()
      .then((v) => v.join(" ")),
    /Deep Halls.*Craft 1.*Trail Workshop/,
  );
  assert.match(
    await page
      .getByLabel("Background", { exact: true })
      .locator("option")
      .allTextContents()
      .then((v) => v.join(" ")),
    /Bridge Worker.*Craft 1.*Trail Workshop/,
  );
  await page.getByLabel("Culture", {exact:true}).focus();
  await page
    .getByLabel("Culture", { exact: true })
    .selectOption("origin-culture-deep-halls|0");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.origin),
    "culture",
  );
  await page
    .getByLabel("Background", { exact: true })
    .selectOption("origin-background-bridge-worker|0");
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
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  assert(
    await page
      .getByRole("heading", { name: "Ancestry traits", exact: true })
      .count(),
  );
  const recipe = page
    .locator(".recipe-table tr")
    .filter({ hasText: "Travel Food" });
  await recipe.locator('[data-action="recipe-roll"]').click();
  await page.locator("#recipe-net").fill("3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Roll", exact: true })
    .click();
  assert.match(
    await page.locator("#recipe-roll-result").innerText(),
    /Weak|Standard|Strong/,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Roll", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open character builder", exact: true })
    .click();
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  await page
    .getByLabel("Search equipment", { exact: true })
    .fill("Ordinary Heavy Armor");
  await page
    .getByLabel("Quantity Ordinary Heavy Armor", { exact: true })
    .fill("100");
  await page
    .locator('[data-action="equipment"][data-id="item-ordinary-heavy-armor"]')
    .click();
  assert.match(
    await page.locator("#notice").innerText(),
    /Override coin limit/,
  );
  await page.getByLabel("Override coin limit", { exact: false }).check();
  await page
    .getByLabel("Quantity Ordinary Heavy Armor", { exact: true })
    .fill("100");
  await page
    .locator('[data-action="equipment"][data-id="item-ordinary-heavy-armor"]')
    .click();
  assert.match(
    await page.locator(".inventory-table").innerText(),
    /Ordinary Heavy Armor/,
  );
  assert.match(
    await page.locator(".inventory-stats").innerText(),
    /-[0-9]+ coins/,
  );
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Export character JSON", exact: true })
      .isEnabled(),
  );
  await page
    .getByRole("button", { name: "Save character", exact: true })
    .click();
  await page.getByLabel("Save name", { exact: true }).fill("Reed crafting");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load character", exact: true })
    .click();
  assert.equal(await page.locator(".saved-characters article").count(), 2);
  await page.screenshot({ path: `${output}/saved-characters.png` });
  await page
    .locator(".saved-characters article")
    .filter({ hasText: "Borin original" })
    .getByRole("button", { name: "Load", exact: true })
    .click();
  assert(
    await page
      .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
      .isVisible(),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Load character", exact: true })
    .click();
  await page
    .locator(".saved-characters article")
    .filter({ hasText: "Reed crafting" })
    .getByRole("button", { name: "Load", exact: true })
    .click();
  assert(
    await page.getByRole("heading", { name: "Reed", exact: true }).isVisible(),
  );
  // Import a ranged character and inspect its creation grants, not just the sheet.
  const fixtures = JSON.parse(
    await readFile(resolve("tests/fixtures/reference-heroes.json"), "utf8"),
  );
  const ranged = {
    ...exported,
    draft: fixtures.characters.find((h) => h.id === "lira-ashbow").draft,
  };
  await page.locator("#import-file").setInputFiles({
    name: "Lira.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(ranged)),
  });
  await page
    .getByRole("heading", { name: "Lira Ashbow", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  const rangedInventory = await page.locator(".inventory-table").innerText();
  assert.match(rangedInventory, /Ordinary Ranged Weapon/);
  assert.match(rangedInventory, /Ammunition Bundle/);
  assert.match(rangedInventory, /d8/);
  // Unknown imported IDs remain inert text and repairable choices.
  const odd = { ...exported, draft: structuredClone(exported.draft) };
  odd.draft.traitIds[0] = 'trait-unknown" data-injected="yes';
  await page.locator("#import-file").setInputFiles({
    name: "unknown-trait.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(odd)),
  });
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  assert.equal(await page.locator("[data-injected]").count(), 0);
  assert.match(await page.locator(".trait-table").innerText(), /trait-unknown/);
  assert.deepEqual(failures, []);
  console.info(
    "Workshop passed: fixed scrolling, live attributes, grants, armor/Bulk/supply, grouped actions, crafting rolls, level replay, coin override, named saves, export/import and 390px layout; no browser errors.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
