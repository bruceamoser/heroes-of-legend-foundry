import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL,
  webUrl = process.env.HOL_WORKSHOP_URL,
  ID = "heroes-of-legend",
  output = "test-results/shared-sheets-import";
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1" ||
  process.env.HOL_TEST_ISOLATED_WORLD !== "1"
)
  throw Error("Use an explicitly authorized isolated localhost world.");
if (!webUrl || !["localhost", "127.0.0.1"].includes(new URL(webUrl).hostname))
  throw Error("Set HOL_WORKSHOP_URL to the local built workshop.");
await mkdir(output, { recursive: true });
const browser = await chromium.launch(),
  errors = [],
  evidence = { checks: [], captures: [] };
let page, fixture;
async function closeSheets() {
  await page.evaluate(async () => {
    for (const app of foundry.applications.instances.values())
      if (
        app.document?.documentName === "Actor" ||
        app.document?.documentName === "Item"
      )
        await app.close();
  });
}
try {
  const web = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await web.goto(webUrl);
  await web
    .getByRole("heading", { name: "Borin Bridgekeeper", exact: true })
    .waitFor();
  await web.getByLabel("Current HP", { exact: true }).fill("7");
  await web.getByLabel("Current HP", { exact: true }).dispatchEvent("change");
  const downloadPromise = web.waitForEvent("download");
  await web.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise,
    portable = await readFile(await download.path());
  assert.equal(JSON.parse(portable).format, "heroes-of-legend-character");
  await web.close();
  evidence.checks.push(
    "Actual workshop Export JSON download, including current HP 7.",
  );
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1050 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url + "/join");
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready, null, {
    timeout: 60000,
  });
  await page.evaluate(() => {
    foundry.nue.Tour.activeTour?.exit();
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  fixture = await page.evaluate(async () => {
    const f = (globalThis.__holShared249 = {
      actors: [],
      scenes: [],
      items: [],
      messages: game.messages.contents.map((m) => m.id),
      previousScene: game.scenes.active?.id ?? null,
    });
    const target = await Actor.create({
      name: "Import target",
      type: "character",
    });
    f.actors.push(target.id);
    f.target = target.id;
    f.ownership = target.toObject().ownership;
    return f;
  });
  await page.evaluate((id) => {
    void game.actors.get(id).importFromJSONDialog();
  }, fixture.target);
  await page
    .locator("input[type=file][name=data]")
    .setInputFiles({
      name: "workshop-character.json",
      mimeType: "application/json",
      buffer: portable,
    });
  await page.locator("button[data-action=import]").click();
  await page.waitForFunction(
    (id) => {
      const a = game.actors.get(id);
      return (
        a?.name === "Borin Bridgekeeper" &&
        a.getFlag("heroes-of-legend", "creationReceipt")?.status === "complete"
      );
    },
    fixture.target,
    { timeout: 60000 },
  );
  const imported = await page.evaluate((id) => {
    const a = game.actors.get(id);
    return {
      id: a.id,
      hp: a.system.health.value,
      tokenName: a.prototypeToken.name,
      ownership: a.toObject().ownership,
      items: a.items.size,
      dp: a.getFlag("heroes-of-legend", "development").dp,
    };
  }, fixture.target);
  assert.equal(imported.id, fixture.target);
  assert.equal(imported.hp, 7);
  assert.equal(imported.tokenName, "Borin Bridgekeeper");
  assert.deepEqual(imported.ownership, fixture.ownership);
  assert(imported.items > 0);
  evidence.checks.push(
    "Native Import Data dialog imports exported name/type/token name, HP, inventory and completed character while preserving identity/ownership.",
  );
  await page.evaluate(
    (id) => game.actors.get(id).sheet.render({ force: true }),
    fixture.target,
  );
  await page.locator(".hol-character-sheet").waitFor();
  await page
    .locator(".hol-character")
    .screenshot({ path: `${output}/character-imported.png` });
  await page.reload();
  await page.waitForFunction(() => game.ready, null, { timeout: 60000 });
  await page.evaluate(f => { globalThis.__holShared249 = f; }, fixture);
  await page.evaluate(() => {ui.sidebar.expand();ui.sidebar.changeTab("chat","primary");});
  assert.equal(
    await page.evaluate(
      (id) => game.actors.get(id).system.health.value,
      fixture.target,
    ),
    7,
  );
  // A normal Foundry export still follows the core import path.
  await page.evaluate(async (id) => {
    const a = game.actors.get(id),
      data = a.toObject();
    data.name = "Native round trip";
    data.prototypeToken.name = data.name;
    await a.importFromJSON(JSON.stringify(data));
  }, fixture.target);
  assert.equal(
    await page.evaluate((id) => game.actors.get(id).name, fixture.target),
    "Native round trip",
  );
  evidence.checks.push(
    "Reload retains imported character state; native Actor JSON import remains compatible.",
  );
  fixture = await page.evaluate(async () => {
    const f = globalThis.__holShared249;
    async function copy(pack, id, kind) {
      const source = (
        await game.packs.get(`heroes-of-legend.${pack}`).getDocuments()
      ).find((d) => d.getFlag("heroes-of-legend", "catalogId") === id);
      if (!source) throw Error(`Missing ${id}`);
      const data = source.toObject();
      delete data._id;
      const a = await Actor.create(data);
      f.actors.push(a.id);
      f[kind] = a.id;
    }
    await copy("creatures", "creature-basilisk", "basilisk");
    await copy("creatures", "creature-bone-sentry", "skeleton");
    await copy("summons", "summon-bone-sentry", "summon");
    const npcData = game.actors.get(f.skeleton).toObject();
    delete npcData._id;
    npcData.name = "NPC sheet audit";
    npcData.flags["heroes-of-legend"].npc = {
      enabled: true,
      role: "Gate guard",
      profileLinked: true,
    };
    const npc = await Actor.create(npcData);
    f.actors.push(npc.id);
    f.npc = npc.id;
    const scene = await Scene.create({
      name: "Shared sheet token fixture",
      width: 1200,
      height: 900,
      padding: 0,
      grid: { type: 1, size: 100 },
      tokens: [
        {
          name: "Summoned skeleton",
          actorId: f.summon,
          actorLink: false,
          x: 100,
          y: 100,
        },
      ],
    });
    f.scenes.push(scene.id);
    f.scene = scene.id;
    await scene.activate();
    await scene.view();
    return f;
  });
  await page.waitForFunction(
    (f) => canvas.ready && canvas.scene?.id === f.scene,
    fixture,
    { timeout: 60000 },
  );
  for (const kind of ["basilisk", "skeleton", "summon", "npc"]) {
    await closeSheets();
    await page.evaluate(
      (id) => game.actors.get(id).sheet.render({ force: true }),
      fixture[kind],
    );
    const sheet = page.locator(".hol-creature-sheet");
    await sheet.waitFor();
    assert.equal(await sheet.locator(".hol-card-defenses dt").count(), 7);
    assert.equal(
      await sheet
        .locator(".hol-card-attributes [data-action=rollAttribute]")
        .count(),
      6,
    );
    assert.equal(await sheet.locator("[data-current-hp]").count(), 1);
    assert.equal(await sheet.locator("[role=tablist]").count(), 0);
    assert.equal(
      await page.evaluate(
        (id) => game.actors.get(id).sheet.constructor.name,
        fixture[kind],
      ),
      "CreatureSheet",
    );
    await page
      .locator(".hol-creature")
      .screenshot({ path: `${output}/${kind}.png` });
    evidence.captures.push(kind);
    if (kind === "summon") {
      assert.equal(await sheet.locator(".hol-outcome-grid").count(), 0);
      await sheet.locator("[data-current-hp]").fill("7");
      await sheet.locator("[data-current-hp]").dispatchEvent("change");
      await page.waitForFunction(
        (id) => game.actors.get(id).system.health.value === 7,
        fixture.summon,
      );
      await sheet.locator("[data-action=npcMelee]").click();
      await page.locator(".hol-roll-dialog [data-action=roll]").click();
      await page.locator(".hol-roll-dialog").waitFor({ state: "detached" });
      const roll = await page.evaluate(() =>
        game.messages.contents
          .filter((m) => m.getFlag("heroes-of-legend", "roll"))
          .at(-1)
          .getFlag("heroes-of-legend", "roll"),
      );
      assert.equal(roll.ability.summonActionId, "basic-melee");
      assert.equal(roll.resolvedEffects.components[0].type, "physical");
      const messageId = await page.evaluate(
        () =>
          game.messages.contents
            .filter((m) => m.getFlag("heroes-of-legend", "roll"))
            .at(-1).id,
      );
      await page.evaluate(() => {ui.sidebar.expand();ui.sidebar.changeTab("chat","primary");});
      await page
        .locator(`#chat [data-message-id="${messageId}"]`)
        .getByRole("button", { name: "Roll again", exact: true })
        .click();
      await page.locator(".hol-roll-dialog").waitFor();
      await page.evaluate(async () => {for(const app of foundry.applications.instances.values())if(app.constructor.name === "SharedRollDialog")await app.close();});
      await sheet.locator("[data-action=cardEdit]").click();
      await sheet.locator("input[name=name]").fill("Summoned skeleton edited");
      await sheet.locator("[data-action=cardEdit]").click();
      await page.waitForFunction(
        (id) => game.actors.get(id).name === "Summoned skeleton edited",
        fixture.summon,
      );
    }
  }
  evidence.checks.push(
    "Basilisk, normal Skeleton Sentry, summoned Skeleton Sentry and NPC use the same CreatureSheet with compact stats, attributes, HP, action tables and no tabs. Summon HP/edit/attack/Roll again work.",
  );
  await closeSheets();
  await page.evaluate(async (f) => {
    const token = canvas.scene.tokens.contents.find(
      (t) => t.actorId === f.summon,
    );
    await token.actor.sheet.render({ force: true });
  }, fixture);
  assert.equal(await page.locator(".hol-creature-sheet").count(), 1);
  await page.locator('.hol-creature-sheet [data-current-hp]').fill('5');
  await page.locator('.hol-creature-sheet [data-current-hp]').dispatchEvent('change');
  await page.waitForFunction(f=>canvas.scene.tokens.contents.find(t=>t.actorId===f.summon).actor.system.health.value===5,fixture);
  assert.equal(await page.evaluate(f=>game.actors.get(f.summon).system.health.value,fixture),7);
  evidence.checks.push("Unlinked token Actor opens the same creature sheet.");
  await closeSheets();
  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    await actor.setFlag("core", "sheetClass", "heroes-of-legend.SummonSheet");
    await actor.sheet.render({ force: true });
  }, fixture.summon);
  assert.equal(await page.locator(".hol-creature-sheet").count(), 1);
  evidence.checks.push(
    "Explicit legacy SummonSheet selection inherits the same template and flow.",
  );
  for (const kind of ["ability", "equipment"]) {
    await closeSheets();
    const item = await page.evaluate(
      ({ id, kind }) => {
        const item = game.actors.get(id).items.find((i) => i.type === kind);
        item.sheet.render({ force: true });
        return item.id;
      },
      { id: fixture.target, kind },
    );
    await page.locator(".hol-approved-item-card").waitFor();
    assert.equal(
      await page.locator(".hol-approved-item-card [role=tablist]").count(),
      0,
    );
    await page
      .locator(".hol-approved-item-card")
      .screenshot({ path: `${output}/${kind}.png` });
    evidence.captures.push(kind);
  }
  evidence.checks.push(
    "Ability and equipment retain the approved compact item cards.",
  );
  assert.deepEqual(errors, []);
  evidence.passed = true;
  evidence.version = await page.evaluate(() => game.system.version);
} catch (error) {
  if (page)
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  if (page) {
    try {
      evidence.cleanup = await page.evaluate(async () => {
        const f = globalThis.__holShared249;
        if (!f) return { complete: true };
        for (const app of foundry.applications.instances.values())
          if (app.document) await app.close();
        if (f.previousScene && game.scenes.has(f.previousScene))
          await game.scenes.get(f.previousScene).activate();
        const messages = game.messages.filter(
          (m) => !f.messages.includes(m.id),
        );
        if (messages.length)
          await ChatMessage.deleteDocuments(messages.map((m) => m.id));
        if (f.scenes.length) await Scene.deleteDocuments(f.scenes);
        if (f.actors.length) await Actor.deleteDocuments(f.actors);
        return {
          complete:
            !f.actors.some((id) => game.actors.has(id)) &&
            !f.scenes.some((id) => game.scenes.has(id)),
        };
      });
    } catch (error) {
      evidence.cleanupError = error.message;
      process.exitCode = 1;
    }
  }
  await writeFile(
    `${output}/evidence.json`,
    JSON.stringify({ ...evidence, errors }, null, 2),
  );
  await browser.close();
}
console.log(
  "Shared native sheet audit and real workshop Export → Actor Import Data passed.",
);
