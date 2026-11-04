import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writePortableCharacter } from "../src/rules/portable-character.mjs";

const directory = resolve("dist/workshop"), prefix = "/heroes-of-legend-foundry/";
const read = async path => JSON.parse(await readFile(path, "utf8"));
const choices = await read("static/data/choices.json");
const catalogs = { choices: choices.records, inventory: await read("static/data/inventory.json"), wounds: await read("static/data/wounds.json"), commit: choices.sourceCommit };
const fixture = (await read("tests/fixtures/reference-heroes.json")).characters[0].draft;
const ancestries = choices.records.filter(record => record.kind === "ancestry");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) throw Error("Wrong base path");
    const path = resolve(directory, url.pathname.slice(prefix.length) || "index.html");
    if (!path.startsWith(directory + "/")) throw Error("Invalid path");
    res.setHeader("Content-Type", ({".html":"text/html",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".ttf":"font/ttf"})[extname(path)] ?? "application/octet-stream");
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end("Not found"); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const base = (process.env.HOL_WORKSHOP_URL ?? `http://127.0.0.1:${server.address().port}${prefix}`).replace(/\/?$/, "/");
const failures = [];
page.on("pageerror", error => failures.push(error.message));
page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
page.on("dialog", dialog => dialog.accept());
const output = resolve(process.env.HOL_WORKSHOP_OUTPUT ?? "test-results/ancestry-workshop");
await mkdir(output, { recursive: true });
async function seed(ancestryId, traitIds, mode = "builder") {
  const draft = { ...structuredClone(fixture), ancestryId, traitIds };
  delete draft.play;
  const character = JSON.parse(writePortableCharacter(draft, catalogs));
  await page.evaluate(saved => localStorage.setItem("hol.workshop.v1", JSON.stringify(saved)), { character, mode, step: 1, tab: "Main", isExample: false });
  await page.reload();
  await page.getByRole("heading", { name: mode === "builder" ? "Ancestry & languages" : draft.name, exact: true }).waitFor();
  return character;
}
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("hol.workshop.v1")));
try {
  await page.goto(base);
  await page.getByRole("heading", {name:fixture.name,exact:true}).waitFor();
  await seed("ancestry-dwarf", []);
  assert.equal(await page.locator('[data-action="ancestry"]').count(), 10);
  for (const ancestry of ancestries) {
    await page.locator(`[data-action="ancestry"][data-id="${ancestry.id}"]`).click();
    assert.equal(await page.locator('input[data-list="traitIds"]').count(), 5, ancestry.name);
    await page.locator(`[data-action="reference"][data-id="${ancestry.id}"]`).click();
    const dialog = page.locator("#reference");
    assert.equal(await dialog.getByRole("heading", {name:ancestry.name,exact:true}).count(), 1);
    const narrative = await dialog.innerText();
    for (const paragraph of ancestry.reference.flavor) assert(narrative.includes(paragraph), `${ancestry.name}: full narrative`);
    assert(!narrative.includes("Prepared for v16.7.0"));
    await dialog.getByRole("button", {name:"Close",exact:true}).click();
    for (const id of ancestry.traits) {
      const trait = choices.records.find(record => record.id === id);
      const choice = page.locator(".check").filter({has:page.locator(`input[value="${id}"]`)});
      assert.equal(await choice.locator(".card-copy").textContent(), trait.reference.flavor[0], `${trait.name}: chooser description`);
      await choice.locator(`[data-action="reference"][data-id="${id}"]`).click();
      assert.equal(await dialog.locator("p.flavor").textContent(), trait.reference.flavor[0], `${trait.name}: reference description`);
      const prose = await dialog.innerText();
      for (const block of trait.reference.rules.body) assert(prose.includes(block.text), `${trait.name}: exact rules`);
      assert(!prose.includes("**Status:**"));
      if (id === "trait-tallfolk-long-reach") await page.screenshot({path:`${output}/trait-reference.png`,fullPage:true});
      await dialog.getByRole("button", {name:"Close",exact:true}).click();
    }
  }
  await page.screenshot({ path: `${output}/ten-ancestries.png`, fullPage: true });

  // Named saves, imports and subsequent reloads retain published IDs and choices.
  for (const id of ["ancestry-elf", "ancestry-dwarf"]) {
    const ancestry = ancestries.find(record => record.id === id);
    const character = await seed(id, ancestry.traits.slice(0, 2));
    const old = {...character, sourceCommit:"25b80c9fe77d7baaec3f3a8a548c9663d0f39a30"};
    await page.locator("#import-file").setInputFiles({ name:`old-${id}.json`, mimeType:"application/json", buffer:Buffer.from(JSON.stringify(old)) });
    await page.getByRole("heading", {name:"Review",exact:true}).waitFor();
    assert.equal((await stored()).character.draft.ancestryId, id);
    assert.deepEqual((await stored()).character.draft.traitIds, ancestry.traits.slice(0, 2));
    await page.getByRole("button", {name:"Save character",exact:true}).click();
    await page.locator("#save-name").fill(`Ancestry regression ${id}`);
    await page.locator("#reference").getByRole("button", {name:"Save",exact:true}).click();
    const saved = await stored();
    assert.equal(saved.character.sourceCommit, choices.sourceCommit);
    await page.reload();
    await page.getByRole("heading", {name:"Review",exact:true}).waitFor();
    assert.equal((await stored()).saveId, saved.saveId);
    await page.getByRole("button", {name:"Load character",exact:true}).click();
    await page.locator(".saved-characters article").filter({hasText:`Ancestry regression ${id}`}).getByRole("button", {name:"Load",exact:true}).click();
    await page.getByRole("tab", {name:"Main",exact:true}).waitFor();
    assert.equal((await stored()).character.draft.ancestryId, id);
    assert.deepEqual((await stored()).character.draft.traitIds, ancestry.traits.slice(0, 2));
  }

  // Exercise the mixed-ancestry controls and derived borrowed benefits through the rendered UI.
  await seed("ancestry-human", []);
  await page.locator('input[data-list="traitIds"][value="trait-human-many-homes"]').check();
  await page.locator('input[data-list="traitIds"][value="trait-human-weathered"]').check();
  await page.getByLabel("Other ancestry", {exact:true}).selectOption("ancestry-tallfolk");
  await page.getByLabel("Borrowed trait", {exact:true}).selectOption("trait-tallfolk-broad-back");
  await page.getByLabel("Ancestry language", {exact:true}).selectOption("giant");
  await page.getByRole("button", {name:"Read borrowed trait",exact:true}).click();
  assert((await page.locator("#reference").innerText()).includes("Your Bulk capacity increases by 3."));
  await page.locator("#reference").getByRole("button", {name:"Close",exact:true}).click();
  await page.getByRole("button", {name:"8 Review",exact:true}).click();
  await page.getByRole("button", {name:"View character sheet",exact:true}).click();
  await page.getByRole("tab", {name:"Main",exact:true}).click();
  assert.match(await page.locator('[data-collapse="movement-carrying"]').innerText(), /11 \/ 16/);
  assert(await page.locator('.trait-table [data-id="trait-tallfolk-broad-back"]').isVisible());
  const mixedDownload = page.waitForEvent("download");
  await page.getByRole("button", {name:"Export JSON",exact:true}).click();
  const mixedFile = `${output}/mixed-ancestry.hol.json`;
  await (await mixedDownload).saveAs(mixedFile);
  const mixed = JSON.parse(await readFile(mixedFile,"utf8"));
  assert.equal(mixed.draft.borrowedAncestryId,"ancestry-tallfolk");
  assert.equal(mixed.draft.borrowedTraitId,"trait-tallfolk-broad-back");
  assert.equal(mixed.draft.languages.ancestry,"giant");
  await page.reload();
  await page.getByRole("tab", {name:"Main",exact:true}).waitFor();
  assert.match(await page.locator('[data-collapse="movement-carrying"]').innerText(), /11 \/ 16/);
  await page.getByRole("button", {name:/Edit/}).first().click();
  await page.getByRole("tab", {name:"Development",exact:true}).click();
  await page.getByRole("button", {name:"Edit creation",exact:true}).click();
  await page.getByRole("button", {name:"2 Ancestry",exact:true}).click();
  assert.equal(await page.getByLabel("Ancestry language", {exact:true}).inputValue(),"giant");
  await page.getByLabel("Other ancestry", {exact:true}).selectOption("ancestry-gnome");
  await page.getByLabel("Borrowed trait", {exact:true}).selectOption("trait-gnome-small-target");
  await page.getByLabel("Ancestry language", {exact:true}).selectOption("goblin");
  await page.getByRole("button", {name:"8 Review",exact:true}).click();
  await page.getByRole("button", {name:"View character sheet",exact:true}).click();
  await page.getByRole("tab", {name:"Main",exact:true}).click();
  assert.match(await page.locator('[data-collapse="movement-carrying"]').innerText(), /11 \/ 13/);
  await page.getByRole("button", {name:"Evade",exact:true}).click();
  assert.equal(await page.locator("#recipe-net").inputValue(),"1", "borrowed Small Target supplies one defense Boon");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("tab", {name:"Main",exact:true}).waitFor();
  const mixedReloaded = (await stored()).character.draft;
  assert.equal(mixedReloaded.borrowedAncestryId,"ancestry-gnome");
  assert.equal(mixedReloaded.borrowedTraitId,"trait-gnome-small-target");
  assert.equal(mixedReloaded.languages.ancestry,"goblin");
  await page.screenshot({path:`${output}/mixed-ancestry.png`,fullPage:true});

  // Legacy two-language choices remain intact until the user explicitly replaces or removes the grant.
  const legacyMixed = await seed("ancestry-human", ["trait-human-many-homes", "trait-human-weathered"]);
  legacyMixed.sourceCommit = "25b80c9fe77d7baaec3f3a8a548c9663d0f39a30";
  legacyMixed.draft.languages.extraSpoken = ["elven", "harbor-cant"];
  legacyMixed.draft.profile = {story:"Retain this legacy hero's story."};
  async function importLegacyMixed() {
    await page.locator("#import-file").setInputFiles({name:"legacy-mixed-ancestry.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacyMixed))});
    await page.getByRole("heading", {name:"Review",exact:true}).waitFor();
    assert(await page.getByRole("button", {name:"Export character JSON",exact:true}).isDisabled());
    await page.getByRole("button", {name:"2 Ancestry",exact:true}).click();
    const original = (await stored()).character.draft;
    assert.deepEqual(original.languages.extraSpoken,["elven","harbor-cant"]);
    assert.equal(original.borrowedAncestryId,undefined);
    assert.equal(original.borrowedTraitId,undefined);
    assert.equal(original.profile.story,"Retain this legacy hero's story.");
  }
  await importLegacyMixed();
  await page.getByLabel("Ancestry language", {exact:true}).selectOption("");
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,["elven","harbor-cant"],"a missing replacement does not discard legacy choices");
  await page.getByLabel("Other ancestry", {exact:true}).selectOption("ancestry-tallfolk");
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,["elven","harbor-cant"]);
  await page.getByLabel("Borrowed trait", {exact:true}).selectOption("trait-tallfolk-broad-back");
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,["elven","harbor-cant"]);
  await page.getByLabel("Ancestry language", {exact:true}).selectOption("giant");
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,[]);
  assert.equal((await stored()).character.draft.languages.home,fixture.languages.home);
  await page.getByRole("button", {name:"8 Review",exact:true}).click();
  await page.getByRole("heading", {name:"Creation complete",exact:true}).waitFor();
  const repairedDownload = page.waitForEvent("download");
  await page.getByRole("button", {name:"Export character JSON",exact:true}).click();
  const repairedFile = `${output}/repaired-legacy-ancestry.hol.json`;
  await (await repairedDownload).saveAs(repairedFile);
  const repaired = JSON.parse(await readFile(repairedFile,"utf8"));
  assert.equal(repaired.status,"ready");
  assert.deepEqual(repaired.draft.languages.extraSpoken,[]);
  assert.equal(repaired.draft.languages.ancestry,"giant");
  assert.equal(repaired.draft.borrowedAncestryId,"ancestry-tallfolk");
  assert.equal(repaired.draft.borrowedTraitId,"trait-tallfolk-broad-back");
  assert.equal(repaired.draft.profile.story,legacyMixed.draft.profile.story);
  await page.reload();
  await page.getByRole("heading", {name:"Creation complete",exact:true}).waitFor();
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,[]);
  await page.screenshot({path:`${output}/repaired-legacy-ancestry.png`,fullPage:true});

  await importLegacyMixed();
  await page.locator('input[data-list="traitIds"][value="trait-human-many-homes"]').uncheck();
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,[]);
  assert.equal((await stored()).character.draft.profile.story,legacyMixed.draft.profile.story);
  await page.locator('input[data-list="traitIds"][value="trait-human-practiced-patience"]').check();
  await page.getByRole("button", {name:"8 Review",exact:true}).click();
  await page.getByRole("heading", {name:"Creation complete",exact:true}).waitFor();
  assert(await page.getByRole("button", {name:"Export character JSON",exact:true}).isEnabled());

  await importLegacyMixed();
  await page.locator('[data-action="ancestry"][data-id="ancestry-dwarf"]').click();
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,["elven","harbor-cant"],"changing ancestry keeps stale choices for explicit removal");
  // These stale checkboxes disappear immediately after their change events.
  await page.locator('input[data-list="traitIds"][value="trait-human-many-homes"]').click();
  assert.equal(await page.locator('input[data-list="traitIds"][value="trait-human-many-homes"]').count(),0);
  assert.deepEqual((await stored()).character.draft.languages.extraSpoken,[]);
  await page.locator('input[data-list="traitIds"][value="trait-human-weathered"]').click();
  for (const id of fixture.traitIds) await page.locator(`input[data-list="traitIds"][value="${id}"]`).check();
  await page.getByRole("button", {name:"8 Review",exact:true}).click();
  await page.getByRole("heading", {name:"Creation complete",exact:true}).waitFor();
  assert(await page.getByRole("button", {name:"Export character JSON",exact:true}).isEnabled());

  // The daily reroll pays HP once, keeps its original modifiers and persists its recovery ceiling.
  await seed("ancestry-oath-bound", ["trait-oath-bound-the-debt-comes-due", "trait-oath-bound-neither-here-nor-there"], "sheet");
  const maximum = Number(await page.getByLabel("Current HP", {exact:true}).inputValue());
  await page.getByRole("button", {name:"Roll Brawn",exact:true}).click();
  await page.locator("#recipe-net").fill("1");
  await page.locator("#recipe-net").dispatchEvent("input");
  await page.evaluate(() => { globalThis.ancestryDiceCount = 0; crypto.getRandomValues = array => { globalThis.ancestryDiceCount += array.length; array.fill(2); return array; }; });
  await page.locator("#reference").getByRole("button", {name:"Roll",exact:true}).click();
  assert.equal(await page.evaluate(() => globalThis.ancestryDiceCount), 4);
  await page.locator("#recipe-net").fill("-3");
  await page.locator("#recipe-net").dispatchEvent("input");
  await page.getByRole("button", {name:"The Debt Comes Due · pay 1 HP & reroll",exact:true}).click();
  assert.equal(await page.evaluate(() => globalThis.ancestryDiceCount), 8, "reroll retained original +1 net");
  assert.equal(Number(await page.getByLabel("Current HP", {exact:true}).inputValue()), maximum - 1);
  assert(await page.getByRole("button", {name:"The Debt Comes Due · pay 1 HP & reroll",exact:true}).isDisabled());
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", {name:"Recovery",exact:true}).waitFor();
  assert.deepEqual((await stored()).character.draft.play.recovery, {unavailableHp:1,debtUsed:true});
  await page.getByLabel("Current HP", {exact:true}).fill("3");
  await page.getByLabel("Current HP", {exact:true}).press("Tab");
  await page.getByRole("button", {name:"Use Grit",exact:true}).click();
  await page.getByRole("button", {name:"Spend 1 Grit",exact:true}).click();
  assert.equal(Number(await page.getByLabel("Current HP", {exact:true}).inputValue()), maximum - 1);
  await page.getByRole("button", {name:"Recovery",exact:true}).click();
  await page.getByRole("button", {name:"Next dawn",exact:true}).click();
  assert.equal(Number(await page.getByLabel("Current HP", {exact:true}).inputValue()), maximum - 1, "dawn unlocks HP without healing");
  await page.getByRole("button", {name:"Safe breath",exact:true}).click();
  assert.equal(Number(await page.getByLabel("Current HP", {exact:true}).inputValue()), maximum);
  await page.keyboard.press("Escape");
  await page.screenshot({path:`${output}/debt-recovery.png`,fullPage:true});

  await page.goto(`${base}journal.html#rule-vision`);
  await page.getByRole("article", {name:"Rule entry"}).waitFor();
  assert.match(await page.locator(".journal-page").innerText(), /Low-Light Vision/);
  await page.screenshot({path:`${output}/shared-vision.png`,fullPage:true});
  await page.locator('[data-entry="rule-ancestry-procedures"]').click();
  assert.match(await page.locator(".journal-page").innerText(), /ancestry/i);
  await page.screenshot({path:`${output}/shared-ancestry-rules.png`,fullPage:true});
  assert.deepEqual(failures, []);
  console.info("Ancestry workshop passed: ten ancestries, fifty exact trait references, shared vision/procedures, old-ID import/save/reload, mixed ancestry controls/derived benefits/export/reload, explicit legacy-language repair/removal, daily Debt reroll and recovery persistence; no browser errors.");
} finally { await browser.close(); await new Promise(done => server.close(done)); }
