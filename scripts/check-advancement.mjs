import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use authorized disposable local world");
const browser = await chromium.launch(),
  errors = [];
let gm, fixture;
async function join(name, canvas = false) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  await context.addInitScript((noCanvas) => {
    localStorage.setItem("core.noCanvas", String(noCanvas));
    localStorage.setItem("core.maxFPS", "10");
  }, !canvas);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return page;
}
try {
  await mkdir("test-results", { recursive: true });
  gm = await join("Gamemaster");
  fixture = await gm.evaluate(async (isolated) => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    const authority = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    const currentCoordinator = game.settings.get(
      "heroes-of-legend",
      "creationAuthorityClient",
    );
    if (currentCoordinator && currentCoordinator !== game.socket.id && isolated) {
      const work = game.settings.get("heroes-of-legend", "authorityWork");
      if (work.busy || work.uncertain) throw new Error("Isolated coordinator has unresolved work");
      await game.settings.set("heroes-of-legend", "creationAuthorityClient", "");
      await game.settings.set("heroes-of-legend", "authorityMeta", {});
      await game.settings.set("heroes-of-legend", "authorityWork", {});
    }
    if (!currentCoordinator || currentCoordinator === game.socket.id) {
      await authority.bindCreationAuthority();
      await authority.releaseAuthority();
    }
    if (game.settings.get("heroes-of-legend", "creationAuthorityClient"))
      throw new Error("Expected unbound authority");
    await bindCreationAuthority();
    const user = await User.create({
      name: `Advance Owner ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actor = await Actor.create({
      name: "Advancing Reed",
      type: "character",
      ownership: { [user.id]: 3 },
      system: {
        health: { value: 3, baseMax: 19 },
        grit: { granted: 2, spent: 1 },
      },
      flags: {
        "heroes-of-legend": {
          creationReceipt: { status: "complete" },
          development: {
            creationSummary: {speedBase: 6, unencumberedSpeed: 6, capacity: 10},
            level: 1,
            stage: "advancement",
            dp: 0,
            classId: "class-intellect",
            ranks: { "discipline-craft": 1, "discipline-scholarship": 1 },
            languages: [
              { id: "common", name: "Common", source: "creation-common" },
            ],
            abilities: [],
            recipes: [],
            purchases: [],
            capabilities: [],
            compatibleRecipes: [],
            safePlace: true,
            gritGranted: 2,
            gritSpent: 1,
            items: [],
            acquisitionReceipts: [],
            revision: 0,
          },
        },
      },
    });
    return { actor: actor.id, user: user.id, name: user.name };
  }, process.env.HOL_TEST_ISOLATED_WORLD === "1");
  const player = await join(fixture.name, true);
  const unauthorized = await player.evaluate(async (id) => {
    const { requestDevelopment } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    return (
      await requestDevelopment(game.actors.get(id), "award", { level: 7 })
    ).id;
  }, fixture.actor);
  assert(
    await gm.evaluate(async (id) => {
      const { resolveDevelopmentRequest } = await import(
        "/systems/heroes-of-legend/services/advancement.mjs"
      );
      try {
        await resolveDevelopmentRequest(id);
        return false;
      } catch (e) {
        return e.message.includes("DA must");
      }
    }, unauthorized),
  );
  await gm.evaluate(async (id) => {
    const { requestDevelopment, resolveDevelopmentRequest } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    const a = game.actors.get(id);
    const m = await requestDevelopment(a, "award", { level: 2 });
    await resolveDevelopmentRequest(m.id);
    await resolveDevelopmentRequest(m.id);
  }, fixture.actor);
  assert.equal(
    await gm.evaluate(
      (id) => game.actors.get(id).getFlag("heroes-of-legend", "development").dp,
      fixture.actor,
    ),
    10,
  );
  await player.evaluate(async (id) => {
    const { AdvancementWizard } = await import(
      "/systems/heroes-of-legend/applications/advancement.mjs"
    );
    globalThis.advanceWizard = new AdvancementWizard(game.actors.get(id));
    await advanceWizard.render({ force: true });
  }, fixture.actor);
  const wizard = player.locator(".hol-advancement");
  async function closeMarket() {
    const dialog = wizard.locator("dialog[open]");
    if (await dialog.count()) await dialog.locator("[data-close-market]").click();
  }
  async function openMarket() {
    if (!(await wizard.locator("dialog[open]").count())) await wizard.locator('[data-open-market="ability"]').click();
    assert(await wizard.locator("dialog[open]").isVisible());
  }
  async function purchase(name) {
    await player.waitForFunction(() => !advanceWizard.busy);
    await openMarket();
    await wizard.getByRole("button", {name, exact:true}).click();
    await player.waitForFunction(() => !advanceWizard.busy);
    assert(await wizard.locator("dialog[open]").isVisible(), "Purchase keeps its native market open");
  }
  await openMarket();
  const initialStudy = wizard
    .locator("article.hol-choice")
    .filter({ has: player.locator("[data-id=ability-ordinary-recipe-study]") });
  assert(
    await initialStudy
      .getByRole("button", {
        name: "Add Ordinary Recipe Study",
        exact: true,
      })
      .isDisabled(),
  );
  assert.match(await initialStudy.textContent(), /only 0 are available/);
  assert(
    await wizard
      .getByRole("button", { name: "Add Conditioned Body", exact: true })
      .isDisabled(),
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
  await player.keyboard.press("Enter");
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
    path: "test-results/advancement-choice-details.png",
  });
  await player.evaluate(() =>
    advanceWizard.setPosition({ width: 620, height: 800 }),
  );
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
    path: "test-results/advancement-choice-details-narrow.png",
  });
  await reference.locator(".hol-reference-outcomes").scrollIntoViewIfNeeded();
  await wizard.screenshot({
    path: "test-results/advancement-choice-outcomes.png",
  });
  await player.evaluate(() =>
    advanceWizard.setPosition({ width: 940, height: 800 }),
  );
  await wizard.locator("[data-search]").fill("");
  await gm.evaluate(async (id) => {
    const { requestDevelopment, resolveDevelopmentRequest } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    const m = await requestDevelopment(game.actors.get(id), "safePlace", {
      approved: true,
    });
    await resolveDevelopmentRequest(m.id);
  }, fixture.actor);
  await closeMarket();
  await wizard
    .getByRole("button", {
      name: "Refresh and review current ledger",
      exact: true,
    })
    .click();
  await player.waitForFunction(() => !advanceWizard.busy);
  // Exercise the actual native acquisition widgets before the main spending plan.
  await purchase("Add Another Tongue");
  await closeMarket();
  const languageSelect = wizard.locator(
    '[name="languageId-ability-another-tongue"]',
  );
  assert(await languageSelect.isVisible());
  assert(
    await languageSelect
      .locator('option[value="common"]')
      .evaluate((option) => option.disabled),
  );
  assert(
    await languageSelect
      .locator('option[value="draconic"]')
      .evaluate((option) => option.disabled),
  );
  await languageSelect.selectOption("goblin");
  await player.waitForFunction(() => !advanceWizard.busy);
  await purchase("Add A Party Piece");
  await closeMarket();
  const specialty = wizard.locator('[name="specialty-ability-a-party-piece"]');
  assert(await specialty.isVisible());
  await specialty.fill("juggling");
  await wizard.getByRole("button", { name: "Save draft", exact: true }).click();
  await player.waitForFunction(() => !advanceWizard.busy);
  const acquisitionChoices = await player.evaluate(
    () => advanceWizard.draft.acquisitions,
  );
  assert.equal(
    acquisitionChoices["ability-another-tongue"].languageId,
    "goblin",
  );
  assert.equal(
    acquisitionChoices["ability-a-party-piece"].specialty,
    "juggling",
  );
  await player.evaluate(async () => {
    advanceWizard.draft = { purchases: [], signatures: {}, acquisitions: {} };
    await advanceWizard.render({ force: true });
  });
  await purchase("Add Conditioned Body");
  await purchase("Add Smoke in a Bottle");
  await purchase("Add Make Something Useful");
  await closeMarket();
  const craftRecipes = wizard.locator(
    '[data-acquisition="ability-make-something-useful"]',
  );
  for (const id of ["recipe-twisted-cord", "recipe-wooden-brace"]) {
    await craftRecipes
      .locator(`[name="recipes-ability-make-something-useful"][value="${id}"]`)
      .check();
    await player.waitForFunction(() => !advanceWizard.busy);
  }
  await wizard.getByRole("button", { name: "Save draft", exact: true }).click();
  await player.waitForFunction(() => !advanceWizard.busy);
  await openMarket();
  const study = wizard
    .locator("article.hol-choice")
    .filter({ has: player.locator("[data-id=ability-ordinary-recipe-study]") });
  const firstRecipe = study.locator(
    '[name="recipe-ability-ordinary-recipe-study-1"]',
  );
  const secondRecipe = study.locator(
    '[name="recipe-ability-ordinary-recipe-study-2"]',
  );
  const ordinaryRecipeCount = await player.evaluate(
    () =>
      advanceWizard.catalogs.inventory.recipes.filter(
        (recipe) => recipe.ordinary,
      ).length,
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
  const knownRecipe = firstRecipe.locator('option[value="recipe-smoke-flask"]'),
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
      .locator('option[value="recipe-fletched-ammunition"]')
      .evaluate((option) => option.disabled),
  );
  assert.equal(
    await firstRecipe
      .locator('option[value="recipe-fletched-ammunition"]')
      .getAttribute("data-intrinsic-disabled"),
    "false",
  );
  const firstDefault = await firstRecipe.inputValue();
  const secondDefault = await secondRecipe.inputValue();
  assert(firstDefault);
  assert(secondDefault);
  assert.notEqual(firstDefault, secondDefault);
  await firstRecipe.selectOption("recipe-travel-food");
  assert(await knownRecipe.evaluate((option) => option.disabled));
  assert.equal(
    await knownRecipe.getAttribute("data-intrinsic-disabled"),
    "true",
  );
  assert(
    await secondRecipe
      .locator('option[value="recipe-travel-food"]')
      .evaluate((option) => option.disabled),
  );
  await firstRecipe.selectOption("recipe-bound-torches");
  await secondRecipe.selectOption("recipe-fletched-ammunition");
  await purchase("Add Ordinary Recipe Study");
  await player.reload();
  await player.waitForFunction(() => game.ready);
  await player.evaluate(async (id) => {
    const { AdvancementWizard } = await import(
      "/systems/heroes-of-legend/applications/advancement.mjs"
    );
    globalThis.advanceWizard = new AdvancementWizard(game.actors.get(id));
    await advanceWizard.render({ force: true });
  }, fixture.actor);
  assert.equal(
    await player.evaluate(() => advanceWizard.draft.purchases.length),
    4,
  );
  const draftId = await player.evaluate(() => advanceWizard.draftId);
  await wizard
    .getByRole("button", { name: "Commit reviewed advancement", exact: true })
    .click();
  await gm.waitForFunction(
    ({ actor, draftId }) =>
      game.actors.get(actor).getFlag("heroes-of-legend", "development")
        .commitReceipts?.[draftId]?.status === "complete",
    { actor: fixture.actor, draftId },
  );
  const result = await gm.evaluate((id) => {
    const a = game.actors.get(id),
      d = a.getFlag("heroes-of-legend", "development");
    return {
      hp: a.system.health.value,
      max: a.system.health.baseMax,
      spent: a.system.grit.spent,
      dp: d.dp,
      recipes: d.recipes,
      items: a.items.size,
    };
  }, fixture.actor);
  assert.equal(result.hp, 3);
  assert.equal(result.max, 20);
  assert.equal(result.spent, 1);
  assert.equal(result.dp, 2);
  assert.equal(result.items, 6);
  assert(result.recipes.includes("recipe-smoke-flask"));
  assert(result.recipes.includes("recipe-bound-torches"));
  assert(result.recipes.includes("recipe-fletched-ammunition"));
  const replay = await gm.evaluate(async (id) => {
    const { resolveDevelopmentRequest } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    const m = game.messages.find(
      (m) =>
        m.getFlag("heroes-of-legend", "developmentRequest")?.actorUuid ===
          `Actor.${id}` &&
        m.getFlag("heroes-of-legend", "developmentRequest")?.kind ===
          "commitDraft",
    );
    return resolveDevelopmentRequest(m.id);
  }, fixture.actor);
  assert(replay.replay);
  await gm.evaluate(async (id) => {
    const { requestDevelopment, resolveDevelopmentRequest } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    const actor = game.actors.get(id);
    for (const [kind, payload] of [
      ["award", { level: 7 }],
      ["safePlace", { approved: true }],
    ]) {
      const message = await requestDevelopment(actor, kind, payload);
      await resolveDevelopmentRequest(message.id);
    }
  }, fixture.actor);
  await player.evaluate(async (id) => {
    const { AdvancementWizard } = await import(
      "/systems/heroes-of-legend/applications/advancement.mjs"
    );
    globalThis.advanceWizard = new AdvancementWizard(game.actors.get(id));
    await advanceWizard.render({ force: true });
  }, fixture.actor);
  await wizard
    .locator('[data-signature="3"]')
    .selectOption("ability-signature-intellect-a-better-angle");
  await wizard
    .locator('[data-signature="7"]')
    .selectOption("ability-signature-intellect-a-route-for-everyone");
  await wizard.getByRole("button", { name: "Save draft", exact: true }).click();
  await player.waitForFunction(() => !advanceWizard.busy);
  for (const name of ["Add One More Dawn", "Add Conditioned Body"]) {
    await purchase(name);
  }
  await closeMarket();
  const secondDraft = await player.evaluate(() => advanceWizard.draftId);
  await wizard
    .getByRole("button", { name: "Commit reviewed advancement", exact: true })
    .click();
  await gm.waitForFunction(
    ({ actor, id }) =>
      game.actors.get(actor).getFlag("heroes-of-legend", "development")
        .commitReceipts?.[id]?.status === "complete",
    { actor: fixture.actor, id: secondDraft },
  );
  const milestone = await gm.evaluate((id) => {
    const a = game.actors.get(id),
      d = a.getFlag("heroes-of-legend", "development");
    return {
      level: d.level,
      dp: d.dp,
      pending: d.pendingSignatures,
      granted: a.system.grit.granted,
      spent: a.system.grit.spent,
      hp: a.system.health.value,
      max: a.system.health.baseMax,
    };
  }, fixture.actor);
  assert.deepEqual(milestone, {
    level: 7,
    dp: 57,
    pending: [],
    granted: 5,
    spent: 1,
    hp: 3,
    max: 21,
  });
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  await gm.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  assert.equal(
    await gm.evaluate(
      (id) => game.actors.get(id).system.health.baseMax,
      fixture.actor,
    ),
    21,
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: DA-only milestones, repeat award, safe-place gate, draft reload, player UI commit, recipe/tool grants, HP maximum without healing, spent Grit, replay and persistence.",
  );
} finally {
  if (gm && fixture)
    await gm
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        {
          await new Promise((resolve) => setTimeout(resolve, 500));
          for (const m of game.messages.filter(
            (m) =>
              m.getFlag("heroes-of-legend", "developmentRequest")?.actorUuid ===
              `Actor.${f.actor}`,
          ))
            await m.delete();
          await game.actors.get(f.actor)?.delete();
          await game.users.get(f.user)?.delete();
        }
      }, fixture)
      .catch((error) => {
        console.error(`Cleanup failed: ${error.message}`);
        process.exitCode = 1;
      });
  await browser.close();
}
