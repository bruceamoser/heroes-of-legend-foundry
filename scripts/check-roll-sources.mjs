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
let gm, player, f;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
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
async function open() {
  await player.page.evaluate(async (f) => {
    const { promptDefenseRoll } = await import(
      "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
    );
    await promptDefenseRoll(game.actors.get(f.actor), "agility");
  }, f);
  return player.page.locator(".hol-roll-dialog");
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const u = await User.create({
      name: `Defense roller ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const a = await Actor.create({
      name: "Another player's defender",
      type: "character",
    });
    const c = await Combat.create({
      active: true,
      flags: {
        "heroes-of-legend": {
          encounter: {
            budgets: { test: { turnId: "turn-1", remaining: { reaction: 1 } } },
          },
        },
      },
    });
    const effects = await a.createEmbeddedDocuments("ActiveEffect", [
      {
        name: "Poison",
        flags: {
          "heroes-of-legend": {
            condition: {
              key: "poisoned",
              rating: 2,
              persistence: "temporary",
              source: "Venom",
            },
          },
        },
      },
      {
        name: "Fear",
        flags: {
          "heroes-of-legend": {
            condition: {
              key: "frightened",
              rating: 2,
              persistence: "temporary",
              source: "Ogre",
            },
          },
        },
      },
      {
        name: "Defend",
        flags: {
          "heroes-of-legend": {
            benefit: {
              key: "defend",
              anchor: {
                combatId: c.id,
                participantId: "test",
                turnId: "turn-1",
              },
            },
          },
        },
      },
    ]);
    return {
      actor: a.id,
      user: u.id,
      name: u.name,
      combat: c.id,
      poison: effects.find((e) => e.name === "Poison").id,
    };
  });
  player = await join(f.name);
  assert.equal(
    await player.page.evaluate((f) => game.actors.get(f.actor).isOwner, f),
    false,
  );
  const original = await gm.page.evaluate(
    (f) => ({
      actor: game.actors.get(f.actor).toObject(),
      combat: game.combats.get(f.combat).toObject(),
    }),
    f,
  );
  let d = await open();
  await d.locator('[data-action="close"]').click();
  await d.waitFor({ state: "detached" });
  assert.deepEqual(
    await gm.page.evaluate(
      (f) => ({
        actor: game.actors.get(f.actor).toObject(),
        combat: game.combats.get(f.combat).toObject(),
      }),
      f,
    ),
    original,
  );
  d = await open();
  await player.page.waitForFunction(
    () =>
      document.querySelector('.hol-roll-dialog [data-action="roll"]')?.disabled,
  );
  assert.match(await d.locator("output").innerText(), /fear source/);
  await d.locator('[name="fear-0"]').selectOption("yes");
  assert.equal(await d.locator("output").innerText(), "6d6kl3 + (0)");
  await d.locator('[name="boons"]').fill("4");
  await d.locator('[name="boonsLabel"]').fill("DA-approved cover");
  assert.equal(await d.locator("output").innerText(), "4d6kh3 + (0)");
  assert.match(
    await d.locator(".hol-roll-sources").innerText(),
    /Defend maneuver/,
  );
  await gm.page.evaluate(async (f) => {
    await game.actors
      .get(f.actor)
      .update({ "system.attributes.agility.base": 2 });
    await game.actors
      .get(f.actor)
      .effects.get(f.poison)
      .update({ "flags.heroes-of-legend.condition.rating": 3 });
  }, f);
  await player.page.waitForFunction(
    (f) =>
      game.actors
        .get(f.actor)
        .effects.get(f.poison)
        .getFlag("heroes-of-legend", "condition").rating === 3,
    f,
  );
  await d.getByRole("button", { name: "Roll", exact: true }).click();
  await d.getByRole("alert").waitFor();
  assert.equal(await d.locator("output").innerText(), "3d6 + (2)");
  assert.equal(
    await d.locator('[name="boonsLabel"]').inputValue(),
    "DA-approved cover",
  );
  assert.equal(
    await player.page.evaluate(
      (f) =>
        game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "roll")?.actorUuid ===
            `Actor.${f.actor}`,
        ).length,
      f,
    ),
    0,
  );
  await d.screenshot({ path: "test-results/shared-roll.png" });
  await d.getByRole("button", { name: "Roll", exact: true }).click();
  await player.page.waitForFunction(
    (f) =>
      game.messages.some(
        (m) =>
          m.getFlag("heroes-of-legend", "roll")?.actorUuid ===
          `Actor.${f.actor}`,
      ),
    f,
  );
  const saved = await player.page.evaluate((f) => {
    const m = game.messages.find(
      (m) =>
        m.getFlag("heroes-of-legend", "roll")?.actorUuid === `Actor.${f.actor}`,
    );
    return {
      id: m.id,
      roll: m.getFlag("heroes-of-legend", "roll"),
      author: m.author.id,
    };
  }, f);
  assert.equal(saved.roll.mode, "defense");
  assert.equal(saved.roll.rollerId, f.user);
  assert.equal(saved.author, f.user);
  assert.equal(saved.roll.boons, 5);
  assert.equal(saved.roll.banes, 5);
  assert.equal(saved.roll.attribute, 2);
  assert.equal(saved.roll.sources.length, 4);
  assert.equal(saved.roll.perception.Ogre, "yes");
  await player.page.reload();
  await player.page.waitForFunction(() => game.ready);
  assert.deepEqual(
    await player.page.evaluate(
      (id) => game.messages.get(id).getFlag("heroes-of-legend", "roll"),
      saved.id,
    ),
    saved.roll,
  );
  assert.deepEqual(
    await gm.page.evaluate((f) => game.combats.get(f.combat).toObject(), f),
    original.combat,
  );
  assert.equal(
    await gm.page.evaluate((f) => game.actors.get(f.actor).effects.size, f),
    3,
  );
  // Expired benefits are removed from the next preview, without a second payment.
  await gm.page.evaluate(
    async (f) =>
      game.combats.get(f.combat).update({
        "flags.heroes-of-legend.encounter.budgets.test.turnId": "turn-2",
      }),
    f,
  );
  await player.page.waitForFunction(
    (f) =>
      game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter")
        .budgets.test.turnId === "turn-2",
    f,
  );
  d = await open();
  await d.locator('[name="fear-0"]').selectOption("no");
  assert.equal(await d.locator("output").innerText(), "6d6kl3 + (2)");
  assert.doesNotMatch(
    await d.locator(".hol-roll-sources").innerText(),
    /Defend maneuver|fear source/,
  );
  await d.locator('[data-action="close"]').click();
  await d.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: non-owner defense, explicit fear perception, automatic poison/Defend sources, labeled adjustment, changed-state review, exact source/roller persistence, no Reaction or Actor mutation, expiry and cancellation.",
  );
} finally {
  await player?.context.close();
  if (gm && f)
    await gm.page
      .evaluate(async (f) => {
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "roll")?.actorUuid ===
            `Actor.${f.actor}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
