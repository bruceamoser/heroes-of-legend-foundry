import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL,
  ID = "heroes-of-legend",
  output = "test-results/combat-damage";
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1" ||
  process.env.HOL_TEST_ISOLATED_WORLD !== "1"
)
  throw Error("Use an explicitly authorized isolated local world.");
await mkdir(output, { recursive: true });
const browser = await chromium.launch(),
  errors = [],
  evidence = { checks: [] };
let gm, player, fixture;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1050 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url + "/join");
  await selectTestUser(page, name);
  await page.locator('button[name="join"]').click();
  await page.waitForFunction(() => globalThis.game?.ready, null, {
    timeout: 60000,
  });
  await page.evaluate(() => {
    foundry.nue.Tour.activeTour?.exit();
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await page.addStyleTag({ content: "#notifications {pointer-events:none}" });
  return page;
}
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const ID = "heroes-of-legend",
      f = (globalThis.__holCombatDamage247 = {
        actors: [],
        users: [],
        scenes: [],
        beforeMessages: game.messages.contents.map((m) => m.id),
        previousScene: game.scenes.active?.id ?? null,
      });
    const owner = await User.create({
      name: `Combat damage owner ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    f.users.push(owner.id);
    f.ownerName = owner.name;
    const hero = await Actor.create({
      name: "Combat damage hero",
      type: "character",
      system: { health: { value: 20, baseMax: 20 } },
      ownership: { [owner.id]: 3 },
      flags: {
        [ID]: {
          development: {
            level: 1,
            dp: 0,
            creationSummary: { speedBase: 6, capacity: 10 },
            creation: {},
          },
        },
      },
    });
    f.actors.push(hero.id);
    f.hero = hero.id;
    await owner.update({ character: hero.id });
    const abilities = await game.packs.get(`${ID}.abilities`).getDocuments();
    for (const id of [
      "ability-basic-melee",
      "ability-invitation-to-the-blade",
      "ability-let-the-spark-decide",
      "ability-a-splendid-mistake",
    ]) {
      const source = abilities.find((i) => i.getFlag(ID, "catalogId") === id);
      assertSource(source, id);
      const data = source.toObject();
      delete data._id;
      const [item] = await hero.createEmbeddedDocuments("Item", [data]);
      f[id] = item.id;
    }
    function assertSource(source, id) {
      if (!source) throw Error(`Missing ${id}`);
    }
    f.customs = [];
    for (const type of [
      "physical",
      "fire",
      "cold",
      "lightning",
      "mental",
      "radiant",
      "life",
    ]) {
      const [custom] = await hero.createEmbeddedDocuments("Item", [
        {
          name: `Fixed ${type} damage and condition`,
          type: "ability",
          system: {
            activity: {
              action: "main",
              rollMode: "attribute",
              attribute: "brawn",
            },
            outcomes: Object.fromEntries(
              ["weak", "standard", "strong"].map((tier) => [
                tier,
                `3 ${type} damage + Slowed 1`,
              ]),
            ),
          },
        },
      ]);
      f.customs.push(custom.id);
    }
    await hero.createEmbeddedDocuments("Item", [
      {
        name: "Combat weapon",
        type: "equipment",
        system: {
          catalogId: "item-ordinary-melee-weapon",
          quantity: 1,
          held: true,
          hands: 1,
          bulk: 1,
        },
      },
    ]);
    const creatures = await game.packs.get(`${ID}.creatures`).getDocuments();
    f.targets = [];
    for (const id of ["creature-basilisk", "creature-bone-sentry"]) {
      const source = creatures.find((a) => a.getFlag(ID, "catalogId") === id);
      assertSource(source, id);
      const data = source.toObject();
      delete data._id;
      data.name = `Combat regression ${source.name}`;
      const actor = await Actor.create(data);
      f.actors.push(actor.id);
      f.targets.push(actor.id);
    }
    const scene = await Scene.create({
      name: "Combat regression 247",
      width: 1400,
      height: 900,
      padding: 0,
      grid: { type: 1, size: 100 },
      tokens: [
        { name: hero.name, actorId: hero.id, actorLink: true, x: 100, y: 100 },
        ...f.targets.map((actorId, i) => ({
          name: game.actors.get(actorId).name,
          actorId,
          actorLink: true,
          x: 300 + i * 200,
          y: 100,
        })),
      ],
    });
    f.scenes.push(scene.id);
    f.scene = scene.id;
    await scene.activate();
    await scene.view();
    return f;
  });
  await gm.waitForFunction(
    (f) => canvas.ready && canvas.scene?.id === f.scene,
    fixture,
    { timeout: 60000 },
  );
  player = await join(fixture.ownerName);
  await player.waitForFunction(
    (f) => canvas.ready && canvas.scene?.id === f.scene,
    fixture,
    { timeout: 60000 },
  );
  await player.evaluate(
    (f) => game.actors.get(f.hero).sheet.render({ force: true }),
    fixture,
  );
  for (const target of fixture.targets) {
    await gm.evaluate(
      (id) =>
        canvas.tokens.placeables
          .find((t) => t.actor.id === id)
          .control({ releaseOthers: true }),
      target,
    );
    for (const ability of [
      "ability-basic-melee",
      "ability-invitation-to-the-blade",
      "ability-let-the-spark-decide",
      "ability-a-splendid-mistake",
      ...fixture.customs,
    ]) {
      await gm.evaluate(async (id) => {
        const actor = game.actors.get(id);
        await actor.update({ "system.health.value": actor.system.health.max });
      }, target);
      const item = fixture[ability] ?? ability;
      let message, snapshot;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (!fixture.customs.includes(ability))
          await player
            .locator(
              `.hol-character [data-item-id="${item}"] [data-action="useItem"]`,
            )
            .first()
            .click();
        else
          await player.evaluate(
            async ({ hero, item }) =>
              (
                await import("/systems/heroes-of-legend/services/abilities.mjs")
              ).activateOwnedAbility(game.actors.get(hero).items.get(item)),
            { hero: fixture.hero, item },
          );
        await player.locator('.hol-roll-dialog [data-action="roll"]').waitFor();
        if (
          await player.locator('.hol-roll-dialog [name="damageType"]').count()
        ) {
          const options = await player
            .locator('.hol-roll-dialog [name="damageType"] option')
            .evaluateAll((nodes) => nodes.map((n) => n.value));
          await player
            .locator('.hol-roll-dialog [name="damageType"]')
            .selectOption(options.at(-1));
        }
        await player.locator('.hol-roll-dialog [data-action="roll"]').click();
        await player.locator(".hol-roll-dialog").waitFor({ state: "detached" });
        ({ message, snapshot } = await player.evaluate(() => {
          const message = game.messages.contents
            .filter((m) => m.getFlag("heroes-of-legend", "roll"))
            .at(-1);
          return {
            message: message.id,
            snapshot: message.getFlag("heroes-of-legend", "roll"),
          };
        }));
        if (
          ability !== "ability-invitation-to-the-blade" ||
          snapshot.tier !== "weak"
        )
          break;
      }
      assert(snapshot);
      if (ability === "ability-invitation-to-the-blade")
        assert.notEqual(snapshot.tier, "weak");
      await gm
        .locator(`#chat [data-message-id="${message}"] .hol-apply-damage`)
        .waitFor();
      const expected = await gm.evaluate(
        async ({ target, snapshot }) => {
          const { resolvedAttackEffects } = await import(
            "/systems/heroes-of-legend/rules/attack-outcomes.mjs"
          );
          const { damageBasis, damagePreview } = await import(
            "/systems/heroes-of-legend/services/damage.mjs"
          );
          const actor = game.actors.get(target),
            effects = resolvedAttackEffects(
              snapshot.ability.outcomes[snapshot.tier],
              { damageType: snapshot.damageType },
            );
          return {
            hp: damagePreview(actor, damageBasis(actor), {
              components: effects.components,
            }).after,
            effects,
          };
        },
        { target, snapshot },
      );
      await gm
        .locator(`#chat [data-message-id="${message}"] .hol-apply-damage`)
        .click();
      await gm.waitForFunction(
        ({ target, hp, condition }) =>
          game.actors.get(target).system.health.value === hp &&
          (!condition || game.actors.get(target).statuses.has("hol.slowed")),
        {
          target,
          hp: expected.hp,
          condition: fixture.customs.includes(ability),
        },
      );
      assert.equal(
        await gm.locator(".hol-native-dialog,.hol-damage").count(),
        0,
        "Resolved roll damage applies without an extra dialog",
      );
      assert.match(
        await gm
          .locator(
            `#chat [data-message-id="${message}"] .hol-chat-damage-amount`,
          )
          .innerText(),
        /Damage: [23456]/,
      );
      await gm
        .locator(
          `#chat [data-message-id="${message}"] .hol-chat-applied-status`,
        )
        .filter({ hasText: "Applied:" })
        .waitFor();
      evidence.checks.push({
        ability,
        target,
        tier: snapshot.tier,
        expectedHp: expected.hp,
        conditions: expected.effects.conditions,
      });
      if (ability === "ability-invitation-to-the-blade")
        await gm
          .locator(`#chat [data-message-id="${message}"]`)
          .screenshot({ path: `${output}/${target}-invitation.png` });
    }
  }
  assert.deepEqual(errors, []);
  evidence.foundry = await gm.evaluate(() => game.version);
} finally {
  if (player) await player.context().close();
  try {
    if (gm)
      evidence.cleanup = await gm.evaluate(async () => {
        const f = globalThis.__holCombatDamage247;
        if (!f) return { complete: true };
        if (f.previousScene && game.scenes.has(f.previousScene))
          await game.scenes.get(f.previousScene).activate();
        const messages = game.messages.filter(
          (m) => !f.beforeMessages.includes(m.id),
        );
        if (messages.length)
          await ChatMessage.deleteDocuments(messages.map((m) => m.id));
        for (const [type, ids] of [
          [Scene, f.scenes],
          [Actor, f.actors],
          [User, f.users],
        ])
          if (ids.length) await type.deleteDocuments(ids);
        return {
          complete:
            !f.actors.some((id) => game.actors.has(id)) &&
            !f.users.some((id) => game.users.has(id)) &&
            !f.scenes.some((id) => game.scenes.has(id)),
        };
      });
  } catch (error) {
    evidence.cleanupError = error.message;
    process.exitCode = 1;
  }
  await writeFile(
    `${output}/evidence.json`,
    JSON.stringify({ ...evidence, errors }, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  "Native Basic Melee / Invitation / condition damage against Basilisk and Skeleton Sentry passed without extra dialogs.",
);
