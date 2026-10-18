import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use a disposable local world.");
const browser = await chromium.launch();
let gm, player, f;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { page, context };
}
async function request(eventId, kind, payload = {}, page = gm.page) {
  return page.evaluate(
    async ({ f, eventId, kind, payload }) => {
      const { requestWound } = await import(
        "/systems/heroes-of-legend/services/wounds.mjs"
      );
      return (
        await requestWound(game.actors.get(f.actor), eventId, kind, payload)
      ).id;
    },
    { f, eventId, kind, payload },
  );
}
async function done(id) {
  await gm.page.waitForFunction(
    ({ f, id }) =>
      game.actors
        .get(f.actor)
        .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.applied,
    { f, id },
  );
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const { survivalState } = await import(
      "/systems/heroes-of-legend/rules/survival.mjs"
    );
    const user = await User.create({
      name: `Wounds ${foundry.utils.randomID(4)}`,
      role: 1,
    });
    const actor = await Actor.create({
      name: "Wound test",
      type: "character",
      system: { health: { value: 0, baseMax: 12 } },
      ownership: { [user.id]: 3 },
      flags: {
        "heroes-of-legend": {
          survival: survivalState({
            hp: 0,
            maxHp: 12,
            wounds: 1,
            gritAvailable: 2,
          }),
          pendingWounds: {
            native: {
              eventId: "native",
              priorWounds: 0,
              types: ["physical"],
              status: "awaiting-roll",
            },
          },
        },
      },
    });
    return { actor: actor.id, user: user.id, name: user.name };
  });
  player = await join(f.name);
  await player.page.evaluate(async (f) => {
    await game.actors.get(f.actor).sheet.render({ force: true });
  }, f);
  await player.page.locator(".hol-character [data-action=wounds]").click();
  await player.page.locator(".hol-wounds [data-action=roll]").click();
  await gm.page.waitForFunction(
    (f) =>
      game.actors.get(f.actor).getFlag("heroes-of-legend", "pendingWounds")
        .native.status === "rolled",
    f,
  );
  const rolled = await gm.page.evaluate((f) => {
    const p = game.actors
      .get(f.actor)
      .getFlag("heroes-of-legend", "pendingWounds").native;
    return { request: p.rollRequestId, key: p.result.key, faces: p.faces };
  }, f);
  assert.equal(rolled.faces.length, 3);
  await gm.page.evaluate(async (id) => {
    const { resolveWoundRequest } = await import(
      "/systems/heroes-of-legend/services/wounds.mjs"
    );
    const old = foundry.dice.Roll.prototype.evaluate;
    foundry.dice.Roll.prototype.evaluate = () => {
      throw new Error("Unexpected reroll");
    };
    try {
      await resolveWoundRequest(id);
    } finally {
      foundry.dice.Roll.prototype.evaluate = old;
    }
  }, rolled.request);
  const denied = await request("native", "apply", {}, player.page);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("DA reviews"),
    denied,
  );
  // Reconstruct unresolved and saved phases to exercise deterministic conditions, anatomy and 666, separately from native random rolling.
  await gm.page.evaluate(async (f) => {
    const { woundCatalog } = await import(
        "/systems/heroes-of-legend/services/wounds.mjs"
      ),
      { woundRoll } = await import(
        "/systems/heroes-of-legend/rules/wounds.mjs"
      ),
      a = game.actors.get(f.actor),
      catalogCommit = (await woundCatalog()).sourceCommit;
    for (const [eventId, faces, damageType] of [
      ["bleeding", [3, 3, 3], "physical"],
      ["anatomy", [1, 1, 6], "physical"],
      ["terminal", [6, 6, 6], "physical"],
    ])
      await a.setFlag("heroes-of-legend", `pendingWounds.${eventId}`, {
        eventId,
        priorWounds: 0,
        types: [damageType],
        damageType,
        status: "rolled",
        faces,
        result: woundRoll(0, faces),
        catalogCommit,
      });
    await a.setFlag("heroes-of-legend", "pendingWounds.unknown", {
      eventId: "unknown",
      priorWounds: 0,
      types: ["cold"],
      damageType: "cold",
      status: "rolling",
      catalogCommit,
    });
  }, f);
  const badRetry = await request("unknown", "roll", { damageType: "cold" });
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("retry will not reroll"),
    badRetry,
  );
  const recovery = await request("unknown", "recover", {
    faces: [1, 5, 6],
    reason: "",
  });
  await done(recovery);
  const applyCold = await request("unknown", "apply");
  await done(applyCold);
  const cold = await gm.page.evaluate(
    (f) =>
      game.actors
        .get(f.actor)
        .effects.map((e) => e.getFlag("heroes-of-legend", "condition")?.key),
    f,
  );
  assert(cold.includes("freezing"));
  const bleed = await request("bleeding", "apply");
  await done(bleed);
  const before = await gm.page.evaluate((f) => {
    const a = game.actors.get(f.actor);
    return {
      effects: a.effects.size,
      wounds: Object.keys(a.getFlag("heroes-of-legend", "wounds")).length,
      count: a.getFlag("heroes-of-legend", "survival").wounds,
    };
  }, f);
  await gm.page.evaluate(async (id) => {
    const { resolveWoundRequest } = await import(
      "/systems/heroes-of-legend/services/wounds.mjs"
    );
    await resolveWoundRequest(id);
  }, bleed);
  assert.deepEqual(
    await gm.page.evaluate((f) => {
      const a = game.actors.get(f.actor);
      return {
        effects: a.effects.size,
        wounds: Object.keys(a.getFlag("heroes-of-legend", "wounds")).length,
        count: a.getFlag("heroes-of-legend", "survival").wounds,
      };
    }, f),
    before,
  );
  const anatomy = await request("anatomy", "apply", {
    skipped: [{ key: "116" }],
  });
  await done(anatomy);
  assert.equal(
    await gm.page.evaluate(
      (f) =>
        game.actors.get(f.actor).getFlag("heroes-of-legend", "wounds").anatomy
          .key,
      f,
    ),
    "122",
  );
  const terminal = await request("terminal", "apply");
  await done(terminal);
  assert.equal(
    await gm.page.evaluate(
      (f) =>
        game.actors.get(f.actor).getFlag("heroes-of-legend", "survival").status,
      f,
    ),
    "lastWords",
  );
  await gm.page.reload();
  await gm.page.waitForFunction(() => globalThis.game?.ready);
  assert.equal(
    await gm.page.evaluate(
      (f) =>
        game.actors.get(f.actor).getFlag("heroes-of-legend", "wounds").bleeding
          .scar,
      f,
    ),
    true,
  );
  await gm.page.evaluate(async (f) => {
    const { WoundPanel } = await import(
      "/systems/heroes-of-legend/applications/wounds.mjs"
    );
    await new WoundPanel(game.actors.get(f.actor)).render({ force: true });
  }, f);
  await gm.page
    .locator(".hol-wounds")
    .screenshot({ path: "test-results/wounds-panel.png" });
  console.log(
    "PASS owner native wound roll and no-reroll replay, DA-only application/recovery, unknown phase refusal, Cold condition mapping, native effects/scars once, anatomy advancement, 666 Last Words and reload.",
  );
} finally {
  await player?.context.close();
  if (gm && f)
    await gm.page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "woundRequest")?.actorUuid ===
            `Actor.${f.actor}`,
        ))
          await m.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch(console.error);
  await browser.close();
}
