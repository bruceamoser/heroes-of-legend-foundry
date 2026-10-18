import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || process.env.HOL_TEST_ALLOW_WRITES !== "1")
  throw new Error("Use an authorized disposable local world.");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let gm, player, fixture;
async function join(name, canvas = false) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await context.addInitScript(canvas => {
    localStorage.setItem("core.noCanvas", String(!canvas));
    localStorage.setItem("core.maxFPS", "10");
  }, canvas);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  if (canvas) await page.waitForFunction(() => game.canvas.initialized && !game.canvas.loading);
  return { context, page };
}
try {
  gm = await join("Gamemaster", true);
  fixture = await gm.page.evaluate(async () => {
    const track = globalThis.hol138Fixture = { actors: [], users: [], scenes: [], combats: [], messages: [] };
    const user = await User.create({ name: `Creature actions ${foundry.utils.randomID(5)}`, role: CONST.USER_ROLES.PLAYER });
    track.users.push(user.id);
    const source = await game.packs.get("heroes-of-legend.creatures").getDocument("6822f0096090dbe5");
    const data = source.toObject();
    delete data._id; delete data.folder;
    const dragon = await Actor.create({ ...data, name: "Reference Red Dragon" });
    track.actors.push(dragon.id);
    if (JSON.stringify(dragon.system.actions.entries) !== JSON.stringify(source.system.actions.entries))
      throw new Error("Native import changed typed creature actions.");
    const defenders = [];
    for (let i = 0; i < 2; i++) {
      const actor = await Actor.create({ name: `Reference defender ${i}`, type: "character",
        system: { attributes: { agility: { base: 0 }, fortitude: { base: 2 } } } });
      track.actors.push(actor.id); defenders.push(actor);
    }
    const scene = await Scene.create({ name: "Creature reference actions", active: false, width: 1200, height: 800,
      grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 1, units: "square" } });
    track.scenes.push(scene.id);
    const createdTokens = await scene.createEmbeddedDocuments("Token", defenders.map((actor, i) => ({
      name: actor.name, actorId: actor.id, actorLink: true, x: 200 + i * 200, y: 200,
    })));
    const tokens = defenders.map(actor => createdTokens.find(token => token.actorId === actor.id));
    if (tokens.some(token => !token)) throw new Error("Created defender token identity mismatch.");
    await scene.view();
    for (const token of tokens) canvas.tokens.get(token.id).setTarget(true, { releaseOthers: false });
    await dragon.sheet.render({ force: true });
    return { user: user.id, name: user.name, dragon: dragon.id, scene: scene.id,
      tokens: tokens.map(token => token.uuid), actors: defenders.map(actor => actor.uuid),
      actions: dragon.system.actions.entries.filter(action => ["Furnace breath", "Crushing bite", "Wing Beat"].includes(action.name)) };
  });
  const attacks = [];
  for (const action of fixture.actions) {
    const targets = await gm.page.evaluate(async fixture => {
      const scene = game.scenes.get(fixture.scene);
      await scene.view();
      if (canvas.scene?.id !== scene.id || canvas.loading) throw new Error("Fixture scene is not ready.");
      for (const token of [...game.user.targets]) await token.setTarget(false);
      for (const uuid of fixture.tokens) await canvas.tokens.get(fromUuidSync(uuid).id).setTarget(true, { releaseOthers: false });
      return [...game.user.targets].map(token => token.document.uuid);
    }, fixture);
    assert.deepEqual(targets, fixture.tokens);
    await gm.page.locator(`[data-action="creatureAction"][data-creature-action="${action.id}"]`).click();
    await gm.page.waitForFunction(({ actor, actionId }) => game.messages.some(message =>
      message.getFlag("heroes-of-legend", "creatureAction")?.actorUuid === `Actor.${actor}` &&
      message.getFlag("heroes-of-legend", "creatureAction")?.actionId === actionId),
    { actor: fixture.dragon, actionId: action.id });
    const posted = await gm.page.evaluate(({ actor, actionId }) => {
      const message = game.messages.find(message => message.getFlag("heroes-of-legend", "creatureAction")?.actorUuid === `Actor.${actor}` && message.getFlag("heroes-of-legend", "creatureAction")?.actionId === actionId);
      globalThis.hol138Fixture.messages.push(message.id);
      return { id: message.id, card: message.getFlag("heroes-of-legend", "attackCard"),
        reference: message.getFlag("heroes-of-legend", "creatureAction"), content: message.content, rolls: message.rolls.length };
    }, { actor: fixture.dragon, actionId: action.id });
    assert.equal(posted.rolls, 0);
    assert.equal(Object.hasOwn(posted.reference, "damage"), false);
    assert.deepEqual(posted.reference.suggestedDefenderTokenUuids, fixture.tokens);
    if (action.attributeKey) {
      assert.equal(posted.card.attributeKey, action.attributeKey);
      assert.equal(Object.hasOwn(posted.card, "combatId"), false);
      assert.deepEqual(posted.card.outcomes, action.outcomes);
      assert.deepEqual(posted.card.threat, { boons: 0, banes: 2 });
      for (const text of Object.values(action.outcomes)) assert(posted.content.includes(text));
      attacks.push(posted);
    } else {
      assert.equal(posted.card, undefined);
      assert(posted.content.includes("no roll or damage"));
    }
  }
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import("/systems/heroes-of-legend/services/authority.mjs");
    await bindCreationAuthority({ restartConfirmed: true });
  });
  player = await join(fixture.name);
  const denied = await player.page.evaluate(async id => {
    const { declareCreatureAction } = await import("/systems/heroes-of-legend/services/npc-attacks.mjs");
    try { await declareCreatureAction(game.actors.get(id), "main-2"); return false; }
    catch { return true; }
  }, fixture.dragon);
  assert(denied);
  for (const attack of attacks) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await player.page.evaluate(async id => {
        const { chooseDefender } = await import("/systems/heroes-of-legend/dialogs/defender-choice.mjs");
        void chooseDefender(id);
      }, attack.id);
      const chooser = player.page.locator(".hol-defender-choice");
      await chooser.locator('[name="defenderUuid"]').selectOption(fixture.tokens[1]);
      await chooser.getByRole("button", { name: "Prepare defense", exact: true }).click();
      const dialog = player.page.locator(".hol-roll-dialog");
      assert.equal(await dialog.locator("output").innerText(), `5d6kl3 + (${attack.card.attributeKey === "fortitude" ? 2 : 0})`);
      assert.equal(await dialog.getByRole("slider", { name: "Boons or Banes" }).inputValue(), "-2");
      assert.equal(await dialog.locator('[name="attemptReason"], [name="additionalAttempt"]').count(), 0);
      if (attempt === 0) await dialog.screenshot({ path: `test-results/creature-action-${attack.card.attributeKey}.png` });
      await dialog.getByRole("button", { name: "Roll", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      await gm.page.waitForFunction(({ id, count }) => game.messages.filter(message => message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id).length === count,
        { id: attack.id, count: attempt + 1 });
    }
    await gm.page.waitForFunction(id => game.messages.get(id).getFlag("heroes-of-legend", "defenseResponses")?.filter(row => row.status === "resolved").length === 2, attack.id);
    const results = await gm.page.evaluate(id => game.messages.filter(message => message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id)
      .map(message => { const result = message.getFlag("heroes-of-legend", "roll"); return { id: message.id, ...result }; }), attack.id);
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.rollerId, fixture.user);
      assert.equal(result.attributeKey, attack.card.attributeKey);
      assert.equal(result.attackOutcome.text, attack.card.outcomes[result.tier]);
      assert.equal(Object.hasOwn(result.attackOutcome, "damage"), false);
      const blocked = await gm.page.evaluate(async id => {
        const { defenseDamage } = await import("/systems/heroes-of-legend/services/damage.mjs");
        try { defenseDamage(game.messages.get(id)); return false; }
        catch (error) { return /manually/.test(error.message); }
      }, result.id);
      assert(blocked);
      const summary = await gm.page.evaluate(async id => {
        const { renderRollSummary } = await import("/systems/heroes-of-legend/services/roll.mjs"),
          element = document.createElement("article");
        element.innerHTML = '<div class="message-content"></div>';
        renderRollSummary(game.messages.get(id), element);
        return { text: element.textContent, buttons: [...element.querySelectorAll("button")].map(button => button.textContent) };
      }, result.id);
      assert(summary.text.includes(result.attackOutcome.text));
      assert.doesNotMatch(summary.text, /physical damage before resistance/);
      assert.equal(summary.buttons.includes("Review and apply damage"), false);
    }
  }
  const encounterReference = await gm.page.evaluate(async fixture => {
    const actor = await fromUuid(fixture.actors[1]), dragon = game.actors.get(fixture.dragon),
      { ABILITY_DEFINITIONS } = await import("/systems/heroes-of-legend/rules/ability-definitions.mjs");
    await actor.createEmbeddedDocuments("Item", [
      { name: "Shield Block", type: "ability", flags: { "heroes-of-legend": {
        catalogId: "ability-shield-block", source: ABILITY_DEFINITIONS["ability-shield-block"].source } } },
      { name: "Reference shield", type: "equipment", system: { catalogId: "item-ordinary-shield", quantity: 1, bulk: 1, hands: 1, held: true } },
    ]);
    const combat = await Combat.create({ scene: fixture.scene, active: true });
    globalThis.hol138Fixture.combats.push(combat.id);
    await combat.createEmbeddedDocuments("Combatant", [
      { actorId: dragon.id, flags: { "heroes-of-legend": { side: "opposition" } } },
      { actorId: actor.id, flags: { "heroes-of-legend": { side: "players" } } },
    ]);
    const { requestCombat, resolveCombatRequest } = await import("/systems/heroes-of-legend/services/combat.mjs");
    await resolveCombatRequest((await requestCombat(combat, "start")).id);
    const { declareCreatureAction } = await import("/systems/heroes-of-legend/services/npc-attacks.mjs"),
      action = dragon.system.actions.entries.find(action => action.name === "Crushing bite"),
      message = await declareCreatureAction(dragon, action.id);
    globalThis.hol138Fixture.messages.push(message.id);
    return { message: message.id, combat: combat.id };
  }, fixture);
  await player.page.waitForFunction(id => game.messages.has(id), encounterReference.message);
  const shieldOption = await player.page.evaluate(({ fixture, reference }) => {
    return import("/systems/heroes-of-legend/services/abilities.mjs").then(({ reviewedDefenseAbilityOptions }) =>
      reviewedDefenseAbilityOptions(fromUuidSync(fixture.actors[1]), { attackMessageId: reference.message,
        defenderTokenUuid: fixture.tokens[1] }).options.find(option => option.id === "ability-shield-block"));
  }, { fixture, reference: encounterReference });
  assert.equal(shieldOption.available, true);
  assert.equal(shieldOption.reasons.length, 0);
  assert.deepEqual(errors, []);
  console.info("PASS native Red Dragon pack import/roundtrip, exact breath/bite defense outcomes, distinct attributes/Threat, native GM multi-target snapshot, non-owner fresh/repeated Defend without Combat, no-roll maneuver, reference damage refusal, existing-encounter Shield Block availability without numeric attack receipts and zero page errors.");
} finally {
  if (gm?.page && !gm.page.isClosed()) await gm.page.evaluate(async () => {
    const f = globalThis.hol138Fixture;
    if (!f) return;
    const { releaseAuthority, isCreationAuthority } = await import("/systems/heroes-of-legend/services/authority.mjs");
    if (isCreationAuthority()) await releaseAuthority();
    for (const message of game.messages.filter(message =>
      f.messages.includes(message.id) ||
      f.actors.some(id => message.getFlag("heroes-of-legend", "creatureAction")?.actorUuid === `Actor.${id}`) ||
      f.combats.some(id => message.getFlag("heroes-of-legend", "combatRequest")?.combatUuid === `Combat.${id}`) ||
      f.messages.includes(message.getFlag("heroes-of-legend", "roll")?.attackMessageId) ||
      f.messages.includes(message.getFlag("heroes-of-legend", "defenseRequest")?.attackMessageId))) await message.delete();
    for (const id of f.combats) await game.combats.get(id)?.delete();
    for (const id of f.scenes) await game.scenes.get(id)?.delete();
    for (const id of f.actors) await game.actors.get(id)?.delete();
    for (const id of f.users) await game.users.get(id)?.delete();
    delete globalThis.hol138Fixture;
  }).catch(error => { console.error("Fixture cleanup failed:", error); process.exitCode = 1; });
  await browser.close();
}
