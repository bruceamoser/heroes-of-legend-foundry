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
const output = resolve("test-results/roll");
await mkdir(output, { recursive: true });
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
try {
  await page.goto(base + "roll.html");
  await page
    .getByRole("heading", { name: "Hook and Drive", exact: true })
    .waitFor();
  assert.equal(await page.locator(".sheet-links a").count(), 6);
  const range = page.getByRole("slider", {
    name: "Banes / Boons",
    exact: true,
  });
  const ticks = page.locator(".hol-net-ticks");
  assert.equal(await ticks.getByRole("button").count(), 7);
  assert.equal(await range.getAttribute("aria-valuetext"), "Even");
  assert.equal(await page.locator("[data-roll-count]").innerText(), "3");
  await page.screenshot({ path: `${output}/roll-neutral-desktop.png` });
  for (const [n, label, keep] of [
    [-3, "3 Banes", "lowest"],
    [3, "3 Boons", "highest"],
    [0, "Even", "all"],
  ]) {
    await ticks.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await range.inputValue(), String(n));
    assert.equal(await range.getAttribute("aria-valuetext"), label);
    assert.equal(
      await page.locator("[data-roll-count]").innerText(),
      String(3 + Math.abs(n)),
    );
    assert.match(
      await page.locator("[data-roll-keep]").innerText(),
      new RegExp(keep),
    );
  }
  // Track endpoints and numeric tick centers agree for pointer users.
  for (const [n, label] of [
    [-3, "3 Banes"],
    [0, "Even"],
    [3, "3 Boons"],
  ]) {
    const tick = await ticks
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    const track = await range.boundingBox();
    await page.mouse.click(tick.x + tick.width / 2, track.y + track.height / 2);
    assert.equal(await range.inputValue(), String(n));
  }
  await range.focus();
  await range.press("Home");
  assert.equal(await range.inputValue(), "-3");
  await range.press("End");
  assert.equal(await range.inputValue(), "3");
  await range.press("ArrowLeft");
  assert.equal(await range.inputValue(), "2");
  await page
    .getByLabel("Roll attribute", { exact: true })
    .selectOption("knowledge");
  assert.equal(await page.locator("[data-roll-value]").innerText(), "-1");
  assert.match(
    await page.locator("[data-roll-formula]").innerText(),
    /5d6kh3 \+ \(-1\)/,
  );
  const ability = page.locator(
    '[data-preview-ability="ability-hook-and-drive"]',
  );
  assert(await ability.isChecked());
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(
    await page.locator("#preview-result").innerText(),
    /Hook and Drive/,
  );
  await ability.uncheck();
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.equal(
    await page.locator("#preview-result .hol-chat-abilities").count(),
    0,
  );
  const referenceAbility = page.locator(
    '[data-preview-ability="ability-braced-harness"]',
  );
  await referenceAbility.check();
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(
    await page.locator("#preview-result .hol-chat-abilities").innerText(),
    /Braced Harness/,
  );
  await referenceAbility.uncheck();
  await ability.check();
  await page.getByText("Selected ability rules", { exact: true }).click();
  assert.match(
    await page.locator("[data-selected-rules]").innerText(),
    /Main Action/,
  );
  await page.getByText("Selected ability rules", { exact: true }).click();
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await ticks.getByRole("button", { name: "3 Banes", exact: true }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(
      await page
        .getByRole("dialog")
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
    );
    await page.screenshot({ path: `${output}/roll-banes-${width}.png` });
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Defend", exact: true }).click();
  assert.equal(
    await page.getByLabel("Roll attribute", { exact: true }).inputValue(),
    "agility",
  );
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(await page.locator("#preview-result").innerText(), /defense/);
  assert.match(
    await page.locator("#preview-result").innerText(),
    /Scrap knife/,
  );
  assert.deepEqual(failures, []);
  console.log(
    "PASS shared roll preview: seven slider positions, live formula, keyboard, known ability selection and embedded rules, repeated rolls/defense, 760/390/320px layouts; zero browser errors.",
  );
} catch (e) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw e;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
