import { selectTestUser } from "./helpers/login.mjs";
import { chromium } from "playwright";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Select a disposable local world and enable writes");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  context.setDefaultTimeout(30000);
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  const result = await page.evaluate(async () => {
    const id = foundry.utils.randomID();
    const data = {
      _id: id,
      name: "HOL temporary claim probe",
      ownership: { default: 0 },
    };
    const results = await Promise.allSettled([
      JournalEntry.create(
        { ...data, flags: { "heroes-of-legend": { nonce: "A" } } },
        { keepId: true },
      ),
      JournalEntry.create(
        { ...data, flags: { "heroes-of-legend": { nonce: "B" } } },
        { keepId: true },
      ),
    ]);
    const observations = results.map((r) => ({
      status: r.status,
      id: r.value?.id,
      nonce: r.value?.getFlag("heroes-of-legend", "nonce"),
      error: r.reason?.message,
    }));
    const finalNonce = game.journal
      .get(id)
      ?.getFlag("heroes-of-legend", "nonce");
    for (const key of new Set(results.map((r) => r.value?.id).filter(Boolean)))
      await game.journal.get(key)?.delete();
    return { observations, finalNonce };
  });
  console.info(JSON.stringify(result, null, 2));
  console.info(
    "Observation only: matching IDs are not proof of an exclusive server claim.",
  );
} finally {
  await browser.close();
}
