import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
import { stableFoundryId } from "./content/item-packs.mjs";

const ID = "heroes-of-legend", url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an authorized isolated local world.");
const installed = process.env.HOL_TEST_INSTALLED_PACKAGE, artifacts = process.env.HOL_RELEASE_ARTIFACT_DIR;
if (!installed || !artifacts || (await lstat(installed)).isSymbolicLink())
  throw new Error("Specify an actual installed package directory and exact downloaded release-artifact directory.");
assert.equal(await realpath(installed), resolve(installed), "Installed package must not resolve through a worktree symlink.");
const archive = resolve(artifacts, "heroes-of-legend.zip"), zip = await readFile(archive),
  zipSha256 = createHash("sha256").update(zip).digest("hex");
assert((await readFile(resolve(artifacts, "SHA256SUMS"), "utf8")).split(/\r?\n/).includes(`${zipSha256}  heroes-of-legend.zip`));
const manifest = JSON.parse(execFileSync("unzip", ["-p", archive, "system.json"]));
assert.equal(manifest.id, ID);
assert.equal(manifest.version, "0.1.0", "Use the final unpublished 0.1.0 candidate.");
// Setup may persist its local transport URLs; runtime code must still be the exact ZIP's bytes.
for (const path of ["heroes-of-legend.mjs", "services/abilities.mjs", "services/potions.mjs", "services/player-attacks.mjs"])
  assert.deepEqual(await readFile(resolve(installed, path)), execFileSync("unzip", ["-p", archive, path]), `Installed ${path} differs from accepted artifact.`);
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], steps = [], clients = [];
let gm, owner, other, fixture, cleanup;
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
  });
  const page = await context.newPage();
  context.on("page", child => child.on("pageerror", error => errors.push(error.message)));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url); await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready && game.canvas.initialized && !game.canvas.loading);
  await page.evaluate(() => foundry.nue.Tour.activeTour?.exit());
  clients.push({ context, page });
  return page;
}
function passed(step) { steps.push(step); console.info(`PASS ${step}`); }
async function combat(kind, payload = {}) {
  return gm.evaluate(async ({ id, kind, payload }) => {
    const service = await import("/systems/heroes-of-legend/services/combat.mjs");
    return service.resolveCombatRequest((await service.requestCombat(game.combats.get(id), kind, payload)).id);
  }, { id: fixture.combat, kind, payload });
}
async function view(page) {
  await page.evaluate(async id => { await game.scenes.get(id).view(); }, fixture.scene);
  await page.waitForFunction(({ scene, tokens }) => canvas.scene?.id === scene && canvas.ready && !canvas.loading &&
    tokens.every(id => canvas.tokens.get(id)?.document.actor), { scene: fixture.scene, tokens: fixture.tokens.map(token => token.id) });
}
try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  assert.equal(await gm.evaluate(() => game.system.version), manifest.version);
  assert.deepEqual(await gm.evaluate(async () => {
    const counts = {};
    for (const name of ["abilities", "equipment", "creatures", "summons"]) counts[name] = (await game.packs.get(`heroes-of-legend.${name}`).getIndex()).size;
    return counts;
  }), { abilities: 350, equipment: 43, creatures: 192, summons: 73 });
  await gm.waitForFunction(() => game.settings.get("heroes-of-legend", "creationAuthorityClient") === game.socket.id);
  fixture = await gm.evaluate(async ids => {
    const ID = "heroes-of-legend", registry = globalThis.__hol121Core = { actors: [], users: [], scenes: [], combats: [], messages: [] };
    registry.hook = Hooks.on("createChatMessage", message => registry.messages.push(message.id));
    const users = [];
    for (const name of ["Journey Arin", "Journey Bera"]) {
      const user = await User.create({ name: `${name} ${foundry.utils.randomID(4)}`, role: CONST.USER_ROLES.PLAYER });
      registry.users.push(user.id); users.push({ id: user.id, name: user.name });
    }
    const copy = async (pack, id) => { const data = (await game.packs.get(`${ID}.${pack}`).getDocument(id)).toObject(); delete data._id; delete data.folder; return data; };
    const basic = await copy("abilities", ids.basic), shield = await copy("abilities", ids.shield),
      potion = await copy("abilities", ids.potion), reference = await copy("abilities", ids.reference),
      bottle = await copy("equipment", ids.bottle);
    bottle.system.inventoryDie = 4; bottle.system.quantity = 1;
    const spareBottle = foundry.utils.deepClone(bottle); spareBottle.name = "Free-play healing bottle";
    const actors = [];
    for (let index = 0; index < 2; index++) {
      const actor = await Actor.create({ name: index ? "Bera · journey" : "Arin · journey", type: "character",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, [users[index].id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        flags: { [ID]: { development: { creationSummary: { speedBase: 5 } } } },
        system: { health: { value: index ? 14 : 10, baseMax: 20 }, attributes: { brawn: { base: 2 }, fortitude: { base: 1 } } } });
      registry.actors.push(actor.id); actors.push(actor);
      await actor.createEmbeddedDocuments("Item", index ? [shield, { name: "Held shield", type: "equipment", system: {
        catalogId: "item-ordinary-shield", quantity: 1, bulk: 1, hands: 1, held: true } }] : [basic, potion, reference, bottle, spareBottle,
        { name: "Held sword", type: "equipment", system: { catalogId: "item-ordinary-melee-weapon", quantity: 1, bulk: 1, hands: 1, held: true } }]);
    }
    const dragon = await Actor.create({ ...await copy("creatures", "6822f0096090dbe5"), name: "Red Dragon · journey" });
    registry.actors.push(dragon.id); actors.push(dragon);
    const scene = await Scene.create({ name: "Installed core journey", active: false, width: 1600, height: 1000,
      grid: { type: 1, size: 100, distance: 1, units: "square" }, tokenVision: false, globalLight: true });
    registry.scenes.push(scene.id);
    const created = await scene.createEmbeddedDocuments("Token", actors.map((actor, index) => ({
      name: actor.name, actorId: actor.id, actorLink: true, x: index === 2 ? 200 : 100, y: index === 1 ? 300 : 200,
      width: actor.prototypeToken.width, height: actor.prototypeToken.height,
    })));
    const tokens = actors.map(actor => created.find(token => token.actorId === actor.id));
    if (tokens.some(token => !token)) throw new Error("Fixture token identities changed.");
    return { users, actors: actors.map(actor => actor.id), scene: scene.id,
      tokens: tokens.map(token => ({ id: token.id, uuid: token.uuid, actorUuid: token.actor.uuid })),
      basic: actors[0].items.find(item => item.getFlag(ID, "catalogId") === "ability-basic-melee").id,
      reference: actors[0].items.find(item => item.getFlag(ID, "catalogId") === "ability-winter-hold").uuid,
      potion: actors[0].items.find(item => item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion").id,
      spareBottle: actors[0].items.find(item => item.name === "Free-play healing bottle").id };
  }, { basic: stableFoundryId("ability-basic-melee"), shield: stableFoundryId("ability-shield-block"), potion: stableFoundryId("ability-use-a-healing-potion"), reference: stableFoundryId("ability-winter-hold"), bottle: stableFoundryId("item-lesser-healing-bottle") });
  assert.equal(await gm.evaluate(async id => {
    const image = game.actors.get(id).img, imageUrl = new URL(image, `${location.origin}/`);
    if (imageUrl.origin !== location.origin) throw new Error("Creature art unexpectedly requests an external host.");
    return (await fetch(imageUrl)).ok;
  }, fixture.actors[2]), true);
  await view(gm);
  fixture = { ...fixture, ...await gm.evaluate(async f => {
    const combat = await Combat.create({ scene: f.scene, active: true }); globalThis.__hol121Core.combats.push(combat.id);
    const created = await combat.createEmbeddedDocuments("Combatant", f.tokens.map((token, index) => ({
      actorId: f.actors[index], tokenId: token.id, sceneId: f.scene, flags: { "heroes-of-legend": { side: index === 2 ? "opposition" : "players" } },
    })));
    const participants = f.tokens.map(token => created.find(entry => entry.token?.uuid === token.uuid && entry.actor?.uuid === token.actorUuid)?.id);
    if (participants.some(id => !id)) throw new Error("Combatant identity mismatch.");
    return { combat: combat.id, participants };
  }, fixture) };
  owner = await join(fixture.users[0].name); other = await join(fixture.users[1].name);
  await view(owner); await view(other);
  // #15's ordinary equipment acquisition path: a native source copy, no manual raw Item construction.
  await owner.evaluate(async id => { await game.actors.get(id).sheet.render({ force: true }); }, fixture.actors[0]);
  await owner.locator(".hol-character [data-action=addEquipment]").click();
  const equipmentSource = `Compendium.heroes-of-legend.equipment.Item.${stableFoundryId("item-lesser-healing-bottle")}`;
  const equipmentDialog = owner.getByRole("dialog").filter({ has: owner.locator('[name="equipmentSourceUuid"]') });
  await equipmentDialog.locator('[name="equipmentSourceUuid"]').selectOption(equipmentSource);
  await equipmentDialog.getByRole("button", { name: "Add", exact: true }).click();
  await gm.waitForFunction(({ actor, source }) => game.actors.get(actor).items.some(item => item.getFlag("heroes-of-legend", "copySourceUuid") === source), { actor: fixture.actors[0], source: equipmentSource });
  assert.equal(await gm.evaluate(({ actor, source }) => {
    const copy = game.actors.get(actor).items.find(item => item.getFlag("heroes-of-legend", "copySourceUuid") === source);
    return copy.system.inventoryDie;
  }, { actor: fixture.actors[0], source: equipmentSource }), 4);
  assert.equal(await gm.evaluate(async ({ actor, source }) => {
    const copy = game.actors.get(actor).items.find(item => item.getFlag("heroes-of-legend", "copySourceUuid") === source), original = await fromUuid(source);
    return copy.system.quantity === original.system.quantity &&
      copy.system.catalogId === original.system.catalogId &&
      JSON.stringify(copy.getFlag("heroes-of-legend", "source")) === JSON.stringify(original.getFlag("heroes-of-legend", "source"));
  }, { actor: fixture.actors[0], source: equipmentSource }), true);
  passed("installed source compendium equipment copies through normal Add equipment control");
  await combat("start");
  const opening = await gm.evaluate(f => game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter").nextSide, fixture);
  if (opening === "opposition") { await combat("choose", { id: fixture.participants[2] }); await combat("finish"); }
  await combat("choose", { id: fixture.participants[0] });
  await owner.evaluate(async f => {
    canvas.tokens.setTargets([f.tokens[2].id]);
    await game.actors.get(f.actors[0]).items.get(f.basic).sheet.render({ force: true });
  }, fixture);
  await owner.locator(".hol-ability [data-action=useAbility]").click();
  const attack = owner.locator(".hol-player-attack");
  assert.equal(await attack.locator('select[name="targetTokenUuid"]').count(), 0);
  await attack.locator(".hol-reference-picker summary").click();
  const formula = await attack.locator("output").innerText();
  await attack.getByRole("checkbox", { name: "Winter Hold", exact: true }).check();
  assert.equal(await attack.locator("output").innerText(), formula);
  await attack.screenshot({ path: "test-results/installed-core-attack.png" });
  await attack.getByRole("button", { name: "Attack", exact: true }).click();
  await gm.waitForFunction(f => game.messages.some(message => message.getFlag("heroes-of-legend", "roll")?.targetTokenUuid === f.tokens[2].uuid), fixture);
  fixture.attack = await gm.evaluate(f => {
    const message = game.messages.find(message => message.getFlag("heroes-of-legend", "roll")?.targetTokenUuid === f.tokens[2].uuid);
    const roll = message.getFlag("heroes-of-legend", "roll");
    if (roll.references[0]?.itemUuid !== f.reference) throw new Error("Reference snapshot changed identity.");
    return message.id;
  }, fixture);
  passed("native player attack and optional owned reference reach authoritative roll");
  const expectedDragonHp = await gm.evaluate(f => {
    const actor = game.actors.get(f.actors[2]), card = game.messages.get(f.attack).getFlag("heroes-of-legend", "playerAttack");
    return actor.system.health.value - Math.max(1, card.damage - actor.system.armor);
  }, fixture);
  await gm.evaluate(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  for (let attempt = 0; attempt < 2; attempt++) {
    await gm.locator(`#chat [data-message-id="${fixture.attack}"] .hol-player-attack-damage`).click();
    await gm.locator(".hol-damage").getByRole("button", { name: "Apply damage once", exact: true }).click();
    if (attempt === 0) await gm.waitForFunction(({ actor, hp }) => game.actors.get(actor).system.health.value === hp, { actor: fixture.actors[2], hp: expectedDragonHp });
    else await gm.waitForFunction(() => game.messages.some(message => message.content.includes("This Basic Melee damage was already applied")));
    assert.equal(await gm.evaluate(id => game.actors.get(id).system.health.value, fixture.actors[2]), expectedDragonHp);
  }
  passed("linked player attack damage applies once despite repeating the review action");
  await combat("finish");
  const afterAttackSide = await gm.evaluate(f => game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter").nextSide, fixture);
  // If opposition opened, the dragon already acted this round; let Bera finish
  // the remaining ordinary turn before its next declaration.
  if (afterAttackSide === "players") { await combat("choose", { id: fixture.participants[1] }); await combat("finish"); }
  await combat("choose", { id: fixture.participants[2] });
  await gm.evaluate(async f => {
    canvas.tokens.setTargets(f.tokens.slice(0, 2).map(token => token.id));
    await game.actors.get(f.actors[2]).sheet.render({ force: true });
  }, fixture);
  const actionId = await gm.evaluate(f => game.actors.get(f.actors[2]).system.actions.entries.find(entry => entry.name === "Crushing bite").id, fixture);
  await gm.locator(`[data-action="creatureAction"][data-creature-action="${actionId}"]`).click();
  await gm.waitForFunction(({ actor, actionId }) => game.messages.some(message => message.getFlag("heroes-of-legend", "creatureAction")?.actorUuid === `Actor.${actor}` && message.getFlag("heroes-of-legend", "creatureAction")?.actionId === actionId), { actor: fixture.actors[2], actionId });
  fixture.creatureAttack = await gm.evaluate(({ f, actionId }) => {
    const message = game.messages.find(message => message.getFlag("heroes-of-legend", "creatureAction")?.actorUuid === `Actor.${f.actors[2]}` && message.getFlag("heroes-of-legend", "creatureAction")?.actionId === actionId);
    const card = message.getFlag("heroes-of-legend", "attackCard");
    if (JSON.stringify([...card.suggestedDefenderTokenUuids].sort()) !== JSON.stringify(f.tokens.slice(0, 2).map(token => token.uuid).sort())) throw new Error("Native target suggestions changed.");
    return message.id;
  }, { f: fixture, actionId });
  for (let attempt = 0; attempt < 2; attempt++) {
    // Arin's player deliberately rolls for Bera: any-player Defend remains available.
    await owner.evaluate(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
    await owner.locator(`#chat [data-message-id="${fixture.creatureAttack}"] .hol-defend-button`).click();
    const chooser = owner.locator(".hol-defender-choice");
    await chooser.locator('[name="defenderUuid"]').selectOption(fixture.tokens[1].uuid);
    await chooser.getByRole("button", { name: "Prepare defense", exact: true }).click();
    const defense = owner.locator(".hol-roll-dialog");
    assert.equal(await defense.locator('[name="attemptReason"], [name="additionalAttempt"]').count(), 0);
    if (attempt === 0) {
      await defense.getByRole("button", { name: "Use Shield Block", exact: true }).click();
      await defense.getByRole("alert").filter({ hasText: "activated" }).waitFor();
      await defense.screenshot({ path: "test-results/installed-core-defense.png" });
    }
    await defense.getByRole("button", { name: "Roll", exact: true }).click();
    await defense.waitFor({ state: "detached" });
    await gm.waitForFunction(({ id, count }) => game.messages.filter(message => message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id).length === count, { id: fixture.creatureAttack, count: attempt + 1 });
  }
  const defenses = await gm.evaluate(f => game.messages.filter(message => message.getFlag("heroes-of-legend", "roll")?.attackMessageId === f.creatureAttack).map(message => message.getFlag("heroes-of-legend", "roll")), fixture);
  assert.equal(defenses.length, 2);
  for (const result of defenses) {
    assert.equal(result.rollerId, fixture.users[0].id);
    assert.equal(result.actorUuid, fixture.tokens[1].actorUuid);
    assert.equal(result.attributeKey, "fortitude");
    assert.equal(result.attackOutcome.resolution, "reference");
    assert.equal(Object.hasOwn(result.attackOutcome, "damage"), false);
    assert.equal(result.sources.filter(source => source.label === "Shield Block").length, 1);
  }
  passed("native two-target creature card, any-player defense, Shield Block and fresh repeat");
  // Printed specialty outcomes stay manual; apply a separate explicit physical hit through the normal DA UI.
  await gm.evaluate(async f => { await game.actors.get(f.actors[1]).sheet.render({ force: true }); }, fixture);
  await gm.locator(".hol-character [data-action=damage]").click();
  const damage = gm.locator(".hol-damage");
  await damage.locator("[data-damage-type=physical] [name=amount]").fill("4");
  assert.equal(await damage.locator("[name=reason]").inputValue(), "");
  await damage.locator("[data-action=apply]").click();
  await gm.waitForFunction(f => game.actors.get(f.actors[1]).system.health.value === 10, fixture);
  await gm.evaluate(async f => {
    const service = await import("/systems/heroes-of-legend/services/conditions.mjs"), actor = game.actors.get(f.actors[1]);
    await service.resolveConditionRequest((await service.requestCondition(actor, "add", { key: "burning", rating: 1, persistence: "temporary", source: "Installed core fixture" })).id);
  }, fixture);
  await combat("finish"); await combat("choose", { id: fixture.participants[1] }); await combat("finish");
  assert.equal(await gm.evaluate(f => game.actors.get(f.actors[1]).system.health.value, fixture), 9);
  passed("DA damage without prose and ordinary single-condition turn completion");
  // Start Arin's next ordinary turn. The encounter handles the intervening opposition side.
  const state = await gm.evaluate(f => game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter"), fixture);
  if (state.nextSide === "opposition") { await combat("choose", { id: fixture.participants[2] }); await combat("finish"); }
  await combat("choose", { id: fixture.participants[0] });
  await owner.evaluate(async f => {
    canvas.tokens.setTargets([f.tokens[1].id]);
    const { openPotionPreparation } = await import("/systems/heroes-of-legend/applications/potions.mjs");
    await openPotionPreparation(game.actors.get(f.actors[0]).items.get(f.potion), { bottleItemUuid: game.actors.get(f.actors[0]).items.find(item => item.system.catalogId === "item-lesser-healing-bottle" && item.id !== f.spareBottle).uuid });
  }, fixture);
  const preparation = owner.locator(".hol-potion-preparation");
  await preparation.locator("[data-action=submit]").click();
  await other.evaluate(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  await other.locator("#chat .hol-potion-consent").last().click();
  await gm.waitForFunction(f => Object.values(game.combats.get(f.combat).getFlag("heroes-of-legend", "potionOperations") ?? {}).some(operation => operation.status === "complete"), fixture);
  fixture.potionRequest = await gm.evaluate(f => Object.values(game.combats.get(f.combat).getFlag("heroes-of-legend", "potionOperations")).find(operation => operation.status === "complete").requestId, fixture);
  assert.equal(await gm.evaluate(f => game.actors.get(f.actors[1]).system.health.value, fixture), 15);
  passed("other-player healing-potion consent with encounter receipt");
  await gm.evaluate(async f => { await game.combats.get(f.combat).update({ active: false }); }, fixture);
  await owner.waitForFunction(() => !game.combat?.active);
  await owner.evaluate(async f => {
    canvas.tokens.setTargets([]);
    const { openPotionPreparation } = await import("/systems/heroes-of-legend/applications/potions.mjs");
    await openPotionPreparation(game.actors.get(f.actors[0]).items.get(f.spareBottle));
  }, fixture);
  await owner.locator(".hol-potion-preparation [data-action=submit]").click();
  await gm.waitForFunction(f => game.actors.get(f.actors[0]).system.health.value === 16, fixture);
  passed("out-of-combat self potion without artificial encounter");
  cleanup = await gm.evaluate(() => {
    const registry = globalThis.__hol121Core;
    Hooks.off("createChatMessage", registry.hook);
    return { actors: registry.actors, users: registry.users, scenes: registry.scenes, combats: registry.combats, messages: registry.messages };
  });
  const before = await gm.evaluate(f => ({ hp: f.actors.map(id => game.actors.get(id).system.health.value),
    dice: game.messages.get(f.attack).rolls[0].toJSON(), encounter: game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter"),
    potion: game.combats.get(f.combat).getFlag("heroes-of-legend", "potionOperations")[f.potionRequest] }), fixture);
  await gm.reload(); await gm.waitForFunction(() => globalThis.game?.ready);
  await gm.waitForFunction(() => game.settings.get("heroes-of-legend", "creationAuthorityClient") === game.socket.id);
  const replay = await gm.evaluate(async f => {
    const { resolvePlayerBasicMeleeRequest } = await import("/systems/heroes-of-legend/services/player-attacks.mjs"),
      { resolvePotionRequest } = await import("/systems/heroes-of-legend/services/potions.mjs");
    return { attack: await resolvePlayerBasicMeleeRequest(f.attack), potion: await resolvePotionRequest(f.potionRequest, `Combat.${f.combat}`) };
  }, fixture);
  assert.equal(replay.potion.replay, true);
  assert.equal(replay.attack.replay, true);
  const after = await gm.evaluate(f => ({ hp: f.actors.map(id => game.actors.get(id).system.health.value),
    dice: game.messages.get(f.attack).rolls[0].toJSON(), encounter: game.combats.get(f.combat).getFlag("heroes-of-legend", "encounter"),
    potion: game.combats.get(f.combat).getFlag("heroes-of-legend", "potionOperations")[f.potionRequest] }), fixture);
  assert.deepEqual(after, before);
  passed("reload and same-operation attack/potion replay preserve dice, HP and receipts");
  await owner.evaluate(async id => { await game.actors.get(id).sheet.render({ force: true }); }, fixture.actors[0]);
  for (const theme of ["light", "dark"]) {
    await owner.evaluate(async ({ id, theme }) => {
      const themes = foundry.utils.deepClone(game.settings.get("core", "sheetThemes"));
      (themes.documents ??= {})[`Actor.${id}`] = theme;
      await game.settings.set("core", "sheetThemes", themes);
      await game.actors.get(id).sheet.close(); await game.actors.get(id).sheet.render({ force: true });
    }, { id: fixture.actors[0], theme });
    assert.equal(await owner.locator(`.hol-character.theme-${theme}`).count(), 1);
    await owner.locator(".hol-character").screenshot({ path: `test-results/installed-core-${theme}.png` });
  }
  await owner.setViewportSize({ width: 820, height: 900 });
  await owner.evaluate(id => game.actors.get(id).sheet.setPosition({ width: 600, height: 760 }), fixture.actors[0]);
  await owner.locator(".hol-character").screenshot({ path: "test-results/installed-core-narrow.png" });
  const popupPromise = owner.waitForEvent("popup");
  await owner.evaluate(async id => { await game.actors.get(id).sheet.detachWindow(); }, fixture.actors[0]);
  const popup = await popupPromise;
  await popup.locator(".hol-character").waitFor();
  await popup.screenshot({ path: "test-results/installed-core-detached.png" });
  await popup.close();
  passed("light/dark, narrow and native detached sheet screenshots captured for visual review");
  assert.deepEqual(errors, []);
  await writeFile("test-results/installed-core-evidence.json", JSON.stringify({ version: manifest.version, zipSha256,
    installed: resolve(installed), foundry: await gm.evaluate(() => game.version), steps, screenshotsRequireVisualReview: true, publicUrlsTested: false }, null, 2) + "\n");
} finally {
  if (gm && !gm.isClosed()) {
    const registry = cleanup ?? await gm.evaluate(() => {
      const registry = globalThis.__hol121Core;
      if (!registry) return null;
      Hooks.off("createChatMessage", registry.hook);
      return { actors: registry.actors, users: registry.users, scenes: registry.scenes, combats: registry.combats, messages: registry.messages };
    }).catch(() => null);
    if (registry) {
      try {
        const removed = await gm.evaluate(async registry => {
          for (const [kind, collection] of [["messages", game.messages], ["combats", game.combats], ["scenes", game.scenes], ["actors", game.actors], ["users", game.users]]) {
            for (const id of registry[kind]) await collection.get(id)?.delete();
            if (registry[kind].some(id => collection.has(id))) throw new Error(`Fixture ${kind} remain.`);
          }
          return Object.fromEntries(Object.entries(registry).map(([kind, ids]) => [kind, ids.length]));
        }, registry);
        console.info("Cleanup verified:", JSON.stringify(removed));
      } catch (error) { console.error("Fixture cleanup failed:", error); process.exitCode = 1; }
    }
  }
  await browser.close();
}
