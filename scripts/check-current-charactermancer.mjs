import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {chromium} from "@playwright/test";
import {selectTestUser} from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an explicitly authorized isolated local Foundry world.");
const ID = "heroes-of-legend";
const fixtures = JSON.parse(await readFile(new URL("../tests/fixtures/reference-heroes.json", import.meta.url)));
const choices = JSON.parse(await readFile(new URL("../static/data/choices.json", import.meta.url)));
const draft = structuredClone(fixtures.characters.find(hero => hero.id === "borin-bridgekeeper").draft);
draft.name = "HOL252 current journey";
draft.profile = {...draft.profile, story: "Imported HOL252 story"};
draft.shopping.push({id: "item-musical-instrument", quantity: 1});
draft.play = {...draft.play, hp: 3, gritSpent: 1};
const portable = {format: "heroes-of-legend-character", schemaVersion: 3, sourceCommit: choices.sourceCommit, draft};
let browser;
const errors = [], cleanupErrors = [];
const evidencePath = process.env.HOL_TEST_EVIDENCE ?? "test-results/current-native-charactermancer.json";
const evidence = {scenario: "Current native creation and advancement", startedAt: new Date().toISOString(),
  sourceCommit: choices.sourceCommit, steps: [], snapshots: {}, cleanup: {attempted: false},
  browserErrors: errors, legacySuitesRun: false};
