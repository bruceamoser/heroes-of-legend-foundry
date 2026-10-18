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
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.stack);
  });
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return { context, page };
}
async function combatRequest(kind, payload = {}) {
  return gm.page.evaluate(
    async ({ combat, kind, payload }) => {
      const { requestCombat, resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
      const m = await requestCombat(game.combats.get(combat), kind, payload);
      try {
        return await resolveCombatRequest(m.id);
      } catch (e) {
        return { error: e.message };
      }
    },
    { combat: fixture.combat, kind, payload },
  );
}
async function abilityRequest() {
  return player.page.evaluate(async (f) => {
    const { requestAbility } = await import(
      "/systems/heroes-of-legend/services/abilities.mjs"
    );
    return (
      await requestAbility(
        await fromUuid(f.item),
        game.combats.get(f.combat),
        f.hero,
      )
    ).id;
  }, fixture);
}
async function snapshot() {
  return gm.page.evaluate(async (f) => {
    const { defenseBenefits } = await import(
      "/systems/heroes-of-legend/services/benefits.mjs"
    );
    const c = game.combats.get(f.combat),
      a = game.actors.get(f.actor);
    return {
      state: c.getFlag("heroes-of-legend", "encounter"),
      pending: c.getFlag("heroes-of-legend", "pendingAbility"),
      benefits: defenseBenefits(a),
      effects: a.effects.map((e) => ({ id: e.id, disabled: e.disabled })),
    };
  }, fixture);
}
try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const { ABILITY_DEFINITIONS } = await import(
      "/systems/heroes-of-legend/rules/ability-definitions.mjs"
    );
    const user = await User.create({
      name: `Defend player ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actors = [];
    for (let i = 0; i < 2; i++)
      actors.push(
        await Actor.create({
          name: i ? "Opponent" : "Guarding hero",
          type: "character",
          ownership: i ? {} : { [user.id]: 3 },
          flags: {
            "heroes-of-legend": {
              development: { creationSummary: { speedBase: 6 } },
            },
          },
        }),
      );
    const [item] = await actors[0].createEmbeddedDocuments("Item", [
      {
        name: "Defend",
        type: "ability",
        flags: {
          "heroes-of-legend": {
            catalogId: "ability-defend",
            source: ABILITY_DEFINITIONS["ability-defend"].source,
            automation: "pending",
          },
        },
      },
    ]);
    const combat = await Combat.create({ active: true });
    const cs = await combat.createEmbeddedDocuments(
      "Combatant",
      actors.map((a, i) => ({
        name: a.name,
        actorId: a.id,
        flags: { "heroes-of-legend": { side: i ? "opposition" : "players" } },
      })),
    );
    return {
      actor: actors[0].id,
      otherActor: actors[1].id,
      combat: combat.id,
      hero: cs[0].id,
      opponent: cs[1].id,
      item: item.uuid,
      user: user.id,
      name: user.name,
    };
  });
  player = await join(fixture.name);
  await combatRequest("start");
  if ((await snapshot()).state.nextSide === "opposition") {
    await combatRequest("choose", { id: fixture.opponent });
    await combatRequest("finish");
  }
  await combatRequest("choose", { id: fixture.hero });
  await player.page.evaluate(async (uuid) => {
    await (await fromUuid(uuid)).sheet.render({ force: true });
  }, fixture.item);
  await player.page
    .locator(".hol-ability")
    .getByRole("button", { name: "Use Defend", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      Object.values(
        game.combats
          .get(f.combat)
          .getFlag("heroes-of-legend", "abilityOperations") ?? {},
      ).some((o) => o.status === "complete"),
    fixture,
  );
  let s = await snapshot();
  assert.equal(s.state.budgets[fixture.hero].remaining.maneuver, 0);
  assert.equal(s.benefits.length, 1);
  assert.equal(s.benefits[0].amount, 1);
  assert.equal(s.effects.length, 1);
  const first = await gm.page.evaluate(
    (f) =>
      Object.keys(
        game.combats
          .get(f.combat)
          .getFlag("heroes-of-legend", "abilityOperations"),
      )[0],
    fixture,
  );
  const replay = await gm.page.evaluate(async (id) => {
    const { resolveAbilityRequest } = await import(
      "/systems/heroes-of-legend/services/abilities.mjs"
    );
    return resolveAbilityRequest(id);
  }, first);
  assert(replay.replay);
  const second = await abilityRequest();
  await gm.page.waitForFunction(
    ({ combat, id }) =>
      game.combats
        .get(combat)
        .getFlag("heroes-of-legend", "abilityOperations")?.[id]?.status ===
      "complete",
    { combat: fixture.combat, id: second },
  );
  s = await snapshot();
  assert.equal(s.benefits.length, 1);
  assert.equal(s.effects.length, 1);
  assert.equal(s.state.budgets[fixture.hero].remaining.maneuver, 0);
  const third = await abilityRequest();
  await gm.page.waitForFunction(
    ({ combat, id }) => game.combats.get(combat)
      .getFlag("heroes-of-legend", "abilityOperations")?.[id]?.status === "complete",
    { combat: fixture.combat, id: third },
  );
  const reused = await snapshot();
  assert.equal(reused.state.budgets[fixture.hero].remaining.maneuver, 0);
  assert.equal(reused.state.budgets[fixture.hero].operations[third].category, "free");
  assert.equal((await snapshot()).effects.length, 1);
  await combatRequest("finish");
  await combatRequest("choose", { id: fixture.opponent });
  assert.equal((await snapshot()).benefits.length, 1);
  await combatRequest("finish");
  await combatRequest("choose", { id: fixture.hero });
  s = await snapshot();
  assert.equal(s.benefits.length, 0);
  assert(s.effects[0].disabled);
  // A known local failure after the durable reservation, before the effect write.
  await gm.page.evaluate((f) => {
    const a = game.actors.get(f.actor),
      native = a.toObject.bind(a);
    a.toObject = (...args) => {
      if (
        game.combats.get(f.combat).getFlag("heroes-of-legend", "pendingAbility")
      )
        throw new Error(
          "Injected continuation failure before native effect write",
        );
      return native(...args);
    };
  }, fixture);
  const pending = await abilityRequest();
  await gm.page.waitForFunction(
    (id) => game.messages.get(id)?.content.includes("Injected continuation"),
    pending,
  );
  s = await snapshot();
  assert.equal(s.pending, pending);
  assert.equal(s.state.budgets[fixture.hero].remaining.maneuver, 0);
  assert.equal(s.benefits.length, 0);
  assert.match((await combatRequest("finish")).error, /pending action/);
  // Foundry 14.369's chat notification insertion dereferences its card after a
  // 100ms animation. Let native notification rendering settle before deleting
  // the source card; deleting during that animation triggers a core UI race.
  await Promise.all(
    [gm.page, player.page].map((page) => page.waitForTimeout(500)),
  );
  // The durable plan must remain resumable even if its original chat entry is deleted.
  await gm.page.evaluate(async (id) => game.messages.get(id).delete(), pending);
  await gm.page.reload();
  await gm.page.waitForFunction(() => game.ready);
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const { AuthorityPanel } = await import(
      "/systems/heroes-of-legend/applications/authority.mjs"
    );
    await new AuthorityPanel().render({ force: true });
  });
  await gm.page
    .locator(".hol-authority")
    .getByRole("button", { name: "Resume reserved action", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      !game.combats.get(f.combat).getFlag("heroes-of-legend", "pendingAbility"),
    fixture,
  );
  s = await snapshot();
  assert.equal(s.benefits.length, 1);
  assert.equal(s.effects.length, 2);
  assert.equal(s.state.budgets[fixture.hero].remaining.maneuver, 0);
  const recovered = await gm.page.evaluate(
    async ({ id, combat }) => {
      const { resolveAbilityRequest } = await import(
        "/systems/heroes-of-legend/services/abilities.mjs"
      );
      return resolveAbilityRequest(id, `Combat.${combat}`);
    },
    { id: pending, combat: fixture.combat },
  );
  assert(recovered.replay);
  assert.deepEqual(await snapshot(), s);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: owned ability UI, one Maneuver for initial use, nonstacking active-benefit reuse without further payment, intervening-turn preservation, next-own-turn expiry, reservation failure, blocked progression, deleted-chat recovery panel and replay without duplicate payment.",
  );
} catch (e) {
  console.error(
    await gm?.page.evaluate(() => ({
      notifications: document.querySelector("#notifications")?.innerText,
      messages: game.messages.contents.slice(-5).map((m) => m.content),
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
              `Combat.${f.combat}` ||
            m.getFlag("heroes-of-legend", "abilityRequest")?.combatUuid ===
              `Combat.${f.combat}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        for (const id of [f.actor, f.otherActor])
          await game.actors.get(id)?.delete();
        await game.users.get(f.user)?.delete();
      }, fixture)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
