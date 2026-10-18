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
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
}),
  errors = [];
let gm, player, f;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready && game.canvas.initialized && !game.canvas.loading);
  return { context, page };
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const user = await User.create({
      name: `Creature observer ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actor = await Actor.create({
      name: "Creature profile test",
      type: "creature",
      ownership: { [user.id]: 2 },
    });
    const scene = await Scene.create({
      name: "Creature token test",
      active: false,
      width: 1000,
      height: 1000,
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      { name: actor.name, actorId: actor.id, actorLink: false },
    ]);
    const combat = await Combat.create({ active: true });
    const [participant] = await combat.createEmbeddedDocuments("Combatant", [
      {
        actorId: actor.id,
        name: actor.name,
        flags: { "heroes-of-legend": { side: "opposition" } },
      },
    ]);
    await actor.sheet.render({ force: true });
    return {
      actor: actor.id,
      user: user.id,
      name: user.name,
      scene: scene.id,
      token: token.id,
      combat: combat.id,
      participant: participant.id,
    };
  });
  const sheet = gm.page.locator(".hol-creature");
  for (const [key, value] of Object.entries({
    "system.attributes.agility.base": 2,
    "system.health.value": 8,
    "system.health.baseMax": 8,
    "system.speed": 7,
    "system.cv": 7,
    "system.evasion.banes": 1,
    "system.threat.banes": 2,
    "system.basicMelee.weak": 4,
    "system.basicMelee.standard": 2,
    "system.basicMelee.strong": 1,
  }))
    await sheet.locator(`[name="${key}"]`).fill(String(value));
  await sheet
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) => game.actors.get(f.actor).system.speed === 7,
    f,
  );
  const result = await gm.page.evaluate(async (f) => {
    const a = game.actors.get(f.actor),
      invalid = [];
    for (const changes of [
      { "system.speed": -1 },
      { "system.speed": 1.5 },
      { "system.health.value": 9 },
      { "system.stability": 4 },
      { "system.threat.banes": -1 },
      { "system.attributes.agility.base": 3 },
    ]) {
      try {
        a.validate({
          changes: foundry.utils.expandObject(changes),
          fallback: false,
        });
        invalid.push(false);
      } catch {
        invalid.push(true);
      }
    }
    const { actorMovement } = await import(
      "/systems/heroes-of-legend/services/turn-budget.mjs"
    );
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const c = game.combats.get(f.combat);
    await resolveCombatRequest((await requestCombat(c, "start")).id);
    await resolveCombatRequest(
      (await requestCombat(c, "choose", { id: f.participant })).id,
    );
    const t = game.scenes.get(f.scene).tokens.get(f.token);
    await t.actor.update({ "system.health.value": 3 });
    return {
      invalid,
      movement: actorMovement(a),
      budget: c.getFlag("heroes-of-legend", "encounter").budgets[f.participant],
      hp: a.system.health.value,
      tokenHp: t.actor.system.health.value,
      grit: a.system.grit ?? null,
      profile: a.system.basicMelee,
    };
  }, f);
  assert(result.invalid.every(Boolean));
  assert.equal(result.movement.speed, 7);
  assert.equal(result.budget.speed, 7);
  assert.equal(result.hp, 8);
  assert.equal(result.tokenHp, 3);
  assert.equal(result.grit, null);
  assert.deepEqual(result.profile, {
    weak: 4, standard: 2, strong: 1,
    defenseAttribute: "agility", orientation: "player-defense",
  });
  player = await join(f.name);
  await player.page.evaluate(
    async (f) => game.actors.get(f.actor).sheet.render({ force: true }),
    f,
  );
  const observed = player.page.locator(".hol-creature");
  assert.equal(
    await observed.locator('input[name="system.speed"]').isDisabled(),
    true,
  );
  assert.equal(
    await observed
      .getByRole("button", { name: "Save changes", exact: true })
      .count(),
    0,
  );
  const denial = await player.page.evaluate(async (f) => {
    const { updateOwnedDocument } = await import(
      "/systems/heroes-of-legend/services/documents.mjs"
    );
    try {
      await updateOwnedDocument(game.actors.get(f.actor), {
        "system.speed": 99,
      });
      return false;
    } catch {
      return true;
    }
  }, f);
  assert(denial);
  await gm.page.evaluate(
    async (f) =>
      game.actors.get(f.actor).update({ [`ownership.${f.user}`]: 3 }),
    f,
  );
  await player.page.waitForFunction((f) => game.actors.get(f.actor).isOwner, f);
  await player.page.evaluate(
    async (f) => game.actors.get(f.actor).sheet.render({ force: true }),
    f,
  );
  await observed.locator('[data-attribute="agility"]').click();
  await player.page
    .locator(".hol-roll-dialog")
    .getByRole("button", { name: "Roll", exact: true })
    .click();
  await player.page.waitForFunction(
    (f) =>
      game.messages.some(
        (m) =>
          m.getFlag("heroes-of-legend", "roll")?.actorUuid ===
          `Actor.${f.actor}`,
      ),
    f,
  );
  await gm.page.reload();
  await gm.page.waitForFunction(() => game.ready && game.canvas.initialized && !game.canvas.loading);
  const persisted = await gm.page.evaluate((f) => {
    const a = game.actors.get(f.actor);
    return {
      type: a.type,
      speed: a.system.speed,
      threat: a.system.threat.banes,
      evasion: a.system.evasion.banes,
      hp: a.system.health.max,
      agility: a.system.attributes.agility.effective,
    };
  }, f);
  assert.deepEqual(persisted, {
    type: "creature",
    speed: 7,
    threat: 2,
    evasion: 1,
    hp: 8,
    agility: 2,
  });
  await gm.page.evaluate(
    async (f) => game.actors.get(f.actor).sheet.render({ force: true }),
    f,
  );
  await gm.page
    .locator(".hol-creature")
    .screenshot({ path: "test-results/creature-sheet.png" });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native creature creation/edit/reload, strict validation, printed Speed turn budget without added Agility, no PC Grit, observer denial, owner roll, separate synthetic-token HP and explicit defense outcome profile.",
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
            m.getFlag("heroes-of-legend", "roll")?.actorUuid ===
              `Actor.${f.actor}` ||
            m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
              `Combat.${f.combat}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        await game.scenes.get(f.scene)?.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
