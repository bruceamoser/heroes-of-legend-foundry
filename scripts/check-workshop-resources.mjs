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
  await page.evaluate((faces) => {
    globalThis.originalDice ??= crypto.getRandomValues.bind(crypto);
    globalThis.faces = [...faces];
    crypto.getRandomValues = (a) => {
      a.fill((globalThis.faces.shift() ?? 1) - 1);
      return a;
    };
  }, faces);
}
async function addItem(id, quantity = 1) {
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator("#play-item").selectOption(id);
  await page.locator("#play-quantity").fill(String(quantity));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  const hp = page.getByRole("spinbutton", { name: "Current HP", exact: true });
  await hp.waitFor();
  const max = Number(await hp.getAttribute("max"));
  const sp = page.getByRole("spinbutton", { name: "Current SP", exact: true });
  await sp.fill("2");
  await sp.press("Tab");
  await hp.fill("3");
  await hp.press("Tab");
  await page.getByRole("button", { name: "Use Grit", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Spend 1 Grit", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await hp.fill("0");
  await hp.press("Tab");
  await page.getByRole("button", { name: "Use Grit", exact: true }).click();
  await page.getByRole("button", { name: "Spend 1 Grit", exact: true }).click();
  assert.equal(Number(await hp.inputValue()), Math.ceil(max / 2));
  assert.equal(await sp.inputValue(), "2");
  assert.equal(
    await page.locator(".vital").filter({
      has: page.getByRole("button", { name: "Use Grit", exact: true }),
    }).locator("strong").innerText(),
    "0",
  );
  // Every right-column section and action group stores its collapsed state.
  const sections = await page
    .locator("[data-collapse]")
    .evaluateAll((es) => es.map((e) => e.dataset.collapse));
  assert(
    sections.includes("supplies") && sections.includes("actions-main-action"),
  );
  for (const key of sections)
    await page.locator(`[data-collapse="${key}"] > summary`).click();
  await page.reload();
  await hp.waitFor();
  for (const key of sections)
    assert.equal(
      await page.locator(`[data-collapse="${key}"]`).getAttribute("open"),
      null,
      key,
    );
  assert.equal(await sp.inputValue(), "2");
  for (const key of sections)
    await page.locator(`[data-collapse="${key}"] > summary`).click();
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  const star = page
    .locator('[data-action="favorite"][data-kind="abilities"]')
    .first();
  const abilityId = await star.getAttribute("data-id");
  assert.equal(await star.innerText(), "☆");
  await star.click();
  assert.equal(await star.innerText(), "★");
  await addItem("item-lesser-healing-bottle");
  const row = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Lesser Healing Bottle" })
    .last();
  const potionId = await row.getAttribute("data-instance");
  await row.locator('[data-action="favorite"]').click();
  assert.equal(await row.locator('[data-action="favorite"]').innerText(), "★");
  const food = page
    .locator(".inventory-table tr")
    .filter({ hasText: "Food Bundle" });
  await food
    .getByRole("spinbutton", { name: "Quantity Food Bundle", exact: true })
    .fill("2");
  await food
    .getByRole("spinbutton", { name: "Quantity Food Bundle", exact: true })
    .press("Tab");
  const foodId = await food.getAttribute("data-instance");
  assert.equal(await food.getByRole("spinbutton").inputValue(), "2");
  await hp.fill("3");
  await hp.press("Tab");
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page
    .getByRole("button", { name: "Use a healing potion", exact: true })
    .click();
  await page
    .getByLabel("Healing potion", { exact: true })
    .selectOption(potionId);
  await dice([1]);
  await page
    .getByRole("button", { name: "Use & roll supply", exact: true })
    .click();
  assert.equal(await hp.inputValue(), "9");
  assert.match(
    await page.locator("#supply-roll-result").innerText(),
    /Exhausted/,
  );
  await page.keyboard.press("Escape");
  await page
    .locator(
      `[data-collapse="supplies"] [data-action="use-supply-dialog"][data-instance="${foodId}"]`,
    )
    .click();
  await dice([1]);
  await page
    .getByRole("button", { name: "Use & roll supply", exact: true })
    .click();
  assert.match(await page.locator("#supply-roll-result").innerText(), /d6/);
  await page.keyboard.press("Escape");
  await page.locator('[data-collapse="defenses"] > summary').click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = `${output}/resources.hol.json`;
  await (await downloaded).saveAs(file);
  const saved = JSON.parse(await readFile(file, "utf8")),
    play = saved.draft.play;
  assert.equal(play.gritSpent, 1);
  assert.equal(play.sp, 2);
  assert.equal(play.inventory.overrides[foodId].quantity, 2);
  assert.equal(play.inventory.overrides[foodId].inventoryDie, 6);
  assert.equal(play.inventory.overrides[potionId].inventoryDie, 0);
  assert(play.favorites.abilities.includes(abilityId));
  assert(play.favorites.items.includes(potionId));
  assert.equal(play.collapsed.defenses, true);
  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("heading", { name: "Review", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  assert.equal(
    await page.locator('[data-collapse="defenses"]').getAttribute("open"),
    null,
  );
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  assert.equal(await row.locator('[data-action="favorite"]').innerText(), "★");
  assert.match(await row.innerText(), /Empty/);
  await page.setViewportSize({ width: 760, height: 900 });
  await page.screenshot({ path: `${output}/resources-inventory-760.png` });
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  assert.equal(
    await page
      .locator(`[data-action="favorite"][data-id="${abilityId}"]`)
      .innerText(),
    "★",
  );
  await page.screenshot({ path: `${output}/resources-abilities-760.png` });
  await hp.fill("0");
  await hp.press("Tab");
  for (let mark = 1; mark <= 3; mark++) {
    await page.getByRole("button", { name: "Death roll", exact: true }).click();
    await dice([1, 1, 1]);
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    assert.match(await page.locator("#death-mark-display").innerText(), new RegExp(`Failure marks ${mark} / 3`));
    if (mark < 3) await page.keyboard.press("Escape");
  }
  assert.equal(await page.getByRole("button", { name: "Spend Grit", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Last Words", exact: true }).click();
  assert.match(await page.locator(".vitals").innerText(), /Dead/);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page.evaluate(() => {
    crypto.getRandomValues = globalThis.originalDice;
  });
  for (const width of [900, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${output}/resources-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
  }
  assert.deepEqual(failures, []);
  console.info(
    "PASS lifetime Grit, separate failure marks and Last Words, all section states, potion final healing, supply decay, quantity, stars and current-only portable persistence; 900/760/390px and zero browser errors.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/resources-failure.png`,
    fullPage: true,
  });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
