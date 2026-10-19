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
  await page
    .getByRole("spinbutton", { name: "Current HP", exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit creation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "4 Early learning", exact: true })
    .click();
  const disciplines = page.locator('[data-learning-list="discipline"]'),
    abilities = page.locator('[data-learning-list="ability"]');
  assert.equal(
    await abilities.locator('[data-choice^="discipline-"]').count(),
    0,
  );
  await disciplines.locator("summary").click();
  assert.equal(
    await disciplines.locator('[data-choice^="ability-"]').count(),
    0,
  );
  assert.equal(await disciplines.locator("[data-choice]").count(), 18);
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  await page
    .getByRole("button", { name: "Increase level", exact: true })
    .click();
  await page.getByRole("button", { name: "Spend DP", exact: true }).click();
  if (!(await disciplines.locator("details").evaluate((e) => e.open)))
    await disciplines.locator("summary").click();
  const order = await disciplines
    .locator("[data-choice]")
    .evaluateAll((es) => es.map((e) => e.dataset.eligible));
  const firstUnavailable = order.indexOf("false");
  if (firstUnavailable >= 0)
    assert(order.slice(firstUnavailable).every((v) => v === "false"));
  const before = await page.locator("[data-dp-remaining]").innerText();
  const purchase = disciplines
    .locator('[data-eligible="true"] [data-action="purchase"]')
    .first();
  assert(await purchase.isEnabled());
  await purchase.click();
  assert.notEqual(
    await page.locator("[data-dp-remaining]").innerText(),
    before,
  );
  assert(await disciplines.locator("details").evaluate((e) => e.open));
  await disciplines.locator("summary").click();
  const samples = [2, 3].map((rank) =>
    choices.find(
      (r) =>
        r.kind === "ability" &&
        !r.universal &&
        !r.id.startsWith("ability-signature-") &&
        r.requirements?.some((q) => q.kind === "discipline" && q.rank === rank),
    ),
  );
  for (const record of samples) {
    await page
      .getByLabel("Search abilities", { exact: true })
      .fill(record.name);
    const card = abilities.locator(`[data-choice="${record.id}"]`);
    await card.waitFor();
    for (const req of record.requirements.filter(
      (r) => r.kind === "discipline",
    )) {
      const badge = card.locator(`[data-requirement="${req.id}"]`);
      assert.equal(await badge.locator(".sigil").count(), 1);
      assert.equal(
        await badge.locator(".discipline-rank").count(),
        req.rank > 1 ? 1 : 0,
      );
      if (req.rank > 1)
        assert.equal(
          await badge.locator(".discipline-rank").innerText(),
          String(req.rank),
        );
    }
  }
  const patterns = [
    [/^Main Action/i, "A"],
    [/^Maneuver/i, "M"],
    [/^Reaction/i, "R"],
    [/^Passive/i, "P"],
  ];
  for (const [pattern, letter] of patterns) {
    const record = choices.find(
      (r) =>
        r.kind === "ability" &&
        !r.universal &&
        !r.id.startsWith("ability-signature-") &&
        pattern.test(
          r.reference?.rules.details.find((d) => d.label === "Action")?.value ??
            "",
        ),
    );
    await page
      .getByLabel("Search abilities", { exact: true })
      .fill(record.name);
    assert(
      (
        await abilities
          .locator(`[data-choice="${record.id}"] .action-code`)
          .innerText()
      ).includes(letter),
    );
  }
  await page.setViewportSize({ width: 760, height: 900 });
  await page.locator(".brand").hover();
  await page.screenshot({ path: `${output}/builder-badges-760.png` });
  await page
    .getByRole("button", { name: "Back to development", exact: true })
    .click();
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await page
    .getByRole("button", { name: "Roll a new wound", exact: true })
    .click();
  await dice([1, 6, 6]);
  await page.getByRole("button", { name: "Roll wound", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  const row = page.locator("[data-wound]").first();
  assert.equal(await row.locator("td").count(), 6);
  assert.equal(await row.locator("td").nth(2).innerText(), "Soft Tissue");
  assert.equal(
    await row
      .locator("td")
      .nth(4)
      .getByRole("button", { name: "Apply healing", exact: true })
      .count(),
    1,
  );
  await row.locator('[data-action="wound-details"]').click();
  const details = page.getByRole("dialog");
  assert.match(await details.innerText(), /Recovery value/);
  assert.doesNotMatch(
    await details.innerText(),
    /Full recovery from zero|Remaining recovery|One point of progress/,
  );
  await page.keyboard.press("Escape");
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".brand").hover();
    await page.screenshot({ path: `${output}/wound-columns-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.getByRole("tab", { name: "Main", exact: true }).click();
  await condition("grappled");
  await condition("poisoned");
  const hp = await page
    .getByRole("spinbutton", { name: "Current HP", exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Evade", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Roll attribute", { exact: true })
      .locator("option")
      .count(),
    6,
  );
  assert.equal(await page.locator("#recipe-net").inputValue(), "-2");
  await page
    .getByLabel("Roll attribute", { exact: true })
    .selectOption("fortitude");
  await dice([6, 6, 6, 6, 6]);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  assert.match(
    await page.locator("#recipe-roll-result").innerText(),
    /Strong defense.*Weak attack effects/,
  );
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Current HP", exact: true })
      .inputValue(),
    hp,
  );
  const supplies = page.locator('[data-collapse="supplies"]');
  assert(
    await supplies
      .getByRole("button", { name: "Resupply Food Bundle", exact: true })
      .count(),
  );
  await supplies
    .getByRole("button", { name: "Resupply Food Bundle", exact: true })
    .click();
  await page.getByLabel("Resupply steps", { exact: true }).selectOption("6");
  await page.getByRole("button", { name: "Resupply", exact: true }).click();
  assert.match(await supplies.innerText(), /Food Bundle.*d8/s);
  // Character story is independent of edit mode and remembers disclosure state.
  await page.setViewportSize({ width: 760, height: 900 });
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  assert.equal(await page.getByLabel("Player", { exact: true }).count(), 0);
  const story = page.locator('[data-collapse="story"]');
  assert(
    await story.evaluate(
      (e) =>
        e.compareDocumentPosition(document.querySelector(".wound-box")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  );
  await page
    .getByLabel("Story", { exact: true })
    .fill("A bridgekeeper’s unfinished journey.\nA promise to return.");
  await page.getByLabel("Story", { exact: true }).press("Tab");
  await story.locator("summary").click();
  await page.reload();
  assert.equal(await story.evaluate((e) => e.open), false);
  await story.locator("summary").click();
  assert.equal(
    await page.getByLabel("Story", { exact: true }).inputValue(),
    "A bridgekeeper’s unfinished journey.\nA promise to return.",
  );
  await page.getByRole("button", { name: "Add wound", exact: true }).click();
  const woundDialog = await page.getByRole("dialog").innerText();
  assert(
    await page.getByLabel("Wound damage type", { exact: true }).isVisible(),
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Roll a new wound", exact: true })
    .click();
  assert.equal(await page.getByRole("dialog").innerText(), woundDialog);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Development", exact: true }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("button", { name: "Increase level", exact: true })
      .click();
  const dp = await page.locator('[data-dp="current"]').innerText();
  assert.match(
    await page.locator(".identity-line p").innerText(),
    new RegExp(
      `Dwarf.*Walled Communities.*Household Guard.*Protector.*Level 7\\(${dp}\\)`,
    ),
  );
  assert.equal(await page.locator(".signature-progress tbody tr").count(), 3);
  assert(
    await page
      .getByRole("button", { name: "Choose level 3 signature", exact: true })
      .isVisible(),
  );
  assert(
    await page
      .getByRole("button", { name: "Choose level 7 signature", exact: true })
      .isVisible(),
  );
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${output}/development-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  // Reopen an incomplete book example choice; canonical validation drives guidance.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("hol.workshop.v1"));
    delete saved.character.draft.acquisitions["ability-hook-and-drive"];
    saved.mode = "builder";
    saved.step = 6;
    localStorage.setItem("hol.workshop.v1", JSON.stringify(saved));
  });
  await page.reload();
  const banner = page.getByRole("status", {
    name: "Missing choices",
    exact: true,
  });
  assert.match(
    await banner.innerText(),
    /Hook and Drive.*one-handed or two-handed/s,
  );
  const incomplete = page.locator(
    '[data-acquisition="ability-hook-and-drive"]',
  );
  assert(
    await incomplete.evaluate(
      (e) => e.open && e.classList.contains("choice-missing"),
    ),
  );
  assert.equal(
    await incomplete
      .getByLabel("Melee weapon hands", { exact: true })
      .inputValue(),
    "",
  );
  const bannerY = (await banner.boundingBox()).y;
  await page.locator("#panel").evaluate((e) => (e.scrollTop = e.scrollHeight));
  assert.equal((await banner.boundingBox()).y, bannerY);
  await page.setViewportSize({ width: 760, height: 900 });
  await page.locator("#panel").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: `${output}/required-choice-760.png` });
  await incomplete
    .getByLabel("Melee weapon hands", { exact: true })
    .selectOption("2");
  assert.equal(await banner.count(), 0);
  assert.equal(await page.locator(".choice-missing").count(), 0);
  await page.reload();
  assert.equal(await banner.count(), 0);
  await page.getByRole("button", { name: "8 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "View character sheet", exact: true })
    .click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  const melee = page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: "Ordinary Melee Weapon" });
  assert(await melee.count());
  assert.deepEqual(failures, []);
  console.info(
    "PASS separate legal-first discipline/ability purchases, remembered discipline list, all rank overlays and A/M/R/P badges, wound type/separate Apply, repeatable attributed Evade with defense conditions/perspective and Main resupply; persistent required choices, story, shared wound flow, header DP/origins and themed Development; compact layouts and zero browser errors.",
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
