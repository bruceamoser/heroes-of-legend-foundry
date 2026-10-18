/** Native, disposable-world reference check for approved book issue #1279 / Foundry #175. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
import { creatureActionEntries } from "./content/creature-packs.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");

const commit = "bdfd18ed535fbd0e1892b9344444abf6da644809";
const creatureCatalog = JSON.parse(
  await readFile(new URL("../static/data/creatures.json", import.meta.url)),
);
const summonCatalog = JSON.parse(
  await readFile(new URL("../static/data/summons.json", import.meta.url)),
);
assert.equal(creatureCatalog.source.commit, commit);
assert.equal(summonCatalog.source.commit, commit);

// Each selection checks an approved new/revised template through the native sheet.
const cases = [
  [
    "guardian",
    "creature-ancestor-guardian",
    [["Cover a Companion", "monster-cover-a-companion"]],
  ],
  [
    "skirmisher",
    "creature-goblin-scrapper",
    [["Slip the Rush", "monster-slip-the-rush"]],
  ],
  [
    "duelist",
    "creature-masked-duelist",
    [
      ["Turn the Blade", "monster-turn-the-blade"],
      ["Stalking Step", "monster-stalking-step"],
    ],
  ],
  [
    "pack hunter",
    "creature-dire-wolf",
    [["Follow the Pack", "monster-follow-the-pack"]],
  ],
  [
    "skeleton",
    "creature-bone-sentry",
    [["Fall to Pieces", "monster-fall-to-pieces"]],
  ],
  [
    "vampire",
    "creature-blood-courtier",
    [["Recoil into Shadow", "monster-recoil-into-shadow"]],
  ],
  ["dragon", "creature-red-dragon", [["Tail Retort", "monster-tail-retort"]]],
  [
    "caster",
    "creature-goblin-rattlechanter",
    [["Rally at the Blow", "monster-rally-at-the-blow"]],
  ],
  [
    "multiheaded",
    "creature-hydra",
    [["Second Head Watches", "monster-second-head-watches"]],
  ],
];
const fixtures = cases.map(([style, id, selections]) => {
  const record = creatureCatalog.creatures.find(
    (candidate) => candidate.id === id,
  );
  assert(record, `Missing pinned ${style} creature ${id}`);
  assert.equal(record.source.commit, commit);
  const entries = creatureActionEntries(record, commit);
  const actions = selections.map(([name, templateId]) => {
    assert(
      record.abilitySources.some((source) => source.id === templateId),
      `${id} lost stable template ${templateId}`,
    );
    const matches = entries.filter(
      (entry) =>
        entry.name === name &&
        ["maneuver", "reaction"].includes(entry.category),
    );
    assert.equal(
      matches.length,
      1,
      `${id}: ${name} must map to one specialty action`,
    );
    assert(
      matches[0].referenceMarkdown.startsWith(`### ${name}\n`),
      `${id}: ${name} needs its local printed heading`,
    );
    assert(
      matches[0].referenceMarkdown.length > name.length + 80,
      `${id}: ${name} needs full printed rules`,
    );
    assert.equal(
      matches[0].abilityId,
      templateId,
      `${id}: stable template identity must survive the action row`,
    );
    assert.equal(
      matches[0].attributeKey,
      "",
      `${id}: ${name} must not request an opposing roll`,
    );
    return { ...matches[0], templateId };
  });
  return {
    style,
    id,
    foundryId: record.foundryId,
    source: record.source,
    cv: record.cv,
    entries,
    actions,
  };
});
const summon = summonCatalog.records.find(
  (record) => record.id === "summon-air-elemental",
);
assert(summon);
assert.equal(summon.source.commit, commit);
assert.match(
  summon.reference.sourceMarkdown,
  /Wind Step[\s\S]*controller.s next turn/,
);
assert.match(
  summon.command.sourceText,
  /No activity or alerts without a command; no Reactions or opportunity attacks/,
);

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1500, height: 1100 },
});
await context.addInitScript(() =>
  localStorage.setItem("core.noCanvas", "true"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let joined = false;
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  joined = true;
  await page.evaluate(() => {
    globalThis.hol175Fixture = { actors: [], messages: [] };
  });

  for (const fixture of fixtures) {
    const imported = await page.evaluate(async (expected) => {
      const source = await game.packs
        .get("heroes-of-legend.creatures")
        ?.getDocument(expected.foundryId);
      if (!source)
        throw new Error(`Installed creature pack is missing ${expected.id}`);
      const data = source.toObject();
      delete data._id;
      delete data.folder;
      const actor = await Actor.create({
        ...data,
        name: `${source.name} #175 reference`,
      });
      globalThis.hol175Fixture.actors.push(actor.id); // Track before any later validation can fail.
      await actor.sheet.render({ force: true });
      return {
        actorId: actor.id,
        actorUuid: actor.uuid,
        catalogId: actor.getFlag("heroes-of-legend", "catalogId"),
        source: actor.getFlag("heroes-of-legend", "source"),
        sourceCommit: actor.getFlag("heroes-of-legend", "sourceCommit"),
        cv: actor.system.cv,
        entries: JSON.parse(JSON.stringify(actor.system.actions.entries)),
        before: JSON.stringify({
          system: actor.system.toObject(),
          effects: actor.effects.map((effect) => effect.toObject()),
          flags: actor.flags,
        }),
      };
    }, fixture);
    assert.equal(imported.catalogId, fixture.id);
    assert.deepEqual(imported.source, {
      path: fixture.source.path,
      sha256: fixture.source.sha256,
    });
    assert.equal(imported.sourceCommit, commit);
    assert.equal(imported.cv, fixture.cv);
    assert.deepEqual(
      imported.entries,
      fixture.entries,
      `${fixture.style}: installed action text differs from pinned source`,
    );
    for (const action of fixture.actions) {
      const button = page.locator(
        `.hol-creature-sheet [data-action="creatureAction"][data-creature-action="${action.id}"]`,
      );
      assert.equal(
        await button.count(),
        1,
        `${fixture.style}: sheet lacks ${action.name}`,
      );
      const beforeIds = await page.evaluate(() =>
        game.messages.map((message) => message.id),
      );
      await button.click();
      await page.waitForFunction(
        ({ actorUuid, actionId, beforeIds }) =>
          game.messages.some(
            (message) =>
              !beforeIds.includes(message.id) &&
              message.getFlag("heroes-of-legend", "creatureAction")
                ?.actorUuid === actorUuid &&
              message.getFlag("heroes-of-legend", "creatureAction")
                ?.actionId === actionId,
          ),
        { actorUuid: imported.actorUuid, actionId: action.id, beforeIds },
      );
      const posted = await page.evaluate(
        ({ actorId, actionId, beforeIds }) => {
          const actor = game.actors.get(actorId);
          const newMessages = game.messages.filter(
            (message) => !beforeIds.includes(message.id),
          );
          const message = newMessages.find(
            (candidate) =>
              candidate.getFlag("heroes-of-legend", "creatureAction")
                ?.actionId === actionId,
          );
          if (message) globalThis.hol175Fixture.messages.push(message.id);
          return {
            newMessageCount: newMessages.length,
            id: message?.id,
            reference: message?.getFlag("heroes-of-legend", "creatureAction"),
            attackCard: message?.getFlag("heroes-of-legend", "attackCard"),
            rolls: message?.rolls.length,
            content: message?.content,
            after: JSON.stringify({
              system: actor.system.toObject(),
              effects: actor.effects.map((effect) => effect.toObject()),
              flags: actor.flags,
            }),
          };
        },
        { actorId: imported.actorId, actionId: action.id, beforeIds },
      );
      assert.equal(
        posted.newMessageCount,
        1,
        `${fixture.style}: reference post caused another chat message`,
      );
      assert(posted.id);
      assert.equal(posted.rolls, 0);
      assert.equal(
        posted.attackCard,
        undefined,
        `${action.name} must not create a defender attack card`,
      );
      assert.equal(posted.reference?.resolution, "reference");
      assert.equal(posted.reference?.category, action.category);
      assert.equal(posted.reference?.abilityId, action.templateId);
      assert.equal(posted.reference?.title, action.name);
      assert.equal(
        posted.reference?.referenceMarkdown,
        action.referenceMarkdown,
      );
      assert.equal(posted.reference?.effect, action.effect);
      assert.equal(posted.reference?.sourceCommit, commit);
      assert.equal(
        posted.after,
        imported.before,
        `${action.name} changed the Actor on a reference post`,
      );
      assert.match(posted.content, /Costs and effects resolved manually/);
      const visible = await page.evaluate((html) => {
        const parsed = new DOMParser().parseFromString(html, "text/html");
        return (
          parsed
            .querySelector(".hol-creature-action-card details")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? ""
        );
      }, posted.content);
      assert(
        visible.includes(action.name),
        `${action.name} card lacks its printed title`,
      );
      assert(
        visible.length > action.name.length + 80,
        `${action.name} card truncates printed rules`,
      );
    }
    await page.evaluate(
      (id) => game.actors.get(id)?.sheet.close(),
      imported.actorId,
    );
  }

  const summonImported = await page.evaluate(
    async (expected) => {
      const source = await game.packs
        .get("heroes-of-legend.summons")
        ?.getDocument(expected.foundryId);
      if (!source)
        throw new Error(`Installed summon pack is missing ${expected.id}`);
      const data = source.toObject();
      delete data._id;
      delete data.folder;
      const actor = await Actor.create(data);
      globalThis.hol175Fixture.actors.push(actor.id);
      await actor.sheet.render({ force: true });
      return {
        actorId: actor.id,
        catalogId: actor.getFlag("heroes-of-legend", "catalogId"),
        sourceCommit: actor.getFlag("heroes-of-legend", "sourceCommit"),
        cv: actor.system.cv,
        restrictions:
          actor.system.restrictions.toObject?.() ??
          JSON.parse(JSON.stringify(actor.system.restrictions)),
        referenceMarkdown: actor.system.referenceMarkdown,
        commandSource: actor.system.commandSource,
        messageCount: game.messages.size,
      };
    },
    { id: summon.id, foundryId: summon.foundryId },
  );
  assert.equal(summonImported.catalogId, summon.id);
  assert.equal(summonImported.sourceCommit, commit);
  assert.equal(summonImported.cv, summon.cv);
  assert.deepEqual(
    {
      reactions: summonImported.restrictions.reactions,
      opportunityAttacks: summonImported.restrictions.opportunityAttacks,
      independentTurns: summonImported.restrictions.independentTurns,
      turnAnchor: summonImported.restrictions.turnAnchor,
      maximumCommandsPerTurn:
        summonImported.restrictions.maximumCommandsPerTurn,
    },
    {
      reactions: false,
      opportunityAttacks: false,
      independentTurns: false,
      turnAnchor: "controller",
      maximumCommandsPerTurn: 1,
    },
  );
  assert.equal(summonImported.commandSource, summon.command.sourceText);
  assert(summonImported.referenceMarkdown.includes("Wind Step"));
  assert.match(summonImported.referenceMarkdown, /controller.s next turn/);
  const summonSheet = page.locator(".hol-summon-sheet");
  assert.equal(await summonSheet.count(), 1);
  await summonSheet.locator("details.hol-creature-reference summary").click();
  const printed = await summonSheet.locator(".hol-item-reference").innerText();
  assert.match(printed, /Wind Step/);
  assert.match(
    printed,
    /No activity or alerts without a command; no Reactions or opportunity attacks/,
  );
  assert.equal(
    await summonSheet
      .locator('[data-action="creatureAction"], [data-action="npcMelee"]')
      .count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => game.messages.size),
    summonImported.messageCount,
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS #175 nine pinned creature imports/sheets/full specialty references, one no-roll manual chat post per action with no Actor mutation; commanded summon maneuver/CV/turn restrictions; zero page errors.",
  );
} finally {
  if (joined && !page.isClosed()) {
    await page
      .evaluate(async () => {
        const tracked = globalThis.hol175Fixture;
        if (!tracked) return;
        const failures = [];
        for (const id of tracked.actors) {
          const actor = game.actors.get(id);
          if (actor)
            try {
              await actor.sheet.close();
            } catch (error) {
              failures.push(`Close ${id}: ${error.message}`);
            }
        }
        for (const message of game.messages.filter(
          (candidate) =>
            tracked.messages.includes(candidate.id) ||
            tracked.actors.some(
              (id) =>
                candidate.getFlag("heroes-of-legend", "creatureAction")
                  ?.actorUuid === `Actor.${id}`,
            ),
        )) {
          try {
            await message.delete();
          } catch (error) {
            failures.push(`Message ${message.id}: ${error.message}`);
          }
        }
        for (const id of [...tracked.actors].reverse()) {
          try {
            await game.actors.get(id)?.delete();
          } catch (error) {
            failures.push(`Actor ${id}: ${error.message}`);
          }
        }
        delete globalThis.hol175Fixture;
        if (failures.length)
          throw new Error(`Fixture cleanup failed: ${failures.join("; ")}`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
  await browser.close();
}
