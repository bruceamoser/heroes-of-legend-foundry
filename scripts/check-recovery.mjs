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
async function request(draft, page = gm.page) {
  return page.evaluate(
    async ({ f, draft }) => {
      const { damageBasis } = await import(
          "/systems/heroes-of-legend/services/damage.mjs"
        ),
        { requestRecovery } = await import(
          "/systems/heroes-of-legend/services/recovery.mjs"
        ),
        a = game.actors.get(f.actor);
      return (await requestRecovery(a, damageBasis(a), draft)).id;
    },
    { f, draft },
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
async function state() {
  return gm.page.evaluate((f) => {
    const a = game.actors.get(f.actor);
    return {
      hp: a.system.health.value,
      spent: a.system.grit.spent,
      state: a.getFlag("heroes-of-legend", "survival"),
      pending: a.getFlag("heroes-of-legend", "pendingWounds"),
    };
  }, f);
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `Recovery ${foundry.utils.randomID(4)}`,
      role: 1,
    });
    const actor = await Actor.create({
      name: "Recovery test",
      type: "character",
      system: { health: { value: 0, baseMax: 12 }, grit: { spent: 1 } },
      ownership: { [user.id]: 3 },
      flags: {
        "heroes-of-legend": {
          pendingWounds: { fixture: { status: "awaiting-roll" } },
        },
      },
    });
    await actor.sheet.render({ force: true });
    return { actor: actor.id, user: user.id, name: user.name };
  });
  await gm.page.locator(".hol-character [data-action=recovery]").click();
  const panel = gm.page.locator(".hol-recovery");
  await panel.locator("[name=kind]").selectOption("correct");
  await panel.locator("[name=status]").selectOption("stable");
  await panel.locator("[name=wounds]").fill("2");
  assert.equal(await panel.locator("[name=reason]").inputValue(), "");
  await panel.screenshot({ path: "test-results/recovery-panel.png" });
  await panel.locator("[data-action=apply]").click();
  await gm.page.waitForFunction(
    (f) =>
      game.actors.get(f.actor).getFlag("heroes-of-legend", "survival")
        ?.status === "stable",
    f,
  );
  const breath = await request({
    kind: "breath",
    reason: "",
  });
  await done(breath);
  let s = await state();
  assert.equal(s.hp, 12);
  assert.equal(s.state.wounds, 2);
  assert.equal(s.spent, 1);
  assert.equal(s.pending.fixture.status, "awaiting-roll");
  await gm.page.evaluate(async (f) => {
    const { damageBasis, requestDamage } = await import(
        "/systems/heroes-of-legend/services/damage.mjs"
      ),
      a = game.actors.get(f.actor);
    await requestDamage(a, damageBasis(a), {
      components: [{ type: "physical", amount: 12 }],
      reason: "New hit",
    });
  }, f);
  await gm.page.waitForFunction(
    (f) => game.actors.get(f.actor).system.health.value === 0,
    f,
  );
  await gm.page.evaluate(async (id) => {
    const { resolveRecoveryRequest } = await import(
      "/systems/heroes-of-legend/services/recovery.mjs"
    );
    await resolveRecoveryRequest(id);
  }, breath);
  assert.equal((await state()).hp, 0);
  const forbidden = await request({ kind: "breath", reason: "Not yet safe" });
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Resolve Dying"),
    forbidden,
  );
  const heal = await request({
    kind: "heal",
    amount: 1,
    lifeResistance: 3,
    reason: "",
  });
  await done(heal);
  s = await state();
  assert.equal(s.hp, 1);
  assert.equal(s.state.status, "active");
  assert.equal(s.state.wounds, 3);
  assert.equal(s.spent, 1);
  const last = await request({
    kind: "correct",
    hp: 0,
    status: "lastWords",
    marks: 3,
    wounds: 3,
    reason: "Record prior Last Words result",
  });
  await done(last);
  const deadline = (await state()).state.lastWordsEnds;
  const noheal = await request({
    kind: "heal",
    amount: 20,
    lifeResistance: 0,
    reason: "Ordinary healing attempt",
  });
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("cannot reverse Last Words"),
    noheal,
  );
  const lastAgain = await request({
    kind: "correct",
    hp: 0,
    status: "lastWords",
    marks: 3,
    wounds: 3,
    reason: "Review same existing Last Words",
  });
  await done(lastAgain);
  assert.equal((await state()).state.lastWordsEnds, deadline);
  await gm.page.evaluate(async (f) => {
    await game.actors.get(f.actor).update({ "system.health.value": 4 });
  }, f);
  const corrected = await request({
    kind: "correct",
    hp: 4,
    status: "active",
    marks: 0,
    wounds: 3,
    reason: "",
  });
  await done(corrected);
  player = await join(f.name);
  const denied = await request(
    { kind: "breath", reason: "Player claims DA ruling" },
    player.page,
  );
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("DA must authorize"),
    denied,
  );
  const stale = await gm.page.evaluate(async (f) => {
    const { damageBasis } = await import(
        "/systems/heroes-of-legend/services/damage.mjs"
      ),
      { requestRecovery } = await import(
        "/systems/heroes-of-legend/services/recovery.mjs"
      ),
      a = game.actors.get(f.actor),
      basis = damageBasis(a);
    await a.update({ "system.grit.spent": 2 });
    return (
      await requestRecovery(a, basis, {
        kind: "breath",
        reason: "Stale Grit state",
      })
    ).id;
  }, f);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Review recovery again"),
    stale,
  );
  await gm.page.reload();
  await gm.page.waitForFunction(() => globalThis.game?.ready);
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  s = await state();
  assert.equal(s.hp, 4);
  assert.equal(s.state.wounds, 3);
  assert.equal(s.spent, 2);
  const cap = await request({
    kind: "heal",
    amount: 100,
    lifeResistance: 0,
    reason: "Resolved large healing",
  });
  await done(cap);
  assert.equal((await state()).hp, 12);
  assert.equal((await state()).spent, 2);
  console.log(
    "PASS native recovery UI, zero-HP import reconciliation, safe breath, replay after damage, healing minimum/cap, scars/Grit preservation, Last Words rejection/deadline, actual DA permission, stale state and reload.",
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
        for (const m of game.messages.filter((m) =>
          [
            m.getFlag("heroes-of-legend", "damageRequest")?.actorUuid,
            m.getFlag("heroes-of-legend", "recoveryRequest")?.actorUuid,
          ].includes(`Actor.${f.actor}`),
        ))
          await m.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch(console.error);
  await browser.close();
}
