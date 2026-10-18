import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an explicitly authorized isolated local world.");
const catalog = JSON.parse(await readFile(new URL("../static/data/summons.json", import.meta.url), "utf8"));
const browser = await chromium.launch();
const errors = [];
let page, context;
await mkdir("test-results", { recursive: true });
try {
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  page = await context.newPage();
  page.on("pageerror", e => errors.push(e.stack ?? e.message));
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  const validation = await page.evaluate(async records => {
    const ID = "heroes-of-legend", pack = game.packs.get(`${ID}.summons`);
    if (!pack || pack.documentName !== "Actor") throw new Error("Missing summon Actor pack");
    const baselineActors = game.actors.map(a => a.toObject());
    const baselineTokens = game.scenes.map(s => [s.id, s.tokens.map(t => t.id)]);
    const expectedIds = records.map(r => r.foundryId);
    if (expectedIds.some(id => game.actors.has(id))) throw new Error("Refusing to overwrite an existing world Actor");
    const fixture = globalThis.__holSummonPackFixture = {
      created: [], folder: null, baselineActors, baselineTokens,
      allowed: records.map(r => r.id), hook: null,
    };
    fixture.hook = Hooks.on("createActor", actor => {
      if (fixture.allowed.includes(actor.getFlag(ID, "catalogId")) && !baselineActors.some(a => a._id === actor.id))
        fixture.created.push(actor.id);
    });
    const index = await pack.getIndex();
    if (index.size !== 73) throw new Error(`Expected 73 summon profiles, got ${index.size}`);
    for (const record of records) {
      const source = await pack.getDocument(record.foundryId);
      if (!source || source.type !== "summon") throw new Error(`Missing summon ${record.id}`);
      source.validate({ strict: true, fallback: false });
      if (JSON.stringify(source.system.sourceMarkdown) !== JSON.stringify(record.reference.sourceMarkdown))
        throw new Error(`Source text changed: ${record.id}`);
      const imported = await game.actors.importFromCompendium(pack, source.id, {}, {
        keepId: true, keepEmbeddedIds: true, renderSheet: false,
      });
      if (!fixture.created.includes(imported.id)) fixture.created.push(imported.id);
      imported.validate({ strict: true, fallback: false });
      if (imported.id !== record.foundryId || imported.system.basicMelee.orientation !== "attacker")
        throw new Error(`Identity or orientation changed: ${record.id}`);
      if (JSON.stringify(imported.toObject().system) !== JSON.stringify(source.toObject().system))
        throw new Error(`Native import changed profile: ${record.id}`);
      if (imported.prototypeToken.width !== record.footprint.width || imported.prototypeToken.height !== record.footprint.height)
        throw new Error(`Native token footprint changed: ${record.id}`);
      if (imported.system.controllerId || imported.flags[ID].controllerId || imported.items.size || imported.effects.size)
        throw new Error(`Reference import created runtime state: ${record.id}`);
    }
    const source = (await pack.getDocument(records[0].foundryId)).toObject();
    const rejected = [];
    for (const [key, value] of [["basicMelee.orientation", "player-defense"], ["health.value", 1.5], ["restrictions.canReceiveHealing", true]]) {
      const changed = structuredClone(source);
      foundry.utils.setProperty(changed.system, key, value);
      try {
        const actor = new Actor(changed, { strict: true, fallback: false });
        actor.validate({ strict: true, fallback: false });
      } catch { rejected.push(key); }
    }
    return { imported: fixture.created.length, rejected };
  }, catalog.records);
  assert.equal(validation.imported, 73);
  assert.deepEqual(validation.rejected, ["basicMelee.orientation", "health.value", "restrictions.canReceiveHealing"]);

  for (const id of ["summon-cave-bat", "summon-adder", "summon-moon-hart", "summon-bone-colossus"]) {
    const record = catalog.records.find(r => r.id === id);
    assert(record);
    const rendered = await page.evaluate(async ({ id, commit }) => {
      const actor = game.actors.get(id), sheet = actor.sheet;
      await sheet.render({ force: true });
      const root = sheet.element.querySelector(".hol-summon-sheet");
      const reference = root.querySelector(".hol-item-reference");
      return {
        type: actor.type, text: root.textContent,
        controls: root.querySelectorAll('button[data-action]:not([data-action="viewPortrait"]), input, select, textarea').length,
        table: Boolean(reference.querySelector("table tbody td")),
        safeLinks: [...reference.querySelectorAll("a")].every(a => a.href.startsWith(`https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/`)),
      };
    }, { id: record.foundryId, commit: catalog.source.commit });
    assert.equal(rendered.type, "summon");
    assert.equal(rendered.controls, 0);
    assert.equal(rendered.table, true);
    assert.equal(rendered.safeLinks, true);
    assert.match(rendered.text, /No activity or alerts without a command/);
    assert.match(rendered.text, /cannot be healed/);
    assert.match(rendered.text, /attacker outcomes/);
    await page.locator(".hol-summon").screenshot({ path: `test-results/${id}-sheet.png` });
    await page.evaluate(id => game.actors.get(id).sheet.close(), record.foundryId);
  }

  // Exercise the native directory drop handler separately from keep-ID imports.
  await page.evaluate(async () => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("actors", "primary");
    await ui.actors.render({ force: true });
  });
  const record = catalog.records[0];
  const folderId = await page.evaluate(async record => {
    // The stable-ID import would be treated as an existing directory entry.
    // Remove only that fixture Actor, then drop into an empty fixture folder so
    // native directory sorting cannot touch preexisting Actors.
    await game.actors.get(record.foundryId).delete();
    const folder = await Folder.create({ name: "Summon drop fixture", type: "Actor" });
    globalThis.__holSummonPackFixture.folder = folder.id;
    return folder.id;
  }, record);
  const transfer = await page.evaluateHandle(({ id }) => {
    const data = new DataTransfer();
    data.setData("text/plain", JSON.stringify({ type: "Actor", uuid: `Compendium.heroes-of-legend.summons.Actor.${id}` }));
    return data;
  }, { id: record.foundryId });
  await page.locator(`#actors .directory-item.folder[data-folder-id="${folderId}"]`).dispatchEvent("drop", { dataTransfer: transfer });
  await page.waitForFunction(() => globalThis.__holSummonPackFixture.created.length === 74);
  const drop = await page.evaluate(() => {
    const fixture = globalThis.__holSummonPackFixture;
    const actor = game.actors.get(fixture.created.at(-1));
    return { type: actor.type, id: actor.id, catalogId: actor.getFlag("heroes-of-legend", "catalogId") };
  });
  assert.equal(drop.type, "summon");
  assert.equal(drop.catalogId, record.id);
  assert.equal(drop.id, record.foundryId);
  assert.deepEqual(errors, []);
  console.info("PASS: 73 strict summon models and stable native imports, attacker profiles, printed token footprints, native directory drop and representative read-only sheets; no lifecycle activity.");
} finally {
  try {
  if (page && !page.isClosed()) {
    const cleanup = await page.evaluate(async () => {
      const f = globalThis.__holSummonPackFixture;
      if (!f) return { cleaned: 0, unchanged: true };
      Hooks.off("createActor", f.hook);
      for (const id of new Set(f.created)) {
        const actor = game.actors.get(id);
        await actor?.sheet?.close();
        await actor?.delete();
      }
      await game.folders.get(f.folder)?.delete();
      const unchanged = JSON.stringify(game.actors.map(a => a.toObject())) === JSON.stringify(f.baselineActors) &&
        JSON.stringify(game.scenes.map(s => [s.id, s.tokens.map(t => t.id)])) === JSON.stringify(f.baselineTokens);
      const remaining = f.created.filter(id => game.actors.has(id));
      delete globalThis.__holSummonPackFixture;
      return { cleaned: f.created.length, unchanged, remaining };
    });
    assert.equal(cleanup.unchanged, true, "Preexisting world documents changed");
    assert.deepEqual(cleanup.remaining ?? [], []);
    console.info("CLEANUP:", cleanup);
  }
  } finally {
    await browser.close();
  }
}
