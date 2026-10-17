import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL,
  mode = process.argv[2];
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1" ||
  !["--prepare", "--check-blocked", "--verify"].includes(mode)
)
  throw new Error(
    "Use a disposable local world and --prepare / --check-blocked / --verify",
  );
const file = new URL(
    "../test-results/coordinator-restart.json",
    import.meta.url,
  ),
  browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  if (mode === "--prepare") {
    const fixture = await page.evaluate(async () => {
      if (game.settings.get("heroes-of-legend", "creationAuthorityClient"))
        throw new Error("Expected unbound coordinator");
      const { bindCreationAuthority, enqueueCharacterOperation } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      await bindCreationAuthority();
      const { loadCatalogs } = await import(
        "/systems/heroes-of-legend/services/catalog.mjs"
      );
      const { getCampaignLanguageConfiguration } = await import(
        "/systems/heroes-of-legend/services/languages.mjs"
      );
      const { commit } = await loadCatalogs();
      const languageBasis = getCampaignLanguageConfiguration().basis;
      const draft = {
        name: "Restart Reed",
        attributes: {
          brawn: 1,
          fortitude: 0,
          agility: 0,
          guile: 0,
          knowledge: 1,
          reason: 1,
        },
        ancestryId: "ancestry-human",
        traitIds: ["trait-human-weathered", "trait-human-far-walker"],
        languages: { home: "dwarven", extraSpoken: [] },
        culture: { id: "origin-culture-deep-halls", pair: 0 },
        background: { id: "origin-background-bridge-worker", pair: 0 },
        classId: "class-intellect",
        classDisciplines: ["discipline-craft", "discipline-scholarship"],
        signatureId: "ability-signature-intellect-spot-the-leverage",
        acquisitions: {
          "ability-trail-workshop": {
            recipes: ["recipe-travel-food", "recipe-bound-torches"],
          },
        },
        purchases: { 0: [], 1: [] },
        shopping: [],
      };
      const actor = await Actor.create({
        name: "HOL restart fixture",
        type: "character",
        flags: {
          "heroes-of-legend": {
            creationDraft: {
              schemaVersion: 1,
              sourceCommit: commit,
              languageBasis,
              revision: 1,
              data: draft,
            },
          },
        },
      });
      const request = await ChatMessage.create({
        content: "Coordinator restart fixture",
      });
      await request.update({
        "flags.heroes-of-legend.creationRequest": {
          actorUuid: actor.uuid,
          revision: 1,
        },
      });
      globalThis.holUnsettled = enqueueCharacterOperation(
        () => new Promise(() => {}),
        { requestId: request.id },
      );
      return {
        actor: actor.id,
        request: request.id,
        launch: game.world.lastPlayed,
      };
    });
    await page.waitForFunction(
      () => game.settings.get("heroes-of-legend", "authorityWork").busy,
    );
    await mkdir(new URL("../test-results/", import.meta.url), {
      recursive: true,
    });
    await writeFile(file, JSON.stringify(fixture, null, 2) + "\n");
    console.info(
      "Prepared an unresolved request. Close test clients, restart only the isolated Foundry server, then run --verify.",
    );
  } else {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    if (mode === "--check-blocked") {
      assert(
        await page.evaluate(async () => {
          const { bindCreationAuthority } = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          );
          try {
            await bindCreationAuthority({ restartConfirmed: true });
            return false;
          } catch {
            return true;
          }
        }),
      );
      assert.equal(
        await page.evaluate(
          (id) => game.actors.get(id).system.health.baseMax,
          fixture.actor,
        ),
        12,
      );
      console.info(
        "PASS: takeover is blocked before world relaunch; no character changes.",
      );
    } else {
      assert.notEqual(
        await page.evaluate(() => game.world.lastPlayed),
        fixture.launch,
        "Actually restart the isolated world before verification",
      );
      await page.evaluate(async () => {
        const { bindCreationAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await bindCreationAuthority({ restartConfirmed: true });
      });
      await page.waitForFunction(
        (id) =>
          game.actors.get(id).getFlag("heroes-of-legend", "creationReceipt")
            ?.status === "complete",
        fixture.actor,
      );
      const before = await page.evaluate(
        (id) => ({
          hp: game.actors.get(id).system.health.baseMax,
          items: game.actors.get(id).items.size,
        }),
        fixture.actor,
      );
      assert.equal(before.hp, 17);
      await page.evaluate(async (id) => {
        const { resolveCreationRequest } = await import(
          "/systems/heroes-of-legend/services/creation.mjs"
        );
        await resolveCreationRequest(id);
      }, fixture.request);
      assert.deepEqual(
        await page.evaluate(
          (id) => ({
            hp: game.actors.get(id).system.health.baseMax,
            items: game.actors.get(id).items.size,
          }),
          fixture.actor,
        ),
        before,
      );
      await page.evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        await game.messages.get(f.request)?.delete();
        await game.actors.get(f.actor)?.delete();
      }, fixture);
      await unlink(file);
      console.info(
        "PASS: explicit recovery after real world restart, original request resumed once, completed grants unchanged on replay.",
      );
    }
  }
} finally {
  await browser.close();
}
