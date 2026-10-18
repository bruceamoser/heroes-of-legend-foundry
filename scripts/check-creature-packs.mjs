import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  CREATURE_AUTOMATION_LABEL,
} from "./content/creature-packs.mjs";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (!url)
  throw new Error("Set HOL_TEST_URL to an isolated local Foundry world.");
if (
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1" ||
  process.env.HOL_TEST_ISOLATED_WORLD !== "1"
)
  throw new Error(
    "Use a disposable local world with HOL_TEST_ALLOW_WRITES=1 and HOL_TEST_ISOLATED_WORLD=1.",
  );

const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/creatures.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(catalog.creatures.length, 192);
const portraitManifest = JSON.parse(await readFile(new URL("../static/assets/creatures/manifest.json", import.meta.url), "utf8"));
const representativeIds = ["creature-adder", "creature-red-dragon"];
const representativeRecords = representativeIds.map((id) => {
  const record = catalog.creatures.find((candidate) => candidate.id === id);
  assert(record, `Missing representative creature ${id}`);
  return record;
});

function expectedProfile(record) {
  const basic = record.actions.main.actions.find(
    ({ name }) => name === "Basic Melee",
  );
  return {
    catalogId: record.id,
    name: record.name,
    type: "creature",
    img: `systems/heroes-of-legend/${portraitManifest.portraits.find(p => p.id === record.id).asset}`,
    cv: record.cv,
    attributes: Object.fromEntries(
      Object.entries(record.attributes).map(([key, base]) => [key, base]),
    ),
    health: record.hp.max,
    speed: record.speed.ordinary,
    speedSource: record.speed.sourceText,
    alternateSpeeds: record.speed.alternates,
    size: record.size.value,
    sizeLabel: record.size.label,
    sizeSource: record.size.sourceText,
    footprint: record.size.footprint ?? {
      width: record.size.value,
      height: record.size.value,
    },
    prototypeToken: record.size.footprint ?? {
      width: record.size.value,
      height: record.size.value,
    },
    armor: record.armor.dr,
    armorMarker: record.armor.marker ?? "",
    armorSource: record.armor.sourceText,
    stability: record.defenses.stability,
    evasion: record.defenses.evasion,
    threat: record.defenses.threat,
    weaknesses: record.weaknesses,
    resistances: record.resistances,
    immunities: record.immunities,
    basicMelee: {
      weak: Number(basic.outcomes.weak),
      standard: Number(basic.outcomes.standard),
      strong: Number(basic.outcomes.strong),
      defenseAttribute: basic.defense.attribute,
      orientation: "player-defense",
    },
    source: {
      path: record.source.path,
      sha256: record.source.sha256,
    },
    sourceCommit: catalog.source.commit,
    classification: record.classification,
    abilitySources: record.abilitySources,
    summoning: record.summoning,
    automation: "pending",
    automationLabel: CREATURE_AUTOMATION_LABEL,
    compendiumId: record.foundryId,
    resolvedImportId: record.foundryId,
  };
}

