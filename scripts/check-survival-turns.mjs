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
  assert.equal((await decide("start")).status, "complete");
  assert.equal(
    (await decide("choose", { id: fixture.participant })).status,
    "complete",
  );
  assert.equal((await state()).survival.due, 1);
  assert.match((await decide("finish")).error, /survival|choice|Dying/i);
  await page.evaluate(async (f) => {
    await game.actors.get(f.actor).sheet.render({ force: true });
  }, fixture);
  await page.locator(".hol-character [data-action=death]").click();
  await page.locator(".hol-roll-dialog [data-action=grit]").click();
  await page.waitForFunction(
    (f) => game.actors.get(f.actor).system.health.value === 12,
    fixture,
  );
  assert.equal((await state()).spent, 1);
  assert.equal((await state()).survival.wounds, 1);
  await page.evaluate(async (f) => {
    const a = game.actors.get(f.actor);
    const m = game.messages.find(
      (m) =>
        m.getFlag("heroes-of-legend", "survivalRequest")?.actorUuid === a.uuid,
    );
    const { resolveSurvivalRequest } = await import(
      "/systems/heroes-of-legend/services/survival.mjs"
    );
    await resolveSurvivalRequest(m.id);
  }, fixture);
  assert.equal((await state()).spent, 1);
  assert.equal((await decide("finish")).status, "complete");
  assert.equal(
    (await decide("choose", { id: fixture.participant })).status,
    "complete",
  );
  assert.equal((await state()).survival.ownTurn, 2);
  // An acknowledged Combat reservation with a known pre-write Actor failure.
  const resumed = await page.evaluate(async (f) => {
    const ID = "heroes-of-legend",
      a = game.actors.get(f.actor),
      c = game.combats.get(f.combat);
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const original = a.validate;
    let calls = 0;
    a.validate = function (...args) {
      if (++calls >= 2) throw Error("Known pre-write validation fixture");
      return original.apply(this, args);
    };
    const m = await requestCombat(c, "finish");
    let failure;
    try {
      await resolveCombatRequest(m.id);
    } catch (e) {
      failure = e.message;
    } finally {
      a.validate = original;
    }
    const pending = c.getFlag(ID, "pendingTurnPhase");
    const result = await resolveCombatRequest(m.id, c.uuid);
    return {
      failure,
      pending: Boolean(pending),
      status: result.status,
      own: a.getFlag(ID, "survival").ownTurn,
    };
  }, fixture);
  assert.match(resumed.failure, /Known pre-write/);
  assert.equal(resumed.pending, true);
  assert.equal(resumed.status, "complete");
  assert.equal(resumed.own, 2);
  // Restore the same current turn only for the following isolated roll fixtures.
  await page.evaluate(async (f) => {
    const c = game.combats.get(f.combat),
      state = c.getFlag("heroes-of-legend", "encounter");
    await c.update({
      "flags.heroes-of-legend.encounter": {
        ...state,
        current: f.participant,
        acted: [],
      },
    });
  }, fixture);

  const actualRoll = await page.evaluate(async (f) => {
    const ID = "heroes-of-legend",
      a = game.actors.get(f.actor);
    const { survivalState, startSurvivalTurn } = await import(
      "/systems/heroes-of-legend/rules/survival.mjs"
    );
    await a.update({
      "system.health.value": 0,
      [`flags.${ID}.survival`]: startSurvivalTurn(
        survivalState({
          hp: 0,
          maxHp: 12,
          wounds: 1,
          gritAvailable: a.system.grit.available,
          ownTurn: 1,
        }),
        2,
      ),
    });
    const { rollBasis } = await import(
      "/systems/heroes-of-legend/services/roll-preparation.mjs"
    );
    const { requestSurvival, resolveSurvivalRequest } = await import(
      "/systems/heroes-of-legend/services/survival.mjs"
    );
    const m = await requestSurvival(a, rollBasis(a, "fortitude", "death"), {});
    await resolveSurvivalRequest(m.id);
    const before = JSON.stringify(a.getFlag(ID, "survival"));
    await resolveSurvivalRequest(m.id);
    return {
      dice: m.rolls[0]?.dice[0]?.results.length,
      same: before === JSON.stringify(a.getFlag(ID, "survival")),
      pending: a.getFlag(ID, "pendingDeath"),
    };
  }, fixture);
  assert.equal(actualRoll.dice, 3);
  assert.equal(actualRoll.same, true);
  assert.equal(actualRoll.pending, null);

  // Reconstruct a reserved roll to verify recovery without manufacturing a network fault.
  await page.evaluate(async (f) => {
    const ID = "heroes-of-legend",
      a = game.actors.get(f.actor);
    const { survivalState, chooseSurvival, startSurvivalTurn } = await import(
      "/systems/heroes-of-legend/rules/survival.mjs"
    );
    const { rollBasis } = await import(
      "/systems/heroes-of-legend/services/roll-preparation.mjs"
    );
    const state = startSurvivalTurn(
      survivalState({
        hp: 0,
        maxHp: 12,
        wounds: 1,
        gritAvailable: a.system.grit.available,
        ownTurn: 1,
      }),
      2,
    );
    await a.update({
      "system.health.value": 0,
      [`flags.${ID}.survival`]: state,
    });
    const basis = rollBasis(a, "fortitude", "death"),
      choice = chooseSurvival(state, "roll");
    await a.update({
      [`flags.${ID}.survival`]: choice,
      [`flags.${ID}.pendingDeath`]: {
        requestId: "fixtureDeath",
        authorId: game.user.id,
        signature: "fixture",
        basis,
        choice,
      },
    });
    const { requestSurvival, resolveSurvivalRequest } = await import(
      "/systems/heroes-of-legend/services/survival.mjs"
    );
    const m = await requestSurvival(
      a,
      null,
      { reason: "", retained: [6, 6, 6] },
      "recover",
    );
    await resolveSurvivalRequest(m.id);
  }, fixture);
  assert.equal((await state()).hp, 1);
  assert.equal((await state()).spent, 1);
  await page.evaluate(async (f) => {
    const a = game.actors.get(f.actor);
    const { enterLastWords } = await import(
      "/systems/heroes-of-legend/rules/survival.mjs"
    );
    await a.update({
      "system.health.value": 0,
      "flags.heroes-of-legend.survival": enterLastWords(
        a.getFlag("heroes-of-legend", "survival"),
      ),
    });
  }, fixture);
  assert.equal((await decide("finish")).status, "complete");
  for (let i = 0; i < 2; i++) {
    assert.equal(
      (await decide("choose", { id: fixture.participant })).status,
      "complete",
    );
    assert.equal((await state()).survival.status, "lastWords");
    assert.equal((await decide("finish")).status, "complete");
    assert.equal(
      (await state()).survival.status,
      i === 0 ? "lastWords" : "dead",
    );
  }
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.ready);
  assert.equal((await state()).survival.ownTurn, 4);
  console.log(
    "PASS native survival turn start, due-choice finish guard, sheet/dialog Grit, HP and wounds, duplicate cost protection, next turn, reconstructed pending-roll recovery, Last Words deadline and reload.",
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
            m.getFlag("heroes-of-legend", "survivalRequest")?.actorUuid ===
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
