import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const root = resolve("dist/workshop"),
  prefix = "/heroes-of-legend-foundry/";
const types = {
  ".html": "text/html",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) throw new Error("wrong base path");
    const file = resolve(
      root,
      url.pathname.slice(prefix.length) || "index.html",
    );
    if (!file.startsWith(root + "/")) throw new Error("invalid path");
    res.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
page.on("dialog", (d) => d.accept());
const output = resolve("test-results/chat");
await mkdir(output, { recursive: true });
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
try {
  // A request must not appear before its shared defense controller is ready.
  await page.route("**/data/example.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto(base + "chat.html");
  await page.locator('.chat-log [data-chat-kind="request"]').waitFor();
  assert.equal(await page.locator(".sheet-links a").count(), 6);
  const request = page.locator('.chat-log [data-chat-kind="request"]').first();
  assert.match(await request.innerText(), /Goblin Scrapper/);
  assert.match(await request.innerText(), /Agility defense/);
  assert.deepEqual(
    await request.locator(".hol-chat-outcomes td").allTextContents(),
    ["5", "3", "2"],
  );
  assert.equal(await request.locator(".hol-chat-targets span").count(), 2);
  assert.equal(await request.getByRole("combobox").count(), 0);
  const player = page.locator('.chat-log [data-chat-kind="ability"]').first();
  assert.equal(await player.locator(".kept").count(), 3);
  assert.equal(await player.locator(".discarded").count(), 1);
  assert.match(
    await player.locator(".hol-chat-effect").innerText(),
    /5 physical damage; pull 1 and knock prone/,
  );
  assert.equal(await player.locator("[data-chat-defend]").count(), 0);
  await page.screenshot({ path: `${output}/chat-desktop.png` });
  for (let attempt = 0; attempt < 2; attempt++) {
    await request.getByRole("button", { name: "Defend", exact: true }).click();
    assert.equal(
      await page.getByLabel("Roll attribute", { exact: true }).inputValue(),
      "agility",
    );
    await page.getByRole("button", { name: "3 Banes", exact: true }).click();
    await page.evaluate(() => {
      globalThis.originalChatDice = crypto.getRandomValues;
      crypto.getRandomValues = (a) => {
        a[0] = 2;
        return a;
      };
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Roll", exact: true })
      .click();
    await page.evaluate(() => {
      crypto.getRandomValues = globalThis.originalChatDice;
    });
    assert.equal(
      await page.locator('.chat-log [data-chat-kind="defense"]').count(),
      attempt + 2,
    );
    const result = page.locator('.chat-log [data-chat-kind="defense"]').last();
    assert.equal(await result.locator(".kept").count(), 3);
    assert.equal(await result.locator(".discarded").count(), 3);
    assert.match(await result.innerText(), /Standard defense/);
    assert.match(
      await result.locator(".hol-chat-effect").innerText(),
      /3 physical damage before resistance/,
    );
    assert(
      await request
        .getByRole("button", { name: "Defend", exact: true })
        .isEnabled(),
    );
  }
  await page.getByRole("button", { name: "Healing", exact: true }).click();
  const healing = page.locator('.chat-log [data-chat-kind="Healing"]').last();
  assert.match(await healing.innerText(), /Restore 6 HP/);
  assert.match(await healing.innerText(), /Empty/);
  assert.match(await healing.innerText(), /Final dose/);
  await page.getByRole("button", { name: "Supply", exact: true }).click();
  assert.match(
    await page.locator('.chat-log [data-chat-kind="Supply"]').innerText(),
    /Supply d8 → d6/,
  );
  for (const [name, natural, tier] of [
    ["Natural 666", "additional benefit", "Strong"],
    ["Natural 111", "complication", "Weak"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const card = page.locator('.chat-log [data-chat-kind="attribute"]').last();
    assert.match(
      await card.locator(".hol-chat-natural").innerText(),
      new RegExp(natural),
    );
    assert.match(
      await card.locator(".hol-chat-verdict").innerText(),
      new RegExp(tier),
    );
  }
  await page
    .getByRole("button", { name: "Reset examples", exact: true })
    .click();
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 2,
      ),
    );
    assert(
      await page
        .locator(".chat-log")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    assert(
      await request.evaluate((e) => e.getBoundingClientRect().width <= 360),
    );
    await page.screenshot({ path: `${output}/chat-${width}.png` });
  }
  // All public text, including incoming creature names and effect prose, is escaped.
  await page.evaluate(async () => {
    const { resourceCard } = await import("./chat-cards.mjs");
    document.querySelector(".chat-log").insertAdjacentHTML(
      "beforeend",
      resourceCard({
        actor: "<img src=x onerror=alert(1)>",
        title: "<script>bad</script>",
        kind: "Supply",
        effect: "<b>Text</b>",
      }),
    );
  });
  assert.equal(
    await page.locator(".chat-log img[onerror], .chat-log script").count(),
    0,
  );
  assert.match(
    await page.locator(".chat-log .hol-chat-card").last().innerText(),
    /<b>Text<\/b>/,
  );
  assert.deepEqual(failures, []);
  console.log(
    "PASS chat cards: pinned defense outcomes, multiple suggestions, repeat Defend, six-die duplicate-face retention, player effects, healing final dose, supply, naturals, escaping and 760/390/320px layouts; zero browser errors.",
  );
} catch (e) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error("Browser errors:", failures);
  throw e;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
