import { selectTestUser } from "./helpers/login.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const url = process.env.HOL_TEST_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Set HOL_TEST_URL to the isolated local Foundry server.");
if (process.env.HOL_TEST_ALLOW_WRITES !== "1")
  throw new Error("Set HOL_TEST_ALLOW_WRITES=1 for the fixture world.");

const browser = await chromium.launch(),
  errors = [];

async function join(user, { canvas = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  context.setDefaultTimeout(30000);
  await context.addInitScript((canvas) => {
    localStorage.setItem("core.noCanvas", String(!canvas));
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  }, canvas);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, user);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  await page.evaluate(() => foundry.nue.Tour.activeTour?.exit());
  await page.evaluate(() => {
    globalThis.__holNotices = [];
    const warn = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (message, ...args) => {
      globalThis.__holNotices.push(String(message));
      return warn(message, ...args);
    };
  });
  return page;
}

async function itemSheetOpened(page, uuid) {
  return page.waitForFunction(
    (documentUuid) =>
      [...foundry.applications.instances.values()].some(
        (app) =>
          app.rendered &&
          app.document?.documentName === "Item" &&
          app.document.uuid === documentUuid,
      ),
    uuid,
  );
}

async function closeItemSheets(page, uuids) {
  await page.evaluate(async (documentUuids) => {
    for (const app of foundry.applications.instances.values()) {
      if (
        app.document?.documentName === "Item" &&
        documentUuids.includes(app.document.uuid) &&
        app.rendered
      )
        await app.close();
    }
  }, uuids);
}

