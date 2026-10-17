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
async function decide(kind, payload = {}, source = gm) {
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
  const result = await gm.page.evaluate(async (id) => {
    const { resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    try {
      return await resolveCombatRequest(id);
    } catch (e) {
      return { error: e.message };
    }
  }, id);
  return { id, result };
}
try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `HOL combat player ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actors = [];
    for (let i = 0; i < 3; i++)
      actors.push(
        await Actor.create({
          name: ["Arden", "Briar", "Opponent"][i],
          type: "character",
          ownership:
            i < 2 ? { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } : {},
        }),
      );
    const combat = await Combat.create({ active: true });
    const combatants = await combat.createEmbeddedDocuments(
      "Combatant",
      actors.map((a, i) => ({
        actorId: a.id,
        name: a.name,
        flags: {
          "heroes-of-legend": { side: i < 2 ? "players" : "opposition" },
        },
      })),
    );
    await ui.combat.render({ force: true });
    return {
      combat: combat.id,
      actors: actors.map((a) => a.id),
      participants: combatants.map((c) => c.id),
      user: user.id,
      name: user.name,
    };
  });
  player = await join(fixture.name);
  const denied = await decide("start", {}, player);
  assert.match(denied.result.error, /DA starts/);
  await gm.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("combat", "primary");
  });
  await gm.page
    .locator(".hol-encounter")
    .getByRole("button", { name: "Start HOL encounter" })
    .click();
  await gm.page.waitForFunction(
    (id) =>
      Boolean(game.combats.get(id).getFlag("heroes-of-legend", "encounter")),
    fixture.combat,
  );
  let s = await state();
  const first = s.startingSide;
  assert.equal(s.opening.faces.length, 3);
  assert.equal(s.opening.total >= 12, first === "players");
  const unauthorized = await decide(
    "choose",
    { id: fixture.participants[2] },
    player,
  );
  assert.match(unauthorized.result.error, /you own/);
  const expected = first === "players" ? [0, 2, 1] : [2, 0, 1];
  const selected = fixture.participants[expected[0]];
  const buttonName = `Choose ${["Arden", "Briar", "Opponent"][expected[0]]}`;
  await gm.page
    .locator(".hol-encounter")
    .getByRole("button", { name: buttonName, exact: true })
    .click();
  await gm.page.waitForFunction(
    ({ combat, id }) =>
      game.combats.get(combat).getFlag("heroes-of-legend", "encounter")
        .current === id,
    { combat: fixture.combat, id: selected },
  );
  if (expected[0] === 2) {
    const forgedFinish = await decide(
      "finish",
      { id: fixture.participants[0] },
      player,
    );
    assert.match(forgedFinish.result.error, /you own/);
  }
  const before = await state();
  assert.equal(
    await gm.page.evaluate(
      (id) => game.combats.get(id).combatant.id,
      fixture.combat,
    ),
    selected,
  );
  const duplicate = await decide("choose", { id: selected });
  assert.match(duplicate.result.error, /Finish/);
  assert.equal((await state()).serial, before.serial);
  await mkdir("test-results", { recursive: true });
  await gm.page.evaluate(() => ui.notifications.clear());
  await gm.page
    .locator(".hol-encounter")
    .screenshot({ path: "test-results/combat-tracker.png" });
  await decide("finish");
  for (const index of expected.slice(1)) {
    const selected = await decide(
      "choose",
      { id: fixture.participants[index] },
      index < 2 ? player : gm,
    );
    assert.equal(selected.result.status, "complete");
    await decide("finish", {}, index < 2 ? player : gm);
  }
  s = await state();
  assert.equal(s.round, 2);
  assert.equal(s.nextSide, first);
  assert.equal(s.serial, 3);
  const opening = await gm.page.evaluate((id) => {
    const m = game.messages.find(
      (m) =>
        m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
          `Combat.${id}` && m.rolls.length,
    );
    return {
      total: m.rolls[0].total,
      faces: m.rolls[0].dice[0].results.map((r) => r.result),
    };
  }, fixture.combat);
  assert.deepEqual(opening, { total: s.opening.total, faces: s.opening.faces });
  const snapshot = structuredClone(s);
  await gm.page.reload();
  await gm.page.waitForFunction(() => game.ready);
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  assert.deepEqual(await state(), snapshot);
  const added = await gm.page.evaluate(async (id) => {
    const c = game.combats.get(id);
    return (
      await c.createEmbeddedDocuments("Combatant", [
        { name: "Arrival", actorId: c.combatants.contents[0].actorId },
      ])
    )[0].id;
  }, fixture.combat);
  await decide("roster", {
    id: added,
    side: "players",
    mode: "join-next-round",
    reason: "DA admits arrival next round",
  });
  assert.equal(
    (await state()).roster.find((p) => p.id === added).eligibleRound,
    3,
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native tracker opening roll, explicit sides, owned-player choices, permission denial, duplicate choice protection, uneven sides, fixed round starter, serial/history persistence, reload and explicit late admission.",
  );
} catch (error) {
  console.error(
    await gm?.page.evaluate(() => ({
      ready: game.ready,
      viewed: ui.combat.viewed?.id,
      html: document.querySelector(".hol-encounter")?.outerHTML,
      notifications: document.querySelector("#notifications")?.innerText,
      messages: game.messages.contents.slice(-5).map((m) => m.content),
    })),
  );
  throw error;
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
        for (const id of f.actors) await game.actors.get(id)?.delete();
        await game.users.get(f.user)?.delete();
      }, fixture)
      .catch((e) => console.error("Fixture cleanup:", e.message));
  await browser.close();
}
