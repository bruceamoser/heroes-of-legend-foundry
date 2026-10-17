import { selectTestUser } from "./helpers/login.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const url = process.env.HOL_TEST_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Set a local HOL_TEST_URL");
if (process.env.HOL_TEST_ALLOW_WRITES !== "1") throw new Error("Set HOL_TEST_ALLOW_WRITES=1 for disposable-world document tests");
const browser = await chromium.launch();
const errors = [];
async function join(user) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  context.setDefaultTimeout(30000);
  await context.addInitScript(() => { localStorage.setItem("core.maxFPS", "10"); localStorage.setItem("core.performanceMode", "0"); });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, user);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  await page.evaluate(() => foundry.nue.Tour.activeTour?.exit());
  return page;
}
let gm;
let fixture;
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const user = await User.create({ name: `HOL Test ${foundry.utils.randomID(6)}`, role: CONST.USER_ROLES.PLAYER });
    const actor = await Actor.create({ name: "Elyra · Test Hero", type: "character", ownership: { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
    const item = await Item.create({ name: "Test ability", type: "ability" });
    const scene = await Scene.create({ name: "HOL Sheet Test", width: 1600, height: 1000 });
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, actorLink: false, x: 0, y: 0 }]);
    await actor.sheet.render({ force: true });
    return { actor: actor.id, item: item.id, scene: scene.id, token: token.id, user: user.id, username: user.name };
  });
  const sheet = gm.locator(".hol-character");
  await sheet.locator('[name="system.attributes.brawn.base"]').fill("2");
  await sheet.locator('[name="system.attributes.agility.base"]').fill("1");
  await sheet.locator('[name="system.biography"]').fill("A traveler from the northern forests.");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await gm.waitForFunction(id => game.actors.get(id).system.attributes.brawn.base === 2, fixture.actor);
  const validation = await gm.evaluate(id => {
    const actor = game.actors.get(id);
    const rejected = [];
    for (const changes of [{ "system.attributes.brawn.base": 3 }, { "system.attributes.brawn.base": 0.5 },
      { "system.health.value": 99 }, { "system.grit.spent": 3 }]) {
      try { actor.validate({ changes: foundry.utils.expandObject(changes), fallback: false }); rejected.push(false); }
      catch { rejected.push(true); }
    }
    return { rejected, effective: actor.system.attributes.brawn.effective, grit: actor.system.grit.available };
  }, fixture.actor);
  assert.deepEqual(validation, { rejected: [true, true, true, true], effective: 2, grit: 2 });
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  assert.equal(await gm.evaluate(id => game.actors.get(id).system.attributes.brawn.base, fixture.actor), 2);
  await gm.evaluate(async id => { await game.items.get(id).sheet.render({ force: true }); }, fixture.item);
  await gm.locator('.hol-ability [name="system.description"]').fill("A measured strike.");
  await gm.locator('.hol-ability [name="system.outcomes.strong"]').fill("Strong outcome.");
  await gm.locator('.hol-ability').getByRole('button', { name: 'Save changes' }).click();
  await gm.waitForFunction(id => game.items.get(id).system.description === "A measured strike.", fixture.item);
  const player = await join(fixture.username);
  await player.evaluate(async id => { await game.actors.get(id).sheet.render({ force: true }); }, fixture.actor);
  await player.locator('.hol-character [name="system.health.value"]').fill("9");
  await player.locator('.hol-character').getByRole('button', { name: 'Save changes' }).click();
  await gm.waitForFunction(id => game.actors.get(id).system.health.value === 9, fixture.actor);
  await gm.evaluate(async f => { await game.actors.get(f.actor).update({ [`ownership.${f.user}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }); }, fixture);
  await player.waitForFunction(id => !game.actors.get(id).isOwner, fixture.actor);
  await player.evaluate(async id => { await game.actors.get(id).sheet.render({ force: true }); }, fixture.actor);
  assert.equal(await player.locator('.hol-character [name="system.health.value"]').isDisabled(), true);
  const denied = await player.evaluate(async id => {
    const { updateOwnedDocument } = await import('/systems/heroes-of-legend/services/documents.mjs');
    try { await updateOwnedDocument(game.actors.get(id), { "system.health.value": 1 }); return false; } catch { return true; }
  }, fixture.actor);
  assert.equal(denied, true);
  await gm.evaluate(async f => {
    const actor = game.scenes.get(f.scene).tokens.get(f.token).actor;
    await actor.sheet.render({ force: true });
  }, fixture);
  const tokenSheet = gm.locator('.hol-character').last();
  await tokenSheet.locator('[name="system.health.value"]').fill('5');
  await tokenSheet.getByRole('button', { name: 'Save changes' }).click();
  await gm.waitForFunction(f => game.scenes.get(f.scene).tokens.get(f.token).actor.system.health.value === 5, fixture);
  assert.equal(await gm.evaluate(id => game.actors.get(id).system.health.value, fixture.actor), 9);
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  assert.equal(await gm.evaluate(f => game.scenes.get(f.scene).tokens.get(f.token).actor.system.health.value, fixture), 5);
  assert.equal(await gm.evaluate(id => game.items.get(id).system.outcomes.strong, fixture.item), "Strong outcome.");
  await gm.evaluate(async id => { await game.actors.get(id).sheet.render({ force: true }); }, fixture.actor);
  await mkdir("test-results", { recursive: true });
  await gm.locator('.hol-character').screenshot({ path: 'test-results/character-sheet.png' });
  assert.deepEqual(errors, []);
  console.info("PASS: character/ability save+reload, invalid input, owner edits, observer denial, unlinked token isolation+reload; no page errors.");
} finally {
  if (gm && fixture) await gm.evaluate(async f => {
    await game.scenes.get(f.scene)?.delete(); await game.actors.get(f.actor)?.delete();
    await game.items.get(f.item)?.delete(); await game.users.get(f.user)?.delete();
  }, fixture).catch(e => console.error("Fixture cleanup failed", e.message));
  await browser.close();
}
