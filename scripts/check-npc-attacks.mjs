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
let gm, player, f, attackId;
async function join(name, canvas = false) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript((canvas) => {
    localStorage.setItem("core.noCanvas", String(!canvas));
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  }, canvas);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}
async function cardClick() {
  await player.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await player.page
    .locator(`[data-message-id="${attackId}"] .hol-defend-button`)
    .filter({ visible: true })
    .first()
    .click();
}
try {
  gm = await join("Gamemaster", true);
  f = await gm.page.evaluate(async () => {
    const user = await User.create({
      name: `Attack responder ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const npc = await Actor.create({
      name: "Melee attacker",
      type: "creature",
      system: { threat: { banes: 2 } },
    });
    const heroes = [];
    for (let i = 0; i < 3; i++)
      heroes.push(
        await Actor.create({
          name: `Defender ${i + 1}`,
          type: "character",
          system: { attributes: { agility: { base: i - 1 } } },
        }),
      );
    const scene = await Scene.create({
      name: "Attack target snapshot test",
      width: 1000,
      height: 1000,
    });
    const createdTokens = await scene.createEmbeddedDocuments(
      "Token",
      heroes.map((a, i) => ({
        name: a.name,
        actorId: a.id,
        actorLink: false,
        x: i * 100,
        y: 100,
      })),
    );
    const tokens = heroes.map((a) =>
      createdTokens.find((t) => t.actorId === a.id),
    );
    await scene.view();
    for (const token of tokens.slice(0, 2))
      canvas.tokens.get(token.id).setTarget(true, { releaseOthers: false });
    const combat = await Combat.create({ active: true });
    const [participant] = await combat.createEmbeddedDocuments("Combatant", [
      {
        actorId: npc.id,
        name: npc.name,
        flags: { "heroes-of-legend": { side: "opposition" } },
      },
    ]);
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    await resolveCombatRequest((await requestCombat(combat, "start")).id);
    await resolveCombatRequest(
      (await requestCombat(combat, "choose", { id: participant.id })).id,
    );
    await npc.sheet.render({ force: true });
    return {
      user: user.id,
      name: user.name,
      npc: npc.id,
      heroes: heroes.map((a) => a.id),
      tokens: tokens.map((t) => t.uuid),
      scene: scene.id,
      combat: combat.id,
      participant: participant.id,
    };
  });
  await gm.page.locator("[data-npc-blockable]").selectOption("true");
  await gm.page
    .locator(".hol-creature")
    .getByRole("button", { name: "Declare NPC Basic Melee", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      game.messages.some(
        (m) =>
          m.getFlag("heroes-of-legend", "attackCard")?.actorUuid ===
          `Actor.${f.npc}`,
      ),
    f,
  );
  attackId = await gm.page.evaluate(
    (f) =>
      game.messages.find(
        (m) =>
          m.getFlag("heroes-of-legend", "attackCard")?.actorUuid ===
          `Actor.${f.npc}`,
      ).id,
    f,
  );
  const declared = await gm.page.evaluate(
    async ({ f, id }) => {
      for (const t of [...game.user.targets]) t.setTarget(false);
      const { resolveNpcAttack } = await import(
        "/systems/heroes-of-legend/services/npc-attacks.mjs"
      );
      const replay = await resolveNpcAttack(id);
      return {
        attack: game.messages.get(id).getFlag("heroes-of-legend", "attackCard"),
        budget: game.combats
          .get(f.combat)
          .getFlag("heroes-of-legend", "encounter").budgets[f.participant],
        replay,
      };
    },
    { f, id: attackId },
  );
  assert.deepEqual(declared.attack.suggestedDefenderTokenUuids, [
    ...f.tokens.slice(0, 2),
  ]);
  assert.equal(declared.attack.blockable, true);
  assert.equal(declared.budget.remaining.main, 0);
  assert(declared.replay.replay);
  player = await join(f.name);
  const forged = await player.page.evaluate(
    async (id) =>
      (
        await ChatMessage.create({
          content: "Forged NPC declaration test",
          flags: {
            "heroes-of-legend": {
              npcAttackRequest: game.messages
                .get(id)
                .getFlag("heroes-of-legend", "npcAttackRequest"),
            },
          },
        })
      ).id,
    attackId,
  );
  await gm.page.waitForFunction(
    (id) =>
      game.messages.get(id)?.content.includes("Invalid DA attack declaration"),
    forged,
  );
  await cardClick();
  const chooser = player.page.locator(".hol-defender-choice");
  await chooser.locator('[name="defenderUuid"]').selectOption(f.tokens[1]);
  await chooser
    .getByRole("button", { name: "Prepare defense", exact: true })
    .click();
  let dialog = player.page.locator(".hol-roll-dialog");
  assert.equal(await dialog.locator("output").innerText(), "5d6kl3 + (0)");
  await dialog.screenshot({ path: "test-results/incoming-defense.png" });
  assert.match(
    await dialog.locator(".hol-roll-sources").innerText(),
    /Incoming Threat/,
  );
  assert.equal(
    await player.page.evaluate(
      (uuid) => fromUuidSync(uuid).actor.isOwner,
      f.tokens[1],
    ),
    false,
  );
  await dialog
    .getByRole("button", { name: "Change defender", exact: true })
    .click();
  await player.page
    .locator(".hol-defender-choice [name=additionalUuid]")
    .fill(f.tokens[2]);
  await player.page
    .locator(".hol-defender-choice")
    .getByRole("button", { name: "Prepare defense", exact: true })
    .click();
  dialog = player.page.locator(".hol-roll-dialog");
  assert.equal(await dialog.locator("output").innerText(), "5d6kl3 + (1)");
  await dialog.locator('[name="boons"]').fill("1");
  await dialog.locator('[name="boonsLabel"]').fill("DA-approved footing");
  await dialog.getByRole("button", { name: "Roll", exact: true }).click();
  await player.page.waitForFunction(
    (id) =>
      game.messages.some(
        (m) => m.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
      ),
    attackId,
  );
  const roll = await player.page.evaluate(
    (id) =>
      game.messages
        .find(
          (m) => m.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
        )
        .getFlag("heroes-of-legend", "roll"),
    attackId,
  );
  assert.equal(roll.actorUuid, `${f.tokens[2]}.Actor.${f.heroes[2]}`);
  assert.equal(roll.rollerId, f.user);
  assert.equal(roll.defenderTokenUuid, f.tokens[2]);
  assert.equal(roll.boons, 1);
  assert.equal(roll.banes, 2);
  assert.equal(roll.attackOutcome.damage, declared.attack.damage[roll.tier]);
  assert.equal(roll.attackOutcome.applied, false);
  await gm.page.evaluate(async (f) => {
    const s = game.scenes.get(f.scene);
    await s.deleteEmbeddedDocuments(
      "Token",
      f.tokens.slice(0, 2).map((uuid) => uuid.split(".").at(-1)),
    );
  }, f);
  await player.page.reload();
  await player.page.waitForFunction(() => globalThis.game?.ready);
  await cardClick();
  await player.page
    .locator(".hol-defender-choice")
    .getByText("2 suggested target(s) are unavailable.", { exact: false })
    .waitFor();
  await player.page
    .locator(".hol-defender-choice [name=additionalUuid]")
    .fill(`Actor.${f.heroes[0]}`);
  await player.page
    .locator(".hol-defender-choice")
    .getByRole("button", { name: "Prepare defense", exact: true })
    .click();
  await player.page.locator(".hol-roll-dialog [data-action=close]").click();
  const final = await gm.page.evaluate(
    (f) => ({
      main: game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter")
        .budgets[f.participant].remaining.main,
      hp: f.heroes.map((id) => game.actors.get(id).system.health.value),
    }),
    f,
  );
  assert.equal(final.main, 0);
  assert.deepEqual(final.hp, [12, 12, 12]);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native GM multi-target snapshot, once-only Main declaration/replay, public reusable Defend, non-owner suggested and additional defenders, change-defender correction, printed Threat and profile outcome, deleted suggestions after reload, no automatic damage.",
  );
} finally {
  await player?.context.close();
  if (gm && f)
    await gm.page
      .evaluate(
        async ({ f, attackId }) => {
          const { releaseAuthority } = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          );
          await releaseAuthority();
          for (const m of game.messages.filter(
            (m) =>
              m.id === attackId ||
              m.getFlag("heroes-of-legend", "npcAttackRequest")?.combatUuid ===
                `Combat.${f.combat}` ||
              m.getFlag("heroes-of-legend", "roll")?.attackMessageId ===
                attackId ||
              m.getFlag("heroes-of-legend", "combatRequest")?.combatUuid ===
                `Combat.${f.combat}`,
          ))
            await m.delete();
          await game.combats.get(f.combat)?.delete();
          await game.scenes.get(f.scene)?.delete();
          for (const id of [f.npc, ...f.heroes])
            await game.actors.get(id)?.delete();
          await game.users.get(f.user)?.delete();
        },
        { f, attackId },
      )
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
