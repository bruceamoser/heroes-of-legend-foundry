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
let acceptDialogs = true;
page.on("dialog", (d) => {
  dialogs.push(d.message());
  acceptDialogs ? d.accept() : d.dismiss();
});
const output = resolve("test-results/workshop");
await mkdir(output, { recursive: true });
const choices = JSON.parse(
  await readFile("static/data/choices.json", "utf8"),
).records;
async function dice(faces) {
  await page.evaluate((f) => {
    globalThis.originalDice ??= crypto.getRandomValues.bind(crypto);
    globalThis.faces = [...f];
    crypto.getRandomValues = (a) => {
      a.fill((globalThis.faces.shift() ?? 6) - 1);
      return a;
    };
  }, faces);
}
async function condition(key) {
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page.locator("#play-condition").selectOption(key);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    saved.character.draft.purchases[0] = [];
    saved.character.draft.purchases[1] = [];
    delete saved.character.draft.acquisitions["ability-hook-and-drive"];
    saved.mode = "builder";
    saved.step = 6;
    localStorage.setItem("hol.workshop.v1", JSON.stringify(saved));
  });
  await page.reload();
  assert.equal(await page.locator("#panel [data-acquisition]").count(), 0);
  assert.equal(
    await page.getByLabel("Override coin limit", { exact: false }).count(),
    0,
  );
  const banner = page.getByRole("status", {
    name: "Missing choices",
    exact: true,
  });
  await banner.getByRole("button", { name: /Hook and Drive/ }).click();
  assert(
    await page
      .getByRole("heading", { name: "Early learning", exact: true })
      .isVisible(),
  );
  const build = page.locator(".current-build");
  assert(
    await build
      .getByRole("heading", { name: "Current Build", exact: true })
      .isVisible(),
  );
  const hook = build.locator('[data-build-id="ability-hook-and-drive"]');
  assert(await hook.locator(".choice-missing").isVisible());
  assert.match(await hook.innerText(), /Household Guard/);
  await hook
    .getByLabel("Melee weapon hands", { exact: true })
    .selectOption("2");
  assert.equal(await banner.count(), 0);
  assert.equal(await build.locator("[data-acquisition]").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Learn discipline", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.locator("[data-learning-list]").count(), 0);
  await page
    .getByRole("button", { name: "Learn abilities", exact: true })
    .click();
  const picker = page.locator("#picker");
  assert(await picker.evaluate((e) => e.open));
  assert.equal(await picker.locator('[data-choice^="discipline-"]').count(), 0);
  assert.match(
    await picker.getByLabel("Known disciplines", { exact: true }).innerText(),
    /Armor 1/,
  );
  assert.match(
    await picker.locator(".purchased-abilities").innerText(),
    /None yet/,
  );
  const filter = picker.locator("#filter");
  assert.equal(await filter.locator('option[value="all"]').innerText(), "All");
  assert.equal(
    await filter.locator('option[value="universal"]').innerText(),
    "Universal",
  );
  await filter.selectOption("universal");
  const universalIds = await picker
    .locator("[data-choice]")
    .evaluateAll((es) => es.map((e) => e.dataset.choice));
  assert(universalIds.length > 0);
  for (const id of universalIds)
    assert(
      !(choices.find((r) => r.id === id).requirements ?? []).some(
        (q) => q.kind === "discipline",
      ),
    );
  await filter.selectOption("all");
  const before = await picker.locator(".picker-balance").innerText();
  await picker
    .locator('[data-eligible="true"] [data-action="purchase"]')
    .first()
    .click();
  assert(await picker.evaluate((e) => e.open));
  assert.notEqual(await picker.locator(".picker-balance").innerText(), before);
  assert(
    (await picker
      .locator('.purchased-abilities [data-action="reference"]')
      .count()) > 0,
  );
  const unavailable = picker
    .locator('[data-eligible="false"] [data-action="purchase"]')
    .first();
  assert(await unavailable.isDisabled());
  await picker
    .getByRole("button", { name: "Close selection", exact: true })
    .click();
  const earlyIds = await build
    .locator("[data-build-id]")
    .evaluateAll((es) => es.map((e) => e.dataset.buildId));
  await page
    .getByRole("button", { name: "6 Heroic learning", exact: true })
    .click();
  for (const id of earlyIds) {
    const entry = build.locator(`[data-build-id="${id}"]`);
    assert(await entry.evaluate((e) => e.classList.contains("build-locked")));
    assert.equal(
      await entry
        .locator('[data-action="remove-purchase"],input,select')
        .count(),
      0,
    );
  }
  await page
    .getByRole("button", { name: "Learn discipline", exact: true })
    .click();
  assert.equal(await picker.locator("[data-choice]").count(), 18);
  const order = await picker
    .locator("[data-choice]")
    .evaluateAll((es) => es.map((e) => e.dataset.eligible));
  const firstUnavailable = order.indexOf("false");
  if (firstUnavailable >= 0)
    assert(order.slice(firstUnavailable).every((v) => v === "false"));
  await picker
    .locator('[data-eligible="true"] [data-action="purchase"]')
    .first()
    .click();
  assert(await picker.evaluate((e) => e.open));
  await picker
    .getByRole("button", { name: "Close selection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Learn abilities", exact: true })
    .click();
  for (const rank of [2, 3]) {
    const r = choices.find(
      (r) =>
        r.kind === "ability" &&
        !r.universal &&
        !r.id.startsWith("ability-signature-") &&
        r.requirements?.some((q) => q.kind === "discipline" && q.rank === rank),
    );
    await picker.getByLabel("Search abilities", { exact: true }).fill(r.name);
    const card = picker.locator(`[data-choice="${r.id}"]`);
    for (const req of r.requirements.filter((q) => q.kind === "discipline")) {
      const badge = card.locator(`[data-requirement="${req.id}"]`);
      assert.equal(await badge.locator(".sigil").count(), 1);
      if (req.rank > 1)
        assert.equal(
          await badge.locator(".discipline-rank").innerText(),
          String(req.rank),
        );
    }
  }
  await page.setViewportSize({ width: 760, height: 900 });
  await page.screenshot({ path: `${output}/learning-picker-760.png` });
  await page.keyboard.press("Escape");
  assert.equal(await picker.evaluate((e) => e.open), false);
  const rows = await page
    .locator(".build-row")
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
  assert(
    rows.length > 0 && rows.every((h) => h <= 30),
    `compact row heights: ${rows}`,
  );
  const headingY = (
    await page
      .getByRole("heading", { name: "Heroic learning", exact: true })
      .boundingBox()
  ).y;
  const learnY = (
    await page
      .getByRole("button", { name: "Learn abilities", exact: true })
      .boundingBox()
  ).y;
  assert(Math.abs(headingY - learnY) < 12);
  await page.screenshot({ path: `${output}/current-build-760.png` });
  await page.setViewportSize({ width: 390, height: 900 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${output}/current-build-390.png` });
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
    /Requires Wear Heavy Armor/,
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
  await page.getByRole("button", { name: /Death roll;/ }).click();
  const close = page.locator(
    '#reference header [data-action="close-reference"]',
  );
  assert.equal(
    await close.evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  await close.hover();
  assert.deepEqual(
    await close.evaluate((e) => [
      getComputedStyle(e).color,
      getComputedStyle(e).backgroundColor,
    ]),
    ["rgb(21, 34, 28)", "rgb(247, 243, 233)"],
  );
  assert.equal(await page.locator(".death-mark").count(), 3);
  assert.equal(await page.locator(".death-mark.filled").count(), 0);
  await page
    .getByRole("button", { name: "Set 1 death mark", exact: true })
    .click();
  assert.equal(await page.locator(".death-mark.filled").count(), 1);
  await dice([1, 1, 1]);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.equal(await page.locator(".death-mark.filled").count(), 3);
  await page.screenshot({ path: `${output}/death-marks-760.png` });
  await page
    .getByRole("button", { name: "Set 2 death marks", exact: true })
    .click();
  assert.equal(await page.locator(".death-mark.filled").count(), 2);
  await page.keyboard.press("Escape");
  await page.reload();
  assert(
    await page
      .getByRole("button", { name: "Death roll; 2 failed", exact: true })
      .isVisible(),
  );
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
    .getByRole("button", { name: /Another Tongue/ })
    .click();
  assert.match(await page.locator(".identity-line p").innerText(), /Level 7/);
  assert.match(await page.locator(".context-strip").innerText(), /Level 2/);
  await page.reload();
  assert.match(await page.locator(".context-strip").innerText(), /Level 2/);
  await page
    .locator('[data-build-id="ability-another-tongue"]')
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
    "item-smoke-supply",
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
    /Requires Wear Light Armor/,
  );
  assert.equal(
    await page.locator(".inventory-table tbody tr").count(),
    countBefore,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(failures, []);
  console.info(
    "PASS Current Build grants/nested missing choices, banner navigation, early restrictions, locked early entries, persistent ability/discipline/equipment dialogs, legal-first choices/rank badges, repeated over-budget consent/decline, skull mark roll/correction/persistence and compact layouts.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/builder-view-failure.png`,
    fullPage: true,
  });
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
