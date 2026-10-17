import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
import { stableFoundryId } from "./content/item-packs.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error(
    "Select a disposable local Foundry world and set HOL_TEST_ALLOW_WRITES=1",
  );

const catalog = JSON.parse(
    await readFile(
      new URL("../static/data/choices.json", import.meta.url),
      "utf8",
    ),
  ),
  inventory = JSON.parse(
    await readFile(
      new URL("../static/data/inventory.json", import.meta.url),
      "utf8",
    ),
  ),
  defend = catalog.records.find((record) => record.id === "ability-defend"),
  shieldBlock = catalog.records.find(
    (record) => record.id === "ability-shield-block",
  ),
  reference = catalog.records.find(
    (record) => record.id === "ability-a-bough-for-the-fallen",
  ),
  ammunition = inventory.equipment.find(
    (record) => record.id === "item-ammunition-bundle",
  );
assert(defend && shieldBlock && reference && ammunition);
const ammunitionFoundryId = stableFoundryId(ammunition.id);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
context.setDefaultTimeout(30000);
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
await mkdir("test-results", { recursive: true });
await page.exposeFunction("holCapturePackReference", async () => {
  await page.locator(".hol-ability").screenshot({path:"test-results/item-pack-reference.png"});
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  const result = await page.evaluate(
    async ({ defendId, shieldId, referenceId, equipmentId }) => {
      const abilityPack = game.packs.get("heroes-of-legend.abilities"),
        equipmentPack = game.packs.get("heroes-of-legend.equipment");
      if (!abilityPack || !equipmentPack)
        throw new Error("HOL Item compendium packs are unavailable");
      if (
        abilityPack.metadata.type !== "Item" ||
        equipmentPack.metadata.type !== "Item"
      )
        throw new Error("HOL compendiums are not native Item packs");
      const abilityDocs = await Promise.all(
          [defendId, shieldId, referenceId].map((id) =>
            abilityPack.getDocument(id),
          ),
        ),
        equipmentDoc = await equipmentPack.getDocument(equipmentId);
      if (abilityDocs.some((document) => !document) || !equipmentDoc)
        throw new Error("A stable compendium Item is missing");
      const allIds = [
        ...abilityDocs.map((document) => document.id),
        equipmentDoc.id,
      ];
      if (allIds.some((id) => game.items.has(id)))
        throw new Error(
          "A fixture Item ID already exists; refusing to overwrite a world Item",
        );
      const imported = [];
      let referenceSheet = null;
      try {
        for (const document of abilityDocs)
          imported.push(
            await game.items.importFromCompendium(
              abilityPack,
              document.id,
              {},
              { keepId: true, renderSheet: false },
            ),
          );
        imported.push(
          await game.items.importFromCompendium(
            equipmentPack,
            equipmentDoc.id,
            {},
            { keepId: true, renderSheet: false },
          ),
        );
        for (const item of imported)
          item.validate({ strict: true, fallback: false });
        const { itemAbilityDefinition } = await import(
          "/systems/heroes-of-legend/services/abilities.mjs"
        );
        const byCatalog = (id) =>
          imported.find(
            (item) =>
              item.id === id,
          );
        const defendItem = byCatalog(defendId),
          shieldItem = byCatalog(shieldId),
          referenceItem = byCatalog(referenceId);
        referenceSheet = referenceItem.sheet;
        await referenceSheet.render({ force: true });
        await globalThis.holCapturePackReference();
        const renderedReference =
          referenceSheet.element?.querySelector(".hol-item-reference")
            ?.textContent ?? "";
        return {
          packIds: [abilityPack.collection, equipmentPack.collection],
          source: {
            defend: await fromUuid(
              `Compendium.heroes-of-legend.abilities.Item.${defendId}`,
            ).then((document) => document?.uuid),
            equipment: await fromUuid(
              `Compendium.heroes-of-legend.equipment.Item.${equipmentId}`,
            ).then((document) => document?.uuid),
          },
          defend: {
            uuid: defendItem.uuid,
            type: defendItem.type,
            catalogId: defendItem.getFlag(
              "heroes-of-legend",
              "catalogId",
            ),
            source: defendItem.getFlag("heroes-of-legend", "source"),
            sourceCommit: defendItem.getFlag(
              "heroes-of-legend",
              "sourceCommit",
            ),
            automation: defendItem.getFlag(
              "heroes-of-legend",
              "automation",
            ),
            automationLabel: defendItem.getFlag(
              "heroes-of-legend",
              "automationLabel",
            ),
            handler: itemAbilityDefinition(defendItem)?.handler ?? null,
            model: {
              schemaVersion: defendItem.system.schemaVersion,
              action: defendItem.system.activity.action,
              rollMode: defendItem.system.activity.rollMode,
            },
            effects: defendItem.effects.size,
          },
          shield: {
            handler: itemAbilityDefinition(shieldItem)?.handler ?? null,
          },
          reference: {
            description: referenceItem.system.description,
            renderedReference,
            catalogId: referenceItem.getFlag(
              "heroes-of-legend",
              "catalogId",
            ),
            source: referenceItem.getFlag("heroes-of-legend", "source"),
            handler: itemAbilityDefinition(referenceItem),
          },
          equipment: {
            uuid: imported.at(-1).uuid,
            type: imported.at(-1).type,
            catalogId: imported.at(-1).system.catalogId,
            source: imported.at(-1).getFlag("heroes-of-legend", "source"),
            sourceCommit: imported.at(-1).getFlag(
              "heroes-of-legend",
              "sourceCommit",
            ),
            automation: imported
              .at(-1)
              .getFlag("heroes-of-legend", "automation"),
            automationLabel: imported
              .at(-1)
              .getFlag("heroes-of-legend", "automationLabel"),
            model: {
              schemaVersion: imported.at(-1).system.schemaVersion,
              quantity: imported.at(-1).system.quantity,
              hands: imported.at(-1).system.hands,
              inventoryDie: imported.at(-1).system.inventoryDie,
              held: imported.at(-1).system.held,
              worn: imported.at(-1).system.worn,
            },
            effects: imported.at(-1).effects.size,
          },
          effects: imported.reduce(
            (total, item) => total + item.effects.size,
            0,
          ),
          actorBound: imported.some((item) => Boolean(item.actor)),
          grantFlags: imported.some((item) =>
            ["creationGrant", "grantKind", "acquisitionInstance"].some(
              (key) =>
                item.getFlag("heroes-of-legend", key) !== undefined,
            ),
          ),
        };
      } finally {
        try {
          await referenceSheet?.close();
        } catch {}
        for (const item of imported.reverse()) await item.delete();
      }
    },
    {
      defendId: defend.foundryId,
      shieldId: shieldBlock.foundryId,
      referenceId: reference.foundryId,
      equipmentId: ammunitionFoundryId,
    },
  );

  assert.deepEqual(result.packIds, [
    "heroes-of-legend.abilities",
    "heroes-of-legend.equipment",
  ]);
  assert.equal(
    result.source.defend,
    `Compendium.heroes-of-legend.abilities.Item.${defend.foundryId}`,
  );
  assert.equal(
    result.source.equipment,
    `Compendium.heroes-of-legend.equipment.Item.${ammunitionFoundryId}`,
  );
  assert.deepEqual(result.defend, {
    uuid: `Item.${defend.foundryId}`,
    type: "ability",
    catalogId: defend.id,
    source: defend.source,
    sourceCommit: catalog.sourceCommit,
    automation: "reviewed",
    automationLabel: "Reviewed native action · rules reference",
    handler: "defend-v1",
    model: {
      schemaVersion: 1,
      action: "maneuver",
      rollMode: "none",
    },
    effects: 0,
  });
  assert.deepEqual(result.shield, { handler: "shield-block-v1" });
  assert.equal(result.reference.catalogId, reference.id);
  assert.deepEqual(result.reference.source, reference.source);
  assert.equal(result.reference.handler, null);
  assert(
    result.reference.description.includes(
      "<h2>Rules</h2>",
    ),
  );
  assert(
    result.reference.description.includes(
      "Offensive healing — latest agreement",
    ),
  );
  assert(
    result.reference.renderedReference.includes(
      "Offensive healing — latest agreement",
    ),
  );
  assert(
    result.reference.renderedReference.includes(
      "Rules reference · play automation in progress",
    ),
  );
  assert.deepEqual(result.equipment, {
    uuid: `Item.${ammunitionFoundryId}`,
    type: "equipment",
    catalogId: ammunition.id,
    source: ammunition.source,
    sourceCommit: inventory.sourceCommit,
    automation: "pending",
    automationLabel:
      "Market reference · acquisition and use automation in progress",
    model: {
      schemaVersion: 1,
      quantity: 1,
      hands: 0,
      inventoryDie: 8,
      held: false,
      worn: false,
    },
    effects: 0,
  });
  assert.equal(result.effects, 0);
  assert.equal(result.actorBound, false);
  assert.equal(result.grantFlags, false);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: shipped native Item packs opened; reviewed and reference-only Items imported with stable UUIDs, exact source provenance, model defaults, rich authored references, no actor acquisition and no embedded effects or grant flags.",
  );
} finally {
  await browser.close();
}
