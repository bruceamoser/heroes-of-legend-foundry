import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use disposable local world with explicit writes");
const browser = await chromium.launch(),
  errors = [];
let gm, fixture;
async function join(name) {
  const context = await browser.newContext();
  await context.addInitScript(
    (noCanvas) => {
      localStorage.setItem("core.noCanvas", String(noCanvas));
      localStorage.setItem("core.maxFPS", "10");
      localStorage.setItem("core.performanceMode", "0");
    },
    !(
      process.env.HOL_TEST_COMMIT_UI === "1" && name.includes("Creation Owner")
    ),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return page;
}
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    const prior = game.settings.get(
      "heroes-of-legend",
      "creationAuthorityClient",
    );
    if (prior) throw new Error("Test requires an unbound creation authority");
    await bindCreationAuthority();
    const owner = await User.create({
      name: `Creation Owner ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const other = await User.create({
      name: `Creation Other ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const { loadCatalogs } = await import(
      "/systems/heroes-of-legend/services/catalog.mjs"
    );
    const { getCampaignLanguageConfiguration } = await import(
      "/systems/heroes-of-legend/services/languages.mjs"
    );
    const { commit } = await loadCatalogs();
    const languageBasis = getCampaignLanguageConfiguration().basis;
    const draft = {
      name: "Committed Reed",
      attributes: {
        brawn: 1,
        fortitude: 0,
        agility: 0,
        guile: 0,
        knowledge: 1,
        reason: 1,
      },
      ancestryId: "ancestry-human",
      traitIds: ["trait-human-weathered", "trait-human-far-walker"],
      languages: { home: "dwarven", extraSpoken: [] },
      culture: { id: "origin-culture-deep-halls", pair: 0 },
      background: { id: "origin-background-bridge-worker", pair: 0 },
      classId: "class-intellect",
      classDisciplines: ["discipline-craft", "discipline-scholarship"],
      signatureId: "ability-signature-intellect-spot-the-leverage",
      acquisitions: {
        "ability-trail-workshop": {
          recipes: ["recipe-travel-food", "recipe-bound-torches"],
        },
      },
      purchases: {
        0: [
          { id: "ability-conditioned-body" },
          {
            id: "ability-ordinary-recipe-study",
            recipeIds: [
              "recipe-fletched-ammunition",
              "recipe-simple-replacement-leg",
            ],
          },
        ],
        1: [{ id: "ability-conditioned-body" }],
      },
      shopping: [{ id: "item-travel-pack", quantity: 1 }],
    };
    const actor = await Actor.create({
      name: "Draft Reed",
      type: "character",
      system: { biography: "Keep this biography" },
      items: [
        { name: "Personal item", type: "ability" },
        {
          name: "Existing craft tools",
          type: "equipment",
          system: { catalogId: "item-craft-tools" },
        },
      ],
      ownership: { [owner.id]: 3 },
      flags: {
        "heroes-of-legend": {
          creationDraft: {
            schemaVersion: 1,
            sourceCommit: commit,
            languageBasis,
            revision: 1,
            step: 7,
            data: draft,
          },
        },
      },
    });
    return {
      actor: actor.id,
      owner: owner.id,
      ownerName: owner.name,
      other: other.id,
      otherName: other.name,
      prior,
    };
  });
  const owner = await join(fixture.ownerName),
    other = await join(fixture.otherName);
  const unauthorized = await other.evaluate(async (id) => {
    const m = await ChatMessage.create({
      content: "Unauthorized fixture",
      flags: {
        "heroes-of-legend": {
          creationRequest: { actorUuid: `Actor.${id}`, revision: 1 },
        },
      },
    });
    return m.id;
  }, fixture.actor);
  const denied = await gm.evaluate(async (id) => {
    const { resolveCreationRequest } = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    try {
      await resolveCreationRequest(id);
      return false;
    } catch (e) {
      return e.message.includes("does not own");
    }
  }, unauthorized);
  assert(denied);
  let requests;
  if (process.env.HOL_TEST_COMMIT_UI === "1") {
    await owner.evaluate(async (id) => {
      const { CreationWizard } = await import(
        "/systems/heroes-of-legend/applications/creation.mjs"
      );
      await new CreationWizard(game.actors.get(id)).render({ force: true });
    }, fixture.actor);
    await Promise.all([
      owner
        .locator(".hol-creation")
        .getByRole("button", { name: "Create this character", exact: true })
        .click(),
      owner.evaluate(async (id) => {
        const { requestCreation } = await import(
          "/systems/heroes-of-legend/services/creation.mjs"
        );
        await requestCreation(game.actors.get(id), 1);
      }, fixture.actor),
    ]);
    await owner
      .locator('.hol-character [name="system.health.baseMax"]')
      .waitFor();
    await gm.waitForFunction(
      (id) =>
        game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "creationRequest")?.actorUuid ===
            `Actor.${id}`,
        ).length >= 3,
      fixture.actor,
    );
    requests = await gm.evaluate(
      ({ actor, owner }) =>
        game.messages
          .filter(
            (m) =>
              m.author?.id === owner &&
              m.getFlag("heroes-of-legend", "creationRequest")?.actorUuid ===
                `Actor.${actor}`,
          )
          .map((m) => m.id),
      fixture,
    );
  } else {
    requests = await owner.evaluate(async (id) => {
      const { requestCreation } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      return (
        await Promise.all([
          requestCreation(game.actors.get(id), 1),
          requestCreation(game.actors.get(id), 1),
        ])
      ).map((m) => m.id);
    }, fixture.actor);
  }
  await gm.waitForFunction(
    (id) =>
      game.actors.get(id).getFlag("heroes-of-legend", "creationReceipt")
        ?.status === "complete",
    fixture.actor,
  );
  const result = await gm.evaluate((id) => {
    const a = game.actors.get(id);
    return {
      hp: a.system.health.baseMax,
      items: a.items.size,
      equipment: a.items.filter((i) => i.type === "equipment").length,
      grit: a.system.grit.granted,
      biography: a.system.biography,
      personal: a.items.some((i) => i.name === "Personal item"),
      receipt: a.getFlag("heroes-of-legend", "creationReceipt"),
      coins: a.getFlag("heroes-of-legend", "development").coins,
      recipes: a.getFlag("heroes-of-legend", "development").recipes,
    };
  }, fixture.actor);
  assert.equal(result.hp, 19);
  assert.equal(result.equipment, 3);
  assert.equal(result.grit, 2);
  assert.equal(result.biography, "Keep this biography");
  assert(result.personal);
  assert.equal(result.items, result.receipt.createdIds.length + 2);
  assert.equal(result.coins, 60);
  assert(result.recipes.includes("recipe-fletched-ammunition"));
  assert(result.recipes.includes("recipe-simple-replacement-leg"));
  assert.equal(result.receipt.reusedIds.length, 1);
  await gm.evaluate(async (id) => {
    await game.actors
      .get(id)
      .update({ "system.health.value": 3, "system.grit.spent": 1 });
  }, fixture.actor);
  for (const id of requests) {
    const replay = await gm.evaluate(async (id) => {
      const { resolveCreationRequest } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      return resolveCreationRequest(id);
    }, id);
    assert(replay.replay);
  }
  const atomic = await gm.evaluate(async (id) => {
    const a = game.actors.get(id),
      before = a.items.size;
    const { validateCreationChanges } = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    const changes = {
      "system.health.value": 10,
      "flags.heroes-of-legend.invalidWrite": true,
      items: [
        ...a.items.map((i) => i.toObject()),
        {
          _id: foundry.utils.randomID(),
          name: "Invalid equipment",
          type: "equipment",
          system: { quantity: 0 },
        },
      ],
    };
    try {
      validateCreationChanges(a, changes);
      await a.update(changes);
      return false;
    } catch {
      return (
        a.system.health.value === 3 &&
        !a.getFlag("heroes-of-legend", "invalidWrite") &&
        a.items.size === before
      );
    }
  }, fixture.actor);
  assert(atomic);
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  const persisted = await gm.evaluate(
    async ({ actor, request }) => {
      const a = game.actors.get(actor);
      const { resolveCreationRequest, bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      await bindCreationAuthority();
      return {
        hp: a.system.health.value,
        spent: a.system.grit.spent,
        items: a.items.size,
        result: await resolveCreationRequest(request),
      };
    },
    { actor: fixture.actor, request: requests[0] },
  );
  assert.equal(persisted.hp, 3);
  assert.equal(persisted.spent, 1);
  assert.equal(persisted.items, result.items);
  assert.equal(persisted.result.status, "complete");
  assert(persisted.result.replay);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native nested Items + receipt, concurrent requests, actual-author denial, preserved unrelated data, replay after resource spend, invalid Item rejected before write, reload persistence and safe same-browser coordinator recovery.",
  );
} finally {
  if (gm && fixture)
    await gm
      .evaluate(async (f) => {
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "creationRequest")?.actorUuid ===
            `Actor.${f.actor}`,
        ))
          await m.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.owner)?.delete();
        await game.users.get(f.other)?.delete();
        await game.settings.set(
          "heroes-of-legend",
          "creationAuthorityClient",
          f.prior,
        );
      }, fixture)
      .catch((e) => console.error(e.message));
  await browser.close();
}
