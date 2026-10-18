import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an authorized isolated local world.");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const gm = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const owner = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const other = await browser.newPage();
const errors = [];
for (const page of [gm, owner, other]) page.on("pageerror", error => errors.push(error.message));
async function login(page, name) {
  await page.goto(url); await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready && game.canvas.initialized && !game.canvas.loading);
}
let fixture;
try {
  await login(gm, "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const fixture = globalThis.__hol134 = { actors: [], users: [], messages: [], hook: null };
    if (game.users.some(user => ["HOL134 Owner", "HOL134 Other"].includes(user.name)))
      throw new Error("Refusing existing fixture users.");
    for (const name of ["HOL134 Owner", "HOL134 Other"]) {
      const user = await User.create({ name, role: 1 }); fixture.users.push(user.id);
    }
    const actor = await Actor.create({ name: "HOL134 reference hero", type: "character", ownership: { default: 0, [fixture.users[0]]: 3 } });
    fixture.actors.push(actor.id);
    const response = await fetch("/systems/heroes-of-legend/../heroes-of-legend/data/choices.json");
    const choices = await response.json();
    const record = choices.records.find(record => record.id === "ability-winter-hold");
    const source = await game.packs.get("heroes-of-legend.abilities").getDocument(record.foundryId);
    const data = source.toObject(); delete data._id;
    data.system.description += '<p onclick="alert(1)">Safe text</p><script>throw new Error("HOL134 injection")</script><a href="javascript:alert(1)">unsafe link</a><section class="secret">HOL134 unrevealed secret</section>';
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    fixture.hook = Hooks.on("createChatMessage", message => {
      if (message.getFlag("heroes-of-legend", "roll")?.actorUuid === actor.uuid ||
          message.getFlag("heroes-of-legend", "abilityReference")?.itemUuid === item.uuid)
        fixture.messages.push(message.id);
    });
    return { actor: actor.id, item: item.id, itemUuid: item.uuid, users: [...fixture.users] };
  });
  await login(owner, "HOL134 Owner"); await login(other, "HOL134 Other");
  await owner.evaluate(async ({ actor, item }) => game.actors.get(actor).items.get(item).sheet.render({ force: true }), fixture);
  await owner.locator('.hol-ability [data-action="postReference"]').click();
  await gm.waitForFunction(() => __hol134.messages.length === 1);
  const posted = await gm.evaluate(() => {
    const message = game.messages.get(__hol134.messages[0]);
    return { content: message.content, reference: message.getFlag("heroes-of-legend", "abilityReference") };
  });
  assert.equal(posted.reference.itemUuid, fixture.itemUuid);
  assert.match(posted.content, /Knowledge/);
  assert.match(posted.content, /data-uuid=/);
  assert.doesNotMatch(posted.content, /onclick|<script|javascript:|unrevealed secret/);
  await owner.evaluate(async id => { for (const app of foundry.applications.instances.values()) if (app.item?.actor?.id === id) await app.close(); await game.actors.get(id).sheet.render({ force: true }); }, fixture.actor);
  await owner.locator(`.hol-character [data-item-id="${fixture.item}"] [data-action="postReference"]`).click();
  await gm.waitForFunction(() => __hol134.messages.length === 2);
  const denied = await other.evaluate(async ({ actor, item }) => {
    const { postAbilityReference } = await import("/systems/heroes-of-legend/services/reference-play.mjs");
    try { await postAbilityReference(game.actors.get(actor)?.items.get(item)); return false; }
    catch { return true; }
  }, fixture);
  assert.equal(denied, true);
  await owner.evaluate(async id => {
    const { promptAttributeRoll } = await import("/systems/heroes-of-legend/dialogs/attribute-roll.mjs");
    await game.settings.set("core", "messageMode", "blind");
    await promptAttributeRoll(game.actors.get(id), "knowledge");
  }, fixture.actor);
  const dialog = owner.locator(".hol-roll-dialog");
  const formula = await dialog.locator("output").innerText();
  await dialog.locator(".hol-reference-picker summary").click();
  await dialog.getByRole("searchbox", { name: "Find ability" }).fill("Winter");
  await dialog.getByRole("checkbox", { name: "Winter Hold", exact: true }).check();
  assert.equal(await dialog.locator("output").innerText(), formula);
  await mkdir("test-results", { recursive: true });
  await dialog.screenshot({ path: "test-results/reference-roll-selection.png" });
  await dialog.locator('[data-action="roll"]').click();
  await gm.waitForFunction(() => __hol134.messages.length === 3);
  const result = await gm.evaluate(() => {
    const message = game.messages.get(__hol134.messages[2]);
    return { id: message.id, blind: message.blind, whisper: message.whisper, roll: message.getFlag("heroes-of-legend", "roll") };
  });
  assert.equal(result.blind, true);
  assert(!result.whisper.includes(fixture.users[1]));
  assert.equal(result.roll.formula, formula);
  assert.equal(result.roll.references[0].itemUuid, fixture.itemUuid);
  await gm.locator(`[data-message-id="${result.id}"] .hol-roll-references`).waitFor();
  assert.equal(await gm.locator(`[data-message-id="${result.id}"] .hol-roll-references a`).getAttribute("data-uuid"), fixture.itemUuid);
  assert.equal(await other.evaluate(id => game.messages.get(id)?.isContentVisible === true, result.id), false);
  assert.equal(await other.locator(`[data-message-id="${result.id}"] .hol-roll-references`).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: owned sheet/list reference posts, exact identity and safe full text, owner denial, searchable roll reference with unchanged dice, blind privacy, zero page errors.");
} finally {
  try {
    if (fixture) await owner.evaluate(async () => game.settings.set("core", "messageMode", "public"));
    await gm.evaluate(async () => {
      const fixture = globalThis.__hol134; if (!fixture) return;
      if (fixture.hook) Hooks.off("createChatMessage", fixture.hook);
      for (const id of fixture.messages) if (game.messages.has(id)) await game.messages.get(id).delete();
      for (const id of fixture.actors) if (game.actors.has(id)) await game.actors.get(id).delete();
      for (const id of fixture.users) if (game.users.has(id)) await game.users.get(id).delete();
    });
    console.log("CLEANUP: exact fixture messages, Actor and users removed.");
  } catch (error) { console.error("CLEANUP FAILED", error); process.exitCode = 1; }
  await browser.close();
}
