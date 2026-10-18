import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    process.env.HOL_TEST_ALLOW_WRITES !== "1")
  throw new Error("Use an authorized disposable local world.");
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir("test-results", { recursive: true });
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready && game.canvas.initialized && !game.canvas.loading);
  await page.evaluate(async () => {
    const fixture = globalThis.__hol129SimpleRoll = { actor: null, message: null };
    const actor = await Actor.create({ name: "HOL129 slider fixture", type: "character" });
    fixture.actor = actor.id;
    const message = await ChatMessage.create({
      content: "HOL129 modifier preview fixture",
      flags: { "heroes-of-legend": { attackCard: {
        perspective: "defender", title: "Preview", attackerName: "Fixture",
        attributeKey: "agility", threat: { boons: 2, banes: 0 },
        damage: { weak: 5, standard: 3, strong: 2 },
      } } },
    });
    fixture.message = message.id;
    const { SharedRollDialog } = await import("/systems/heroes-of-legend/dialogs/attribute-roll.mjs");
    fixture.dialog = new SharedRollDialog(actor, "agility", { mode: "defense", attackMessageId: message.id });
    await fixture.dialog.render({ force: true });
  });
  const dialog = page.locator(".hol-roll-dialog");
  const slider = dialog.getByRole("slider", { name: "Boons or Banes", exact: true });
  assert.equal(await slider.inputValue(), "2");
  assert.equal(await dialog.locator("output").innerText(), "5d6kh3 + (0)");
  assert.equal(await dialog.locator('[name="boonsLabel"], [name="banesLabel"], [name="attemptReason"]').count(), 0);
  // An untouched slider follows refreshed automatic sources.
  await page.evaluate(async () => {
    const fixture = __hol129SimpleRoll;
    await game.messages.get(fixture.message).update({ "flags.heroes-of-legend.attackCard.threat": { boons: 5, banes: 1 } });
    await fixture.dialog.render();
  });
  assert.equal(await slider.inputValue(), "3");
  await slider.focus();
  for (let index = 0; index < 3; index++) await slider.press("ArrowLeft");
  assert.equal(await slider.inputValue(), "0");
  assert.equal(await dialog.locator("output").innerText(), "3d6 + (0)");
  await dialog.screenshot({ path: "test-results/simple-roll-effective-zero.png" });
  await page.evaluate(async () => {
    const fixture = __hol129SimpleRoll;
    await game.messages.get(fixture.message).update({ "flags.heroes-of-legend.attackCard.threat": { boons: 2, banes: 0 } });
    await fixture.dialog.render();
  });
  assert.equal(await slider.inputValue(), "0");
  await slider.press("ArrowLeft");
  assert.equal(await slider.inputValue(), "-1");
  assert.equal(await dialog.locator("output").innerText(), "4d6kl3 + (0)");
  await slider.press("Home");
  assert.equal(await dialog.locator("output").innerText(), "6d6kl3 + (0)");
  await slider.press("End");
  assert.equal(await dialog.locator("output").innerText(), "6d6kh3 + (0)");
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await slider.inputValue(), "0");
  assert.equal(await dialog.locator("output").innerText(), "3d6 + (0)");
} finally {
  try {
    await page.evaluate(async () => {
      const fixture = globalThis.__hol129SimpleRoll;
      if (!fixture) return;
      await fixture.dialog?.close();
      ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary");
      if (fixture.message) await game.messages.get(fixture.message)?.delete();
      if (fixture.actor) await game.actors.get(fixture.actor)?.delete();
      if (game.messages.has(fixture.message) || game.actors.has(fixture.actor))
        throw new Error("Simple roll fixture cleanup failed.");
    });
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
console.info("PASS: native effective slider prefill, keyboard/mouse −3/0/+3, automatic +2→manual −1, uncapped +5/−1→manual 0, source refresh/override, compact screenshot and cleanup; zero page errors.");
