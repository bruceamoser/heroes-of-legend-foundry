import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, expect } from "@playwright/test";
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
const output = resolve("test-results/sheets");
await mkdir(output, { recursive: true });
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
async function expand(id) {
  const section = page.locator(`[data-collapse="${id}"]`).first();
  if (!(await section.evaluate((e) => e.open)))
    await section.locator(":scope > summary").click();
}
async function close() {
  await page.locator('#reference [data-action="close"]').click();
}
async function choose(search, id) {
  await page
    .getByRole("button", { name: "Search catalog", exact: true })
    .count();
  await page.getByLabel("Search catalog", { exact: true }).fill(search);
  await page.locator(`[data-action="pick"][data-id="${id}"]`).click();
}
try {
  await page.goto(base + "npc.html");
  await page.getByRole("heading", { name: "Edda Vale", exact: true }).waitFor();
  assert.equal(await page.locator(".sheet-links a").count(), 6);
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(await page.locator(".combat-stats > div").count(), 7);
  for (const label of [
    "Armor DR",
    "Evasion",
    "Threat",
    "Stability",
    "Resistance",
    "Weakness",
    "Immunity",
  ]) {
    assert(
      await page
        .locator(".combat-stats")
        .getByText(label, { exact: true })
        .isVisible(),
    );
  }
  assert(await page.locator('[data-group="main"]').first().isVisible());
  await page.screenshot({ path: `${output}/npc-default.png` });
  const card = await page.locator("#app").boundingBox();
  assert(
    card.width <= 700 && card.height < 700,
    `Compact default NPC card: ${JSON.stringify(card)}`,
  );
  await expand("npc-details");
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page
    .getByLabel("Want", { exact: true })
    .fill("Find the missing patrol.");
  await page.getByLabel("Want", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  assert.match(
    await page.locator("#panel").innerText(),
    /Find the missing patrol/,
  );
  await expand("notes");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Promised the heroes a safe route.");
  await page.reload();
  await expand("notes");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .inputValue(),
    "Promised the heroes a safe route.",
  );

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "New NPC", exact: true }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.locator('[data-action="load-saved"]').first().click();
  assert.match(
    await page.locator("#panel").innerText(),
    /Find the missing patrol/,
  );

  assert.match(
    await page.locator(".combat-label").innerText(),
    /Player defense/,
  );
  assert((await page.locator(".action-table tbody tr").count()) > 0);
  await page
    .getByRole("spinbutton", { name: "Current HP", exact: true })
    .fill("3");
  await page
    .getByRole("spinbutton", { name: "Current HP", exact: true })
    .press("Tab");
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Current HP", exact: true })
      .inputValue(),
    "3",
  );
  await page.goto(base + "creature.html");
  await page
    .getByRole("heading", { name: "Goblin Scrapper", exact: true })
    .waitFor();
  assert.notEqual(
    await page
      .getByRole("spinbutton", { name: "Current HP", exact: true })
      .inputValue(),
    "3",
  );
  await page
    .locator('[data-action="action"][data-group="main"]')
    .first()
    .click();
  assert.match(await page.getByRole("dialog").innerText(), /Weak defense/i);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  assert(await page.getByLabel("Roll attribute", { exact: true }).isVisible());
  await page.getByLabel("Attribute value", { exact: true }).fill("2");
  await page
    .getByRole("slider", { name: "Banes / Boons", exact: true })
    .fill("-3");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(
    await page.locator("#roll-result").innerText(),
    /Weak|Standard|Strong/,
  );
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await close();
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.getByLabel("Condition", { exact: true }).selectOption("poisoned");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Remove Poisoned", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Remove Poisoned", exact: true })
    .click();
  await expand("book-details");
  assert((await page.locator(".world-fields dt").count()) > 0);

  await page
    .getByRole("button", { name: "Choose creature", exact: true })
    .click();
  await choose("Red Dragon", "creature-red-dragon");
  await page
    .getByRole("heading", { name: "Red Dragon", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.match(
    await page.locator(".combat-stats").innerText(),
    /Threat\s+2 Banes/,
  );
  assert.match(
    (await page.locator(".action-context-row").allTextContents()).join(" "),
    /Cannot use this attack on consecutive turns/,
  );
  await page.getByRole("button", { name: "Tail Retort", exact: true }).click();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /must survive and remain capable/,
  );
  await close();
  await page.locator(".portrait-button img").evaluate((img) => img.decode());
  assert(
    await page
      .locator(".portrait-button img")
      .evaluate((img) => img.naturalWidth <= 384),
  );
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/creature-${width}.png` });
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = `${output}/creature.json`;
  await (await download).saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  assert.equal(exported.kind, "creature");
  assert.equal(exported.state.id, "creature-red-dragon");
  await page
    .getByRole("button", { name: "Choose creature", exact: true })
    .click();
  await choose("Adder", "creature-adder");
  await page.locator("#sheet-import").setInputFiles(file);
  await page
    .getByRole("heading", { name: "Red Dragon", exact: true })
    .waitFor();
  const maneuvers = page.locator('[data-collapse="maneuvers"]');
  await maneuvers.locator("summary").click();
  await page.reload();
  assert.equal(await maneuvers.evaluate((e) => e.open), false);
  await page.goto(base + "item.html");
  await page
    .getByRole("heading", { name: "Ordinary Light Armor", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(
    await page
      .getByRole("heading", { name: "Ordinary Light Armor", exact: true })
      .count(),
    1,
  );
  assert.doesNotMatch(
    await page.locator("#panel").innerText(),
    /item-ordinary-light-armor/,
  );

  await page
    .getByRole("heading", { name: "Ordinary Light Armor", exact: true })
    .first()
    .waitFor();
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/equipment-${width}.png` });
  }
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await page.getByLabel("Quantity", { exact: true }).press("Tab");
  await page.reload();
  assert.equal(
    await page.getByLabel("Quantity", { exact: true }).inputValue(),
    "4",
  );
  await page.locator("#sheet-import").setInputFiles({
    name: "wrong-kind.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator("#notice")).toContainText(
    "Choose an item sheet export",
  );
  await page.getByRole("button", { name: "Choose item", exact: true }).click();
  await choose("Hook and Drive", "ability-hook-and-drive");
  assert((await page.locator(".outcome-table tr").count()) > 0);
  assert.match(await page.locator(".card-metadata").innerText(), /Brawn/);
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/ability-${width}.png` });
  }
  await page.getByRole("button", { name: "Choose item", exact: true }).click();
  await choose("Food Bundle", "item-food-bundle");
  await page.evaluate(() => {
    globalThis.savedDice = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      a.fill(0);
      return a;
    };
  });
  await page.getByRole("button", { name: "Use supply", exact: false }).click();
  assert.match(await page.getByRole("dialog").innerText(), /d8 → 1 · d6/);
  await close();
  await page.evaluate(() => (crypto.getRandomValues = globalThis.savedDice));
  await page.getByRole("button", { name: "Resupply", exact: true }).click();
  await page.getByLabel("Resupply steps", { exact: true }).selectOption("6");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resupply", exact: true })
    .click();
  assert.equal(await page.locator(".supply-current").innerText(), "d8");

  await page.goto(base + "npc.html");
  await expand("npc-details");
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await page.getByLabel("Name", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  assert.equal(await page.locator("#app img[onerror]").count(), 0);
  await page
    .getByRole("button", { name: "Change profile", exact: true })
    .click();
  await choose("Shield Soldier", "creature-shield-soldier");
  await expand("npc-details");
  await page.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Edda Vale");
  await page.getByLabel("Name", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "✓ Done", exact: true }).click();
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: `${output}/npc-${width}.png` });
  }
  assert.deepEqual(failures, []);
  console.log(
    "PASS NPC portrayal/profile/combat, single cards and seven visible combat statistics, HP, conditions, defense rolls, complete catalog selection, book thumbnails, item rules/supply, isolated autosave/named saves, export/kind rejection, escaped edits and 760/390px layouts; zero browser errors.",
  );
} catch (e) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw e;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
