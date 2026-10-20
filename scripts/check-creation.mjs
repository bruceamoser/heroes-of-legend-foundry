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
  await mkdir("test-results", { recursive: true });
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
  async function closeMarket() {
    const dialog = wizard.locator("dialog[open]");
    if (await dialog.count()) await dialog.locator("[data-close-market]").click();
  }
  async function openMarket(kind = "ability") {
    if (!(await wizard.locator("dialog[open]").count()))
      await wizard.locator(`[data-open-market="${kind}"]`).click();
    assert(await wizard.locator("dialog[open]").isVisible());
  }
  async function action(name) {
    await page.waitForFunction(() => !holWizard.busy);
    if (name.startsWith("Add ")) await openMarket(await page.evaluate(() => holWizard.step === 6) ? "equipment" : "ability");
    else await closeMarket();
    await wizard.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(() => !holWizard.busy);
    if (name.startsWith("Add ")) assert(await wizard.locator("dialog[open]").isVisible(), "Purchase keeps its native market open");
  }
  await wizard.locator("[name=heroName]").fill("Reed of the Deep Halls");
  for (const key of ["brawn", "knowledge", "reason"])
    await wizard.locator(`[name=attribute-${key}]`).fill("1");
  await action("Save and continue");
  await wizard.locator("[name=ancestryId]").selectOption("ancestry-human");
  await action("Save choices");
  await wizard.locator("[name=trait][value=trait-human-weathered]").check();
  await wizard.locator("[name=trait][value=trait-human-far-walker]").check();
  await wizard.locator("[name=homeLanguage][value=dwarven]").check();
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
  await page.waitForFunction(() => !holWizard.busy);
  await wizard
    .locator(
      '[name="recipes-ability-trail-workshop"][value=recipe-bound-torches]',
    )
    .check();
  await page.waitForFunction(() => !holWizard.busy);
  await action("Save choices");
  assert.equal(await wizard.locator('[data-open-market="discipline"]').count(), 0, "Early learning has no discipline market");
  await openMarket();
  const invalid = wizard.locator("[data-id=ability-the-cleverest-mixture]");
  assert(await invalid.isDisabled());
  const study = wizard
    .locator("article.hol-choice")
    .filter({ has: page.locator("[data-id=ability-ordinary-recipe-study]") });
  const firstRecipe = study.locator(
    '[name="recipe-ability-ordinary-recipe-study-1"]',
  );
  const secondRecipe = study.locator(
    '[name="recipe-ability-ordinary-recipe-study-2"]',
  );
  const ordinaryRecipeCount = await page.evaluate(
    () =>
      holWizard.catalogs.inventory.recipes.filter((recipe) => recipe.ordinary)
        .length,
  );
  assert.equal(
    await firstRecipe.locator("option:not([value=''])").count(),
    ordinaryRecipeCount,
  );
  assert.equal(
    await firstRecipe
      .locator("option:not([value=''])")
      .first()
      .evaluate((option) => option.disabled),
    false,
  );
  const knownRecipe = firstRecipe.locator('option[value="recipe-travel-food"]'),
    incompatibleRecipe = firstRecipe.locator(
      'option[value="recipe-camp-shelter"]',
    );
  assert(await knownRecipe.evaluate((option) => option.disabled));
  assert.match(await knownRecipe.textContent(), /Already known\./);
  assert.equal(
    await knownRecipe.getAttribute("data-intrinsic-disabled"),
    "true",
  );
  assert(await incompatibleRecipe.evaluate((option) => option.disabled));
  assert.match(
    await incompatibleRecipe.textContent(),
    /Incompatible with your crafting abilities\./,
  );
  assert.equal(
    await incompatibleRecipe.getAttribute("data-intrinsic-disabled"),
    "true",
  );
  assert(
    await firstRecipe
      .locator('option[value="recipe-simple-replacement-leg"]')
      .evaluate((option) => option.disabled),
  );
  assert.equal(
    await firstRecipe
      .locator('option[value="recipe-simple-replacement-leg"]')
      .getAttribute("data-intrinsic-disabled"),
    "false",
  );
  const firstDefault = await firstRecipe.inputValue();
  const secondDefault = await secondRecipe.inputValue();
  assert(firstDefault);
  assert(secondDefault);
  assert.notEqual(firstDefault, secondDefault);
  await firstRecipe.selectOption("recipe-twisted-cord");
  assert(await knownRecipe.evaluate((option) => option.disabled));
  assert.equal(
    await knownRecipe.getAttribute("data-intrinsic-disabled"),
    "true",
  );
  assert(
    await secondRecipe
      .locator('option[value="recipe-twisted-cord"]')
      .evaluate((option) => option.disabled),
  );
  await firstRecipe.selectOption("recipe-fletched-ammunition");
  await secondRecipe.selectOption("recipe-simple-replacement-leg");
  await action("Add Ordinary Recipe Study");
  assert.deepEqual(await page.evaluate(() => holWizard.draft.purchases[0].find((entry) => entry.id === "ability-ordinary-recipe-study").recipeIds), ["recipe-fletched-ammunition", "recipe-simple-replacement-leg"]);
  await action("Add Conditioned Body");
  await action("Save and continue");
  await wizard.locator("[name=classId][value=class-intellect]").check();
  await action("Save choices");
  assert(await wizard.locator("[name=classDiscipline][value=discipline-craft]").isDisabled(), "A class cannot grant a discipline already learned from an origin");
  for (const id of ["discipline-medicine", "discipline-scholarship"])
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
  assert.deepEqual(
    await page.evaluate(
      () =>
        holWizard.draft.purchases[0].find(
          (entry) => entry.id === "ability-ordinary-recipe-study",
        ).recipeIds,
    ),
    ["recipe-fletched-ammunition", "recipe-simple-replacement-leg"],
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
  await openMarket();
  assert.equal(
    await wizard
      .locator(".hol-choice-list article:visible")
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
  const clever = wizard.locator(".hol-choice-list article:visible"),
    cleverButton = clever.locator("button");
  assert(await cleverButton.isDisabled());
  assert.match(await clever.textContent(), /Requires level 7\./);
  assert.match(await clever.getAttribute("class"), /hol-ineligible/);
  const reference = clever.locator("details[data-ability-reference]");
  assert.equal(await reference.evaluate((el) => el.open), false);
  await reference.locator("summary").focus();
  assert(
    await reference
      .locator("summary")
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press("Enter");
  assert.equal(await reference.evaluate((el) => el.open), true);
  assert.match(
    await reference.textContent(),
    /Rules reference · play automation in progress/,
  );
  assert.deepEqual(
    await reference.locator(".hol-reference-outcomes dd").allTextContents(),
    [
      "Reduce temporary Poisoned by 1.",
      "Reduce temporary Poisoned by 2 or Dazed by 1.",
      "Reduce temporary Poisoned by 3 or Dazed by 2.",
    ],
  );
  const referenceText = (await reference.innerText()).replace(/\s+/g, " ");
  assert.match(referenceText, /Action Maneuver/);
  assert.match(referenceText, /Attribute Knowledge/);
  assert.match(
    referenceText,
    /Target \/ range \/ shape Self or one adjacent willing creature\./,
  );
  assert.match(
    referenceText,
    /Duration Condition reduction is immediate; crafted supplies persist until used\./,
  );
  assert.match(referenceText, /Limits Repeatable; pay the action/);
  assert.match(
    referenceText,
    /Equipment \/ acquisition One mixing kit, Bulk 1/,
  );
  await clever.scrollIntoViewIfNeeded();
  await wizard.screenshot({
    path: "test-results/creation-choice-details.png",
  });
  await page.evaluate(() => holWizard.setPosition({ width: 620, height: 800 }));
  const narrow = await clever.evaluate((el) => {
    const main = el.closest("dialog") ?? el.closest(".hol-wizard-main"),
      list = el.closest(".hol-choice-list"),
      button = el.querySelector("button"),
      mainBox = main.getBoundingClientRect(),
      buttonBox = button.getBoundingClientRect();
    return {
      columns: getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/)
        .length,
      overflow: main.scrollWidth - main.clientWidth,
      buttonVisible:
        buttonBox.width > 0 &&
        buttonBox.left >= mainBox.left &&
        buttonBox.right <= mainBox.right + 1,
      fontSize: Number.parseFloat(getComputedStyle(button).fontSize),
    };
  });
  assert.equal(narrow.columns, 1);
  assert(narrow.overflow <= 1);
  assert(narrow.buttonVisible);
  assert(narrow.fontSize >= 12);
  await wizard.screenshot({
    path: "test-results/creation-choice-details-narrow.png",
  });
  await reference.locator(".hol-reference-outcomes").scrollIntoViewIfNeeded();
  await wizard.screenshot({
    path: "test-results/creation-choice-outcomes.png",
  });
  await page.evaluate(() => holWizard.setPosition({ width: 980, height: 800 }));
  await action("Origins");
  await wizard
    .locator("[name=culture]")
    .selectOption("origin-culture-deep-halls|1");
  await action("Save choices");
  await action("Review"); // Background still grants Craft; changing one origin must preserve purchases.
  assert.equal(
    await page.evaluate(() => holWizard.draft.purchases[0].length),
    2,
  );
  const staleRejected = await page.evaluate(async () => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    const stale = new CreationWizard(holWizard.actor);
    await holWizard.persist();
    try {
      await stale.persist();
      return false;
    } catch (error) {
      return error.message.includes("Another window");
    }
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
