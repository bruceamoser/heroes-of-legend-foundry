import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error(
    "Use an explicitly authorized disposable local Foundry world.",
  );
const heroes = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/reference-heroes.json", import.meta.url),
  ),
);
const oldCommit = "64089a1c8961d7faff172f179448a8b6e57827ef";
const currentCommit = "d67e046466bdd5052360b96ed91861d607091446";
const origin = "origin-culture-cloister-valleys";
const oldDraft = structuredClone(heroes.characters[0].draft);
oldDraft.culture = { id: origin, pair: 0, retainedFrom: oldCommit };
oldDraft.purchases = { 0: [], 1: [] };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1450, height: 960 },
});
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let fixture;
try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  fixture = await page.evaluate(
    async ({ oldDraft, oldCommit }) => {
      const actor = await Actor.create({
        name: "Origin update fixture",
        type: "character",
      });
      window.holOriginActorId = actor.id;
      const { getCampaignLanguageConfiguration } = await import(
        "/systems/heroes-of-legend/services/languages.mjs"
      );
      const saved = {
        schemaVersion: 1,
        sourceCommit: oldCommit,
        languageBasis: getCampaignLanguageConfiguration().basis,
        revision: 1,
        step: 2,
        data: oldDraft,
      };
      await actor.setFlag("heroes-of-legend", "creationDraft", saved);
      const committed = await Actor.create({
        name: "Committed origin fixture",
        type: "character",
        flags: {
          "heroes-of-legend": {
            creationDraft: saved,
            creationReceipt: {
              status: "complete",
              revision: 1,
              createdIds: [],
            },
          },
        },
      });
      window.holCommittedOriginActorId = committed.id;
      return {
        id: actor.id,
        committedId: committed.id,
        saved,
        before: { hp: actor.system.health.baseMax, items: actor.items.size },
        settings: Object.fromEntries(
          ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
            (key) => [key, game.settings.get("heroes-of-legend", key)],
          ),
        ),
      };
    },
    { oldDraft, oldCommit },
  );
  const committedBefore = await page.evaluate(
    (id) => game.actors.get(id).toObject(),
    fixture.committedId,
  );
  await page.evaluate(async ({ id, committedId }) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    window.holOriginWizard = new CreationWizard(game.actors.get(id));
    await window.holOriginWizard.render({ force: true });
    window.holCommittedOriginWizard = new CreationWizard(
      game.actors.get(committedId),
    );
    await window.holCommittedOriginWizard.render({ force: true });
  }, fixture);
  const wizard = page.locator(".hol-creation").first();
  assert.equal(
    await wizard.getByRole("heading", { name: "Rules update" }).count(),
    0,
  );
  assert.equal(
    await wizard
      .getByRole("button", { name: "Keep these choices and update draft" })
      .count(),
    0,
  );
  const culture = wizard.locator('select[name="culture"]');
  assert.equal(await culture.inputValue(), `${origin}|0`);
  assert.match(
    await culture.locator(`option[value="${origin}|0"]`).textContent(),
    /Radiance 1 \+ Lantern Moths/,
  );
  assert.equal(
    await culture.locator(`option[value="${origin}|0|${oldCommit}"]`).count(),
    0,
  );
  assert.deepEqual(
    await page.evaluate(() => window.holOriginWizard.draft.culture),
    { id: origin, pair: 0 },
  );
  assert.deepEqual(
    await page.evaluate(
      (id) => game.actors.get(id).toObject(),
      fixture.committedId,
    ),
    committedBefore,
  );
  await page.evaluate(async () => {
    await window.holCommittedOriginWizard.close();
    window.holOriginWizard.bringToFront();
  });
  const clickSave = async () => {
    await wizard
      .getByRole("button", { name: "Save choices", exact: true })
      .click();
    await page.waitForFunction(() => !window.holOriginWizard.busy);
  };
  await clickSave();
  let state = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    return {
      saved: actor.getFlag("heroes-of-legend", "creationDraft"),
      backup: actor.getFlag(
        "heroes-of-legend",
        "creationDraftBeforeRulesUpdate",
      ),
      hp: actor.system.health.baseMax,
      items: actor.items.size,
    };
  }, fixture.id);
  assert.equal(state.saved.sourceCommit, currentCommit);
  assert.equal(state.saved.revision, 2);
  assert.deepEqual(state.saved.data.culture, { id: origin, pair: 0 });
  assert.equal(state.backup, undefined);
  assert.deepEqual({ hp: state.hp, items: state.items }, fixture.before);
  assert.deepEqual(state.saved.data.purchases, oldDraft.purchases);
  assert(
    (
      await page.evaluate(() => window.holOriginWizard.preview.state.abilities)
    ).includes("ability-lantern-moths"),
  );
  const portable = {
    format: "heroes-of-legend-character",
    schemaVersion: 3,
    sourceCommit: oldCommit,
    draft: oldDraft,
  };
  const chooser = page.waitForEvent("filechooser");
  await wizard
    .getByRole("button", { name: "Import character JSON", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "old-origin.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(portable)),
  });
  await page.waitForFunction(
    (id) =>
      game.actors.get(id).getFlag("heroes-of-legend", "creationDraft")?.step ===
      7,
    fixture.id,
  );
  state = await page.evaluate(
    (id) => game.actors.get(id).getFlag("heroes-of-legend", "creationDraft"),
    fixture.id,
  );
  assert.equal(state.sourceCommit, currentCommit);
  assert.deepEqual(state.data.culture, { id: origin, pair: 0 });
  assert.equal(
    await wizard
      .getByRole("button", { name: "Create this character" })
      .isVisible(),
    true,
  );
  assert.deepEqual(errors, []);
  console.info(
    "Origin update native check passed: old draft ordinary save, current pair, old JSON import, committed Actor unchanged.",
  );
} finally {
  try {
    await page.evaluate(async (fixture) => {
      await window.holOriginWizard?.close();
      await window.holCommittedOriginWizard?.close();
      const actor = game.actors.get(fixture?.id ?? window.holOriginActorId);
      if (actor) await actor.delete();
      const committed = game.actors.get(
        fixture?.committedId ?? window.holCommittedOriginActorId,
      );
      if (committed) await committed.delete();
      const authority = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      if (authority.isCreationAuthority()) await authority.releaseAuthority();
      if (fixture?.settings)
        for (const [key, value] of Object.entries(fixture.settings))
          await game.settings.set("heroes-of-legend", key, value);
    }, fixture);
  } finally {
    await browser.close();
  }
}