let gm, player;
let fixture;
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const player = await User.create({
      name: `HOL Shortcut ${foundry.utils.randomID(6)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actor = await Actor.create({
      name: "Shortcut Hero",
      type: "character",
      ownership: {
        [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      },
    });
    const other = await Actor.create({
      name: "Shortcut Other Hero",
      type: "character",
      ownership: {
        [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      },
    });
    const createdItems = await actor.createEmbeddedDocuments("Item", [
      { name: "First Ability", type: "ability", sort: 100 },
      { name: "Second Ability", type: "ability", sort: 200 },
      { name: "First Gear", type: "equipment", sort: 100 },
      { name: "Pack", type: "equipment", sort: 200 },
    ]);
    const first = createdItems.find((item) => item.name === "First Ability"),
      second = createdItems.find((item) => item.name === "Second Ability"),
      gear = createdItems.find((item) => item.name === "First Gear"),
      pack = createdItems.find((item) => item.name === "Pack");
    const [otherAbility] = await other.createEmbeddedDocuments("Item", [
      { name: "Existing Other Ability", type: "ability", sort: 100 },
    ]);
    const scene = await Scene.create({
      name: "HOL Shortcut Fixture",
      width: 1500,
      height: 1000,
      navigation: false,
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      {
        name: "Unlinked Shortcut Hero",
        actorId: actor.id,
        actorLink: false,
        x: 100,
        y: 100,
      },
    ]);
    const tokenActor = token.actor;
    return {
      priorGmSlot7: game.user.hotbar["7"] ?? null,
      actor: actor.id,
      actorUuid: actor.uuid,
      first: first.id,
      firstUuid: first.uuid,
      gear: gear.id,
      gearUuid: gear.uuid,
      other: other.id,
      otherAbility: otherAbility.id,
      pack: pack.id,
      player: player.id,
      playerName: player.name,
      scene: scene.id,
      second: second.id,
      secondUuid: second.uuid,
      token: token.id,
      tokenActor: tokenActor.id,
      tokenActorUuid: tokenActor.uuid,
      tokenFirstUuid: tokenActor.items.get(first.id).uuid,
    };
  });

  player = await join(fixture.playerName, { canvas: true });
  assert.deepEqual(
    await player.evaluate(() => ({
      frozen: Object.isFrozen(game.heroesOfLegend),
      hasAdd: typeof game.heroesOfLegend?.addHotbarShortcut === "function",
      hasOpen: typeof game.heroesOfLegend?.openItem === "function",
    })),
    { frozen: true, hasAdd: true, hasOpen: true },
  );
  await player.evaluate(async (id) => {
    await game.actors.get(id).sheet.render({ force: true });
  }, fixture.actor);
  const actorSheet = player.locator(".hol-character", {
    hasText: "Shortcut Hero",
  });
  await actorSheet.waitFor();
  assert.equal(
    await actorSheet
      .locator(".hol-ability-list")
      .first()
      .locator(".hol-item-open span")
      .allTextContents()
      .then((texts) => texts.join("|")),
    "First Ability|Second Ability",
  );
  assert.equal(await actorSheet.locator(".hol-shortcut-controls").count(), 4);
  assert.equal(
    await actorSheet
      .locator(`.hol-item-row[data-item-id="${fixture.first}"]`)
      .getAttribute("draggable"),
    "true",
  );

  const beforeDrop = await player.evaluate((id) => {
    const actor = game.actors.get(id);
    return {
      items: actor.items.size,
      health: actor.system.health.value,
      grit: actor.system.grit.spent,
    };
  }, fixture.actor);
  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.second}"]`)
    .dragTo(player.locator('#hotbar .slot[data-slot="1"]'));
  await player.waitForFunction(() => Boolean(game.user.hotbar["1"]));
  const firstDrop = await player.evaluate(
    ({ uuid }) => {
      const macro = game.macros.get(game.user.hotbar["1"]);
      return {
        command: macro.command,
        expected: `await game.heroesOfLegend.openItem(${JSON.stringify(uuid)});`,
        flag: macro.getFlag("heroes-of-legend", "shortcut"),
        macroId: macro.id,
      };
    },
    { uuid: fixture.secondUuid },
  );
  assert.equal(firstDrop.command, firstDrop.expected);
  assert.equal(firstDrop.flag.itemUuid, fixture.secondUuid);
  assert.equal(firstDrop.flag.actorUuid, fixture.actorUuid);
  assert.deepEqual(
    await player.evaluate((id) => {
      const actor = game.actors.get(id);
      return {
        items: actor.items.size,
        health: actor.system.health.value,
        grit: actor.system.grit.spent,
      };
    }, fixture.actor),
    beforeDrop,
  );

  await player.locator('#hotbar .slot[data-slot="1"]').click();
  await itemSheetOpened(player, fixture.secondUuid);
  assert.equal(await player.locator(".hol-roll-dialog").count(), 0);
  assert.deepEqual(
    await player.evaluate((id) => {
      const actor = game.actors.get(id);
      return {
        items: actor.items.size,
        health: actor.system.health.value,
        grit: actor.system.grit.spent,
      };
    }, fixture.actor),
    beforeDrop,
  );
  await closeItemSheets(player, [fixture.secondUuid]);

  await player.evaluate(async (id) => {
    await game.actors.get(id).sheet.render({ force: true });
  }, fixture.actor);
  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.second}"]`)
    .dragTo(
      actorSheet.locator(`.hol-item-row[data-item-id="${fixture.first}"]`),
    );
  await player.waitForFunction(
    ({ first, second }) => {
      const items = game.actors.find(
        (actor) => actor.items.has(first) && actor.items.has(second),
      ).items;
      return items.get(second).sort < items.get(first).sort;
    },
    { first: fixture.first, second: fixture.second },
    { polling: 100 },
  );
  await player.evaluate(async (id) => {
    await game.actors.get(id).sheet.render({ force: true });
  }, fixture.actor);
  assert.equal(
    await actorSheet
      .locator(".hol-ability-list")
      .first()
      .locator(".hol-item-open span")
      .allTextContents()
      .then((texts) => texts.join("|")),
    "Second Ability|First Ability",
  );

  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.gear}"]`)
    .dragTo(player.locator('#hotbar .slot[data-slot="2"]'));
  await player.waitForFunction(() => Boolean(game.user.hotbar["2"]));
  const macroCount = await player.evaluate(
    (actorUuid) =>
      game.macros.filter(
        (macro) =>
          macro.getFlag("heroes-of-legend", "shortcut")?.actorUuid ===
          actorUuid,
      ).length,
    fixture.actorUuid,
  );
  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.second}"]`)
    .dragTo(player.locator('#hotbar .slot[data-slot="3"]'));
  await player.waitForFunction(
    (macroId) => game.user.hotbar["3"] === macroId,
    firstDrop.macroId,
  );
  assert.equal(
    await player.evaluate(
      (actorUuid) =>
        game.macros.filter(
          (macro) =>
            macro.getFlag("heroes-of-legend", "shortcut")?.actorUuid ===
            actorUuid,
        ).length,
      fixture.actorUuid,
    ),
    macroCount,
  );

  const firstRow = actorSheet.locator(
    `.hol-item-row[data-item-id="${fixture.first}"]`,
  );
  await firstRow.locator("[data-hotbar-slot]").fill("4");
  await firstRow.locator('[data-action="addShortcut"]').click();
  await player.waitForFunction(() => Boolean(game.user.hotbar["4"]));
  const gearRow = actorSheet.locator(
    `.hol-item-row[data-item-id="${fixture.gear}"]`,
  );
  await gearRow.locator("[data-hotbar-slot]").fill("5");
  await gearRow.locator('[data-action="addShortcut"]').focus();
  await gearRow.locator('[data-action="addShortcut"]').press("Enter");
  await player.waitForFunction(
    () =>
      Boolean(game.user.hotbar["5"]) &&
      game.user.hotbar["5"] === game.user.hotbar["2"],
  );

  await player.evaluate(async ({ actor, other }) => {
    await game.actors.get(actor).sheet.render({
      force: true,
      position: { left: 20, top: 40, width: 700, height: 760 },
    });
    await game.actors.get(other).sheet.render({
      force: true,
      position: { left: 760, top: 40, width: 700, height: 760 },
    });
  }, fixture);
  const otherSheet = player.locator(".hol-character", {
    hasText: "Shortcut Other Hero",
  });
  await otherSheet.waitFor();
  await player.evaluate(() => {
    globalThis.__holNotices.length = 0;
  });
  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.first}"]`)
    .dragTo(
      otherSheet.locator(
        `.hol-item-row[data-item-id="${fixture.otherAbility}"]`,
      ),
    );
  await player.waitForFunction(() =>
    globalThis.__holNotices.some((message) =>
      message.includes("does not change ownership"),
    ),
  );
  assert.equal(
    await player.evaluate(
      (id) => game.actors.get(id).items.size,
      fixture.other,
    ),
    1,
  );
  await player.evaluate(async (id) => {
    await game.actors.get(id).sheet.close();
  }, fixture.other);

  await player.evaluate(async (macroId) => {
    await game.macros
      .get(macroId)
      .update({ command: "ui.notifications.error('modified shortcut');" });
  }, firstDrop.macroId);
  await actorSheet
    .locator(`.hol-item-row[data-item-id="${fixture.second}"]`)
    .dragTo(player.locator('#hotbar .slot[data-slot="6"]'));
  await player.waitForFunction(
    (oldMacro) =>
      Boolean(game.user.hotbar["6"]) && game.user.hotbar["6"] !== oldMacro,
    firstDrop.macroId,
  );
  const replacement = await player.evaluate(() => {
    const macro = game.macros.get(game.user.hotbar["6"]);
    return {
      command: macro.command,
      flag: macro.getFlag("heroes-of-legend", "shortcut"),
    };
  });
  assert.equal(
    replacement.command,
    `await game.heroesOfLegend.openItem(${JSON.stringify(fixture.secondUuid)});`,
  );
  assert.equal(replacement.flag.itemUuid, fixture.secondUuid);

  await player.evaluate(
    async ({ actor, item }) => {
      await game.actors.get(actor).deleteEmbeddedDocuments("Item", [item]);
    },
    { actor: fixture.actor, item: fixture.second },
  );
  await player.evaluate(() => {
    globalThis.__holNotices.length = 0;
  });
  await player.locator('#hotbar .slot[data-slot="6"]').click();
  await player.waitForFunction(() =>
    globalThis.__holNotices.some((message) =>
      message.includes("no longer available"),
    ),
  );

  await gm.evaluate(async ({ actor, player }) => {
    await game.actors.get(actor).update({
      [`ownership.${player}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    });
  }, fixture);
  await player.waitForFunction(
    ({ actor, player }) =>
      game.users.get(player) && !game.actors.get(actor).isOwner,
    fixture,
  );
  await player.evaluate(async (id) => {
    await game.actors.get(id).sheet.render({ force: true });
  }, fixture.actor);
  const observerSheet = player.locator(".hol-character", {
    hasText: "Shortcut Hero",
  });
  assert.equal(
    await observerSheet.locator(".hol-shortcut-controls").count(),
    0,
  );
  assert.notEqual(
    await observerSheet
      .locator(`.hol-item-row[data-item-id="${fixture.first}"]`)
      .getAttribute("draggable"),
    "true",
  );
  assert.equal(
    await player.evaluate(async (uuid) => {
      try {
        await game.heroesOfLegend.addHotbarShortcut(uuid, 8);
        return false;
      } catch {
        return true;
      }
    }, fixture.firstUuid),
    true,
  );
  await observerSheet
    .locator(`.hol-item-row[data-item-id="${fixture.first}"] .hol-item-open`)
    .click();
  await itemSheetOpened(player, fixture.firstUuid);
  await closeItemSheets(player, [fixture.firstUuid]);

  const nativeResult = await gm.evaluate(async () => {
    const macro = await Macro.create({
      name: "Unrelated native hotbar fixture",
      type: "chat",
      command: "",
    });
    const result = Hooks.call("hotbarDrop", ui.hotbar, macro.toDragData(), 50);
    await macro.delete();
    return result;
  });
  assert.notEqual(nativeResult, false);

  await gm.evaluate(
    async ({ actor, token }) => {
      await game.scenes
        .get(token.scene)
        ?.tokens.get(token.id)
        ?.actor.sheet.render({
          force: true,
        });
    },
    {
      actor: fixture.actor,
      token: { id: fixture.token, scene: fixture.scene },
    },
  );
  const tokenSheet = gm.locator(".hol-character", {
    hasText: "Unlinked Shortcut Hero",
  });
  await tokenSheet.waitFor();
  await tokenSheet
    .locator(`.hol-item-row[data-item-id="${fixture.first}"]`)
    .dragTo(gm.locator('#hotbar .slot[data-slot="7"]'));
  await gm.waitForFunction(() => Boolean(game.user.hotbar["7"]));
  const tokenShortcut = await gm.evaluate(
    ({ baseActorUuid }) => {
      const macro = game.macros.get(game.user.hotbar["7"]);
      const flag = macro.getFlag("heroes-of-legend", "shortcut");
      return {
        flag,
        isBase: flag.actorUuid === baseActorUuid,
      };
    },
    { baseActorUuid: fixture.actorUuid },
  );
  assert.equal(tokenShortcut.isBase, false);
  assert.equal(tokenShortcut.flag.actorUuid, fixture.tokenActorUuid);
  assert.equal(tokenShortcut.flag.itemUuid, fixture.tokenFirstUuid);
  await gm.locator('#hotbar .slot[data-slot="7"]').click();
  await itemSheetOpened(gm, fixture.tokenFirstUuid);
  assert.equal(
    await gm.evaluate(
      (uuid) =>
        [...foundry.applications.instances.values()].some(
          (app) =>
            app.rendered &&
            app.document?.uuid === uuid &&
            app.document.actor?.isToken,
        ),
      fixture.tokenFirstUuid,
    ),
    true,
  );

  await mkdir("test-results", { recursive: true });
  await closeItemSheets(gm, [fixture.tokenFirstUuid]);
  await tokenSheet.screenshot({ path: "test-results/item-shortcuts.png" });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native sheet drag/hotbar creation, row click, click and keyboard slot add, rerender/reuse, modified-command rejection, deleted-source notification, observer denial and unlinked-token context.",
  );
} catch (error) {
  await mkdir("test-results", { recursive: true });
  await player?.screenshot({ path: "test-results/shortcuts-failure.png" });
  console.error("Browser errors", errors);
  console.error(
    "Sort values",
    await player?.evaluate(
      ({ actor, first, second }) => ({
        a: game.actors.get(actor)?.items.get(first)?.sort,
        b: game.actors.get(actor)?.items.get(second)?.sort,
      }),
      fixture,
    ),
  );
  throw error;
} finally {
  if (gm && fixture)
    await gm
      .evaluate(async (data) => {
        const macros = game.macros
          .filter((macro) =>
            [data.actorUuid, data.tokenActorUuid].includes(
              macro.getFlag("heroes-of-legend", "shortcut")?.actorUuid,
            ),
          )
          .map((macro) => macro.id);
        await game.user.assignHotbarMacro(
          data.priorGmSlot7
            ? (game.macros.get(data.priorGmSlot7) ?? null)
            : null,
          7,
        );
        if (macros.length) await Macro.deleteDocuments(macros);
        await game.scenes.get(data.scene)?.delete();
        await game.actors.get(data.actor)?.delete();
        await game.actors.get(data.other)?.delete();
        await game.users.get(data.player)?.delete();
      }, fixture)
      .catch((error) => {
        console.error("Fixture cleanup failed", error.message);
        process.exitCode = 1;
      });
  await browser.close();
}
