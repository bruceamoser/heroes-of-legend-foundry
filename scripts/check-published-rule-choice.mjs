import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1" || process.env.HOL_TEST_ISOLATED_WORLD !== "1") {
  throw Error("Use an explicitly isolated disposable Foundry world.");
}

const output = "test-results/current-rulebook";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));

try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  const fixture = await page.evaluate(async () => {
    const id = "heroes-of-legend";
    const path = "design/rules/languages.md";
    const { localRulePage } = await import("/systems/heroes-of-legend/services/journals.mjs");
    const current = await localRulePage(path);
    const saved = await JournalEntry.create({
      name: "Current rulebook regression fixture",
      flags: { [id]: { ruleBook: { key: "player-rules", schema: 2 } } },
      pages: [{
        _id: current.id,
        name: current.name,
        type: "text",
        flags: { [id]: { ruleSource: { path } } },
        text: { content: "<p>Stale world book test text.</p>", format: 1 },
      }],
    }, { keepEmbeddedIds: true });
    globalThis.__holCurrentRules = { id: saved.id };
    const { RulesLibrary } = await import("/systems/heroes-of-legend/applications/journals.mjs");
    const library = new RulesLibrary();
    globalThis.__holCurrentRules.library = library;
    library.rulePath = path;
    await library.render({ force: true });
    return { id: saved.id, pageId: current.id, before: saved.toObject(), journalCount: game.journal.size };
  });

  const reader = page.locator(".hol-rules-library [data-library-reader]");
  await reader.getByText(/learn one language native to it and gain one trait/).waitFor();
  assert.doesNotMatch(await reader.innerText(), /Stale world book test text/);
  assert.equal(await reader.getByRole("button", { name: /Read world copy|Read current published rules/ }).count(), 0);
  assert.equal(await page.locator(".hol-rules-library [data-action=importRules]").count(), 0);
  await reader.screenshot({ path: `${output}/current-inline.png` });
  await reader.getByRole("button", { name: "Open full book", exact: true }).click();
  await page.locator(`.hol-native-book [data-page-id="${fixture.pageId}"]`).first().waitFor();
  const after = await page.evaluate(id => ({ journalCount: game.journal.size, saved: game.journal.get(id).toObject() }), fixture.id);
  assert.equal(after.journalCount, fixture.journalCount);
  assert.deepEqual(after.saved, fixture.before);
  assert.deepEqual(errors, []);
  console.log("PASS current installed rulebook through inline and full-book views with an older world copy present.");
} finally {
  try {
    await page.evaluate(async () => {
      const state = globalThis.__holCurrentRules;
      if (!state) return;
      await state.library?.close();
      await game.journal.get(state.id)?.delete();
      if (game.journal.has(state.id)) throw Error("Current-rulebook fixture cleanup incomplete.");
    });
  } finally {
    await browser.close();
  }
}
