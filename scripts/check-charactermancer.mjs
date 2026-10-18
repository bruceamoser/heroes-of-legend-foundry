import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1") throw new Error("Use an authorized isolated local world.");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const gm = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const owner = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
for (const page of [gm, owner]) page.on("pageerror", error => errors.push(error.message));
let fixture;
async function login(page, name) {
  await page.goto(url); await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready && game.canvas.initialized && !game.canvas.loading);
}
async function action(wizard, name) {
  await wizard.getByRole("button", { name, exact: true }).click();
  await owner.waitForFunction(() => !globalThis.holWizard?.busy);
}
async function drop(id, { invalid = false, type = "Item" } = {}) {
  const before = await owner.evaluate(() => ({ draft: JSON.stringify(holWizard.draft), revision: holWizard.revision, warnings: __hol137Warnings.length }));
  await owner.evaluate(({ id, type }) => {
    const choice = holWizard.catalogs.choices.find(record => record.id === id);
    const data = new DataTransfer();
    data.setData("text/plain", JSON.stringify({ type, uuid: `Compendium.heroes-of-legend.abilities.Item.${choice?.foundryId ?? "unsupported"}` }));
    holWizard.element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { id, type });
  if (invalid) {
    await owner.waitForFunction(count => __hol137Warnings.length > count, before.warnings);
    assert.deepEqual(await owner.evaluate(() => ({ draft: JSON.stringify(holWizard.draft), revision: holWizard.revision })), { draft: before.draft, revision: before.revision });
  } else {
    await owner.waitForFunction(revision => holWizard.revision > revision && !holWizard.busy, before.revision);
  }
}
try {
  await mkdir("test-results", { recursive: true });
  await login(gm, "Gamemaster");
  fixture = await gm.evaluate(async () => {
    const registry = globalThis.__hol137 = { actors: [], users: [], scenes: [], messages: [], hook: null, bound: false, previousScene: game.scenes.viewed?.id };
    if (game.settings.get("heroes-of-legend", "creationAuthorityClient")) throw new Error("Expected unbound coordinator.");
    if (game.users.some(user => user.name === "HOL137 Owner")) throw new Error("Refusing existing fixture user.");
    const { bindCreationAuthority } = await import("/systems/heroes-of-legend/services/creation.mjs");
    await bindCreationAuthority(); registry.bound = true;
    const user = await User.create({ name: "HOL137 Owner", role: 1 }); registry.users.push(user.id);
    const actor = await Actor.create({ name: "HOL137 blank hero", type: "character", ownership: { default: 0, [user.id]: 3 } }); registry.actors.push(actor.id);
    registry.hook = Hooks.on("createChatMessage", message => {
      const flags = message.flags["heroes-of-legend"] ?? {};
      if (["creationRequest", "developmentRequest", "equipmentRequest"].some(key => flags[key]?.actorUuid === actor.uuid)) registry.messages.push(message.id);
    });
    return { actor: actor.id, user: user.id };
  });
  await login(owner, "HOL137 Owner");
  await owner.evaluate(async id => {
    globalThis.__hol137Warnings = [];
    const warn = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (message, options) => { __hol137Warnings.push(message); return warn(message, options); };
    const { CreationWizard } = await import("/systems/heroes-of-legend/applications/creation.mjs");
    globalThis.holWizard = new CreationWizard(game.actors.get(id)); await holWizard.render({ force: true });
  }, fixture.actor);
  let wizard = owner.locator(".hol-creation");
  await drop("ability-conditioned-body", { invalid: true }); // Wrong creation step.
  await wizard.locator("[name=heroName]").fill("HOL137 Reed");
  for (const key of ["brawn", "knowledge", "reason"]) await wizard.locator(`[name=attribute-${key}]`).fill("1");
  await action(wizard, "Save and continue");
  await wizard.locator("[name=ancestryId]").selectOption("ancestry-human"); await action(wizard, "Save choices");
  for (const id of ["trait-human-weathered", "trait-human-far-walker"]) await wizard.locator(`[name=trait][value=${id}]`).check();
  await wizard.locator("[name=homeLanguage][value=dwarven]").check(); await action(wizard, "Save and continue");
  await wizard.locator("[name=culture]").selectOption("origin-culture-deep-halls|0");
  await wizard.locator("[name=background]").selectOption("origin-background-bridge-worker|0"); await action(wizard, "Save and continue");
  for (const id of ["recipe-travel-food", "recipe-bound-torches"]) await wizard.locator(`[name="recipes-ability-trail-workshop"][value=${id}]`).check();
  await action(wizard, "Save choices");
  const ineligible = wizard.locator('[data-id="ability-the-cleverest-mixture"]');
  assert(await ineligible.isDisabled());
  assert.match(await ineligible.locator("..").textContent(), /Requires level 7/);
  assert.equal(await wizard.locator(".hol-choice-list [data-action=addPurchase]").first().isEnabled(), true);
  await drop("ability-the-cleverest-mixture", { invalid: true });
  await drop("ability-conditioned-body", { invalid: true, type: "Actor" });
  await drop("ability-conditioned-body");
  assert.equal(await owner.evaluate(() => holWizard.draft.purchases[0].filter(purchase => purchase.id === "ability-conditioned-body").length), 1);
  await action(wizard, "Origins"); await action(wizard, "Level 0 learning");
  assert.equal(await owner.evaluate(() => holWizard.draft.purchases[0].length), 1);
  await owner.reload(); await owner.waitForFunction(() => globalThis.game?.ready && game.canvas.initialized && !game.canvas.loading);
  await owner.evaluate(async id => { const { CreationWizard } = await import("/systems/heroes-of-legend/applications/creation.mjs"); globalThis.holWizard = new CreationWizard(game.actors.get(id)); await holWizard.render({ force: true }); }, fixture.actor);
  assert.equal(await owner.evaluate(() => holWizard.draft.purchases[0].length), 1);
  await action(wizard, "Save and continue");
  await wizard.locator("[name=classId][value=class-intellect]").check(); await action(wizard, "Save choices");
  for (const id of ["discipline-craft", "discipline-scholarship"]) await wizard.locator(`[name=classDiscipline][value=${id}]`).check();
  await wizard.locator("[name=signatureId]").selectOption("ability-signature-intellect-spot-the-leverage"); await action(wizard, "Save and continue");
  await action(wizard, "Add Conditioned Body"); await action(wizard, "Save and continue");
  await action(wizard, "Add Travel Pack"); await action(wizard, "Add Ordinary Melee Weapon"); await action(wizard, "Save and continue");
  await wizard.getByText("All creation choices are valid.", { exact: true }).waitFor();
  await wizard.screenshot({ path: "test-results/charactermancer-creation-review.png" });
  await action(wizard, "Create this character");
  await gm.waitForFunction(id => game.actors.get(id).getFlag("heroes-of-legend", "creationReceipt")?.status === "complete", fixture.actor);
  const created = await gm.evaluate(id => {
    const actor = game.actors.get(id);
    return { hp: actor.system.health.baseMax, items: actor.items.size, meleeId: actor.items.find(item => item.system.catalogId === "item-ordinary-melee-weapon")?.id };
  }, fixture.actor);
  assert.equal(created.hp, 19); assert(created.meleeId);
  await owner.evaluate(async id => { const { EquipmentPanel } = await import("/systems/heroes-of-legend/applications/equipment.mjs"); await new EquipmentPanel(game.actors.get(id)).render({ force: true }); }, fixture.actor);
  await owner.locator(`.hol-hands [data-equipment-id="${created.meleeId}"] [name=held]`).check();
  await owner.locator('.hol-hands [data-action="save"]').click();
  await gm.waitForFunction(({ actor, item }) => game.actors.get(actor).items.get(item).system.held, { actor: fixture.actor, item: created.meleeId });
  await gm.evaluate(async id => {
    const scene = await Scene.create({ name: "HOL137 placement", active: false, width: 1600, height: 1200, padding: 0, grid: { size: 100, distance: 5, units: "ft" } });
    __hol137.scenes.push(scene.id);
    await new Promise(resolve => setTimeout(resolve, 2100)); await scene.view();
    if (canvas.scene.id !== scene.id || canvas.loading) throw new Error("Fixture scene not ready.");
    const data = new DataTransfer(); data.setData("text/plain", JSON.stringify({ type: "Actor", uuid: `Actor.${id}` }));
    const board = document.querySelector("#board"), box = board.getBoundingClientRect();
    board.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
  }, fixture.actor);
  await gm.waitForFunction(id => game.scenes.get(__hol137.scenes[0]).tokens.some(token => token.actorId === id), fixture.actor);
  await gm.evaluate(async id => {
    const actor = game.actors.get(id); await actor.update({ "system.health.value": 3, "system.grit.spent": 1 });
    const { requestDevelopment, resolveDevelopmentRequest } = await import("/systems/heroes-of-legend/services/advancement.mjs");
    const award = await requestDevelopment(actor, "award", { level: 2 }); await resolveDevelopmentRequest(award.id); await resolveDevelopmentRequest(award.id);
    const repeated = await requestDevelopment(actor, "award", { level: 2 }); await resolveDevelopmentRequest(repeated.id);
    const safe = await requestDevelopment(actor, "safePlace", { approved: true }); await resolveDevelopmentRequest(safe.id);
  }, fixture.actor);
  assert.deepEqual(await gm.evaluate(id => { const actor = game.actors.get(id), state = actor.getFlag("heroes-of-legend", "development"); return { dp: state.dp, awards: state.awards.length, hp: actor.system.health.value, spent: actor.system.grit.spent }; }, fixture.actor), { dp: 10, awards: 1, hp: 3, spent: 1 });
  await owner.evaluate(async id => { const { AdvancementWizard } = await import("/systems/heroes-of-legend/applications/advancement.mjs"); globalThis.holWizard = new AdvancementWizard(game.actors.get(id)); await holWizard.render({ force: true }); globalThis.__hol137Warnings = []; const warn = ui.notifications.warn.bind(ui.notifications); ui.notifications.warn = (message, options) => { __hol137Warnings.push(message); return warn(message, options); }; }, fixture.actor);
  wizard = owner.locator(".hol-advancement");
  await drop("ability-the-cleverest-mixture", { invalid: true }); await drop("ability-conditioned-body"); await drop("ability-anatomy-of-an-opening");
  const weapons = wizard.locator('[name="weapon-ability-anatomy-of-an-opening"]');
  assert.deepEqual(await weapons.locator("option").allTextContents(), ["Choose equipment", "Unarmed", "Ordinary Melee Weapon"]);
  await weapons.selectOption("melee"); await wizard.locator('[name="hands-ability-anatomy-of-an-opening"]').selectOption("1");
  await action(wizard, "Save draft");
  await wizard.screenshot({ path: "test-results/charactermancer-advancement-review.png" });
  const draftId = await owner.evaluate(() => holWizard.draftId);
  await action(wizard, "Commit reviewed advancement");
  await gm.waitForFunction(({ actor, draft }) => game.actors.get(actor).getFlag("heroes-of-legend", "development").commitReceipts?.[draft]?.status === "complete", { actor: fixture.actor, draft: draftId });
  const advanced = await gm.evaluate(id => { const actor = game.actors.get(id), state = actor.getFlag("heroes-of-legend", "development"); return { hp: actor.system.health.value, maximum: actor.system.health.baseMax, spent: actor.system.grit.spent, dp: state.dp, awards: state.awards.length, weapons: actor.items.filter(item => item.system.catalogId === "item-ordinary-melee-weapon").length }; }, fixture.actor);
  assert.deepEqual(advanced, { hp: 3, maximum: 21, spent: 1, dp: 6, awards: 1, weapons: 1 });
  await gm.evaluate(async () => { const { resolveDevelopmentRequest } = await import("/systems/heroes-of-legend/services/advancement.mjs"); const message = __hol137.messages.map(id => game.messages.get(id)).find(message => message.getFlag("heroes-of-legend", "developmentRequest")?.kind === "commitDraft"); await resolveDevelopmentRequest(message.id); });
  assert.deepEqual(errors, []);
  console.log("PASS: continuous owner blank creation, legal-first disabled choices, eligible/ineligible/unsupported DOM drops, backtracking/reload, normal commit, equip, native Token placement, one advancement, readable weapon labels, unchanged current HP/spent Grit, exactly-once milestone and equipment grants.");
} finally {
  try {
    await gm.evaluate(async () => {
      const registry = globalThis.__hol137; if (!registry) return;
      if (registry.bound) { const { releaseAuthority } = await import("/systems/heroes-of-legend/services/authority.mjs"); await releaseAuthority(); }
      if (registry.hook) Hooks.off("createChatMessage", registry.hook);
      if (registry.scenes.length) { await new Promise(resolve => setTimeout(resolve, 2100)); if (registry.previousScene && game.scenes.has(registry.previousScene)) await game.scenes.get(registry.previousScene).view(); else if (canvas.scene) await canvas.tearDown(); }
      for (const id of registry.messages) if (game.messages.has(id)) await game.messages.get(id).delete();
      for (const id of registry.scenes) if (game.scenes.has(id)) await game.scenes.get(id).delete();
      for (const id of registry.actors) if (game.actors.has(id)) await game.actors.get(id).delete();
      for (const id of registry.users) if (game.users.has(id)) await game.users.get(id).delete();
    });
    console.log("CLEANUP: exact fixture messages, scenes, Actor and owner removed; coordinator released.");
  } catch (error) { console.error("CLEANUP FAILED", error); process.exitCode = 1; }
  await browser.close();
}
