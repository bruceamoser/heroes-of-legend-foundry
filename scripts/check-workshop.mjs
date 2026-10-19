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
const dialogs = [];
page.on("dialog", (d) => {
  dialogs.push(d.message());
  d.accept();
});
const output = resolve("test-results/workshop");
await mkdir(output, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("tab").count(), 5);
  assert.equal(
    await page.getByRole("tab", { name: "Recipes", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Main", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator('[data-action="builder"]').count(), 0);
  assert.deepEqual(
    (await page.locator(".play-summary > .box > summary > h3").allTextContents())
      .slice(0, 4)
      .map((s) => s.trim()),
    ["Passives", "Ancestry traits", "Defenses", "Conditions"],
  );
  assert.equal(
    await page
      .locator(".action-groups .trait-table, .action-groups .passive-table")
      .count(),
    0,
  );
  await page.locator(".passive-table [data-action=reference]").first().click();
  assert(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.locator(".trait-table [data-action=reference]").first().click();
  assert(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Abilities", exact: true }).focus();
  await page.keyboard.press("Home");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "tab-Main",
  );

  const edge = await page
    .getByRole("tab", { name: "Abilities", exact: true })
    .boundingBox();
  const sheet = await page.locator("#app").boundingBox();
  assert(sheet.width <= 900, "sheet must fit a Foundry-sized window");
  assert.equal(await page.getByLabel("Pronouns", { exact: true }).count(), 0);
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
  for (const width of [900, 970]) {
    await page.setViewportSize({ width, height: 800 });
    assert(
      (await page.getByRole("tab", { name: "Main", exact: true }).boundingBox())
        .x >= 0,
      "edge tabs remain on screen",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 900, height: 800 });
  await page.screenshot({ path: `${output}/foundry-sized-sheet.png` });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  const rankRows = await page
    .locator(".discipline-table tbody tr")
    .allTextContents();
  assert.match(rankRows.join(" "), /Armor\s*1/);
  assert.match(rankRows.join(" "), /Guard\s*1/);
  await page.locator('.discipline-table [data-id="discipline-armor"]').click();
  assert(
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Armor", exact: true })
      .isVisible(),
  );
  await page.keyboard.press("Escape");
  await page.locator(".brand").hover();
  await page.screenshot({ path: `${output}/desktop-abilities.png` });
  await page.getByRole("tab", { name: "Abilities", exact: true }).focus();
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
    .filter({ hasText: "Ordinary Light Armor" });
  assert.match(await armorRow.innerText(), /Wear Light Armor/);
  assert.match(await page.locator(".inventory-table").innerText(), /d8/);
  await page.getByLabel("Wear Ordinary Light Armor", { exact: true }).check();
  assert.equal(
    await page
      .locator(".vital")
      .filter({ hasText: "Armor DR" })
      .locator("strong")
      .innerText(),
    "1",
  );
  await page.getByLabel("Wear Ordinary Light Armor", { exact: true }).uncheck();
  assert.equal(
    await page
      .locator(".vital")
      .filter({ hasText: "Armor DR" })
      .locator("strong")
      .innerText(),
    "0",
  );
  await page
    .getByLabel("Carry Ordinary Light Armor", { exact: true })
    .uncheck();
  assert.match(await page.locator(".inventory-stats").innerText(), /10 \/ 13/);
  await page.getByLabel("Carry Ordinary Light Armor", { exact: true }).check();
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
  await page.getByRole("button", { name: "Spend DP", exact: true }).click();
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
  await page.getByLabel("Player", { exact: true }).fill("Bruce");
  await page.getByLabel("Player", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  assert(await page.getByText("Bruce", { exact: true }).isVisible());
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
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
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
    /Ordinary Light Armor/,
  );

  // Remove a purchased shield directly from its row, preserving the granted shield.
  assert.equal(
    await page.getByText("Remove purchased items", { exact: true }).count(),
    0,
  );
  const beforePurchase = await page
    .locator(".context-strip .inventory-stats")
    .innerText();
  await page
    .getByLabel("Search equipment", { exact: true })
    .fill("Ordinary Shield");
  await page
    .locator('[data-action="equipment"][data-id="item-ordinary-shield"]')
    .click();
  const shieldRows = page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: "Ordinary Shield" });
  assert.equal(await shieldRows.count(), 2);
  const removeShield = page.getByRole("button", {
    name: "Remove purchased Ordinary Shield",
    exact: true,
  });
  assert.equal(await removeShield.count(), 1);
  assert.match(
    await removeShield.locator("xpath=ancestor::tr").innerText(),
    /Purchased/,
  );
  // Even a later play removal must not hide the original purchase from creation editing.
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: "Ordinary Shield" })
    .filter({ hasText: "Purchased" })
    .getByRole("button", { name: "Delete Ordinary Shield", exact: true })
    .click();
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  assert.equal(await shieldRows.count(), 2);
  await removeShield.click();
  assert.equal(await shieldRows.count(), 1);
  assert.match(await shieldRows.innerText(), /Shielding Step/);
  assert.equal(
    await page.locator(".context-strip .inventory-stats").innerText(),
    beforePurchase,
  );
  await page.getByLabel("Search equipment", { exact: true }).fill("");
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
  assert.equal(exported.draft.profile.player, "Bruce");
  // Play controls change the sheet directly and survive autosave/JSON transfer.
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  assert(await page.locator("#results .action-table").first().isVisible());
  await page.locator('#results [data-action="reference"]').first().click();
  assert(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Wear Food Bundle", { exact: true }).check();
  await page.getByLabel("Hold Food Bundle", { exact: true }).check();
  await page.getByLabel("Carry Food Bundle", { exact: true }).uncheck();
  assert(
    !(await page.getByLabel("Wear Food Bundle", { exact: true }).isChecked()),
  );
  assert(
    !(await page.getByLabel("Hold Food Bundle", { exact: true }).isChecked()),
  );
  await page.getByLabel("Hold Food Bundle", { exact: true }).check();
  assert(
    await page.getByLabel("Carry Food Bundle", { exact: true }).isChecked(),
  );
  await page.getByLabel("Carry Food Bundle", { exact: true }).uncheck();
  await page.getByLabel("Wear Food Bundle", { exact: true }).check();
  assert(
    await page.getByLabel("Carry Food Bundle", { exact: true }).isChecked(),
  );
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator("#play-item").selectOption("item-ordinary-heavy-armor");
  await page.locator("#play-quantity").fill("2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".inventory-table tr")
      .filter({ hasText: "Ordinary Heavy Armor" })
      .locator("td")
      .nth(1)
      .locator("input")
      .inputValue(),
    "2",
  );
  await page
    .getByRole("button", { name: "Delete Ordinary Light Armor", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Wear Ordinary Light Armor", { exact: true }).count(),
    0,
  );
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove language Common", exact: true })
    .click();
  await page.getByRole("button", { name: "Add language", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("River Sign");
  await page.getByLabel("Form", { exact: true }).selectOption("signed");
  await page.getByLabel("Read & write", { exact: true }).uncheck();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add language", exact: true })
    .click();
  assert.match(
    await page.locator(".language-table").innerText(),
    /River Sign.*Signed/s,
  );
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.getByLabel("Condition", { exact: true }).selectOption("burning");
  await page.locator("#condition-rating").fill("2");
  await page.getByLabel("Starred", { exact: true }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.getByLabel("Condition", { exact: true }).selectOption("prone");
  assert(!(await page.locator("#condition-rating").isVisible()));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 2/);
  assert.match(await page.locator(".condition-bar").innerText(), /Prone/);
  await page.reload();
  await page
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 2/);
  await page.screenshot({ path: `${output}/play-main.png` });
  await page.getByRole("button", { name: "Remove Prone", exact: true }).click();
  assert.doesNotMatch(
    await page.locator(".condition-bar").innerText(),
    /Prone/,
  );
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  assert.equal(
    await page.getByLabel("Wear Ordinary Light Armor", { exact: true }).count(),
    0,
  );
  assert(
    await page.getByLabel("Wear Food Bundle", { exact: true }).isChecked(),
  );
  await page.screenshot({ path: `${output}/play-inventory.png` });
  await page
    .getByRole("button", { name: "Delete Ordinary Heavy Armor", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Wear Ordinary Heavy Armor", { exact: true }).count(),
    0,
  );
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  assert.match(await page.locator(".language-table").innerText(), /River Sign/);
  assert.doesNotMatch(
    await page.locator(".language-table").innerText(),
    /Common/,
  );
  // Standard language definitions can be restored after removing them.
  await page.getByRole("button", { name: "Add language", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("common");
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Common",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add language", exact: true })
    .click();
  assert.match(await page.locator(".language-table").innerText(), /Common/);
  await page
    .getByRole("button", { name: "Remove language River Sign", exact: true })
    .click();
  assert.doesNotMatch(
    await page.locator(".language-table").innerText(),
    /River Sign/,
  );
  // A missed signature has its own flow, independent of spending at the current level.
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  const beforeSignature = await page.locator('[data-dp="current"]').innerText();
  assert(
    await page
      .getByRole("button", { name: "Choose level 3 signature", exact: true })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Spend DP", exact: true }).click();
  assert.equal(
    await page.locator('[data-action="advance-signature"]').count(),
    0,
  );
  assert(await page.locator("[data-dp-remaining]").isVisible());
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose level 3 signature", exact: true })
    .click();
  assert.equal(await page.locator("[data-dp-remaining]").count(), 0);
  await page.locator('[data-action="advance-signature"]').first().click();
  await page.screenshot({ path: `${output}/signature-choice.png` });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Choose level 3 signature", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[data-dp="current"]').innerText(),
    beforeSignature,
  );
  const playDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const playFile = `${output}/borin-play.hol.json`;
  await (await playDownload).saveAs(playFile);
  const played = JSON.parse(await readFile(playFile, "utf8"));
  assert.equal(played.schemaVersion, 3);
  assert.equal(played.draft.play.conditions[0].key, "burning");
  assert(played.draft.progression.levels[3].signatures[3]);
  await page.locator("#import-file").setInputFiles(playFile);
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 2/);
  await page.locator("#import-file").setInputFiles(file);
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
  await page.getByLabel("Culture", { exact: true }).focus();
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
  assert.equal(await page.getByRole("tab").count(), 6);
  assert.equal(await page.locator(".recipe-table").count(), 0);
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  assert.equal(await page.locator(".recipe-table").count(), 0);
  assert.equal(
    await page.getByRole("heading", { name: "Recipes", exact: true }).count(),
    0,
  );
  await page.getByRole("tab", { name: "Inventory", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Recipes", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.reload();
  await page.getByRole("heading", { name: "Recipes", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Recipes", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.locator(".brand").hover();
  await page.screenshot({ path: `${output}/desktop-recipes.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/mobile-recipes.png` });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const recipe = page
    .locator(".recipe-table tr")
    .filter({ hasText: "Travel Food" });
  await recipe.locator('[data-action="recipe-roll"]').click();
  assert.equal(await page.locator("#roll-net-value").innerText(), "Even");
  const left = await page
    .locator(".roll-net-labels span")
    .first()
    .boundingBox();
  const right = await page
    .locator(".roll-net-labels span")
    .last()
    .boundingBox();
  assert(left.x < right.x);
  assert.deepEqual(
    await page.locator(".roll-net-labels span").allTextContents(),
    ["Banes", "Boons"],
  );
  await page.locator("#recipe-net").fill("-3");
  assert.equal(await page.locator("#roll-net-value").innerText(), "3 Banes");
  assert.equal(
    await page.locator("#recipe-net").getAttribute("aria-valuetext"),
    "3 Banes",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Roll", exact: true })
    .click();
  await page.screenshot({ path: `${output}/recipe-slider.png` });
  await page.locator("#recipe-net").fill("3");
  assert.equal(await page.locator("#roll-net-value").innerText(), "3 Boons");
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
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
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
  await page.evaluate(() => {
    const key = "hol.workshop.v1",
      saved = JSON.parse(localStorage.getItem(key));
    saved.mode = "sheet";
    saved.tab = "Recipes";
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Lira Ashbow", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Recipes", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("tab", { name: "Main", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );

  // An unfinished signature equipment choice stays reachable after leaving its screen.
  const warden = structuredClone(ranged);
  warden.draft.classId = "class-warden";
  warden.draft.signatureId = "ability-signature-warden-keep-the-quarry-close";
  warden.draft.attributes.knowledge = 1;
  warden.draft.attributes.guile = -1;
  warden.draft.purchases[1] = [];
  warden.draft.shopping = [];
  warden.draft.progression = { level: 7, levels: {} };
  await page.locator("#import-file").setInputFiles({
    name: "Warden.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(warden)),
  });
  await page
    .getByRole("button", { name: "Choose level 7 signature", exact: true })
    .click();
  await page
    .locator(
      '[data-action="advance-signature"][data-id="ability-signature-warden-turn-the-hunt"]',
    )
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Choose level 7 signature", exact: true })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Spend DP", exact: true }).click();
  assert.equal(await page.getByLabel("Weapon", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose level 7 signature", exact: true })
    .click();
  await page.getByLabel("Weapon", { exact: true }).selectOption("ranged");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Choose level 7 signature", exact: true })
      .count(),
    0,
  );
  // Unknown imported IDs remain inert text and repairable choices.
  const odd = { ...exported, draft: structuredClone(exported.draft) };
  odd.draft.classId = "ability-wear-medium-armor";
  odd.draft.culture = { id: "ability-wear-medium-armor", pair: 0 };
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
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page.getByRole("button", { name: "3 Origins", exact: true }).click();
  await page
    .getByLabel("Culture", { exact: true })
    .selectOption("origin-culture-walled-communities|0");
  assert.match(
    await page.locator(".origin-grants").first().innerText(),
    /Armor 1/,
  );
  await page.getByRole("button", { name: "5 Class", exact: true }).click();
  await page
    .locator('[data-action="class"][data-id="class-protector"]')
    .click();
  assert.match(await page.locator(".hero-header").innerText(), /Protector/);
  // Buy the new shared options through the real learning UI and retain their choices.
  const utility = structuredClone(exported);
  utility.draft.purchases = { 0: [], 1: [] };
  delete utility.draft.progression;
  delete utility.draft.play;
  await page.locator("#import-file").setInputFiles({
    name: "utility.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(utility)),
  });
  await page
    .getByRole("button", { name: "4 Early learning", exact: true })
    .click();
  const initialDp = Number(
    (await page.locator("[data-dp-remaining]").innerText()).split(" ")[0],
  );
  for (const [id, name] of [
    ["another-tongue", "Another Tongue"],
    ["a-party-piece", "A Party Piece"],
    ["message-by-heart", "Message by Heart"],
    ["catch-that", "Catch That!"],
    ["quick-exit", "Quick Exit"],
    ["look-over-here", "Look Over Here!"],
  ]) {
    await page.getByLabel("Search abilities", { exact: true }).fill(name);
    const learn = page.locator(
      `[data-action="purchase"][data-id="ability-${id}"]`,
    );
    assert.equal(await learn.innerText(), "1 DP · Learn");
    await learn.click();
    assert(await learn.isDisabled());
    if (id === "another-tongue")
      await page.getByLabel("Language", { exact: true }).selectOption("goblin");
    if (id === "a-party-piece") {
      await page
        .getByLabel("Performance specialty", { exact: true })
        .fill("juggling");
      await page
        .getByLabel("Performance specialty", { exact: true })
        .press("Tab");
    }
  }
  assert.equal(
    await page.locator("[data-dp-remaining]").innerText(),
    `${initialDp - 6} DP remaining`,
  );
  await page.getByLabel("Search abilities", { exact: true }).fill("");
  await page.screenshot({ path: `${output}/one-dp-learning.png` });
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  assert.match(await page.locator(".language-table").innerText(), /Goblin/);
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  await page
    .locator(
      '#results [data-action="reference"][data-id="ability-a-party-piece"]',
    )
    .click();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /Your specialty: juggling/,
  );
  await page.keyboard.press("Escape");
  await page
    .locator(
      '#results [data-action="reference"][data-id="ability-message-by-heart"]',
    )
    .click();
  await page
    .getByLabel("Memorized message", { exact: true })
    .fill("Meet by the old bridge at dawn.");
  await page.getByRole("button", { name: "Save message", exact: true }).click();
  await page.reload();
  await page
    .locator(
      '#results [data-action="reference"][data-id="ability-message-by-heart"]',
    )
    .click();
  assert.equal(
    await page.getByLabel("Memorized message", { exact: true }).inputValue(),
    "Meet by the old bridge at dawn.",
  );
  await page.screenshot({ path: `${output}/memorized-message.png` });
  await page.keyboard.press("Escape");
  const savedUtility = await page.evaluate(
    () => JSON.parse(localStorage.getItem("hol.workshop.v1")).character,
  );
  assert.equal(
    savedUtility.draft.acquisitions["ability-another-tongue"].languageId,
    "goblin",
  );
  assert.equal(
    savedUtility.draft.acquisitions["ability-a-party-piece"].specialty,
    "juggling",
  );
  assert.equal(
    savedUtility.draft.play.memorizedMessage,
    "Meet by the old bridge at dawn.",
  );
  // Every saved/imported hero uses the current catalog immediately, without a version choice.
  const previous = structuredClone(exported);
  previous.sourceCommit = "64089a1c8961d7faff172f179448a8b6e57827ef";
  previous.draft.culture = {
    id: "origin-culture-cloister-valleys",
    pair: 0,
    retainedFrom: previous.sourceCommit,
  };
  const beforeUpdateDialogs = dialogs.length;
  const previousLibraryCount = await page.evaluate((character) => {
    const key = "hol.workshop.library.v1";
    const entries = JSON.parse(localStorage.getItem(key) ?? "[]");
    entries.push({
      id: "current-rules-save",
      name: "Current rules hero (before rules update)",
      updated: "2026-10-18",
      character,
    });
    localStorage.setItem(key, JSON.stringify(entries));
    localStorage.setItem(
      "hol.workshop.v1",
      JSON.stringify({
        character,
        mode: "sheet",
        tab: "Abilities",
        saveId: "current-rules-save",
      }),
    );
    return entries.length;
  }, previous);
  await page.reload();
  await page.getByRole("tab", { name: "Abilities", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Abilities", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(dialogs.length, beforeUpdateDialogs);
  const refreshed = await page.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem("hol.workshop.v1")),
    library: JSON.parse(localStorage.getItem("hol.workshop.library.v1")),
  }));
  assert.equal(refreshed.library.length, previousLibraryCount);
  assert.equal(
    refreshed.library.find((entry) => entry.id === "current-rules-save").name,
    "Current rules hero",
  );
  assert.notEqual(
    refreshed.saved.character.sourceCommit,
    previous.sourceCommit,
  );
  assert.deepEqual(refreshed.saved.character.draft.culture, {
    id: "origin-culture-cloister-valleys",
    pair: 0,
  });
  assert.deepEqual(
    refreshed.saved.character.draft.purchases,
    previous.draft.purchases,
  );
  assert.equal(refreshed.saved.saveId, "current-rules-save");
  assert.equal(
    refreshed.library.find((entry) => entry.id === "current-rules-save")
      .character.sourceCommit,
    refreshed.saved.character.sourceCommit,
  );
  await page
    .getByRole("button", { name: "Load character", exact: true })
    .click();
  await page
    .locator(".saved-characters article")
    .filter({ hasText: "Current rules hero" })
    .getByRole("button", { name: "Load", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("tab", { name: "Main", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(dialogs.length, beforeUpdateDialogs);
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page.getByRole("button", { name: "3 Origins", exact: true }).click();
  const culture = page.getByLabel("Culture", { exact: true });
  assert.equal(await culture.inputValue(), "origin-culture-cloister-valleys|0");
  assert.match(
    await culture.locator("option:checked").innerText(),
    /Radiance 1.*Lantern Moths/,
  );
  assert(
    (await culture.locator("option").allTextContents()).every(
      (text) => !/retained choice|Cloister Valleys.*Athletics 1/.test(text),
    ),
  );
  await page.locator(".brand").hover();
  await page.screenshot({ path: `${output}/current-origin.png` });
  // Import old files directly under the current rules, including obsolete retention markers.
  await page.locator("#import-file").setInputFiles({
    name: "previous-origin.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(previous)),
  });
  await page.getByRole("heading", { name: "Review", exact: true }).waitFor();
  const importedCurrent = await page.evaluate(
    () => JSON.parse(localStorage.getItem("hol.workshop.v1")).character,
  );
  assert.deepEqual(importedCurrent.draft.culture, {
    id: "origin-culture-cloister-valleys",
    pair: 0,
  });
  assert.equal(
    importedCurrent.sourceCommit,
    refreshed.saved.character.sourceCommit,
  );
  assert(
    !dialogs
      .slice(beforeUpdateDialogs)
      .some((text) => /rules update|updated rules|rules edition/i.test(text)),
  );
  assert.deepEqual(failures, []);
  console.info(
    "Workshop passed: fixed scrolling, live attributes, grants, armor/Bulk/supply, grouped actions, crafting rolls, level replay, independent/revisitable signatures, play inventory/languages/conditions, coin override, named saves, schema-3 export/import and 390px layout; no browser errors.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
