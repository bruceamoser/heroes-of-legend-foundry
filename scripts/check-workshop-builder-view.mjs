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
  ".svg": "image/svg+xml",
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
page.setDefaultTimeout(5000);
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
const dialogs = [];
let acceptDialogs = true;
page.on("dialog", (d) => {
  dialogs.push(d.message());
  acceptDialogs ? d.accept() : d.dismiss();
});
const output = resolve("test-results/workshop");
await mkdir(output, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    saved.character.draft.purchases[0] = saved.character.draft.purchases[0].filter(
      ({ id }) => id !== "armor:harness:2" && id !== "armor:harness:3",
    );
    localStorage.setItem("hol.workshop.v1", JSON.stringify(saved));
  });
  await page.reload();
  const picker = page.locator("#picker");
  await page.setViewportSize({ width: 760, height: 900 });
  await page.getByRole("button", { name: "7 Equipment", exact: true }).click();
  assert.equal(await page.locator("#panel [data-acquisition]").count(), 0);
  assert.equal(await page.locator(".market-table").count(), 0);
  await page
    .getByRole("button", { name: "Buy inventory items", exact: true })
    .click();
  await picker
    .getByLabel("Search equipment", { exact: true })
    .fill("Ordinary Heavy Armor");
  assert(
    await picker
      .locator('[data-action="equipment"][data-id="item-ordinary-heavy-armor"]')
      .isDisabled(),
  );
  assert.match(
    await picker.locator(".market-table").innerText(),
    /Requires Armored Training III/,
  );
  await picker
    .getByLabel("Search equipment", { exact: true })
    .fill("Small Tent");
  await picker.getByLabel("Quantity Small Tent", { exact: true }).fill("100");
  const buy = picker.locator(
    '[data-action="equipment"][data-id="item-small-tent"]',
  );
  acceptDialogs = false;
  await buy.click();
  assert(dialogs.some((d) => /exceeds your available coins/.test(d)));
  assert.equal(
    await page
      .locator(".inventory-table tbody tr")
      .filter({ hasText: "Small Tent" })
      .count(),
    0,
  );
  acceptDialogs = true;
  await buy.click();
  assert(await picker.evaluate((e) => e.open));
  const confirmCount = dialogs.length;
  await buy.click();
  assert.equal(dialogs.length, confirmCount + 1);
  await picker
    .getByRole("button", { name: "Close selection", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".inventory-table tbody tr")
      .filter({ hasText: "Small Tent" })
      .count(),
    2,
  );
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("tab", { name: "Development", exact: true }).click();
    await page.screenshot({ path: `${output}/development-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  // Following a warning for a past level must never lower the character's level.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    saved.character.draft.progression = {
      level: 7,
      levels: {
        2: {
          purchases: [{ id: "ability-another-tongue" }],
          signatures: {},
          acquisitions: {},
        },
      },
    };
    saved.mode = "advancement";
    saved.editingLevel = null;
    localStorage.setItem("hol.workshop.v1", JSON.stringify(saved));
  });
  await page.reload();
  await page
    .getByRole("status", { name: "Missing choices", exact: true })
    .locator('[data-action="locate-choice"][data-id="ability-another-tongue"][data-level="2"]')
    .click();
  assert.match(await page.locator(".identity-line p").innerText(), /Level 7/);
  await page.getByRole("heading", { name: "Level 2 learning", exact: true }).waitFor();
  assert.match(await page.locator(".context-strip").innerText(), /Level 2/);
  await page.reload();
  await page.getByRole("heading", { name: "Level 2 learning", exact: true }).waitFor();
  assert.match(await page.locator(".context-strip").innerText(), /Level 2/);
  await page
    .locator('[data-acquisition="ability-another-tongue"]')
    .getByLabel("Language", { exact: true })
    .selectOption("goblin");
  const savedLevel = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("hol.workshop.v1")).character.draft
        .progression.level,
  );
  assert.equal(savedLevel, 7);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    saved.character.draft.culture = {
      id: "origin-culture-deep-halls",
      pair: 0,
    };
    saved.mode = "sheet";
    saved.tab = "Inventory";
    localStorage.setItem("hol.workshop.v1", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  for (const id of [
    "item-ordinary-light-armor",
    "item-ordinary-medium-armor",
    "item-ordinary-heavy-armor",
  ])
    assert(
      await page
        .locator(`#play-item option[value="${id}"]`)
        .evaluate((e) => e.disabled),
      `${id} should be disabled`,
    );
  // The add action independently enforces eligibility, including a manipulated dropdown.
  const countBefore = await page.locator(".inventory-table tbody tr").count();
  await page
    .locator('#play-item option[value="item-ordinary-light-armor"]')
    .evaluate((e) => (e.disabled = false));
  await page.locator("#play-item").selectOption("item-ordinary-light-armor");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  assert.match(
    await page.locator("#notice").innerText(),
    /Requires Armored Training I/,
  );
  assert.equal(
    await page.locator(".inventory-table tbody tr").count(),
    countBefore,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(failures, []);
  console.info(
    "PASS Builder: equipment availability, over-budget confirmation and repeat purchases, earlier level acquisition repair, and compact development layouts.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/builder-view-failure.png`,
    fullPage: true,
  });
  console.error("Browser errors:", failures);
  console.error(await page.locator("#notice").innerText(), await page.evaluate(() => {
    const { mode, editingLevel } = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    return { mode, editingLevel };
  }));
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
