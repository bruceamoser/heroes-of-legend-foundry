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
  const hp = page.getByRole("spinbutton", { name: "Current HP", exact: true });
  const max = Number(await hp.getAttribute("max"));
  assert.equal(Number(await hp.inputValue()), max);
  await hp.fill("3");
  await hp.press("Tab");
  await page.reload();
  await hp.waitFor();
  assert.equal(await hp.inputValue(), "3");
  assert.equal(
    await page.locator('.attributes [data-action="open-roll"]').count(),
    6,
  );
  await page.getByRole("button", { name: "Roll Brawn", exact: true }).click();
  assert.equal(
    await page.getByLabel("Roll attribute", { exact: true }).inputValue(),
    "brawn",
  );
  await page.locator("#recipe-net").fill("-3");
  assert.equal(await page.locator("#roll-net-value").innerText(), "3 Banes");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(await page.locator("#recipe-roll-result").innerText(), /→ keep/);
  // A roll remains available for correction or another attempt.
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.keyboard.press("Escape");
  const ability = page
    .locator('.action-groups [data-action="open-roll"]')
    .first();
  assert(await ability.isVisible());
  await ability.click();
  assert(await page.getByLabel("Roll attribute", { exact: true }).isVisible());
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page.getByRole("button", { name: "Add wound", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Roll wound", exact: true })
      .isVisible(),
  );
  await page.evaluate(() => {
    globalThis.woundRandom = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      a.fill(0);
      return a;
    };
  });
  await page.getByRole("button", { name: "Roll wound", exact: true }).click();
  await page.evaluate(() => {
    crypto.getRandomValues = globalThis.woundRandom;
  });
  await page.keyboard.press("Escape");
  const woundName = await page
    .locator('.wound-box [data-action="wound-details"]')
    .first()
    .innerText();
  assert.equal(await page.locator("[data-wound-count]").innerText(), "1");
  await page.getByRole("tab", { name: "Abilities", exact: true }).click();
  assert.deepEqual(
    await page.locator("[data-ability-group] > h3").allTextContents(),
    ["Main Action", "Maneuver", "Reaction", "Passive", "Other"],
  );
  await page.getByRole("button", { name: /Death roll;/ }).click();
  assert.equal(
    await page.getByLabel("Failed death rolls", { exact: true }).inputValue(),
    "0",
  );
  await page.getByLabel("Failed death rolls", { exact: true }).fill("1");
  await page.getByLabel("Failed death rolls", { exact: true }).press("Tab");
  // Inject known die faces into the normal UI roll path, not a mocked result.
  await page.evaluate(() => {
    globalThis.originalDice = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      a.fill(0);
      return a;
    };
  });
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.equal(
    await page.getByLabel("Failed death rolls", { exact: true }).inputValue(),
    "3",
  );
  assert.match(
    await page.locator("#recipe-roll-result").innerText(),
    /Last Words/,
  );
  await page.evaluate(() => {
    crypto.getRandomValues = (a) => {
      a.fill(5);
      return a;
    };
  });
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.equal(
    await page.getByLabel("Failed death rolls", { exact: true }).inputValue(),
    "0",
  );
  await page.evaluate(() => {
    crypto.getRandomValues = globalThis.originalDice;
  });
  await page.getByLabel("Failed death rolls", { exact: true }).fill("2");
  await page.getByLabel("Failed death rolls", { exact: true }).press("Tab");
  await page.keyboard.press("Escape");
  await page.reload();
  await hp.waitFor();
  assert.equal(await hp.inputValue(), "3");
  assert.equal(await page.locator("[data-wound-count]").innerText(), "1");
  await page
    .getByRole("button", { name: "Death roll; 2 failed", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Failed death rolls", { exact: true }).inputValue(),
    "2",
  );
  await page.keyboard.press("Escape");
  await hp.fill("4");
  await hp.press("Tab");
  assert.equal(
    await page
      .getByRole("button", { name: "Death roll; 0 failed", exact: true })
      .count(),
    1,
  );
  // Current/max Speed follows existing Bulk and Slowed, with no new penalty rule.
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  const beforeSpeed = Number(
    (await page.locator("[data-speed]").innerText()).split("/")[0],
  );
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.locator("#play-condition").selectOption("slowed");
  await page.locator("#condition-rating").fill("2");
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .last()
    .click();
  assert.match(
    await page.locator("[data-speed]").innerText(),
    new RegExp(`^${Math.max(0, beforeSpeed - 2)} / `),
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = `${output}/play-vitals.hol.json`;
  await (await downloaded).saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  assert.equal(exported.draft.play.hp, 4);
  assert.equal(exported.draft.play.wounds[0].name, woundName);
  for (const width of [900, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${output}/play-vitals-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    );
    assert(
      await page.evaluate(() => {
        const h = document.querySelector(".workshop-header");
        return h.scrollWidth <= h.clientWidth + 1;
      }),
      `header overflow at ${width}`,
    );
  }
  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("heading", { name: "Review", exact: true }).waitFor();
  assert.equal(await hp.inputValue(), "4");
  assert.equal(await page.locator("[data-wound-count]").innerText(), "1");
  assert.deepEqual(failures, []);
  console.info(
    "PASS web HP/Speed/wounds, attribute and ability dice, repeatable death rolls/failed marks, healing reset, current-only JSON/reload and compact 900/760/390px layouts.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/play-vitals-failure.png`,
    fullPage: true,
  });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
