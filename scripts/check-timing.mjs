import { selectTestUser } from "./helpers/login.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Select a disposable local world and enable writes");
const browser = await chromium.launch();
const errors = [];
const contexts = [];
async function join(name) {
  const c = await browser.newContext();
  contexts.push(c);
  await c.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  const p = await c.newPage();
  p.setDefaultTimeout(30000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url);
  await selectTestUser(p, name);
  await p.locator("button[name=join]").click();
  await p.waitForFunction(() => game.ready);
  return p;
}
let gm, other, fixture, originalGM;
const run = (page, event) =>
  page.evaluate(
    async ({ fixture, event }) => {
      const { applyTimingProbe } = await import(
        "/systems/heroes-of-legend/prototypes/timing.mjs"
      );
      return applyTimingProbe(game.combats.get(fixture.combat), {
        turnId: "turn1",
        phase: "end",
        controllerUuid: `Actor.${fixture.actors[0]}`,
        actorUuids: fixture.actors.map((id) => `Actor.${id}`),
        ...event,
      });
    },
    { fixture, event },
  );
const snapshot = (page) =>
  page.evaluate(
    (f) => ({
      actors: f.actors.map((id) => {
        const a = game.actors.get(id);
        return {
          hp: a.system.health.value,
          burning: a.getFlag("heroes-of-legend", "probeBurning"),
          expired: [
            "heroes-of-legend.turnStart",
            "heroes-of-legend.turnEnd",
          ].map(
            (expiry) =>
              a.effects.find((e) => e.duration.expiry === expiry)?.duration
                .expired,
          ),
        };
      }),
      phase: game.combats
        .get(f.combat)
        .getFlag("heroes-of-legend", "timingPhase"),
    }),
    fixture,
  );
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  originalGM = gm;
  fixture = await gm.evaluate(async () => {
    const actors = [];
    for (const name of ["Controller", "Summon", "Unrelated"]) {
      const a = await Actor.create({
        name: `Timing ${name}`,
        type: "character",
        flags: { "heroes-of-legend": { probeBurning: 3 } },
      });
      actors.push(a);
      await a.createEmbeddedDocuments("ActiveEffect", [
        {
          name: "Turn start fixture",
          duration: {
            value: null,
            units: "seconds",
            expiry: "heroes-of-legend.turnStart",
          },
        },
        {
          name: "Turn end fixture",
          duration: {
            value: null,
            units: "seconds",
            expiry: "heroes-of-legend.turnEnd",
          },
        },
      ]);
    }
    const actorUuids = actors.slice(0, 2).map((a) => a.uuid);
    const combat = await Combat.create({
      flags: {
        "heroes-of-legend": {
          timingProbe: { controllerUuid: actorUuids[0], actorUuids },
        },
      },
    });
    const user = await User.create({
      name: `Timing GM ${foundry.utils.randomID()}`,
      role: CONST.USER_ROLES.GAMEMASTER,
    });
    return {
      actors: actors.slice(0, 2).map((a) => a.id),
      unrelated: actors[2].id,
      combat: combat.id,
      user: user.id,
      userName: user.name,
    };
  });
  other = await join(fixture.userName);
  // Choose the core active GM dynamically; its identity is not creation-order guaranteed.
  if (!(await gm.evaluate(() => game.users.activeGM.isSelf)))
    [gm, other] = [other, gm];
  assert.equal((await run(other, { phase: "start" })).status, "not-authority");
  await run(gm, { phase: "start" });
  let state = await snapshot(gm);
  assert.deepEqual(
    state.actors.map((a) => a.hp),
    [12, 12],
  );
  assert.deepEqual(
    state.actors.map((a) => a.expired),
    [
      [true, false],
      [true, false],
    ],
  );
  await Promise.all([run(gm, {}), run(gm, {}), run(other, {})]);
  state = await snapshot(gm);
  assert.deepEqual(
    state.actors.map((a) => [a.hp, a.burning, a.expired]),
    [
      [9, 2, [true, true]],
      [9, 2, [true, true]],
    ],
  );
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  // Reload may move activeGM ownership; select the active client again.
  if (!(await gm.evaluate(() => game.users.activeGM.isSelf)))
    [gm, other] = [other, gm];
  await run(gm, {});
  assert.deepEqual(await snapshot(gm), state);
  await run(gm, { turnId: "turn2" });
  state = await snapshot(gm);
  assert.deepEqual(
    state.actors.map((a) => [a.hp, a.burning]),
    [
      [7, 1],
      [7, 1],
    ],
  );
  const unrelated = await gm.evaluate((id) => {
    const a = game.actors.get(id);
    return {
      hp: a.system.health.value,
      expired: ["heroes-of-legend.turnStart", "heroes-of-legend.turnEnd"].map(
        (expiry) =>
          a.effects.find((e) => e.duration.expiry === expiry)?.duration.expired,
      ),
    };
  }, fixture.unrelated);
  assert.deepEqual(unrelated, { hp: 12, expired: [false, false] });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: controller and summon tick once, start/end expiry scoped correctly, duplicate/second-GM calls and reload replay safe; unrelated Actor unchanged.",
  );
} finally {
  if (fixture && originalGM)
    await originalGM
      .evaluate(async (f) => {
        await game.combats.get(f.combat)?.delete();
        for (const id of [...f.actors, f.unrelated])
          await game.actors.get(id)?.delete();
        const u = game.users.get(f.user);
        if (u && u.id !== game.user.id) await u.delete();
      }, fixture)
      .catch(() => {});
  await browser.close();
}
