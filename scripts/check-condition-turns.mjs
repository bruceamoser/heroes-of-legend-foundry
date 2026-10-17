import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw Error("Use a disposable local world.");
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
let fixture;
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  fixture = await page.evaluate(async () => {
    const ID = "heroes-of-legend";
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority({ restartConfirmed: true });
    const { survivalState } = await import(
      "/systems/heroes-of-legend/rules/survival.mjs"
    );
    const actor = await Actor.create({
      name: "Survival test",
      type: "character",
      system: { health: { value: 0, baseMax: 12 } },
      flags: {
        [ID]: {
          survival: survivalState({
            hp: 0,
            maxHp: 12,
            wounds: 1,
            gritAvailable: 2,
          }),
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    const combat = await Combat.create({ active: true });
    const [c] = await combat.createEmbeddedDocuments("Combatant", [
      { actorId: actor.id, flags: { [ID]: { side: "players" } } },
    ]);
    return { actor: actor.id, combat: combat.id, participant: c.id };
  });
  async function decide(kind, payload = {}) {
    return page.evaluate(
      async ({ fixture, kind, payload }) => {
        const m = await import("/systems/heroes-of-legend/services/combat.mjs");
        const request = await m.requestCombat(
          game.combats.get(fixture.combat),
          kind,
          payload,
        );
        try {
          return {
            id: request.id,
            ...(await m.resolveCombatRequest(request.id)),
          };
        } catch (e) {
          return { error: e.message };
        }
      },
      { fixture, kind, payload },
    );
  }
  async function state() {
    return page.evaluate((f) => {
      const a = game.actors.get(f.actor);
      return {
        survival: a.getFlag("heroes-of-legend", "survival"),
        hp: a.system.health.value,
        spent: a.system.grit.spent,
      };
    }, fixture);
  }
  await page.evaluate(async (f) => {
    const a = game.actors.get(f.actor);
    await a.update({
      "system.health.value": 12,
      "flags.heroes-of-legend.survival": {
        ...a.getFlag("heroes-of-legend", "survival"),
        hp: 12,
        status: "active",
      },
    });
    const { requestCondition, resolveConditionRequest } = await import(
      "/systems/heroes-of-legend/services/conditions.mjs"
    );
    for (const [key, rating, persistence] of [
      ["burning", 2, "temporary"],
      ["burning", 1, "starred"],
      ["poisoned", 2, "temporary"],
    ]) {
      const m = await requestCondition(a, "add", {
        key,
        rating,
        persistence,
        source: "Condition turn fixture",
      });
      await resolveConditionRequest(m.id);
    }
  }, fixture);
  assert.equal((await decide("start")).status, "complete");
  assert.equal(
    (await decide("choose", { id: fixture.participant })).status,
    "complete",
  );
  assert.match((await decide("finish")).error, /review condition/);
  await page.evaluate(async (f) => {
    const { finishCombatParticipant } = await import(
      "/systems/heroes-of-legend/dialogs/turn-end.mjs"
    );
    void finishCombatParticipant(game.combats.get(f.combat));
  }, fixture);
  await page.locator("[name=fireResistance]").fill("2");
  await page.locator("[name=reason]").fill("Fixture fire resistance");
  await page
    .getByRole("button", { name: "Apply effects and finish", exact: true })
    .click();
  await page.waitForFunction(
    (f) => game.actors.get(f.actor).system.health.value === 11,
    fixture,
  );
  assert.equal((await state()).hp, 11);
  const sources = await page.evaluate(async (f) => {
    const { actorContributions } = await import(
      "/systems/heroes-of-legend/services/conditions.mjs"
    );
    return actorContributions(game.actors.get(f.actor));
  }, fixture);
  assert.deepEqual(
    sources.filter((c) => c.key === "burning").map((c) => c.rating),
    [1, 1],
  );
  assert.equal(sources.find((c) => c.key === "poisoned").rating, 1);
  assert.equal(
    (await decide("choose", { id: fixture.participant })).status,
    "complete",
  );
  const second = await decide("finish");
  assert.equal(second.status, "complete");
  assert.equal((await state()).hp, 10);
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.ready);
  assert.equal((await state()).hp, 10);
  console.log(
    "PASS native condition tick defense ruling, typed damage, aggregate temporary decay, starred preservation, next turn and reload.",
  );
} finally {
  if (fixture)
    await page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await (
          await import("/systems/heroes-of-legend/services/authority.mjs")
        ).bindCreationAuthority();
        await releaseAuthority();
        await new Promise((r) => setTimeout(r, 500));
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "conditionRequest")?.actorUuid ===
              `Actor.${f.actor}` ||
            m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
              `Combat.${f.combat}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        await game.actors.get(f.actor)?.delete();
      }, fixture)
      .catch(console.error);
  await browser.close();
}
