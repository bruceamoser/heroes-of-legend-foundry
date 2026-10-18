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
async function request(actor, draft, rollMessageId = null) {
  return gm.page.evaluate(
    async ({ actor, draft, rollMessageId }) => {
      const s = await import("/systems/heroes-of-legend/services/damage.mjs"),
        a = await fromUuid(actor);
      return (await s.requestDamage(a, s.damageBasis(a), draft, rollMessageId))
        .id;
    },
    { actor, draft, rollMessageId },
  );
}
async function done(actor, id) {
  await gm.page.waitForFunction(
    ({ actor, id }) =>
      fromUuidSync(actor)?.getFlag("heroes-of-legend", "operationReceipts")?.[
        id
      ]?.applied,
    { actor, id },
  );
}
const hit = (amount) => ({
  components: [{ type: "physical", amount }],
  reason: "Fixture hit",
});
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `Damage ${foundry.utils.randomID(4)}`,
      role: 1,
    });
    const hero = await Actor.create({
      name: "Survival test",
      type: "character",
      system: { health: { value: 3, baseMax: 12 } },
      ownership: { [user.id]: 3 },
    });
    const creature = await Actor.create({
      name: "DR test",
      type: "creature",
      system: { armor: 2 },
    });
    const scene = await Scene.create({
      name: "Damage isolation test",
      width: 1000,
      height: 1000,
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      { name: creature.name, actorId: creature.id, actorLink: false },
    ]);
    return {
      hero: hero.uuid,
      creature: creature.uuid,
      tokenActor: token.actor.uuid,
      scene: scene.id,
      user: user.id,
      name: user.name,
    };
  });
  const mixed = {
    components: [
      { type: "physical", amount: 4 },
      { type: "fire", amount: 1 },
    ],
    resistances: [
      { type: "physical", value: 1, label: "Lesser armor" },
      { type: "fire", value: 1, label: "Fire ward" },
    ],
    weaknesses: [{ type: "fire", value: 2, label: "Fire weakness" }],
    reason: "Mixed fixture",
  };
  const mix = await request(f.tokenActor, mixed);
  await done(f.tokenActor, mix);
  assert.deepEqual(
    await gm.page.evaluate(
      (f) => ({
        token: fromUuidSync(f.tokenActor).system.health.value,
        base: fromUuidSync(f.creature).system.health.value,
      }),
      f,
    ),
    { token: 8, base: 12 },
  );
  await gm.page.evaluate(async (f) => {
    await fromUuidSync(f.hero).sheet.render({ force: true });
  }, f);
  await gm.page.locator(".hol-character [data-action=damage]").click();
  const panel = gm.page.locator(".hol-damage");
  await panel.locator("[data-damage-type=physical] [name=amount]").fill("4");
  assert.equal(await panel.locator("[name=reason]").inputValue(), "");
  assert.match(await panel.locator("[data-preview]").innerText(), /New wound/);
  await panel.screenshot({ path: "test-results/damage-preview.png" });
  await panel.locator("[data-action=apply]").click();
  await gm.page.waitForFunction(
    (f) =>
      fromUuidSync(f.hero).getFlag("heroes-of-legend", "survival")?.status ===
      "dying",
    f,
  );
  let state = await gm.page.evaluate(
    (f) => fromUuidSync(f.hero).getFlag("heroes-of-legend", "survival"),
    f,
  );
  assert.equal(state.wounds, 1);
  assert.equal(state.marks, 0);
  const repeat = await gm.page.evaluate(async (f) => {
    const a = fromUuidSync(f.hero),
      id = game.messages.find(
        (m) =>
          m.getFlag("heroes-of-legend", "damageRequest")?.actorUuid === a.uuid,
      ).id;
    const { resolveDamageRequest } = await import(
      "/systems/heroes-of-legend/services/damage.mjs"
    );
    return resolveDamageRequest(id);
  }, f);
  assert.equal(repeat.replay, true);
  for (let i = 1; i <= 3; i++) {
    const id = await request(f.hero, hit(10));
    await done(f.hero, id);
  }
  state = await gm.page.evaluate(
    (f) => fromUuidSync(f.hero).getFlag("heroes-of-legend", "survival"),
    f,
  );
  assert.equal(state.status, "lastWords");
  assert.equal(state.wounds, 1);
  assert.equal(state.marks, 3);
  const stale = await gm.page.evaluate(async (f) => {
    const s = await import("/systems/heroes-of-legend/services/damage.mjs"),
      a = fromUuidSync(f.creature),
      basis = s.damageBasis(a);
    await a.update({ "system.armor": 3 });
    return (
      await s.requestDamage(a, basis, {
        components: [{ type: "physical", amount: 5 }],
        reason: "Stale armor",
      })
    ).id;
  }, f);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("defenses changed"),
    stale,
  );
  player = await join(f.name);
  const denied = await player.page.evaluate(async (f) => {
    const s = await import("/systems/heroes-of-legend/services/damage.mjs"),
      a = fromUuidSync(f.hero);
    return (
      await s.requestDamage(a, s.damageBasis(a), {
        components: [{ type: "physical", amount: 1 }],
        reason: "Forged DA adjustment",
      })
    ).id;
  }, f);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("DA must authorize"),
    denied,
  );
  // Reconstruct a settled defense result to test event deduplication separately from the defense pipeline suite.
  const rollId = await gm.page.evaluate(async (f) => {
    const ID = "heroes-of-legend",
      attack = await ChatMessage.create({
        content: "Damage fixture attack",
        flags: {
          [ID]: { attackCard: { damage: { weak: 5, standard: 3, strong: 2 } } },
        },
      });
    const roll = await new foundry.dice.Roll("3d6").evaluate({
      allowInteractive: false,
    });
    const retained = roll.dice[0].results
      .filter((r) => r.active)
      .map((r) => r.result);
    const { classifyRoll } = await import(
      "/systems/heroes-of-legend/rules/roll.mjs"
    );
    const tier = classifyRoll(retained, 0).tier;
    const damage = { weak: 5, standard: 3, strong: 2 }[tier];
    const defense = await ChatMessage.create({
      content: "Damage fixture defense",
      rolls: [roll],
      flags: {
        [ID]: {
          defenseRequest: { actorUuid: f.creature },
          roll: {
            actorUuid: f.creature,
            attackMessageId: attack.id,
            tier,
            attribute: 0,
            retained,
            attackOutcome: { damage, type: "physical" },
          },
        },
      },
    });
    await attack.setFlag(ID, "defenseResponses", [
      { requestId: defense.id, actorUuid: f.creature, status: "resolved" },
    ]);
    return {
      defense: defense.id,
      attack: attack.id,
      expectedHp: 12 - Math.max(1, damage - 3),
    };
  }, f);
  f.roll = rollId;
  const first = await request(
    f.creature,
    { components: [], reason: "Defense" },
    rollId.defense,
  );
  await done(f.creature, first);
  const second = await request(
    f.creature,
    { components: [], reason: "Defense" },
    rollId.defense,
  );
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("already applied"),
    second,
  );
  assert.equal(
    await gm.page.evaluate(
      (f) => fromUuidSync(f.creature).system.health.value,
      f,
    ),
    rollId.expectedHp,
  );
  await gm.page.reload();
  await gm.page.waitForFunction(() => globalThis.game?.ready);
  assert.deepEqual(
    await gm.page.evaluate(
      (f) => ({
        status: fromUuidSync(f.hero).getFlag("heroes-of-legend", "survival")
          .status,
        wounds: Object.keys(
          fromUuidSync(f.hero).getFlag("heroes-of-legend", "pendingWounds"),
        ).length,
        hp: fromUuidSync(f.creature).system.health.value,
      }),
      f,
    ),
    { status: "lastWords", wounds: 1, hp: rollId.expectedHp },
  );
  console.log(
    "PASS native mixed damage, printed DR once, token isolation, Dying/wound/marks, replay, stale defense, actual DA author, settled-defense deduplication and reload.",
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
            [f.hero, f.creature, f.tokenActor].includes(
              m.getFlag("heroes-of-legend", "damageRequest")?.actorUuid,
            ) || [f.roll?.attack, f.roll?.defense].includes(m.id),
        ))
          await m.delete();
        await game.scenes.get(f.scene)?.delete();
        for (const uuid of [f.hero, f.creature])
          await fromUuidSync(uuid)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch(console.error);
  await browser.close();
}
