import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
import { writePortableCharacter } from "../src/rules/portable-character.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error(
    "Use an isolated local Foundry world with explicit write authorization.",
  );
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const choices = await read("../static/data/choices.json"),
  inventory = await read("../static/data/inventory.json"),
  heroes = await read("../tests/fixtures/reference-heroes.json");
const playDraft = structuredClone(heroes.characters[0].draft);
playDraft.play = {
  inventory: {
    added: [
      { id: "item-rope-coil", instanceId: "inventory-rope", quantity: 2 },
    ],
    removed: [],
  },
  languages: {
    added: [
      { id: "river-sign", name: "River Sign", form: "signed", written: false },
    ],
    removed: [],
  },
  conditions: [
    {
      id: "prone-test",
      key: "prone",
      rating: 1,
      persistence: "binary",
      source: "sheet",
    },
  ],
};
const data = writePortableCharacter(
  playDraft,
  { choices: choices.records, inventory, commit: choices.sourceCommit },
  { ready: true },
);
const browser = await chromium.launch(),
  page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem("core.noCanvas", "true"));
let fixture;
try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  fixture = await page.evaluate(async () => {
    const actor = await Actor.create({
      name: "Workshop import fixture",
      type: "character",
    });
    window.holWorkshopActorId = actor.id;
    return {
      id: actor.id,
      prior: Object.fromEntries(
        ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
          (key) => [key, game.settings.get("heroes-of-legend", key)],
        ),
      ),
    };
  });
  await page.evaluate(async () => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    window.holWorkshopWizard = new CreationWizard(
      game.actors.get(window.holWorkshopActorId),
    );
    await window.holWorkshopWizard.render({ force: true });
  });
  // A later-level plan must not be silently imported as a level-1 hero.
  const advanced = JSON.parse(data);
  advanced.draft.progression = { level: 2, levels: {} };
  const advancedChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import character JSON", exact: true })
    .click();
  await (
    await advancedChooser
  ).setFiles({
    name: "advanced.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(advanced)),
  });
  await page.getByText(/This file includes later-level advancement/).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        game.actors
          .get(window.holWorkshopActorId)
          .getFlag("heroes-of-legend", "creationDraft")?.revision ?? 0,
    ),
    0,
  );
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import character JSON", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Borin.hol.json",
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
  await page.waitForFunction(
    () =>
      game.actors
        .get(window.holWorkshopActorId)
        .getFlag("heroes-of-legend", "creationDraft")?.revision === 1,
  );
  assert(
    await page
      .getByText("All creation choices are valid.", { exact: true })
      .isVisible(),
  );
  const imported = await page.evaluate(() =>
    game.actors
      .get(window.holWorkshopActorId)
      .getFlag("heroes-of-legend", "creationDraft"),
  );
  assert.equal(imported.data.name, "Borin Bridgekeeper");
  assert.equal(imported.step, 7);
  assert.deepEqual(imported.data.play, playDraft.play);
  const result = await page.evaluate(async () => {
    const service = await import(
      "/systems/heroes-of-legend/services/creation.mjs"
    );
    await service.bindCreationAuthority({ restartConfirmed: true });
    const actor = game.actors.get(window.holWorkshopActorId);
    const message = await service.requestCreation(actor, 1);
    await service.resolveCreationRequest(message.id);
    return {
      name: actor.name,
      hp: actor.system.health.baseMax,
      receipt: actor.getFlag("heroes-of-legend", "creationReceipt"),
      items: actor.items.size,
    };
  });
  assert.equal(result.name, "Borin Bridgekeeper");
  assert.equal(result.hp, 25);
  assert.equal(result.receipt.status, "complete");
  assert(result.items > 10);
  assert.deepEqual(errors, []);
  console.info(
    "Native V14.369 file chooser import → Review → normal authority commit passed; Borin HP 25 with granted Items and receipt.",
  );
} finally {
  try {
    if (fixture)
      await page.evaluate(async (fixture) => {
        await window.holWorkshopWizard?.close();
        const actor = game.actors.get(fixture.id);
        const uuid = actor?.uuid;
        const messages = game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "creationRequest")?.actorUuid ===
            uuid,
        );
        if (messages.length)
          await ChatMessage.deleteDocuments(messages.map((m) => m.id));
        if (actor) await actor.delete();
        const authority = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        if (authority.isCreationAuthority()) await authority.releaseAuthority();
        for (const [key, value] of Object.entries(fixture.prior))
          await game.settings.set("heroes-of-legend", key, value);
      }, fixture);
  } finally {
    await browser.close();
  }
}