const expected = representativeRecords.map(expectedProfile);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
});
context.setDefaultTimeout(120000);
await context.addInitScript(() => {
  localStorage.setItem("core.maxFPS", "10");
  localStorage.setItem("core.performanceMode", "0");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  const result = await page.evaluate(
    async ({ ids, expectedProfiles, sourceCommit }) => {
      const ID = "heroes-of-legend";
      const pack = game.packs.get(`${ID}.creatures`);
      if (!pack) throw new Error("Creature Actor pack is unavailable");
      if (pack.metadata.type !== "Actor")
        throw new Error("Creature compendium is not a native Actor pack");
      if (pack.index.size !== ids.length)
        throw new Error(
          `Creature pack has ${pack.index.size} indexed records, expected ${ids.length}`,
        );

      const validationDetails = (error) => {
        const failures = Object.entries(error?.getAllFailures?.() ?? {});
        if (!failures.length) return error?.stack ?? String(error);
        return failures
          .map(([field, failure]) => {
            const value = JSON.stringify(failure.invalidValue);
            const actual = value === undefined ? "" : ` (actual ${value})`;
            return `${field}: ${failure.message}${actual}`;
          })
          .join("\n");
      };
      const missing = [];
      const sourceActors = new Map();
      const sourceValidationErrors = [];
      const sourceShapeErrors = [];
      for (const id of ids) {
        let source;
        try {
          source = await pack.getDocument(id);
          if (!source) {
            missing.push(id);
            continue;
          }
          sourceActors.set(id, source);
          source.validate({ strict: true, fallback: false });
          if (source.prototypeToken.width !== source.system.footprint.width ||
              source.prototypeToken.height !== source.system.footprint.height)
            sourceShapeErrors.push(`- ${id}: native prototype token differs from printed footprint`);
          for (const [section, expectedKeys] of [
            ["numeric", ["type", "value"]],
            ["special", ["reference", "type"]],
          ]) {
            for (const collection of [
              source.system.weaknesses,
              source.system.resistances,
            ]) {
              for (const [index, entry] of collection[section].entries()) {
                const actualKeys = Object.keys(entry).sort();
                if (actualKeys.join() === expectedKeys.join()) continue;
                sourceShapeErrors.push(
                  `- ${id} (${source.name}): ${section} mitigation ${index} has keys ${actualKeys.join(", ")}; expected ${expectedKeys.join(", ")}`,
                );
              }
            }
          }
        } catch (error) {
          const details = validationDetails(error)
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n");
          const name = source?.name ? ` (${source.name})` : "";
          sourceValidationErrors.push(`- ${id}${name}:\n${details}`);
        }
      }
      if (
        missing.length ||
        sourceValidationErrors.length ||
        sourceShapeErrors.length
      ) {
        const errors = [];
        if (missing.length)
          errors.push(`Missing creature pack documents: ${missing.join(", ")}`);
        if (sourceValidationErrors.length)
          errors.push(
            `Creature source validation failed before import:\n${sourceValidationErrors.join("\n")}`,
          );
        if (sourceShapeErrors.length)
          errors.push(
            `Creature source shapes failed before import:\n${sourceShapeErrors.join("\n")}`,
          );
        throw new Error(errors.join("\n"));
      }

      const defaultCreature = new Actor({
        name: "HOL plain creature schema fixture",
        type: "creature",
      });
      defaultCreature.validate({ strict: true, fallback: false });
      const emptyMarkerCreature = new Actor({
        name: "HOL empty Armor marker schema fixture",
        type: "creature",
        system: { armorMarker: "" },
      });
      emptyMarkerCreature.validate({ strict: true, fallback: false });
      const creatureSchema = CONFIG.Actor.dataModels.creature.schema;
      const choiceFields = [
        ["armorMarker", creatureSchema.getField("armorMarker")],
        [
          "alternateSpeeds.mode",
          creatureSchema.getField("alternateSpeeds").element.fields.mode,
        ],
        [
          "basicMelee.defenseAttribute",
          creatureSchema.getField("basicMelee").fields.defenseAttribute,
        ],
        [
          "basicMelee.orientation",
          creatureSchema.getField("basicMelee").fields.orientation,
        ],
        [
          "actions.orientation",
          creatureSchema.getField("actions").fields.orientation,
        ],
      ];
      const rejectedChoiceFields = [];
      for (const [path, field] of choiceFields) {
        const failure = field.validate("invalid", {
          strict: false,
          fallback: false,
        });
        if (failure?.fieldPath === field.fieldPath)
          rejectedChoiceFields.push(path);
      }
      if (rejectedChoiceFields.length !== choiceFields.length)
        throw new Error(
          `Native creature schema accepted invalid choices for: ${choiceFields
            .map(([path]) => path)
            .filter((path) => !rejectedChoiceFields.includes(path))
            .join(", ")}`,
        );
      const schemaDefaults = {
        marker: defaultCreature.system.armorMarker,
        emptyMarkerAccepted: emptyMarkerCreature.system.armorMarker === "",
        invalidChoicesRejected: rejectedChoiceFields,
      };

      if (ids.some((id) => game.actors.has(id)))
        throw new Error(
          "A fixture creature ID already exists; refusing to overwrite a world Actor",
        );

      const tracked = new Set();
      const imported = new Map();
      let negativeId = null;
      let rendered = null;
      try {
        for (const id of ids) {
          const actor = await game.actors.importFromCompendium(
            pack,
            id,
            {},
            {
              keepId: true,
              keepEmbeddedIds: true,
              renderSheet: false,
            },
          );
          const actualId = actor?.id ?? null;
          if (actualId) tracked.add(actualId);
          if (!actor)
            throw new Error(`Compendium import returned no Actor for ${id}`);
          if (actualId !== id)
            throw new Error(
              `Compendium import returned ID ${actualId} for expected ID ${id}`,
            );
          actor.validate({ strict: true, fallback: false });
          imported.set(id, actor);
        }

        const profiles = [];
        for (const expectedProfile of expectedProfiles) {
          const compendium = await fromUuid(
            `Compendium.${ID}.creatures.Actor.${expectedProfile.sourceFoundryId}`,
          );
          if (!compendium)
            throw new Error(
              `Compendium UUID did not resolve: ${expectedProfile.catalogId}`,
            );
          const actor = imported.get(expectedProfile.sourceFoundryId);
          const resolvedImport = await fromUuid(actor.uuid);
          const flags = actor.flags[ID] ?? {};
          profiles.push({
            catalogId: flags.catalogId,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            cv: actor.system.cv,
            attributes: Object.fromEntries(
              Object.entries(actor.system.attributes).map(([key, value]) => [
                key,
                value.base,
              ]),
            ),
            health: actor.system.health.baseMax,
            speed: actor.system.speed,
            speedSource: actor.system.speedSource,
            alternateSpeeds: actor.system.alternateSpeeds,
            size: actor.system.size,
            sizeLabel: actor.system.sizeLabel,
            sizeSource: actor.system.sizeSource,
            footprint: actor.system.footprint,
            prototypeToken: {
              width: actor.prototypeToken.width,
              height: actor.prototypeToken.height,
            },
            armor: actor.system.armor,
            armorMarker: actor.system.armorMarker,
            armorSource: actor.system.armorSource,
            stability: actor.system.stability,
            evasion: actor.system.evasion,
            threat: actor.system.threat,
            weaknesses: actor.system.weaknesses,
            resistances: actor.system.resistances,
            immunities: actor.system.immunities,
            basicMelee: actor.system.basicMelee,
            source: flags.source,
            sourceCommit: flags.sourceCommit,
            classification: flags.classification,
            abilitySources: flags.abilitySources,
            summoning: flags.summoning,
            automation: flags.automation,
            automationLabel: flags.automationLabel,
            compendiumId: compendium.id,
            resolvedImportId: resolvedImport?.id ?? null,
          });
        }

        const requestedNegativeId = foundry.utils.randomID();
        const negative = await Actor.create(
          {
            _id: requestedNegativeId,
            name: "HOL negative CV fixture",
            type: "creature",
            system: { cv: -6 },
            flags: { [ID]: { nativePackFixture: true } },
          },
          { keepId: true },
        );
        negativeId = negative?.id ?? null;
        if (negativeId) tracked.add(negativeId);
        if (!negative) throw new Error("Negative-CV Actor was not created");
        if (negativeId !== requestedNegativeId)
          throw new Error(
            `Negative-CV Actor returned ID ${negativeId} for expected ID ${requestedNegativeId}`,
          );
        negative.validate({ strict: true, fallback: false });
        const resolvedNegative = await fromUuid(negative.uuid);
        const negativeCv = resolvedNegative?.system.cv;

        const dragonId = expectedProfiles.find(
          ({ catalogId }) => catalogId === "creature-red-dragon",
        ).sourceFoundryId;
        const dragon = imported.get(dragonId);
        const hostileScript =
          '<script data-hol-reference="hostile">alert("hostile")</script>';
        const unsafeLink = "[unsafe](javascript:alert(1))";
        await dragon.update({
          "system.details.flavorMarkdown": `${dragon.system.details.flavorMarkdown}\n\n${hostileScript}`,
          "system.actions.reactionMarkdown": `${dragon.system.actions.reactionMarkdown}\n\n${unsafeLink}`,
        });
        const sheet = dragon.sheet;
        await sheet.render({ force: true });
        const sheetRoot = sheet.element?.querySelector(
          ".hol-creature-sheet",
        );
        const reference = sheetRoot?.querySelector(
          ".hol-creature-reference",
        );
        const referenceText = reference?.textContent ?? "";
        const referenceHtml = reference?.innerHTML ?? "";
        const sheetText = sheetRoot?.textContent ?? "";
        const sourceLinks = [
          ...(reference?.querySelectorAll("a[href]") ?? []),
        ];
        rendered = {
          sheetRoots:
            sheet.element?.querySelectorAll(".hol-creature-sheet").length ===
            1,
          hasReference: Boolean(reference),
          hasHeadings: Boolean(
            reference?.querySelector("h2") &&
              reference?.querySelector("h3"),
          ),
          hasTable: Boolean(
            reference?.querySelector("table thead th") &&
              reference?.querySelector("table tbody td"),
          ),
          hasFormatting: Boolean(
            reference?.querySelector("p strong") &&
              reference?.querySelector("p em"),
          ),
          hasMainActions: referenceText.includes("Furnace breath"),
          hasLimit: referenceText.includes(
            "Cannot use this attack on consecutive turns",
          ),
          noRawMarkdown: ![
            "|---|",
            "### Main Actions",
            "**Target:**",
          ].some((value) => referenceText.includes(value)),
          hostileEscaped:
            referenceText.includes(hostileScript) &&
            referenceHtml.includes(
              '&lt;script data-hol-reference=',
            ) &&
            !reference.querySelector(
              'script[data-hol-reference="hostile"]',
            ),
          unsafeLinkEscaped:
            referenceText.includes(unsafeLink) &&
            !sourceLinks.some(
              (link) => link.protocol === "javascript:",
            ),
          safeSourceLinks:
            sourceLinks.length > 0 &&
            sourceLinks.every(
              (link) =>
                link.protocol === "https:" &&
                link.hostname === "github.com" &&
                link.pathname.startsWith(
                  "/bruceamoser/heroes-of-legend/blob/",
                ),
            ),
          hasNumericResistance: sheetText.includes("Physical (3)"),
          readOnly:
            reference?.querySelectorAll("input, textarea, select").length === 0,
        };
        await sheet.close();
        const negativeVisible = Boolean(negativeCv === -6);
        return {
          profiles,
          negative: {
            id: negativeId,
            cv: negativeCv,
            visible: negativeVisible,
          },
          rendered,
          schemaDefaults,
          importedCount: imported.size,
        };
      } finally {
        for (const id of [...tracked].reverse()) {
          const actor = game.actors.get(id);
          if (
            actor &&
            (actor.getFlag(ID, "nativePackFixture") ||
              actor.getFlag(ID, "sourceCommit") === sourceCommit)
          )
            await actor.delete();
        }
        const leftovers = [...tracked].filter((id) => game.actors.has(id));
        if (leftovers.length)
          throw new Error(`Fixture cleanup failed: ${leftovers.join(", ")}`);
      }
    },
    {
      ids: catalog.creatures.map(({ foundryId }) => foundryId),
      expectedProfiles: representativeRecords.map((record, index) => ({
        ...expected[index],
        sourceFoundryId: record.foundryId,
      })),
      sourceCommit: catalog.source.commit,
    },
  );

  assert.equal(result.importedCount, 192);
  assert.equal(
    await page.evaluate(
      (ids) => ids.filter((id) => game.actors.has(id)).length,
      catalog.creatures.map(({ foundryId }) => foundryId),
    ),
    0,
  );
  assert.deepEqual(result.profiles, expected);
  assert.equal(result.negative.cv, -6);
  assert.equal(result.negative.visible, true);
  assert.match(result.negative.id, /^[A-Za-z0-9]{16}$/);
  assert.deepEqual(result.schemaDefaults, {
    marker: "",
    emptyMarkerAccepted: true,
    invalidChoicesRejected: [
      "armorMarker",
      "alternateSpeeds.mode",
      "basicMelee.defenseAttribute",
      "basicMelee.orientation",
      "actions.orientation",
    ],
  });
  assert.deepEqual(result.rendered, {
    sheetRoots: true,
    hasReference: true,
    hasHeadings: true,
    hasTable: true,
    hasFormatting: true,
    hasMainActions: true,
    hasLimit: true,
    noRawMarkdown: true,
    hostileEscaped: true,
    unsafeLinkEscaped: true,
    safeSourceLinks: true,
    hasNumericResistance: true,
    readOnly: true,
  });
  assert.deepEqual(errors, []);
  console.info(
    "PASS: 192 native creature Actors import with stable IDs and exact pinned profiles; Adder, Red Dragon, signed CV, enriched read-only details, source provenance and immediate fixture cleanup verified.",
  );
} finally {
  await context.close();
  await browser.close();
}
