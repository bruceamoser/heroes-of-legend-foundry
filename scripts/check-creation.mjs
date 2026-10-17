import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an explicitly authorized disposable local world");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
});
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let actorId;
try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  actorId = await page.evaluate(async () => {
    const a = await Actor.create({ name: "Creation test", type: "character" });
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    globalThis.holWizard = new CreationWizard(a);
    await holWizard.render({ force: true });
    return a.id;
  });
  const wizard = page.locator(".hol-creation");
  async function action(name) {
    await wizard.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(() => !holWizard.busy);
  }
  await wizard.locator("[name=heroName]").fill("Reed of the Deep Halls");
  for (const key of ["brawn", "knowledge", "reason"])
    await wizard.locator(`[name=attribute-${key}]`).fill("1");
  await action("Save and continue");
  await wizard.locator("[name=ancestryId]").selectOption("ancestry-human");
  await action("Save choices");
  await wizard.locator("[name=trait][value=trait-human-weathered]").check();
  await wizard.locator("[name=trait][value=trait-human-far-walker]").check();
  await wizard.locator("[name=homeLanguage]").selectOption("dwarven");
  await action("Save and continue");
  await wizard
    .locator("[name=culture]")
    .selectOption("origin-culture-deep-halls|0");
  await wizard
    .locator("[name=background]")
    .selectOption("origin-background-bridge-worker|0");
  await action("Save and continue");
  await wizard
    .locator(
      '[name="recipes-ability-trail-workshop"][value=recipe-travel-food]',
    )
    .check();
  await wizard
    .locator(
      '[name="recipes-ability-trail-workshop"][value=recipe-bound-torches]',
    )
    .check();
  await action("Save choices");
  const invalid = wizard.locator("[data-id=ability-the-cleverest-mixture]");
  assert(await invalid.isDisabled());
  await action("Add Conditioned Body");
  await action("Save and continue");
  await wizard.locator("[name=classId][value=class-intellect]").check();
  await action("Save choices");
  for (const id of ["discipline-craft", "discipline-scholarship"])
    await wizard.locator(`[name=classDiscipline][value=${id}]`).check();
  await wizard
    .locator("[name=signatureId]")
    .selectOption("ability-signature-intellect-spot-the-leverage");
  await action("Save and continue");
  await action("Add Conditioned Body");
  await action("Save and continue");
  await action("Add Travel Pack");
  await action("Save and continue");
  assert(
    await wizard
      .getByText("All creation choices are valid.", { exact: true })
      .isVisible(),
  );
  const preview = await page.evaluate(() => ({
    hp: holWizard.preview.summary.maximumHp,
    bulk: holWizard.preview.inventory.bulk,
    items: holWizard.preview.inventory.items.length,
    abilities: holWizard.preview.state.abilities.length,
  }));
  assert.equal(preview.hp, 19);
  assert.equal(preview.bulk, 2);
  assert.equal(preview.items, 3);
  assert.equal(
    await page.evaluate(
      (id) => game.actors.get(id).system.health.baseMax,
      actorId,
    ),
    12,
  );
  await mkdir("test-results", { recursive: true });
  await wizard.locator(".hol-wizard-main").evaluate((el) => (el.scrollTop = 0));
  await wizard.screenshot({ path: "test-results/creation-review.png" });
  await page.reload();
  await page.waitForFunction(() => game.ready);
  await page.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    globalThis.holWizard = new CreationWizard(game.actors.get(id));
    await holWizard.render({ force: true });
  }, actorId);
  assert(
    await wizard
      .getByText("All creation choices are valid.", { exact: true })
      .isVisible(),
  );
  await action("Level 0 learning");
  assert.equal(
    await wizard
      .locator(".hol-choice-list article")
      .first()
      .locator("button")
      .isDisabled(),
    false,
  );
  await wizard.locator("[data-search]").fill("cleverest");
  assert.equal(
    await wizard.locator(".hol-choice-list article:visible").count(),
    1,
  );
  assert(
    await wizard
      .locator(".hol-choice-list article:visible button")
      .isDisabled(),
  );
  await action("Origins");
  await wizard
    .locator("[name=culture]")
    .selectOption("origin-culture-deep-halls|1");
  await action("Save choices");
  await action("Review"); // Background still grants Craft; changing one origin must preserve purchases.
  assert.equal(
    await page.evaluate(() => holWizard.draft.purchases[0].length),
    1,
  );
  const staleRejected = await page.evaluate(async () => {
    const { CreationWizard } = await import('/systems/heroes-of-legend/applications/creation.mjs');
    const stale = new CreationWizard(holWizard.actor);
    await holWizard.persist();
    try { await stale.persist(); return false; } catch (error) { return error.message.includes('Another window'); }
  });
  assert(staleRejected);
  assert.deepEqual(errors, []);
  console.info(
    "PASS V14 creation: guided choices, eligible/disabled options, grants, shopping, review, unchanged actor mechanics, reload/resume, backtracking and search.",
  );
} finally {
  if (actorId)
    await page
      .evaluate(async (id) => {
        await game.actors.get(id)?.delete();
      }, actorId)
      .catch(() => {});
  await browser.close();
}
