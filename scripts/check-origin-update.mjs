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
const oldSelection = { id: origin, pair: 0 };
const retainedSelection = { ...oldSelection, retainedFrom: oldCommit };
const oldDraft = structuredClone(heroes.characters[0].draft);
oldDraft.culture = oldSelection;
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
      // Keep its identity available to cleanup before any later fixture step can fail.
      window.holOriginActorId = actor.id;
      const { getCampaignLanguageConfiguration } = await import(
        "/systems/heroes-of-legend/services/languages.mjs"
      );
      const saved = {
        schemaVersion: 1,
        sourceCommit: oldCommit,
        languageBasis: getCampaignLanguageConfiguration().basis,
        revision: 1,
        step: 7,
        data: oldDraft,
      };
      await actor.setFlag("heroes-of-legend", "creationDraft", saved);
      const committed = await Actor.create({
        name: "Existing committed origin fixture",
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
        before: {
          hp: actor.system.health.baseMax,
          items: actor.items.size,
          receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
        },
        settings: Object.fromEntries(
          ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
            (key) => [key, game.settings.get("heroes-of-legend", key)],
          ),
        ),
      };
    },
    { oldDraft, oldCommit },
  );
  await page.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    window.holOriginWizard = new CreationWizard(game.actors.get(id));
    await window.holOriginWizard.render({ force: true });
  }, fixture.id);
  const wizard = page.locator(".hol-creation");
  const committedBefore = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    return {
      saved: actor.getFlag("heroes-of-legend", "creationDraft"),
      receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
      hp: actor.system.health.baseMax,
      items: actor.items.size,
    };
  }, fixture.committedId);
  await page.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    window.holCommittedOriginWizard = new CreationWizard(game.actors.get(id));
    await window.holCommittedOriginWizard.render({ force: true });
  }, fixture.committedId);
  assert.deepEqual(
    await page.evaluate((id) => {
      const actor = game.actors.get(id);
      return {
        saved: actor.getFlag("heroes-of-legend", "creationDraft"),
        receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
        hp: actor.system.health.baseMax,
        items: actor.items.size,
      };
    }, fixture.committedId),
    committedBefore,
  );
  await page.evaluate(async () => window.holCommittedOriginWizard.close());
  const actorState = () =>
    page.evaluate((id) => {
      const actor = game.actors.get(id);
      return {
        saved: actor.getFlag("heroes-of-legend", "creationDraft"),
        backup: actor.getFlag(
          "heroes-of-legend",
          "creationDraftBeforeRulesUpdate",
        ),
        hp: actor.system.health.baseMax,
        items: actor.items.size,
        receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
      };
    }, fixture.id);
  const clickAction = async (name) => {
    await wizard.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(() => !window.holOriginWizard.busy);
  };

  await wizard.getByRole("heading", { name: "Rules update" }).waitFor();
  assert.match(await wizard.textContent(), /original draft will be kept/i);
  assert.equal(
    await wizard.getByRole("button", { name: "Create this character" }).count(),
    0,
  );
  assert.equal(
    await page.evaluate(async () => {
      try {
        await window.holOriginWizard.persist();
        return false;
      } catch (error) {
        return /Review the rules update/.test(error.message);
      }
    }),
    true,
  );
  await clickAction("Save choices");
  let state = await actorState();
  assert.deepEqual(state.saved, fixture.saved);
  assert.equal(state.backup, undefined);
  assert.deepEqual(
    { hp: state.hp, items: state.items },
    { hp: fixture.before.hp, items: fixture.before.items },
  );
  assert.equal(state.receipt, fixture.before.receipt);

  await clickAction("Keep these choices and update draft");
  await page.waitForFunction(
    (id) =>
      game.actors.get(id).getFlag("heroes-of-legend", "creationDraft")
        ?.sourceCommit === "d67e046466bdd5052360b96ed91861d607091446",
    fixture.id,
  );
  state = await actorState();
  assert.equal(state.saved.revision, 2);
  assert.equal(state.saved.sourceCommit, currentCommit);
  assert.deepEqual(state.saved.data.culture, retainedSelection);
  assert.deepEqual(state.backup, fixture.saved);
  assert.equal(state.receipt, undefined);
  assert.deepEqual(
    await page.evaluate(() => ({
      valid: window.holOriginWizard.preview.valid,
      abilities: window.holOriginWizard.preview.state.abilities,
      hp: window.holOriginWizard.preview.summary.maximumHp,
    })),
    {
      valid: true,
      abilities: [
        "ability-the-untroubled-hand",
        "ability-hook-and-drive",
        "ability-signature-protector-between-them",
      ],
      hp: 24,
    },
  );
  await clickAction("Origins");
  const culture = wizard.locator('select[name="culture"]');
  const retainedValue = `${origin}|0|${oldCommit}`;
  const currentValue = `${origin}|0`;
  assert.equal(await culture.inputValue(), retainedValue);
  assert.match(
    await culture.locator(`option[value="${retainedValue}"]`).textContent(),
    /Athletics 1 \+ The Untroubled Hand \(retained choice\)/,
  );
  assert.match(
    await culture.locator(`option[value="${currentValue}"]`).textContent(),
    /Radiance 1 \+ Lantern Moths/,
  );
  await clickAction("Save choices");
  state = await actorState();
  assert.equal(state.saved.revision, 4); // Review -> Origins navigation, then save.
  assert.deepEqual(state.saved.data.culture, retainedSelection);
  assert.deepEqual(state.backup, fixture.saved);

  await culture.selectOption(currentValue);
  await clickAction("Save choices");
  state = await actorState();
  assert.deepEqual(state.saved.data.culture, oldSelection);
  assert.deepEqual(state.saved.data.purchases, { 0: [], 1: [] });
  assert.deepEqual(state.backup, fixture.saved);
  assert.deepEqual(
    await page.evaluate(() => window.holOriginWizard.preview.state.abilities),
    [
      "ability-lantern-moths",
      "ability-hook-and-drive",
      "ability-signature-protector-between-them",
    ],
  );

  // A portable current-edition draft may carry the reviewed retained marker.
  const portable = {
    format: "heroes-of-legend-character",
    schemaVersion: 3,
    sourceCommit: currentCommit,
    draft: { ...oldDraft, culture: retainedSelection },
  };
  const chooser = page.waitForEvent("filechooser");
  await wizard
    .getByRole("button", { name: "Import character JSON", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "retained-origin.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(portable)),
  });
  await page.waitForFunction((id) => {
    const saved = game.actors
      .get(id)
      .getFlag("heroes-of-legend", "creationDraft");
    return (
      saved?.step === 7 &&
      saved?.data?.culture?.retainedFrom ===
        "64089a1c8961d7faff172f179448a8b6e57827ef"
    );
  }, fixture.id);
  state = await actorState();
  assert.deepEqual(state.saved.data.culture, retainedSelection);
  assert.deepEqual(state.backup, fixture.saved);
  assert.equal(
    await wizard
      .getByRole("button", { name: "Create this character" })
      .isVisible(),
    true,
  );

  // Commit through the same authority path as ordinary native creation.
  const result = await page.evaluate(async (id) => {
    const service = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    await service.bindCreationAuthority({ restartConfirmed: true });
    const actor = game.actors.get(id);
    const message = await service.requestCreation(
      actor,
      actor.getFlag("heroes-of-legend", "creationDraft").revision,
    );
    await service.resolveCreationRequest(message.id);
    return {
      hp: actor.system.health.baseMax,
      receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
      abilityIds: actor.items
        .filter((item) => item.type === "ability")
        .map((item) => item.getFlag("heroes-of-legend", "catalogId")),
      backup: actor.getFlag(
        "heroes-of-legend",
        "creationDraftBeforeRulesUpdate",
      ),
      development: actor.getFlag("heroes-of-legend", "development"),
    };
  }, fixture.id);
  assert.equal(result.hp, 24);
  assert.equal(result.receipt.status, "complete");
  assert(result.abilityIds.includes("ability-the-untroubled-hand"));
  assert(!result.abilityIds.includes("ability-lantern-moths"));
  assert.deepEqual(result.backup, fixture.saved);
  assert.equal(result.development.coins, 8); // Derived from the retained origin and original shopping list.
  assert.deepEqual(errors, []);
  console.info(
    "Origin update native check passed: explicit review, retained grant, replacement, portable import and commit.",
  );
} finally {
  try {
    await page.evaluate(async (fixture) => {
      await window.holOriginWizard?.close();
      await window.holCommittedOriginWizard?.close();
      const actor = game.actors.get(fixture?.id ?? window.holOriginActorId);
      const uuid = actor?.uuid;
      if (uuid) {
        const messages = game.messages.filter(
          (message) =>
            message.getFlag("heroes-of-legend", "creationRequest")
              ?.actorUuid === uuid,
        );
        if (messages.length)
          await ChatMessage.deleteDocuments(
            messages.map((message) => message.id),
          );
      }
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
