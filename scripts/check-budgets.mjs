import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");
const browser = await chromium.launch(),
  errors = [];
let gm, player, fixture;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return { context, page };
}
const state = () =>
  gm.page.evaluate(
    (id) => game.combats.get(id).getFlag("heroes-of-legend", "encounter"),
    fixture.combat,
  );
async function request(kind, payload = {}, source = gm) {
  const id = await source.page.evaluate(
    async ({ combat, kind, payload }) => {
      const { requestCombat } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
      return (await requestCombat(game.combats.get(combat), kind, payload)).id;
    },
    { combat: fixture.combat, kind, payload },
  );
  await gm.page.waitForFunction((id) => game.messages.has(id), id);
  return {
    id,
    result: await gm.page.evaluate(async (id) => {
      const { resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
      try {
        return await resolveCombatRequest(id);
      } catch (e) {
        return { error: e.message };
      }
    }, id),
  };
}
async function changeCondition(key, rating) {
  await gm.page.evaluate(
    async ({ actor, key, rating }) => {
      const a = game.actors.get(actor),
        e = a.effects.find(
          (e) => e.getFlag("heroes-of-legend", "condition")?.key === key,
        );
      if (e)
        await e.update(
          rating
            ? {
                disabled: false,
                "flags.heroes-of-legend.condition.rating": rating,
              }
            : { disabled: true },
        );
      else if (rating)
        await a.createEmbeddedDocuments("ActiveEffect", [
          {
            name: key,
            flags: {
              "heroes-of-legend": {
                condition: {
                  key,
                  rating,
                  persistence: key === "grappled" ? "maintained" : "temporary",
                  source: "Budget fixture",
                  order: 0,
                },
              },
            },
          },
        ]);
    },
    { actor: fixture.actor, key, rating },
  );
}
try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `Budget player ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actor = await Actor.create({
      name: "Budget hero",
      type: "character",
      ownership: { [user.id]: 3 },
      flags: {
        "heroes-of-legend": {
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    const combat = await Combat.create({ active: true });
    const [c] = await combat.createEmbeddedDocuments("Combatant", [
      {
        actorId: actor.id,
        name: actor.name,
        flags: { "heroes-of-legend": { side: "players" } },
      },
    ]);
    return {
      actor: actor.id,
      combat: combat.id,
      participant: c.id,
      user: user.id,
      name: user.name,
    };
  });
  player = await join(fixture.name);
  await changeCondition("dazed", 2);
  await changeCondition("grappled", 1);
  await request("start");
  assert.equal(
    (await state()).budgets[fixture.participant].remaining.reaction,
    1,
  );
  await player.page.evaluate(async (f) => {
    const { chooseCombatParticipant } = await import(
      "/systems/heroes-of-legend/dialogs/turn-choice.mjs"
    );
    globalThis.holTurnChoice = chooseCombatParticipant(
      game.combats.get(f.combat),
      f.participant,
    );
  }, fixture);
  await player.page.locator(".hol-turn-choice [name=main]").check();
  await player.page
    .locator(".hol-turn-choice")
    .getByRole("button", { name: "Begin turn", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter")
        .current === f.participant,
    fixture,
  );
  let s = await state();
  assert.deepEqual(s.budgets[fixture.participant].remaining, {
    main: 1,
    maneuver: 0,
    reaction: 0,
  });
  const movement = () =>
    gm.page.evaluate(async (f) => {
      const { displayedBudget } = await import(
        "/systems/heroes-of-legend/services/turn-budget.mjs"
      );
      return displayedBudget(game.combats.get(f.combat), f.participant)
        .movementRemaining;
    }, fixture);
  assert.equal(await movement(), 0);
  await changeCondition("grappled", 0);
  await changeCondition("dazed", 3);
  assert.equal(await movement(), 6);
  const blocked = await request("convert", {
    id: fixture.participant,
    from: "main",
    to: "maneuver",
  });
  assert.match(blocked.result.error, /not retained/);
  const forged = await request(
    "convert",
    {
      id: fixture.participant,
      from: "main",
      to: "maneuver",
      overrideReason: "I am the DA",
    },
    player,
  );
  assert.match(forged.result.error, /Only the DA/);
  const allowed = await request("convert", {
    id: fixture.participant,
    from: "main",
    to: "maneuver",
    overrideReason: "DA permits this exceptional conversion",
  });
  assert.equal(allowed.result.status, "complete");
  await request("convert", {
    id: fixture.participant,
    from: "maneuver",
    to: "movement",
  });
  assert.equal(await movement(), 12);
  await request("finish");
  assert.equal((await state()).budgets[fixture.participant].remaining.main, 0);
  await request("choose", { id: fixture.participant });
  s = await state();
  assert.deepEqual(s.budgets[fixture.participant].retained, []);
  assert.equal(await movement(), 6);
  await changeCondition("dazed", 0);
  await request("finish");
  await request("choose", { id: fixture.participant });
  s = await state();
  assert.deepEqual(s.budgets[fixture.participant].remaining, {
    main: 1,
    maneuver: 1,
    reaction: 1,
  });
  await player.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("combat", "primary");
  });
  await player.page
    .locator(".hol-encounter")
    .getByRole("button", { name: "Main → Maneuver", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter")
        .budgets[f.participant].remaining.main === 0,
    fixture,
  );
  const conversion = {
    id: await gm.page.evaluate(
      (f) =>
        game.messages.contents
          .filter(
            (m) =>
              m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
                `Combat.${f.combat}` &&
              m.getFlag("heroes-of-legend", "combatRequest").kind ===
                "convert" &&
              m.author.id === f.user &&
              game.combats
                .get(f.combat)
                .getFlag("heroes-of-legend", "operationReceipts")?.[m.id]
                ?.applied,
          )
          .at(-1).id,
      fixture,
    ),
  };
  assert(conversion.id);
  await request(
    "convert",
    { id: fixture.participant, from: "maneuver", to: "movement" },
    player,
  );
  await request(
    "convert",
    { id: fixture.participant, from: "maneuver", to: "movement" },
    player,
  );
  assert.equal(await movement(), 18);
  await gm.page.evaluate(async (id) => {
    const { resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    await resolveCombatRequest(id);
  }, conversion.id);
  assert.equal(await movement(), 18);
  await changeCondition("paralyzed", 2);
  assert.equal(await movement(), 0);
  await changeCondition("paralyzed", 0);
  assert.equal(await movement(), 18);
  const before = await state();
  await gm.page.reload();
  await gm.page.waitForFunction(() => game.ready);
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  assert.deepEqual(await state(), before);
  await request("finish");
  await gm.page.evaluate(async (id) => {
    await game.actors.get(id).unsetFlag("heroes-of-legend", "development");
  }, fixture.actor);
  await gm.page.evaluate(async (f) => {
    const { chooseCombatParticipant } = await import(
      "/systems/heroes-of-legend/dialogs/turn-choice.mjs"
    );
    globalThis.holTurnChoice = chooseCombatParticipant(
      game.combats.get(f.combat),
      f.participant,
    );
  }, fixture);
  await gm.page.locator(".hol-turn-choice [name=speed]").fill("4");
  await gm.page
    .locator(".hol-turn-choice [name=reason]")
    .fill("Printed custom profile");
  await gm.page
    .locator(".hol-turn-choice")
    .getByRole("button", { name: "Begin turn", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter")
        .current === f.participant,
    fixture,
  );
  assert.equal(await movement(), 4);
  assert.equal(
    (await state()).speedRulings[fixture.participant].reason,
    "Printed custom profile",
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native turn-category choice, frozen Dazed categories, live grapple/paralysis movement, authenticated DA exception, counted sprint conversions, replay, refresh, off-turn preservation, reload and explicit custom Speed ruling.",
  );
} catch (e) {
  console.error(
    await gm?.page.evaluate(() => ({
      notifications: document.querySelector("#notifications")?.innerText,
      messages: game.messages.contents.slice(-4).map((m) => m.content),
    })),
  );
  throw e;
} finally {
  await player?.context.close();
  if (gm && fixture)
    await gm.page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
            `Combat.${f.combat}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, fixture)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
