import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Select a disposable local world and enable writes");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
context.setDefaultTimeout(30000);
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(url);
  await page
    .locator("input[name=username]")
    .fill(process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  if (process.argv.includes("--prepare")) {
    console.info(
      await page.evaluate(async () => {
        const result = [];
        for (const [name, type] of [
          ["hol-fixture-actors", "Actor"],
          ["hol-fixture-journal", "JournalEntry"],
        ]) {
          let pack = game.packs.get(`world.${name}`);
          if (!pack)
            pack =
              await foundry.documents.collections.CompendiumCollection.createCompendium(
                { name, label: `HOL fixture ${type}`, type },
              );
          result.push({
            collection: pack.collection,
            path: pack.metadata.path,
          });
        }
        return result;
      }),
    );
  } else {
    const result = await page.evaluate(async () => {
      let unknownTypeRejected = false;
      try {
        new Actor({
          name: "Unknown type fixture",
          type: "hol-unknown-fixture",
        });
      } catch {
        unknownTypeRejected = true;
      }
      if (!unknownTypeRejected)
        throw new Error("Unknown Actor type was accepted");
      const actorPack = game.packs.get("world.hol-fixture-actors");
      const journalPack = game.packs.get("world.hol-fixture-journal");
      const actor = await actorPack.getDocument("holActor00000001");
      const journal = await journalPack.getDocument("holJournal000001");
      const page = journal.pages.get("holPage000000001");
      const uuid = "Compendium.world.hol-fixture-actors.Actor.holActor00000001";
      const linked = await fromUuid(uuid);
      const enriched =
        await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          page.text.content,
        );
      if (game.actors.has(actor.id) || game.journal.has(journal.id))
        throw new Error(
          "Fixture document ID already exists; refusing to overwrite a world document",
        );
      const imported = await game.actors.importFromCompendium(
        actorPack,
        actor.id,
        {},
        { keepId: true, keepEmbeddedIds: true, renderSheet: false },
      );
      const importedJournal = await game.journal.importFromCompendium(
        journalPack, journal.id, {},
        { keepId: true, keepEmbeddedIds: true, renderSheet: false },
      );
      const ids = {
        importedJournal: importedJournal.id,
        importedPage: importedJournal.pages.contents[0].id,
        importedText: importedJournal.pages.contents[0].text.content,
        actor: actor.id,
        item: actor.items.contents[0].id,
        effect: actor.items.contents[0].effects.contents[0].id,
        page: page.id,
        linked: linked?.id,
        imported: imported.id,
        importedItem: imported.items.contents[0].id,
        importedEffect: imported.items.contents[0].effects.contents[0].id,
        brawn: imported.system.attributes.brawn.base,
        brokenLink: enriched.includes("broken"),
        text: page.text.content,
      };
      await imported.delete();
      await importedJournal.delete();
      return ids;
    });
    assert.deepEqual(result, {
      importedJournal: "holJournal000001",
      importedPage: "holPage000000001",
      importedText: "<p>@UUID[Compendium.world.hol-fixture-actors.Actor.holActor00000001]{Fixture hero}</p>",
      actor: "holActor00000001",
      item: "holItem000000001",
      effect: "holEffect0000001",
      page: "holPage000000001",
      linked: "holActor00000001",
      imported: "holActor00000001",
      importedItem: "holItem000000001",
      importedEffect: "holEffect0000001",
      brawn: 2,
      brokenLink: false,
      text: "<p>@UUID[Compendium.world.hol-fixture-actors.Actor.holActor00000001]{Fixture hero}</p>",
    });
    assert.deepEqual(errors, []);
    console.info(
      "PASS: official-CLI packs load in Foundry; embedded IDs, journal page, UUID link and native Actor/Journal imports preserved; unknown Actor type rejected.",
    );
  }
} finally {
  await browser.close();
}
