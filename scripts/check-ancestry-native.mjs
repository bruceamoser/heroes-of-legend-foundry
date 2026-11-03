import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an explicitly authorized isolated local Foundry world.");
const ID = "heroes-of-legend";
const fixtureId = `ancestry-259-${Date.now()}`;
const output = process.env.HOL_TEST_ANCESTRY_OUTPUT ?? "test-results/ancestry-native";
const heroes = JSON.parse(await readFile(new URL("../tests/fixtures/reference-heroes.json", import.meta.url)));
const baseDraft = structuredClone(heroes.characters.find(hero => hero.id === "borin-bridgekeeper").draft);
const roster = [
  ["ancestry-human", ["trait-human-weathered", "trait-human-far-walker"]],
  ["ancestry-high-elf", ["trait-high-elf-starlight-eyes", "trait-high-elf-practised-hand"]],
  ["ancestry-elf", ["trait-elf-unhurried-grace", "trait-elf-age-of-memory"]],
  ["ancestry-dwarf", ["trait-dwarf-deep-constitution", "trait-dwarf-low-center"]],
  ["ancestry-deep-dwarf", ["trait-deep-dwarf-eyes-for-the-dark", "trait-deep-dwarf-stone-tells-you"]],
  ["ancestry-halfling", ["trait-halfling-stout-heart", "trait-halfling-resilient"]],
  ["ancestry-tallfolk", ["trait-tallfolk-broad-back", "trait-tallfolk-you-take-the-blow"]],
  ["ancestry-gnome", ["trait-gnome-small-target", "trait-gnome-whats-it-made-of"]],
  ["ancestry-goblin", ["trait-goblin-run-away-better", "trait-goblin-never-where-you-aim"]],
  ["ancestry-oath-bound", ["trait-oath-bound-the-mark", "trait-oath-bound-the-debt-comes-due"]],
];
const evidence = { fixtureId, startedAt:new Date().toISOString(), cases:[], browserErrors:[], cleanup:[] };
let browser, page, fixture, failure;
await mkdir(output, {recursive:true});
try {
  browser = await chromium.launch();
  const context = await browser.newContext({viewport:{width:1500,height:1100}});
  await context.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
  page = await context.newPage();
  page.on("pageerror", error => evidence.browserErrors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  fixture = await page.evaluate(async ({fixtureId,baseDraft,roster,ID}) => {
    const {loadCatalogs} = await import("/systems/heroes-of-legend/services/catalog.mjs");
    const {getCampaignLanguageConfiguration} = await import("/systems/heroes-of-legend/services/languages.mjs");
    const {buildPortableActorSource} = await import("/systems/heroes-of-legend/services/portable-actor-import.mjs");
    const {writePortableCharacter} = await import("/systems/heroes-of-legend/rules/portable-character.mjs");
    const catalogs = await loadCatalogs(), languages = getCampaignLanguageConfiguration(), actors = {};
    for (const [ancestryId,traitIds] of roster) {
      const draft = {...structuredClone(baseDraft),name:`${fixtureId} ${ancestryId}`,ancestryId,traitIds,
        languages:{home:"elven",extraSpoken:[]},play:{hp:3,gritSpent:1}};
      const portable = JSON.parse(writePortableCharacter(draft,catalogs,{ready:true,languages:languages.definitions}));
      const source = buildPortableActorSource(portable,catalogs,languages);
      source.flags[ID].testFixture = fixtureId;
      // The import supplies an explicit creationSummary.speedBase for every actor.
      if (!Number.isSafeInteger(source.flags[ID].development.creationSummary.speedBase)) throw Error("Missing fixture Speed metadata.");
      const actor = await Actor.create(source);
      actors[ancestryId] = actor.id;
    }
    const draft = {...structuredClone(baseDraft),name:`${fixtureId} builder`,languages:{home:"elven",extraSpoken:[]}};
    const wizardActor = await Actor.create({name:draft.name,type:"character",flags:{[ID]:{testFixture:fixtureId,
      development:{creationSummary:{speedBase:5},creation:{ancestryId:"ancestry-dwarf",traitIds:[]}},
      creationDraft:{schemaVersion:1,sourceCommit:catalogs.commit,languageBasis:languages.basis,revision:1,step:1,data:draft}}}});
    const scene = await Scene.create({name:fixtureId,flags:{[ID]:{testFixture:fixtureId}},tokens:[]});
    const tokens = await scene.createEmbeddedDocuments("Token",[
      {name:"Gnome defender",actorId:actors["ancestry-gnome"],actorLink:true,x:0,y:0},
      {name:"Tallfolk attacker",actorId:actors["ancestry-tallfolk"],actorLink:true,x:100,y:0},
    ]);
    return {actors,wizardId:wizardActor.id,sceneId:scene.id,gnomeToken:tokens[0].uuid,tallfolkToken:tokens[1].uuid,
      commit:catalogs.commit,version:game.system.version,foundry:game.version};
  }, {fixtureId,baseDraft,roster,ID});
  evidence.installed = {commit:fixture.commit,system:fixture.version,foundry:fixture.foundry};
  await page.evaluate(async actorId => {
    const {CreationWizard} = await import("/systems/heroes-of-legend/applications/creation.mjs");
    globalThis.holAncestryWizard = new CreationWizard(game.actors.get(actorId));
    await globalThis.holAncestryWizard.render({force:true});
  }, fixture.wizardId);
  const wizard = page.locator(".hol-creation");
  await wizard.waitFor();
  assert.equal(await wizard.locator('[data-action="chooseAncestry"]').count(),10);
  for (const [ancestryId] of roster) {
    await page.waitForFunction(() => !holAncestryWizard.busy && !(holAncestryWizard.pendingActions?.length));
    await page.evaluate(async () => {
      holAncestryWizard.draft.traitIds = [];
      await holAncestryWizard.render({force:true});
    });
    await wizard.locator(`[data-action="chooseAncestry"][data-id="${ancestryId}"]`).click();
    await page.waitForFunction(id => !holAncestryWizard.busy && !(holAncestryWizard.pendingActions?.length) &&
      document.querySelector('.hol-creation [name="ancestryId"]')?.value === id,ancestryId);
    assert.equal(await wizard.locator('[name="trait"]').count(),5,ancestryId);
  }
  await wizard.screenshot({path:`${output}/ten-ancestry-builder.png`});
  evidence.cases.push("Ten native ancestry cards, each exposing five current traits.");

  await page.evaluate(async () => {
    holAncestryWizard.draft.ancestryId = "ancestry-human";
    holAncestryWizard.draft.traitIds = ["trait-human-weathered","trait-human-many-homes"];
    holAncestryWizard.draft.borrowedAncestryId = "";
    holAncestryWizard.draft.borrowedTraitId = "";
    await holAncestryWizard.render({force:true});
  });
  await wizard.locator('[name="borrowedAncestryId"]').selectOption("ancestry-tallfolk");
  await page.waitForFunction(({id,ID}) => !holAncestryWizard.busy && !(holAncestryWizard.pendingActions?.length) &&
    holAncestryWizard.draft.borrowedAncestryId === "ancestry-tallfolk" &&
    game.actors.get(id)?.getFlag(ID,"creationDraft")?.data.borrowedAncestryId === "ancestry-tallfolk",
  {id:fixture.wizardId,ID});
  await wizard.locator('[name="borrowedTraitId"] option[value="trait-tallfolk-broad-back"]').waitFor({state:"attached"});
  await wizard.locator('[name="borrowedTraitId"]').selectOption("trait-tallfolk-broad-back");
  await page.waitForFunction(({id,ID}) => !holAncestryWizard.busy && !(holAncestryWizard.pendingActions?.length) &&
    holAncestryWizard.draft.borrowedTraitId === "trait-tallfolk-broad-back" &&
    game.actors.get(id)?.getFlag(ID,"creationDraft")?.data.borrowedTraitId === "trait-tallfolk-broad-back",
  {id:fixture.wizardId,ID});
  await wizard.locator('[name="ancestryLanguage"]').selectOption("dwarven");
  await page.waitForFunction(({id,ID}) => !holAncestryWizard.busy && !(holAncestryWizard.pendingActions?.length) &&
    holAncestryWizard.draft.languages?.ancestry === "dwarven" &&
    game.actors.get(id)?.getFlag(ID,"creationDraft")?.data.languages?.ancestry === "dwarven",
  {id:fixture.wizardId,ID});
  await wizard.locator('[data-action="saveDraft"]').first().click();
  await page.waitForFunction(({id,ID}) => {
    const d=game.actors.get(id)?.getFlag(ID,"creationDraft")?.data;
    return d?.borrowedTraitId === "trait-tallfolk-broad-back" && d.languages?.ancestry === "dwarven";
  }, {id:fixture.wizardId,ID});
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.ready);
  await page.evaluate(async actorId => {
    const {CreationWizard} = await import("/systems/heroes-of-legend/applications/creation.mjs");
    globalThis.holAncestryWizard = new CreationWizard(game.actors.get(actorId));
    await holAncestryWizard.render({force:true});
  },fixture.wizardId);
  assert.equal(await wizard.locator('[name="borrowedAncestryId"]').inputValue(),"ancestry-tallfolk");
  assert.equal(await wizard.locator('[name="borrowedTraitId"]').inputValue(),"trait-tallfolk-broad-back");
  assert.equal(await wizard.locator('[name="ancestryLanguage"]').inputValue(),"dwarven");
  const mixed = await page.evaluate(() => ({valid:holAncestryWizard.preview.valid,capacity:holAncestryWizard.preview.summary?.capacity,
    languages:holAncestryWizard.preview.summary?.languages?.map(language=>language.id),errors:holAncestryWizard.preview.errors}));
  assert.equal(mixed.valid,true,JSON.stringify(mixed.errors));
  assert.equal(mixed.capacity,16);
  assert.deepEqual(mixed.languages,["common","elven","dwarven"]);
  await wizard.screenshot({path:`${output}/mixed-ancestry-reload.png`});
  evidence.cases.push("Explicit mixed ancestry, trait and one ordinary language save and reload with derived capacity16.");
  await page.evaluate(() => holAncestryWizard.close());

  evidence.native = await page.evaluate(async ({fixture,ID}) => {
    const {rollBasis,prepareRoll} = await import("/systems/heroes-of-legend/services/roll-preparation.mjs");
    const {actorMovement} = await import("/systems/heroes-of-legend/services/turn-budget.mjs");
    const {characterSheetView} = await import("/systems/heroes-of-legend/sheets/character-view.mjs");
    const {loadCatalogs} = await import("/systems/heroes-of-legend/services/catalog.mjs");
    const catalogs = await loadCatalogs();
    const gnome=game.actors.get(fixture.actors["ancestry-gnome"]),tallfolk=game.actors.get(fixture.actors["ancestry-tallfolk"]),deep=game.actors.get(fixture.actors["ancestry-deep-dwarf"]);
    const defense = prepareRoll(rollBasis(gnome,"agility","defense"));
    const attack = prepareRoll(rollBasis(tallfolk,"brawn","attack",null,null,{actorTokenUuid:fixture.tallfolkToken,targetTokenUuid:fixture.gnomeToken}));
    const view=characterSheetView({development:deep.getFlag(ID,"development"),choices:catalogs.choices});
    return {defenseSources:defense.sources,defenseNet:defense.net,attackSources:attack.sources,attackNet:attack.net,
      tallfolkMovement:actorMovement(tallfolk),deepVision:view.vision,deepTraits:view.traits,
      live:{hp:gnome.system.health.value,gritSpent:gnome.system.grit.spent},darknessVision:deep.prototypeToken.sight.visionMode};
  },{fixture,ID});
  assert.equal(evidence.native.defenseSources.filter(source=>source.id === "passive-trait-gnome-small-target").length,1);
  assert.equal(evidence.native.defenseNet,1);
  assert.equal(evidence.native.attackSources.find(source=>source.id === "passive-trait-gnome-small-target")?.kind,"bane");
  assert.equal(evidence.native.attackNet,-1);
  assert.equal(evidence.native.tallfolkMovement.capacity,16);
  assert.equal(evidence.native.tallfolkMovement.speedBase,7);
  assert.equal(evidence.native.deepVision.lowLightVision,2);
  assert.equal(evidence.native.deepVision.seismicVisionRange,6);
  assert.equal(evidence.native.deepVision.ruleReferences[0].path,"design/rules/vision.md");
  assert.deepEqual(evidence.native.live,{hp:3,gritSpent:1});
  assert.notEqual(evidence.native.darknessVision,"darkvision");
  evidence.cases.push("Native Small Target defense Boon and attacker-roll Bane; Tallfolk capacity/Speed; Deep Dwarf sense facts with shared rule reference; live HP/Grit preserved.");
  await page.evaluate(async id => {
    const {SharedRollDialog}=await import("/systems/heroes-of-legend/dialogs/attribute-roll.mjs");
    globalThis.holAncestryRoll=new SharedRollDialog(game.actors.get(id),"agility",{mode:"defense"});
    await holAncestryRoll.render({force:true});
  },fixture.actors["ancestry-gnome"]);
  await page.locator(".hol-roll-dialog").getByText("Roll details",{exact:true}).click();
  await page.locator(".hol-roll-dialog .hol-roll-sources").getByText(/Small Target: 1 Boon/).waitFor();
  await page.locator(".hol-roll-dialog").screenshot({path:`${output}/small-target-defense.png`});
  await page.evaluate(() => holAncestryRoll.close());
  for (const [id,label] of [["ancestry-elf","Wood Elf"],["ancestry-dwarf","Hill Dwarf"],["ancestry-deep-dwarf","Deep Dwarf"]]) {
    await page.evaluate(async actorId => {await game.actors.get(actorId).sheet.render({force:true});},fixture.actors[id]);
    const sheet=page.locator(".hol-character");
    await sheet.getByText(new RegExp(label)).first().waitFor();
    if(id === "ancestry-deep-dwarf") {
      await sheet.getByText(/Seismic Vision.*6 squares/).first().waitFor();
      await sheet.screenshot({path:`${output}/deep-dwarf-rules.png`});
    }
    assert.equal(await page.evaluate(({actorId,ID})=>game.actors.get(actorId).getFlag(ID,"development").creation.ancestryId,{actorId:fixture.actors[id],ID}),id);
    await page.evaluate(actorId=>game.actors.get(actorId).sheet.close(),fixture.actors[id]);
  }
  evidence.cases.push("Published Elf/Dwarf IDs remain unchanged while native sheets render Wood Elf/Hill Dwarf labels and complete Seismic Vision trait rules.");
  assert.deepEqual(evidence.browserErrors,[]);
} catch(error) {
  failure=error;
  evidence.failure=error.stack;
  if(page) {
    try {
      evidence.failureSnapshot=await page.evaluate(({wizardId,ID})=>{
        const wizard=globalThis.holAncestryWizard;
        return {
          wizard:wizard ? {draft:structuredClone(wizard.draft),step:wizard.step,revision:wizard.revision,
            busy:wizard.busy,pendingActions:wizard.pendingActions?.length ?? 0} : null,
          savedFlag:game.actors.get(wizardId)?.getFlag(ID,"creationDraft") ?? null,
          notifications:[...document.querySelectorAll("#notifications .notification, .notifications .notification")].map(element=>element.textContent.trim()),
          controls:[...document.querySelectorAll(".hol-creation select")].map(element=>({name:element.name,value:element.value})),
        };
      },{wizardId:fixture?.wizardId,ID});
      await page.screenshot({path:`${output}/failure.png`});
    } catch(snapshotError) {evidence.failureSnapshotError=snapshotError.message;}
  }
} finally {
  if(page) {
    try {
      evidence.cleanup = await page.evaluate(async ({fixtureId,ID}) => {
        const results=[];
        for(const app of [...foundry.applications.instances.values()])
          if(app.actor?.getFlag?.(ID,"testFixture") === fixtureId) await app.close();
        for(const [kind,collection] of [["Scene",game.scenes],["Actor",game.actors]])
          for(const doc of collection.filter(doc=>doc.getFlag(ID,"testFixture") === fixtureId)) {
            try {await doc.delete();results.push({kind,id:doc.id,deleted:true});}
            catch(error) {results.push({kind,id:doc.id,deleted:false,error:error.message});}
          }
        return results;
      },{fixtureId,ID});
      if(evidence.cleanup.some(result=>!result.deleted)) failure ??= new Error("Fixture cleanup failed.");
    } catch(error) {evidence.cleanupFailure=error.stack;failure ??= error;}
  }
  await browser?.close();
  evidence.finishedAt=new Date().toISOString();
  await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));
}
if(failure) throw failure;
console.log("PASS native ancestry choices, mixed selection save/reload, passive defense inversion, capacity, shared sense facts and stable published identities.");
