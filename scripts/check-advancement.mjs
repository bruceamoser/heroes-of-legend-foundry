import { chromium } from "playwright";
import assert from "node:assert/strict";
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
  gm = await join("Gamemaster");
  fixture = await gm.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    const prior = game.settings.get(
      "heroes-of-legend",
      "creationAuthorityClient",
    );
    if (prior) throw new Error("Expected unbound authority");
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
            level: 1,
            stage: "advancement",
            dp: 0,
            classId: "class-intellect",
            ranks: { "discipline-craft": 1, "discipline-scholarship": 1 },
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
    return { actor: actor.id, user: user.id, name: user.name, prior };
  });
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
  assert(
    await wizard
      .getByRole("button", { name: "Add Conditioned Body", exact: true })
      .isDisabled(),
  );
  await gm.evaluate(async (id) => {
    const { requestDevelopment, resolveDevelopmentRequest } = await import(
      "/systems/heroes-of-legend/services/advancement.mjs"
    );
    const m = await requestDevelopment(game.actors.get(id), "safePlace", {
      approved: true,
    });
    await resolveDevelopmentRequest(m.id);
  }, fixture.actor);
  await wizard
    .getByRole("button", {
      name: "Refresh and review current ledger",
      exact: true,
    })
    .click();
  await player.waitForFunction(() => !advanceWizard.busy);
  await wizard
    .getByRole("button", { name: "Add Conditioned Body", exact: true })
    .click();
  await player.waitForFunction(() => !advanceWizard.busy);
  await wizard
    .getByRole("button", { name: "Add Smoke in a Bottle", exact: true })
    .click();
  await player.waitForFunction(() => !advanceWizard.busy);
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
    2,
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
  assert.equal(result.dp, 6);
  assert.equal(result.items, 3);
  assert(result.recipes.includes("recipe-smoke-flask"));
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
    await wizard.getByRole("button", { name, exact: true }).click();
    await player.waitForFunction(() => !advanceWizard.busy);
  }
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
    dp: 61,
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
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "developmentRequest")?.actorUuid ===
            `Actor.${f.actor}`,
        ))
          await m.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
        await game.settings.set(
          "heroes-of-legend",
          "creationAuthorityClient",
          f.prior,
        );
      }, fixture)
      .catch((e) => console.error(e.message));
  await browser.close();
}
