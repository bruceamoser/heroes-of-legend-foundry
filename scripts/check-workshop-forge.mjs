import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const root = resolve("dist/workshop");
const prefix = "/heroes-of-legend-foundry/";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!path.startsWith(prefix)) throw new Error("Wrong base path");
    const file = resolve(root, path.slice(prefix.length) || "index.html");
    if (!file.startsWith(root + sep)) throw new Error("Invalid path");
    const contents = await readFile(file);
    response.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream");
    response.end(contents);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = process.env.HOL_WORKSHOP_URL ?? `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
});
page.on("dialog", (dialog) => dialog.accept());

const actorName = "Workshop Forge Check";
const action = (name, id) => page.locator(
  `[data-action="${name}"]${id === undefined ? "" : `[data-id="${id}"]`}`,
);
const stage = (index) => page.locator(`[data-action="step"][data-step="${index}"]`);
const heading = (name) => page.getByRole("heading", { name, exact: true });
const balance = (dp) => expect(page.locator(".forge-dp")).toHaveText(`${dp} DP available`);
const findDiscipline = async (id) => {
  const filter = page.locator(".forge-filters");
  if ((await filter.getAttribute("open")) === null) await filter.locator("summary").click();
  await action("forge-filter", id).click();
};
const select = async (id) => {
  const visible = page.locator(`[data-action="forge-select"][data-id="${id}"]:visible`);
  await visible.first().click();
  await expect(page.locator("#forge-selection")).toBeVisible();
};
const learn = async (id) => {
  await select(id);
  const button = action("forge-learn", id);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#forge-selection .forge-meta")).toContainText("Learned");
};
const data = async () => page.evaluate(() => JSON.parse(localStorage.getItem("hol.workshop.v1")));
const openDevelopment = async () => page.getByRole("tab", { name: "Development", exact: true }).click();

try {
  await page.goto(base);
  await heading("Borin Bridgekeeper").waitFor();
  await action("new").click();
  await page.getByLabel("Character name", { exact: true }).fill(actorName);
  await page.getByLabel("Character name", { exact: true }).blur();
  for (const [attribute, value] of [["Brawn", "1"], ["Fortitude", "1"], ["Reason", "1"]]) {
    const field = page.getByLabel(attribute, { exact: true });
    await field.fill(value);
    await field.blur();
  }
  assert.deepEqual((await data()).character.draft.attributes, {
    brawn: 1, fortitude: 1, agility: 0, guile: 0, knowledge: 0, reason: 1,
  });

  await stage(1).click();
  await action("ancestry", "ancestry-dwarf").click();
  await page.locator('input[data-list="traitIds"][value="trait-dwarf-deep-constitution"]').check();
  await page.locator('input[data-list="traitIds"][value="trait-dwarf-carved-history"]').check();
  await page.getByLabel("Home language", { exact: true }).selectOption("dwarven");

  await stage(2).click();
  await page.getByLabel("Culture", { exact: true }).selectOption("origin-culture-walled-communities|0");
  await page.getByLabel("Background", { exact: true }).selectOption("origin-background-household-guard|0");

  await stage(3).click();
  await heading("Early learning").waitFor();
  await balance(11);
  await action("forge-view", "columns").click();
  await findDiscipline("arms");
  await learn("arms:bladework:1");
  await learn("arms:bladework:2");
  await learn("arms:bladework:3");
  await select("arms:bladework:4");
  await expect(action("forge-learn", "arms:bladework:4")).toBeDisabled();
  await expect(page.locator("#forge-selection")).toContainText("Available at level 3");
  await balance(6);

  await stage(4).click();
  await action("class", "class-protector").click();
  await page.locator('input[data-list="classDisciplines"][value="armor"]').check();
  await page.locator('input[data-list="classDisciplines"][value="guard"]').check();
  await action("signature", "ability-signature-protector-between-them").click();

  await stage(5).click();
  await heading("Heroic learning").waitFor();
  // The Armor class grant duplicates the culture discipline, adding 1 DP at level 1.
  await balance(12);
  await findDiscipline("elements");
  for (const id of ["elements", "air:0", "air:1", "air:2"]) await learn(id);
  await balance(6);
  await stage(7).click();
  assert.match(await page.locator("#panel").innerText(), /Creation complete/);
  const firstStage = (await data()).character.draft.purchases;
  assert.deepEqual(firstStage[0].map(({ id }) => id), ["arms:bladework:1", "arms:bladework:2", "arms:bladework:3"]);
  assert.deepEqual(firstStage[1].map(({ id }) => id), ["elements", "air:0", "air:1", "air:2"]);

  await action("sheet").filter({ hasText: "View character sheet" }).click();
  await openDevelopment();
  for (let level = 2; level <= 7; level++) await action("level-up").click();
  for (const tier of [3, 7]) {
    await page.locator(`[data-action="choose-signature"][data-tier="${tier}"]`).click();
    await page.locator(`[data-action="advance-signature"][data-tier="${tier}"]`).first().click();
    await action("sheet-development").filter({ hasText: "Back to development" }).click();
  }
  await action("advance").click();
  await heading("Level 7 learning").waitFor();
  await action("forge-view", "atlas").click();
  await findDiscipline("all");
  await select("combined:stormsteel-arc");
  const selected = page.locator("#forge-selection");
  await expect(selected).toContainText("Voice of the Tempest");
  await expect(selected).toContainText("Sweeping Blade");
  await expect(action("forge-learn", "combined:stormsteel-arc")).toBeDisabled();
  const edges = await page.locator('.forge-cross[data-to="combined:stormsteel-arc"]').evaluateAll(
    (elements) => elements.map((element) => element.dataset.from),
  );
  assert.deepEqual(edges, ["air:3", "arms:bladework:4"]);
  await action("forge-view", "columns").click();
  await findDiscipline("elements");
  await learn("air:3");
  assert.equal(await selected.locator(".forge-spell").count(), 5);
  await findDiscipline("arms");
  await learn("arms:bladework:4");
  await learn("combined:stormsteel-arc");

  await action("sheet-development").filter({ hasText: "Back to development" }).click();
  await page.getByRole("tab", { name: "Spellbooks", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Zephyra/ })).toBeVisible();
  assert.equal(await page.locator(".spellbook-sheet tbody tr").count(), 11);
  await action("reference", "spell:air:1").click();
  await expect(page.locator("#reference")).toContainText("Maneuver");
  const sp = Number(await page.getByRole("spinbutton", { name: "Current SP" }).inputValue());
  await action("cast-spell", "spell:air:1").click();
  assert.equal(Number(await page.getByRole("spinbutton", { name: "Current SP" }).inputValue()), sp);
  await action("reference", "spell:air:3").click();
  await expect(page.locator("#reference")).toContainText("Fog Cloud");
  await action("cast-spell", "spell:air:3").click();
  if (await page.locator('#reference [data-action="roll-sheet"]').isVisible())
    await page.locator('#reference [data-action="roll-sheet"]').click();
  assert.equal(Number(await page.getByRole("spinbutton", { name: "Current SP" }).inputValue()), sp - 1);
  if (await page.locator("#reference").isVisible()) await page.keyboard.press("Escape");
  await openDevelopment();
  await action("save").click();
  await page.getByRole("dialog").getByLabel("Save name").fill("Forge hybrid");
  await action("save-confirm").click();
  await expect(page.locator("#notice")).toContainText("Saved Forge hybrid");

  const [download] = await Promise.all([page.waitForEvent("download"), action("export").click()]);
  const exported = await readFile(await download.path());
  const portable = JSON.parse(exported);
  assert.equal(portable.draft.progression.level, 7);
  assert.equal(portable.draft.play.sp, sp - 1);
  assert.deepEqual(portable.draft.progression.levels[7].purchases.map(({ id }) => id), [
    "air:3", "arms:bladework:4", "combined:stormsteel-arc",
  ]);
  await page.reload();
  await heading(actorName).waitFor();
  await action("library").click();
  await expect(page.getByRole("dialog").getByText("Forge hybrid")).toBeVisible();
  await action("load-saved").click();
  await expect(page.locator("#notice")).toContainText("Loaded Forge hybrid");

  await page.locator("#import-file").setInputFiles({
    name: "forge-hybrid.hol.json", mimeType: "application/json", buffer: exported,
  });
  await expect(page.locator("#notice")).toContainText("Character imported");
  await page.setViewportSize({ width: 390, height: 800 });
  await action("advance").click();
  await action("forge-view", "columns").click();
  await findDiscipline("arms");
  await select("combined:stormsteel-arc");
  await expect(selected.locator(".forge-meta")).toContainText("Learned");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > innerWidth + 2 && rect.width ? [[element.tagName, element.className, rect.right]] : [];
    }).slice(0, 25))),
  );
  assert.deepEqual(failures, []);
  console.log("PASS Workshop Forge: staged creation pools, level gates, exact mixed combination edges, save/reload/import, and narrow layout.");
} catch (error) {
  console.error("Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
