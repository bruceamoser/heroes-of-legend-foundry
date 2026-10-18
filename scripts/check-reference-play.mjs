import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { stableFoundryId } from "./content/item-packs.mjs";
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
  await page.waitForFunction(() => globalThis.game?.ready && game.canvas.initialized && !game.canvas.loading);
}
let fixture;
try {
  await login(gm, "Gamemaster");
  fixture = await gm.evaluate(async (equipmentId) => {
    const fixture = globalThis.__hol134 = { actors: [], items: [], users: [], messages: [], hook: null };
    if (game.users.some(user => ["HOL134 Owner", "HOL134 Other"].includes(user.name)))
      throw new Error("Refusing existing fixture users.");
    for (const name of ["HOL134 Owner", "HOL134 Other"]) {
      const user = await User.create({ name, role: 1 }); fixture.users.push(user.id);
    }
    const actor = await Actor.create({ name: "HOL134 reference hero", type: "character", ownership: { default: 0, [fixture.users[0]]: 3 } });
    fixture.actors.push(actor.id);
    const equipmentSource = await game.packs.get("heroes-of-legend.equipment").getDocument(equipmentId),
      worldData = equipmentSource.toObject();
    delete worldData._id;
    worldData.name = "HOL15 world bottle";
    worldData.system.quantity = 3;
    worldData.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
    const worldItem = await Item.create(worldData); fixture.items.push(worldItem.id);
    const foreign = await Actor.create({ name: "HOL15 other inventory", type: "character", ownership: { [fixture.users[0]]: 3 } });
    fixture.actors.push(foreign.id);
    await foreign.createEmbeddedDocuments("Item", [equipmentSource.toObject()]);
    const foreignItem = foreign.items.find(item => item.system.catalogId === equipmentSource.system.catalogId);
    const { safeReferenceHTML } = await import("/systems/heroes-of-legend/services/reference-play.mjs");
    const clean = safeReferenceHTML('<h2>Preserved heading</h2><p onclick="alert(1)">safe</p><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a><section class="secret">hidden secret</section><a href="https://example.com/source">source</a>');
    if (/onclick|<script|javascript:|hidden secret/.test(clean) || !clean.includes("Preserved heading") || !clean.includes("https://example.com/source")) throw new Error("Unsafe or incomplete reference HTML");
    const response = await fetch("/systems/heroes-of-legend/data/choices.json");
    const choices = await response.json();
    const record = choices.records.find(record => record.id === "ability-winter-hold");
    const source = await game.packs.get("heroes-of-legend.abilities").getDocument(record.foundryId);
    const data = source.toObject(); delete data._id;
    data.system.description += '<p onclick="alert(1)">Safe text</p><script>throw new Error("HOL134 injection")</script><a href="javascript:alert(1)">unsafe link</a><section class="secret">HOL134 unrevealed secret</section>';
    await actor.createEmbeddedDocuments("Item", [data]);
    const item = actor.items.find(item => item.getFlag("heroes-of-legend", "catalogId") === record.id);
    fixture.hook = Hooks.on("createChatMessage", message => {
      if (message.getFlag("heroes-of-legend", "roll")?.actorUuid === actor.uuid ||
          message.getFlag("heroes-of-legend", "abilityReference")?.itemUuid === item.uuid)
        fixture.messages.push(message.id);
    });
    return { actor: actor.id, item: item.id, itemUuid: item.uuid, compendiumUuid: source.uuid, equipmentUuid: equipmentSource.uuid,
      equipmentSource: equipmentSource.getFlag("heroes-of-legend", "source"),
      worldItemUuid: worldItem.uuid, worldItemId: worldItem.id, foreignItemUuid: foreignItem.uuid,
      users: [...fixture.users] };
  }, stableFoundryId("item-lesser-healing-bottle"));
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
  // Basic inventory drops and their click alternative use the same live native copy path.
  await owner.evaluate(id => game.actors.get(id).sheet.setPosition({ left: 10, top: 40, width: 600 }), fixture.actor);
  async function inventoryDrop(uuid) {
    await owner.evaluate((uuid) => {
      const transfer = new DataTransfer(); transfer.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
      document.querySelector(".hol-character").dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, uuid);
  }
  await inventoryDrop(fixture.equipmentUuid);
  await owner.waitForFunction(({ actor, equipmentUuid }) => game.actors.get(actor).items.some(item =>
    item.getFlag("heroes-of-legend", "copySourceUuid") === equipmentUuid), fixture);
  await owner.locator('.hol-character [data-action="addEquipment"]').click();
  const addDialog = owner.getByRole("dialog").filter({ has: owner.locator('select[name="equipmentSourceUuid"]') });
  await addDialog.locator('select[name="equipmentSourceUuid"]').selectOption(fixture.worldItemUuid);
  await addDialog.getByRole("button", { name: "Add", exact: true }).click();
  await owner.waitForFunction(({ actor, worldItemUuid }) => game.actors.get(actor).items.some(item =>
    item.getFlag("heroes-of-legend", "copySourceUuid") === worldItemUuid), fixture);
  const copied = await owner.evaluate(({ actor, equipmentUuid, worldItemUuid }) => {
    const items = game.actors.get(actor).items;
    const result = (uuid) => {
      const item = items.find(item => item.getFlag("heroes-of-legend", "copySourceUuid") === uuid);
      return { id: item.id, quantity: item.system.quantity, die: item.system.inventoryDie,
        source: item.getFlag("heroes-of-legend", "source"), uuid: item.uuid };
    };
    return { catalog: result(equipmentUuid), world: result(worldItemUuid), ids: items.map(item => item.id).sort() };
  }, fixture);
  assert.equal(copied.catalog.quantity, 1); assert.equal(copied.catalog.die, 4);
  assert.equal(copied.world.quantity, 3); assert.equal(copied.world.die, 4);
  assert.deepEqual(copied.catalog.source, fixture.equipmentSource);
  assert.deepEqual(copied.world.source, fixture.equipmentSource);
  assert.notEqual(copied.world.id, fixture.worldItemId);
  await owner.locator(`.hol-character [data-item-id="${copied.world.id}"]`).dragTo(
    owner.locator(`.hol-character [data-item-id="${copied.catalog.id}"]`));
  assert.deepEqual(await owner.evaluate(id => game.actors.get(id).items.map(item => item.id).sort(), fixture.actor), copied.ids);
  await inventoryDrop(fixture.foreignItemUuid);
  await owner.waitForFunction(() => document.querySelector("#notifications")?.textContent.includes("explicit transfer"));
  assert.deepEqual(await owner.evaluate(id => game.actors.get(id).items.map(item => item.id).sort(), fixture.actor), copied.ids);

  // An ability drop opens learning instead of embedding/free-buying the catalog card.
  await inventoryDrop(fixture.compendiumUuid);
  await owner.locator(".hol-creation").waitFor();
  await owner.locator('.hol-creation [name="heroName"]').fill("Keep this unsaved name");
  await inventoryDrop(fixture.compendiumUuid);
  await owner.waitForFunction(({ actor }) => [...foundry.applications.instances.values()].some(app =>
    app.actor?.id === actor && app.draft?.name === "Keep this unsaved name" && app.step === 0), fixture);
  assert.deepEqual(await owner.evaluate(id => game.actors.get(id).items.map(item => item.id).sort(), fixture.actor), copied.ids);
  await owner.evaluate(async id => {
    for (const app of foundry.applications.instances.values())
      if (app.actor?.id === id && app.draft) await app.close();
  }, fixture.actor);
  await owner.locator(".hol-creation").waitFor({ state: "detached" });
  console.log("PASS: native equipment catalog drop, world-copy click alternative, source/quantity/supply, sorting, transfer refusal and draft-preserving ability learning route.");
  await owner.evaluate(async id => {
    const { promptAttributeRoll } = await import("/systems/heroes-of-legend/dialogs/attribute-roll.mjs");
    await game.settings.set("core", "messageMode", "blind");
    const actor = game.actors.get(id);
    actor.sheet.setPosition({ left: 10, top: 40, width: 500 });
    globalThis.__holReferenceDropDialog = await promptAttributeRoll(actor, "knowledge");
    __holReferenceDropDialog.setPosition({ left: 650, top: 40, width: 600 });
    await __holReferenceDropDialog.render({ force: true });
    await __holReferenceDropDialog.render({ force: true });
  }, fixture.actor);
  const dialog = owner.locator(".hol-roll-dialog");
  const formula = await dialog.locator("output").innerText();
  await owner.evaluate(({ compendiumUuid }) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: compendiumUuid }));
    document.querySelector(".hol-roll-dialog").dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, fixture);
  await owner.waitForFunction(() => document.querySelector(".hol-roll-dialog [data-reference-drop-status]")?.textContent.includes("Compendium drops cannot grant"));
  assert.equal(await dialog.locator("[data-reference-id]").isChecked(), false);
  await owner.locator(`.hol-character [data-item-id="${fixture.item}"]`).dragTo(dialog);
  await owner.waitForFunction(() => document.querySelector(".hol-roll-dialog [data-reference-id]")?.checked === true);
  await dialog.getByRole("searchbox", { name: "Find ability" }).fill("Winter");
  assert.equal(await dialog.getByRole("checkbox", { name: "Winter Hold", exact: true }).isChecked(), true);
  // The existing keyboard/click selector remains equivalent to the drop.
  await dialog.getByRole("checkbox", { name: "Winter Hold", exact: true }).uncheck();
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
  await gm.evaluate(() => ui.sidebar.changeTab("chat", "primary"));
  await gm.locator(`#chat [data-message-id="${result.id}"] .hol-roll-references`).waitFor();
  assert.equal(await gm.locator(`#chat [data-message-id="${result.id}"] .hol-roll-references a`).getAttribute("data-uuid"), fixture.itemUuid);
  assert.equal(await other.evaluate(id => game.messages.get(id)?.isContentVisible === true, result.id), false);
  assert.equal(await other.locator(`[data-message-id="${result.id}"] .hol-roll-references`).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: owned sheet/list reference posts, exact identity and safe full text, owner denial, native reference drop after rerender, rejected compendium drop, searchable/click reference with unchanged dice, blind privacy, zero page errors.");
} finally {
  try {
    if (fixture) await owner.evaluate(async () => game.settings.set("core", "messageMode", "public"));
    await gm.evaluate(async () => {
      const fixture = globalThis.__hol134; if (!fixture) return;
      if (fixture.hook) Hooks.off("createChatMessage", fixture.hook);
      for (const id of fixture.messages) if (game.messages.has(id)) await game.messages.get(id).delete();
      for (const id of fixture.actors) if (game.actors.has(id)) await game.actors.get(id).delete();
      for (const id of fixture.items) if (game.items.has(id)) await game.items.get(id).delete();
      for (const id of fixture.users) if (game.users.has(id)) await game.users.get(id).delete();
    });
    console.log("CLEANUP: exact fixture messages, Actor and users removed.");
  } catch (error) { console.error("CLEANUP FAILED", error); process.exitCode = 1; }
  await browser.close();
}
