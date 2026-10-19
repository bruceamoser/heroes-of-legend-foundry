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
async function dice(faces) {
  await page.evaluate((f) => {
    globalThis.originalDice ??= crypto.getRandomValues.bind(crypto);
    globalThis.faces = [...f];
    crypto.getRandomValues = (a) => {
      a.fill((globalThis.faces.shift() ?? 1) - 1);
      return a;
    };
  }, faces);
}
async function wound(faces) {
  await page
    .getByRole("button", { name: "Roll a new wound", exact: true })
    .click();
  await dice(faces);
  await page.getByRole("button", { name: "Roll wound", exact: true }).click();
  await page.keyboard.press("Escape");
}
async function heal(row, progress) {
  await row.getByRole("button", { name: "Apply healing", exact: true }).click();
  await page
    .getByLabel("Healing progress", { exact: true })
    .selectOption(String(progress));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply healing", exact: true })
    .click();
  await page.keyboard.press("Escape");
}
async function condition(key, rating) {
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.locator("#play-condition").selectOption(key);
  await page.locator("#condition-rating").fill(String(rating));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  const hp = page.getByRole("spinbutton", { name: "Current HP", exact: true });
  await hp.waitFor();
  const speed = Number(await page.locator("[data-speed]").innerText());
  await wound([1, 6, 6]);
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  const foot = page
    .locator("[data-wound]")
    .filter({ hasText: "Foot: painful heel injury" });
  await foot
    .getByRole("button", {
      name: "Foot: painful heel injury; small scar and limp",
      exact: true,
    })
    .click();
  assert.match(await page.getByRole("dialog").innerText(), /Scar/);
  assert.match(await page.getByRole("dialog").innerText(), /Recovery value/);
  await page.keyboard.press("Escape");
  await heal(foot, 1);
  assert.match(await foot.innerText(), /1 \/ 2/);
  assert.match(await foot.innerText(), /Speed −1/);
  await heal(foot, 1);
  assert.match(await foot.innerText(), /2 \/ 2.*Healed/);
  assert.match(await foot.innerText(), /Scar:/);
  assert.equal(await page.locator("[data-wound-count]").innerText(), "1");
  assert.equal(await page.locator("[data-speed]").innerText(), String(speed));
  await wound([1, 3, 6, 6]);
  const eye = page.locator("[data-wound]").filter({ hasText: "Eye: injury" });
  await heal(eye, 3);
  await heal(eye, 2);
  assert.match(await eye.innerText(), /5 \/ 5.*Healed/);
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  assert.doesNotMatch(
    await page.locator(".condition-bar").innerText(),
    /Blinded/,
  );
  // Favorite universal and learned actions plus a weapon and a supply.
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  await page
    .locator('[data-action="favorite"][data-id="ability-hook-and-drive"]')
    .click();
  await page.getByText("Basic actions", { exact: true }).click();
  await page
    .locator('[data-action="favorite"][data-id="ability-basic-unarmed"]')
    .click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  const weapon = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Ordinary Melee Weapon" });
  await weapon.locator('[data-action="favorite"]').click();
  const food = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Food Bundle" });
  await food.locator('[data-action="favorite"]').click();
  const foodId = await food.getAttribute("data-instance");
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  const favorites = page.locator('[data-collapse="favorites"]');
  for (const name of [
    "Hook and Drive",
    "Basic Unarmed",
    "Basic Melee",
    "Opportunity Attack",
  ])
    assert.match(await favorites.innerText(), new RegExp(name));
  assert.match(await favorites.innerText(), /Food Bundle/);
  await favorites
    .locator(`[data-action="use-supply-dialog"][data-instance="${foodId}"]`)
    .click();
  await dice([1]);
  await page
    .getByRole("button", { name: "Use & roll supply", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await food
    .getByRole("button", { name: "Resupply Food Bundle", exact: true })
    .click();
  await page.getByLabel("Resupply steps", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Resupply", exact: true }).click();
  assert.match(await food.innerText(), /d8/);
  const potion = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Lesser Healing Bottle" })
    .first();
  await potion
    .getByRole("button", { name: "Use Lesser Healing Bottle", exact: true })
    .click();
  await dice([1]);
  await page
    .getByRole("button", { name: "Use & roll supply", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await potion
    .getByRole("button", {
      name: "Resupply Lesser Healing Bottle",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Resupply", exact: true }).click();
  assert.match(await potion.innerText(), /d4/);
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await hp.fill("20");
  await hp.press("Tab");
  await condition("burning", 2);
  await page
    .getByRole("button", { name: "Increase Burning", exact: true })
    .click();
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 3/);
  await page
    .getByRole("button", { name: "Apply Burning damage", exact: true })
    .click();
  assert.equal(await hp.inputValue(), "17");
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 3/);
  await page
    .getByRole("button", { name: "Decrease Burning", exact: true })
    .click();
  assert.match(await page.locator(".condition-bar").innerText(), /Burning 2/);
  await condition("burning", 1);
  assert.equal(
    await page
      .getByRole("button", { name: "Apply Burning damage", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Apply Burning damage", exact: true })
    .click();
  assert.equal(await hp.inputValue(), "14");
  await condition("bleeding", 2);
  await page
    .getByRole("button", { name: "Apply Bleeding damage", exact: true })
    .click();
  assert.equal(await hp.inputValue(), "12");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = `${output}/recovery-favorites.hol.json`;
  await (await downloaded).saveAs(file);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.draft.play.wounds[0].progress, 2);
  assert.equal(saved.draft.play.wounds[1].progress, 5);
  await page.reload();
  await hp.waitFor();
  assert.equal(await hp.inputValue(), "12");
  assert.match(
    await page.locator('[data-collapse="favorites"]').innerText(),
    /Basic Unarmed/,
  );
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".brand").hover();
    await page.screenshot({ path: `${output}/recovery-main-${width}.png` });
    const favoriteBox = await page.locator(".favorite-actions").boundingBox(),
      summaryBox = await page.locator(".play-summary").boundingBox();
    assert(
      favoriteBox.y <= summaryBox.y + 2,
      "Favorites must be at the top at every width",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page.screenshot({ path: `${output}/recovery-character-390.png` });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.match(await foot.innerText(), /Healed/);
  assert.equal(await page.locator("[data-wound-count]").innerText(), "2");
  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("heading", { name: "Review", exact: true }).waitFor();
  assert.equal(await hp.inputValue(), "12");
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  assert.match(
    await page.locator('[data-collapse="favorites"]').innerText(),
    /Opportunity Attack/,
  );
  await page.evaluate(() => {
    crypto.getRandomValues = globalThis.originalDice ?? crypto.getRandomValues;
  });
  assert.deepEqual(failures, []);
  console.info(
    "PASS wound dialogs/scars/exact healing threshold, starred condition removal, empty resupply/caps, basic and inventory Favorites, condition +/- and HP Apply without decay; saved/reloaded/JSON and compact layouts.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/recovery-failure.png`,
    fullPage: true,
  });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