let failure;
let gm, owner;
const fixture = {actorId: null, userId: null};
async function join(name) {
  const context = await browser.newContext({viewport: {width: 1500, height: 1000}});
  await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return page;
}
async function snapshot(page) {
  return page.evaluate(({actorId, ID}) => {
    const actor = game.actors.get(actorId), state = actor.getFlag(ID, "development");
    return {name: actor.name, hp: actor.system.health.value, maximum: actor.system.health.baseMax,
      spent: actor.system.grit.spent, level: state?.level, dp: state?.dp,
      items: actor.items.size, personal: actor.items.some(item => item.name === "HOL252 personal reference"),
      biography: actor.system.biography,
      instrumentCount: actor.items.filter(item => item.system.catalogId === "item-musical-instrument").length,
      partyCount: actor.items.filter(item => item.getFlag(ID, "catalogId") === "ability-a-party-piece").length,
      conditionedCount: actor.items.filter(item => item.getFlag(ID, "catalogId") === "ability-conditioned-body").length,
      conditionedPurchases: (state?.purchases ?? []).filter(entry => entry.id === "ability-conditioned-body").length,
      receipt: actor.getFlag(ID, "creationReceipt"), commitReceipts: state?.commitReceipts,
      instruments: state?.instruments, levelEntries: (state?.ledger ?? []).filter(entry => entry.kind === "add-level" && entry.level === 2)};
  }, {...fixture, ID});
}
try {
  await mkdir("test-results", {recursive: true});
  browser = await chromium.launch();
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  Object.assign(evidence, await gm.evaluate(async () => {
    const {loadCatalogs} = await import("/systems/heroes-of-legend/services/catalog.mjs");
    return {foundryVersion: game.version, systemVersion: game.system.version, installedSourceCommit: (await loadCatalogs()).commit, worldId: game.world.id};
  }));
  assert.equal(evidence.installedSourceCommit, choices.sourceCommit, "Installed and local catalogs must use the same source pin");
  const user = await gm.evaluate(async () => {
    const name = `HOL252 Journey ${foundry.utils.randomID(6)}`;
    const user = await User.create({name, role: CONST.USER_ROLES.PLAYER});
    return {id: user.id, name: user.name};
  });
  fixture.userId = user.id;
  fixture.actorId = await gm.evaluate(async userId => {
    const actor = await Actor.create({name: "HOL252 blank journey", type: "character",
      system: {biography: "Preserve HOL252 biography"},
      // Explicit Speed metadata for this disposable pre-creation fixture.
      flags: {"heroes-of-legend": {development: {creationSummary: {speedBase: 5}}}},
      ownership: {default: 0, [userId]: 3},
      items: [{name: "HOL252 personal reference", type: "ability"}]});
    return actor.id;
  }, fixture.userId);
  await gm.evaluate(({actorId, userId, ID}) => {
    const registry = globalThis.__hol252Journey = {messages: [], hook: null};
    registry.hook = Hooks.on("createChatMessage", message => {
      if (message.author?.id === userId || JSON.stringify(message.flags?.[ID] ?? {}).includes(`Actor.${actorId}`))
        registry.messages.push(message.id);
    });
  }, {...fixture, ID});
  evidence.fixture = structuredClone(fixture);
  owner = await join(user.name);
  await owner.evaluate(async actorId => {
    const {CreationWizard} = await import("/systems/heroes-of-legend/applications/creation.mjs");
    globalThis.holJourneyWizard = new CreationWizard(game.actors.get(actorId));
    await holJourneyWizard.render({force: true});
  }, fixture.actorId);
  const creation = owner.locator(".hol-creation:not(.hol-advancement)");
  await creation.locator('[data-action="navigate"][data-step="7"]').click();
  assert(await creation.locator('[data-action="commitCreation"]').isDisabled(), "Incomplete creation cannot commit");
  assert(await creation.locator(".hol-error").count(), "Review explains unfinished choices");
  evidence.steps.push("Incomplete blank creation explains errors and disables Save");
  const chooser = owner.waitForEvent("filechooser");
  await creation.locator('[data-action="importCharacter"]').click();
  await (await chooser).setFiles({name: "current-journey.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(portable))});
  await creation.getByRole("heading", {name: draft.name, exact: true}).waitFor();
  await owner.waitForFunction(() => !holJourneyWizard.busy);
  await creation.locator('[data-action="navigate"][data-step="0"]').click();
  await creation.locator('[name="heroName"]').fill("HOL252 current saved hero");
  await creation.locator('[data-action="navigate"][data-step="7"]').click();
  const save = creation.locator('[data-action="commitCreation"]');
  await owner.waitForFunction(() => !holJourneyWizard.busy);
  assert(await save.isEnabled(), "Current imported choices are reviewable and valid");
  await creation.screenshot({path: "test-results/current-native-creation-review.png"});
  await save.click();
  await owner.waitForFunction(({actorId, ID}) => game.actors.get(actorId)?.getFlag(ID, "creationReceipt")?.status === "complete", {...fixture, ID});
  await owner.locator(".hol-character-sheet").getByRole("heading", {name: "HOL252 current saved hero", exact: true}).waitFor();
  const created = await snapshot(owner);
  evidence.snapshots.created = created;
  assert.equal(created.hp, 3); assert.equal(created.spent, 1); assert.equal(created.level, 1);
  assert.equal(created.instrumentCount, 1); assert.equal(created.partyCount, 0);
  assert(created.personal); assert.equal(created.biography, "Imported HOL252 story");
  evidence.snapshots.created = created;
  evidence.steps.push("Owner imports current portable choices through file chooser, edits name, saves creation and sees returned sheet");
  await owner.reload();
  await owner.waitForFunction(() => globalThis.game?.ready);
  await owner.evaluate(actorId => game.actors.get(actorId).sheet.render({force: true}), fixture.actorId);
  const sheet = owner.locator(".hol-character-sheet");
  await sheet.getByRole("heading", {name: "HOL252 current saved hero", exact: true}).waitFor();
  assert.deepEqual(await snapshot(owner), created, "Creation and imported play resources survive reload");
  evidence.steps.push("Creation receipt, owned inventory, imported story, current HP and spent Grit survive owner reload");
  await sheet.locator('[data-action="switchTab"][data-tab="development"]').click();
  await sheet.locator('[data-action="addLevel"]').click();
  await owner.waitForFunction(({actorId, ID}) => game.actors.get(actorId).getFlag(ID, "development")?.level === 2, {...fixture, ID});
  await sheet.locator('[data-action="advanceHero"]').click();
  const advancement = owner.locator(".hol-advancement");
  await advancement.locator('[data-open-market="ability"]').click();
  const market = advancement.locator("dialog[open]");
  const ineligible = market.locator('[data-action="add"][data-id="ability-the-cleverest-mixture"]');
  assert(await ineligible.isDisabled());
  assert.match(await ineligible.locator("xpath=ancestor::article").innerText(), /Requires level 7/);
  const awarded = await snapshot(owner);
  evidence.snapshots.awarded = awarded;
  assert.equal(awarded.dp, created.dp + 10); assert.equal(awarded.hp, 3); assert.equal(awarded.spent, 1);
  await market.locator('[data-action="referenceChoice"][data-id="ability-a-party-piece"]').click();
  const reference = advancement.locator("[data-creation-reference]");
  await reference.waitFor({state: "visible"});
  await reference.locator("[data-rule-content]").getByText(/instrument/i).first().waitFor();
  assert.match(await reference.innerText(), /instrument/i);
  assert.equal((await snapshot(owner)).dp, awarded.dp, "Reading reference spends no DP");
  await reference.locator('[data-action="closeReference"]').click();
  await market.locator('[data-action="add"][data-id="ability-a-party-piece"]').click();
  await owner.waitForFunction(() => ![...foundry.applications.instances.values()].some(app => app.constructor.name === "AdvancementWizard" && app.busy));
  await advancement.locator("dialog[open] [data-close-market]").click();
  const done = advancement.locator('[data-action="commit"]');
  assert(await done.isDisabled(), "Acquisition choice must be completed before advancement commits");
  await advancement.locator('[name="instrument-ability-a-party-piece"]').fill("flute");
  await advancement.locator('[name="instrument-ability-a-party-piece"]').press("Tab");
  await advancement.locator('[data-open-market="ability"]').click();
  await advancement.locator('dialog[open] [data-action="add"][data-id="ability-conditioned-body"]').click();
  await advancement.locator("dialog[open] [data-close-market]").click();
  await owner.waitForFunction(({actorId, ID}) => game.actors.get(actorId).getFlag(ID, "advancementDraft")?.data?.acquisitions?.["ability-a-party-piece"]?.instrument === "flute", {...fixture, ID});
  const draftId = await owner.evaluate(({actorId, ID}) => game.actors.get(actorId).getFlag(ID, "advancementDraft").id, {...fixture, ID});
  await done.waitFor();
  assert(await done.isEnabled());
  await advancement.screenshot({path: "test-results/current-native-advancement-review.png"});
  await done.click();
  await owner.waitForFunction(({actorId, ID, draftId}) => game.actors.get(actorId).getFlag(ID, "development")?.commitReceipts?.[draftId]?.status === "complete", {...fixture, ID, draftId});
  await advancement.waitFor({state: "detached"});
  evidence.steps.push("Owner Add level grants exactly 10 DP; ineligible ability disabled; local reference free; missing instrument choice blocks Done");
  const advanced = await snapshot(owner);
  evidence.snapshots.advanced = advanced;
  assert.equal(advanced.dp, awarded.dp - 3); assert.equal(advanced.maximum, created.maximum + 1);
  assert.equal(advanced.hp, 3); assert.equal(advanced.spent, 1); assert.equal(advanced.level, 2);
  assert.equal(advanced.instrumentCount, 1); assert.equal(advanced.partyCount, 1);
  assert.equal(advanced.conditionedCount, created.conditionedCount, "Repeated training retains one learned rules reference");
  assert.equal(advanced.conditionedPurchases, created.conditionedPurchases + 1, "One additional permitted training purchase is recorded");
  assert.deepEqual(advanced.instruments, [{abilityId: "ability-a-party-piece", instrument: "flute"}]);
  assert.equal(advanced.levelEntries.length, 1);
  assert.equal(advanced.levelEntries[0].delta, 10);
  evidence.snapshots.advanced = advanced;
  await owner.reload(); await owner.waitForFunction(() => globalThis.game?.ready);
  await owner.evaluate(actorId => game.actors.get(actorId).sheet.render({force: true}), fixture.actorId);
  await owner.locator(".hol-character-sheet").getByRole("heading", {name: "HOL252 current saved hero", exact: true}).waitFor();
  evidence.snapshots.reloaded = await snapshot(owner);
  assert.deepEqual(evidence.snapshots.reloaded, advanced, "Committed advancement survives reload without duplicate grants or resource refill");
  evidence.steps.push("Done commits both purchases once at 3 DP; +1 maximum HP, preserved current HP/spent Grit, instrument choice and receipts survive reload");

} catch (error) {
  failure = error;
  evidence.failure = {name: error.name, message: error.message, stack: error.stack};
  throw error;
} finally {
  evidence.cleanup.attempted = true;
  if (owner) {
    try {await owner.evaluate(async actorId => {
      for (const app of foundry.applications.instances.values()) if (app.actor?.id === actorId) await app.close();
    }, fixture.actorId);} catch (error) {cleanupErrors.push(`Close fixture applications: ${error.message}`);}
  }
  if (gm) {
    try {evidence.cleanup = await gm.evaluate(async ({actorId, userId, ID}) => {
      const registry = globalThis.__hol252Journey, errors = [];
      if (registry?.hook) Hooks.off("createChatMessage", registry.hook);
      const messageIds = [...new Set([...(registry?.messages ?? []), ...game.messages.filter(message =>
        message.author?.id === userId || JSON.stringify(message.flags?.[ID] ?? {}).includes(`Actor.${actorId}`)).map(message => message.id)])];
      for (const messageId of messageIds) {
        try {if (game.messages.has(messageId)) await game.messages.get(messageId).delete();}
        catch (error) {errors.push(`Message ${messageId}: ${error.message}`);}
      }
      try {if (actorId && game.actors.has(actorId)) await game.actors.get(actorId).delete();}
      catch (error) {errors.push(`Actor: ${error.message}`);}
      try {if (userId && game.users.has(userId)) await game.users.get(userId).delete();}
      catch (error) {errors.push(`User: ${error.message}`);}
      return {attempted: true, actorAbsent: !actorId || !game.actors.has(actorId),
        userAbsent: !userId || !game.users.has(userId), messageIds,
        remainingMessageIds: messageIds.filter(id => game.messages.has(id)), errors};
    }, {...fixture, ID});
    cleanupErrors.push(...evidence.cleanup.errors);
    if (!evidence.cleanup.actorAbsent || !evidence.cleanup.userAbsent || evidence.cleanup.remainingMessageIds.length)
      cleanupErrors.push("Fixture documents remain after cleanup");
    } catch (error) {cleanupErrors.push(`Cleanup or absence verification: ${error.message}`);}
  }
  try {await browser?.close();} catch (error) {cleanupErrors.push(`Browser close: ${error.message}`);}
  evidence.cleanup.errors = cleanupErrors;
  evidence.cleanup.complete = Boolean(gm && !cleanupErrors.length);
  evidence.finishedAt = new Date().toISOString();
  evidence.status = !failure && !cleanupErrors.length && !errors.length ? "passed" : "failed";
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  if (!failure) {
    assert.deepEqual(cleanupErrors, [], "Fixture cleanup and document-absence verification must complete");
    assert.deepEqual(errors, [], "Browser must remain error-free through teardown");
  }
}

console.info("PASS current native journey: incomplete creation validation; UI portable import/edit/Save/returned sheet/reload; owner Add level, disabled ineligible choice, local reference, required instrument choice, Done; exact DP/HP/Grit/acquisition persistence and no duplicate grants. Legacy broad creation/advancement/canvas suites were not run by this harness.");
