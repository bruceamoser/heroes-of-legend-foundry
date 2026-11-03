import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1")
  throw new Error("Use an explicitly authorized isolated local Foundry world.");
const ID = "heroes-of-legend", fixtureId = `debt-259-${Date.now()}`;
const output = process.env.HOL_TEST_DEBT_OUTPUT ?? "test-results/debt-native";
const heroes = JSON.parse(await readFile(new URL("../tests/fixtures/reference-heroes.json", import.meta.url)));
const baseDraft = heroes.characters.find(hero => hero.id === "borin-bridgekeeper").draft;
const evidence = {fixtureId,startedAt:new Date().toISOString(),cases:[],browserErrors:[],cleanup:[]};
let browser, page, fixture, failure;
await mkdir(output,{recursive:true});
try {
  browser = await chromium.launch();
  const context = await browser.newContext({viewport:{width:1500,height:1100}});
  await context.addInitScript(() => localStorage.setItem("core.noCanvas","true"));
  page = await context.newPage();
  page.on("pageerror", error => evidence.browserErrors.push(error.message));
  await page.goto(url);
  await selectTestUser(page,process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  fixture = await page.evaluate(async ({baseDraft,fixtureId,ID}) => {
    const {ensureAuthorityReady} = await import("/systems/heroes-of-legend/services/authority.mjs");
    await ensureAuthorityReady();
    const {loadCatalogs} = await import("/systems/heroes-of-legend/services/catalog.mjs");
    const {getCampaignLanguageConfiguration} = await import("/systems/heroes-of-legend/services/languages.mjs");
    const {writePortableCharacter} = await import("/systems/heroes-of-legend/rules/portable-character.mjs");
    const {buildPortableActorSource} = await import("/systems/heroes-of-legend/services/portable-actor-import.mjs");
    const {rollAttribute} = await import("/systems/heroes-of-legend/services/roll.mjs");
    const catalogs = await loadCatalogs(), languages = getCampaignLanguageConfiguration();
    const draft = {...structuredClone(baseDraft),name:fixtureId,ancestryId:"ancestry-oath-bound",
      traitIds:["trait-oath-bound-the-mark","trait-oath-bound-the-debt-comes-due"],
      languages:{home:"elven",extraSpoken:[]}};
    delete draft.play;
    const portable = JSON.parse(writePortableCharacter(draft,catalogs,{ready:true,languages:languages.definitions}));
    const source = buildPortableActorSource(portable,catalogs,languages);
    source.flags[ID].testFixture = fixtureId;
    if (!Number.isSafeInteger(source.flags[ID].development.creationSummary.speedBase)) throw Error("Missing fixture Speed metadata.");
    const actor = await Actor.create(source);
    const message = await rollAttribute(actor,"knowledge",{boons:2,banes:1});
    ui.sidebar.expand();
    await ui.sidebar.changeTab("chat","primary");
    return {actorId:actor.id,actorUuid:actor.uuid,messageId:message.id,maxHp:actor.system.health.max,
      original:structuredClone(message.getFlag(ID,"roll")),commit:catalogs.commit,version:game.system.version,foundry:game.version};
  },{baseDraft,fixtureId,ID});
  evidence.installed = {commit:fixture.commit,system:fixture.version,foundry:fixture.foundry};
  const card = page.locator(`[data-message-id="${fixture.messageId}"]`).first();
  await card.getByRole("button",{name:"The Debt Comes Due · pay 1 HP & reroll",exact:true}).click();
  await page.waitForFunction(({actorId,ID}) => Object.values(game.actors.get(actorId)?.getFlag(ID,"debtRerolls") ?? {}).some(operation=>operation.status==="resolved"),{actorId:fixture.actorId,ID});
  const settled = await page.evaluate(({fixture,ID}) => {
    const actor=game.actors.get(fixture.actorId),message=game.messages.get(fixture.messageId);
    const operation=Object.values(actor.getFlag(ID,"debtRerolls"))[0];
    return {hp:actor.system.health.value,recovery:structuredClone(actor.system.recovery),
      snapshot:structuredClone(message.getFlag(ID,"roll")),requestId:operation.requestId,
      native:message.rolls[0].dice[0].results.filter(die=>die.active).map(die=>die.result),
      receipt:actor.getFlag(ID,"operationReceipts")[operation.requestId]};
  },{fixture,ID});
  assert.equal(settled.hp,fixture.maxHp-1);
  assert.deepEqual(settled.recovery,{unavailableHp:1,debtUsed:true});
  assert.equal(settled.snapshot.formula,fixture.original.formula);
  assert.equal(settled.snapshot.attribute,fixture.original.attribute);
  assert.equal(settled.snapshot.net,fixture.original.net);
  assert.deepEqual(settled.snapshot.debtReroll.originalRetained,fixture.original.retained);
  assert.deepEqual(settled.snapshot.retained,settled.native);
  assert.equal(settled.receipt.applied,true);
  await card.screenshot({path:`${output}/native-debt-replacement.png`});
  const replay = await page.evaluate(async ({actorId,requestId,ID}) => {
    const {resolveRecoveryRequest}=await import("/systems/heroes-of-legend/services/recovery.mjs");
    const actor=game.actors.get(actorId),before=structuredClone(actor.getFlag(ID,"debtRerolls")[requestId]);
    const result=await resolveRecoveryRequest(requestId);
    return {replay:result.replay,hp:actor.system.health.value,same:JSON.stringify(before)===JSON.stringify(actor.getFlag(ID,"debtRerolls")[requestId])};
  },{actorId:fixture.actorId,requestId:settled.requestId,ID});
  assert.equal(replay.replay,true);assert.equal(replay.hp,fixture.maxHp-1);assert.equal(replay.same,true);
  evidence.cases.push("Actual native ordinary-check chat reroll pays once, keeps the original attribute/pool, replaces native retained dice, and replays the saved result without another roll/payment.");

  await page.reload();
  await page.waitForFunction(()=>globalThis.game?.ready);
  const reloaded = await page.evaluate(({actorId,ID})=>{
    const actor=game.actors.get(actorId);return {hp:actor.system.health.value,recovery:structuredClone(actor.system.recovery),
      operations:Object.values(actor.getFlag(ID,"debtRerolls")??{}).length};
  },{actorId:fixture.actorId,ID});
  assert.equal(reloaded.hp,fixture.maxHp-1);assert.deepEqual(reloaded.recovery,settled.recovery);assert.equal(reloaded.operations,1);

  for(const draft of [{kind:"setHp",hp:fixture.maxHp-3},{kind:"heal",amount:100,lifeResistance:0}]){
    const requestId = await page.evaluate(async ({actorId,draft})=>{
      const {requestRecovery}=await import("/systems/heroes-of-legend/services/recovery.mjs");
      const {damageBasis}=await import("/systems/heroes-of-legend/services/damage.mjs");
      const actor=game.actors.get(actorId);return (await requestRecovery(actor,damageBasis(actor),draft)).id;
    },{actorId:fixture.actorId,draft});
    await page.waitForFunction(({actorId,requestId,ID})=>game.actors.get(actorId).getFlag(ID,"operationReceipts")?.[requestId]?.applied,{actorId:fixture.actorId,requestId,ID});
  }
  assert.equal(await page.evaluate(id=>game.actors.get(id).system.health.value,fixture.actorId),fixture.maxHp-1);
  await page.evaluate(async actorId=>{
    const {RecoveryPanel}=await import("/systems/heroes-of-legend/applications/recovery.mjs");
    await new RecoveryPanel(game.actors.get(actorId)).render({force:true});
  },fixture.actorId);
  const panel=page.locator(".hol-recovery");
  await panel.getByText("1 HP unavailable until next dawn.",{exact:false}).waitFor();
  await panel.screenshot({path:`${output}/native-unavailable-hp.png`});
  await panel.getByRole("button",{name:"Next dawn",exact:true}).click();
  await page.waitForFunction(id=>!game.actors.get(id).system.recovery.debtUsed,fixture.actorId);
  assert.equal(await page.evaluate(id=>game.actors.get(id).system.health.value,fixture.actorId),fixture.maxHp-1);
  await panel.getByRole("button",{name:"Safe breath",exact:true}).click();
  await page.waitForFunction(id=>{const actor=game.actors.get(id);return actor.system.health.value===actor.system.health.max;},fixture.actorId);
  evidence.cases.push("Native reload preserves paid HP and daily use; ordinary healing stops at maximum−1; actual Recovery Next dawn unlocks the final HP without healing; Safe breath then restores it.");

  await page.evaluate(async actorId=>{
    for(const app of [...foundry.applications.instances.values()])if(app.actor?.id===actorId)await app.close();
  },fixture.actorId);
  fixture.synthetic = await page.evaluate(async ({fixture,fixtureId,ID})=>{
    const {rollAttribute}=await import("/systems/heroes-of-legend/services/roll.mjs");
    const actor=game.actors.get(fixture.actorId);
    const scene=await Scene.create({name:`${fixtureId} synthetic`,flags:{[ID]:{testFixture:fixtureId}},tokens:[]});
    const name=`${fixtureId} unlinked`;
    const created=await scene.createEmbeddedDocuments("Token",[{name,actorId:actor.id,actorLink:false,x:0,y:0}]);
    const token=created.find(document=>document.name===name&&document.actorId===actor.id);
    if(!token?.actor?.isToken||token.actor.uuid===actor.uuid)throw Error("Fixture did not create a distinct synthetic Actor.");
    const synthetic=token.actor;
    const message=await rollAttribute(synthetic,"knowledge",{boons:1,banes:0});
    return {sceneId:scene.id,tokenId:token.id,actorUuid:synthetic.uuid,messageId:message.id,
      original:structuredClone(message.getFlag(ID,"roll")),
      baseBefore:{hp:actor.system.health.value,recovery:structuredClone(actor.system.recovery)},
      before:{hp:synthetic.system.health.value,recovery:structuredClone(synthetic.system.recovery)}};
  },{fixture,fixtureId,ID});
  assert.equal(fixture.synthetic.original.actorUuid,fixture.synthetic.actorUuid);
  const syntheticCard=page.locator(`[data-message-id="${fixture.synthetic.messageId}"]`).first();
  await syntheticCard.getByRole("button",{name:"The Debt Comes Due · pay 1 HP & reroll",exact:true}).click();
  await page.waitForFunction(({sceneId,tokenId,messageId,ID})=>{
    const actor=game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
    return Object.values(actor?.getFlag(ID,"debtRerolls")??{}).some(operation=>operation.sourceMessageId===messageId&&operation.status==="resolved");
  },{...fixture.synthetic,ID});
  const syntheticResult=await page.evaluate(({fixture,ID})=>{
    const base=game.actors.get(fixture.actorId),actor=game.scenes.get(fixture.synthetic.sceneId).tokens.get(fixture.synthetic.tokenId).actor;
    const operation=Object.values(actor.getFlag(ID,"debtRerolls")).find(operation=>operation.sourceMessageId===fixture.synthetic.messageId);
    const message=game.messages.get(fixture.synthetic.messageId);
    return {base:{hp:base.system.health.value,recovery:structuredClone(base.system.recovery)},
      synthetic:{hp:actor.system.health.value,recovery:structuredClone(actor.system.recovery)},requestId:operation.requestId,
      snapshot:structuredClone(message.getFlag(ID,"roll")),retained:message.rolls[0].dice[0].results.filter(die=>die.active).map(die=>die.result)};
  },{fixture,ID});
  assert.deepEqual(syntheticResult.base,fixture.synthetic.baseBefore);
  assert.equal(syntheticResult.synthetic.hp,fixture.synthetic.before.hp-1);
  assert.deepEqual(syntheticResult.synthetic.recovery,{unavailableHp:1,debtUsed:true});
  assert.equal(syntheticResult.snapshot.actorUuid,fixture.synthetic.actorUuid);
  assert.equal(syntheticResult.snapshot.formula,fixture.synthetic.original.formula);
  assert.deepEqual(syntheticResult.snapshot.retained,syntheticResult.retained);
  await syntheticCard.screenshot({path:`${output}/native-synthetic-debt-replacement.png`});
  const syntheticReplay=await page.evaluate(async ({fixture,requestId,ID})=>{
    const {resolveRecoveryRequest}=await import("/systems/heroes-of-legend/services/recovery.mjs");
    const actor=game.scenes.get(fixture.synthetic.sceneId).tokens.get(fixture.synthetic.tokenId).actor;
    const before=JSON.stringify(actor.getFlag(ID,"debtRerolls")[requestId]);
    const result=await resolveRecoveryRequest(requestId);
    return {replay:result.replay,same:before===JSON.stringify(actor.getFlag(ID,"debtRerolls")[requestId]),hp:actor.system.health.value};
  },{fixture,requestId:syntheticResult.requestId,ID});
  assert.equal(syntheticReplay.replay,true);assert.equal(syntheticReplay.same,true);
  assert.equal(syntheticReplay.hp,syntheticResult.synthetic.hp);
  await page.reload();
  await page.waitForFunction(()=>globalThis.game?.ready);
  const syntheticReload=await page.evaluate(async ({fixture,requestId,ID})=>{
    const {ensureAuthorityReady}=await import("/systems/heroes-of-legend/services/authority.mjs");
    await ensureAuthorityReady();
    const {resolveRecoveryRequest}=await import("/systems/heroes-of-legend/services/recovery.mjs");
    const actor=game.scenes.get(fixture.synthetic.sceneId).tokens.get(fixture.synthetic.tokenId).actor;
    const before=JSON.stringify(actor.getFlag(ID,"debtRerolls")[requestId]);
    const result=await resolveRecoveryRequest(requestId);
    const base=game.actors.get(fixture.actorId);
    return {status:result.status,same:before===JSON.stringify(actor.getFlag(ID,"debtRerolls")[requestId]),
      synthetic:{hp:actor.system.health.value,recovery:structuredClone(actor.system.recovery)},
      base:{hp:base.system.health.value,recovery:structuredClone(base.system.recovery)}};
  },{fixture,requestId:syntheticResult.requestId,ID});
  // Requests are bound to their dispatching socket. Reload must not authorize
  // a different client to execute an old saved request, even for the same GM.
  assert.equal(syntheticReload.status,"not-authority");assert.equal(syntheticReload.same,true);
  assert.deepEqual(syntheticReload.synthetic,syntheticResult.synthetic);
  assert.deepEqual(syntheticReload.base,fixture.synthetic.baseBefore);
  evidence.cases.push("Actual unlinked-token chat reroll resolves the synthetic Actor UUID and mutates only its HP/debt. Same-client replay reuses its saved result; reload preserves state and rejects old-client dispatch without a second payment; the base Actor remains unchanged.");
  assert.deepEqual(evidence.browserErrors,[]);
} catch(error) {
  failure=error;evidence.failure=error.stack;
} finally {
  if(page) try {
    evidence.cleanup=await page.evaluate(async ({fixtureId,ID})=>{
      const results=[],actors=game.actors.filter(actor=>actor.getFlag(ID,"testFixture")===fixtureId);
      const scenes=game.scenes.filter(scene=>scene.getFlag(ID,"testFixture")===fixtureId);
      const uuids=new Set(actors.map(actor=>actor.uuid));
      for(const scene of scenes)for(const token of scene.tokens)if(token.actor)uuids.add(token.actor.uuid);
      for(const app of [...foundry.applications.instances.values()])if(uuids.has(app.actor?.uuid))await app.close();
      const messages=game.messages.filter(message=>uuids.has(message.getFlag(ID,"roll")?.actorUuid)||uuids.has(message.getFlag(ID,"recoveryRequest")?.actorUuid));
      for(const doc of [...messages,...scenes,...actors])try {await doc.delete();results.push({kind:doc.documentName,id:doc.id,deleted:true});}
      catch(error){results.push({kind:doc.documentName,id:doc.id,deleted:false,error:error.message});}
      return results;
    },{fixtureId,ID});
    if(evidence.cleanup.some(result=>!result.deleted))failure??=new Error("Fixture cleanup failed.");
  } catch(error){evidence.cleanupFailure=error.stack;failure??=error;}
  await browser?.close();
  evidence.finishedAt=new Date().toISOString();
  await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));
}
if(failure)throw failure;
console.log("PASS native and unlinked-token Debt chat rerolls, persistent payment, replay, healing cap, dawn unlock, reload and cleanup.");
