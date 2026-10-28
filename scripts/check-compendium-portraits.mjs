import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an explicitly authorized isolated local world.");
const art = JSON.parse(await readFile(new URL("../static/assets/creatures/manifest.json", import.meta.url), "utf8"));
const nonSquare = art.portraits.find(p => p.width !== p.height);
assert(nonSquare, "Expected a non-square portrait acceptance example");
const examples = [
  ...new Set(["creature-adder", "creature-red-dragon", nonSquare.id]),
].map(id => ({ id, pack: "creatures" }));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let page;
await mkdir("test-results", { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  });
  page = await context.newPage();
  page.on("pageerror", e => errors.push(e.stack ?? e.message));
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready && game.canvas.initialized && !game.canvas.loading);
  await page.evaluate(() => ui.notifications.clear());
  for (const asset of art.assets) {
    const response = await page.request.get(new URL(`systems/heroes-of-legend/${asset.runtimePath}`, url).href);
    assert.equal(response.status(), 200, asset.runtimePath);
    const bytes = await response.body();
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  }
  await page.evaluate(async examples => {
    const f = globalThis.__holPortraitFixture = { actors: [], scene: null,
      baselineActors: game.actors.map(a => a.toObject()),
      baselineTokens: game.scenes.map(s => [s.id, s.tokens.map(t => t.id)]), hook: null };
    f.hook = Hooks.on("createActor", actor => {
      if (examples.some(e => e.id === actor.getFlag("heroes-of-legend", "catalogId")) &&
          !f.baselineActors.some(a => a._id === actor.id)) f.actors.push(actor.id);
    });
    const scene = await Scene.create({name:"Portrait acceptance fixture", active:false, width:2000,height:1600,
      grid:{type:1,size:100,distance:5,units:"ft"}, tokenVision:false,globalLight:true});
    f.scene = scene.id;
    for (const [index, example] of examples.entries()) {
      const pack = game.packs.get(`heroes-of-legend.${example.pack}`);
      const source = (await pack.getDocuments()).find(a => a.getFlag("heroes-of-legend", "catalogId") === example.id);
      if (!source) throw new Error(`Missing source ${example.id}`);
      const actor = await game.actors.importFromCompendium(pack, source.id, {}, {renderSheet:false});
      if (!f.actors.includes(actor.id)) f.actors.push(actor.id);
      actor.validate({strict:true,fallback:false});
      const token = await actor.getTokenDocument({x:100+index*400,y:100});
      await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    }
    await new Promise(resolve=>setTimeout(resolve,2100));
    await scene.view();
  }, examples);
  await page.waitForFunction(() => canvas.ready && !canvas.loading && canvas.scene?.id === globalThis.__holPortraitFixture.scene);
  await page.evaluate(() => canvas.pan({x:800,y:400,scale:0.7}));
  for (const example of examples) {
    const state = await page.evaluate(async example => {
      const actor = game.actors.find(a => globalThis.__holPortraitFixture.actors.includes(a.id) &&
        a.getFlag("heroes-of-legend", "catalogId") === example.id);
      await actor.sheet.render({force:true});
      const token = canvas.tokens.placeables.find(t=>t.document.actorId===actor.id);
      const footprint=actor.system.footprint;
      return { id:actor.id,img:actor.img,texture:actor.prototypeToken.texture.src,
        tokenTexture:token.document.texture.src, tokenWidth:token.document.width, tokenHeight:token.document.height,
        footprint, portrait:actor.getFlag("heroes-of-legend","portrait"), controller:actor.system.controllerId??null };
    }, example);
    assert.equal(state.img,state.texture);
    assert.equal(state.img,state.tokenTexture);
    assert.equal(state.tokenWidth,state.footprint.width);
    assert.equal(state.tokenHeight,state.footprint.height);
    assert.equal(state.controller,null);
    const sheet = page.locator(".hol-creature");
    const image = sheet.locator(".hol-profile-portrait img");
    await image.evaluate(async img => { await img.decode(); });
    assert.deepEqual(await image.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight})),
      {width:state.portrait.width,height:state.portrait.height});
    await sheet.screenshot({path:`test-results/${example.id}-portrait-sheet.png`});
    await sheet.locator('[data-action="viewPortrait"]').click();
    const popout = page.locator(".image-popout");
    await popout.waitFor();
    const enlarged = popout.locator("img");
    await enlarged.evaluate(async img => { await img.decode(); });
    assert.equal(await enlarged.getAttribute("src"),state.img);
    await popout.screenshot({path:`test-results/${example.id}-portrait-enlarged.png`});
    await page.evaluate(async id => {
      for (const app of foundry.applications.instances.values())
        if (app instanceof foundry.applications.apps.ImagePopout) await app.close();
      await game.actors.get(id).sheet.close();
    },state.id);
  }
  await page.screenshot({path:"test-results/compendium-portrait-tokens.png"});
  assert.deepEqual(errors,[]);
  console.info("PASS: installed HTTP image bytes/hashes for all192 assets, source-imported creature sheets including the summon-flag layout, token textures, native enlarged views, non-square image dimensions and no controller state.");
} finally {
  try {
    if (page && !page.isClosed()) {
      const cleanup = await page.evaluate(async () => {
        const f = globalThis.__holPortraitFixture;
        if (!f) return {unchanged:true,remaining:[]};
        Hooks.off("createActor",f.hook);
        await game.scenes.get(f.scene)?.delete();
        for (const id of new Set(f.actors)) {
          const actor=game.actors.get(id); await actor?.sheet?.close(); await actor?.delete();
        }
        const unchanged=JSON.stringify(game.actors.map(a=>a.toObject()))===JSON.stringify(f.baselineActors)&&
          JSON.stringify(game.scenes.map(s=>[s.id,s.tokens.map(t=>t.id)]))===JSON.stringify(f.baselineTokens);
        const remaining=f.actors.filter(id=>game.actors.has(id));
        if(game.scenes.has(f.scene))remaining.push(f.scene);
        delete globalThis.__holPortraitFixture;
        return {unchanged,remaining};
      });
      assert.equal(cleanup.unchanged,true);assert.deepEqual(cleanup.remaining,[]);
      console.info("CLEANUP:",cleanup);
    }
  } finally {await browser.close();}
}
