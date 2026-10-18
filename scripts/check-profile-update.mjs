import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");
const oldRef = "9030f69fc7d7bbae81c5f13c9aa3bfe10f151011";
const currentCommit = "bdfd18ed535fbd0e1892b9344444abf6da644809";
const profiles = [
  "creatures/creature-skeleton-horse",
  "creatures/creature-air-elemental",
  "summons/summon-air-elemental",
].map((path) =>
  JSON.parse(
    execFileSync("git", ["show", `${oldRef}:content/packs/${path}.json`], {
      encoding: "utf8",
    }),
  ),
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let joined = false;
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  joined = true;
  const created = await page.evaluate(async (profiles) => {
    const ID = "heroes-of-legend";
    globalThis.hol175Profile = { ids: [] };
    const result = [];
    for (const [index, source] of profiles.entries()) {
      delete source._id;
      delete source._key;
      delete source.folder;
      source.name = `HOL175 profile ${index}`;
      source.img = "icons/svg/anchor.svg";
      source.system.health.value = 1;
      source.flags[ID].localNote = "Keep this local note";
      source.flags[ID].commandHistory = [
        { operationId: "spent-command", turnId: "controller-turn" },
      ];
      source.items = [{ name: "Local reference", type: "ability" }];
      source.effects = [{ name: "Local condition marker", disabled: true }];
      if (index === 1) {
        source.system.details.flavorMarkdown = "Local elemental description";
        source.system.actions.entries.push({
          id: "local-trick",
          name: "Local trick",
          category: "maneuver",
        });
      }
      const actor = await Actor.create(source);
      globalThis.hol175Profile.ids.push(actor.id);
      const protectedState = () => {
        const data = actor.toObject();
        return {
          name: data.name,
          img: data.img,
          prototypeToken: data.prototypeToken,
          health: data.system.health,
          attributes: data.system.attributes,
          speed: data.system.speed,
          armor: data.system.armor,
          resistances: data.system.resistances,
          stability: data.system.stability,
          attacks: data.system.attacks,
          restrictions: data.system.restrictions,
          items: data.items,
          effects: data.effects,
          localNote: data.flags[ID].localNote,
          commandHistory: data.flags[ID].commandHistory,
        };
      };
      result.push({
        id: actor.id,
        protected: protectedState(),
        oldCommit: actor.getFlag(ID, "sourceCommit"),
        oldCv: actor.system.cv,
      });
    }
    return result;
  }, profiles);
  for (const [index, fixture] of created.entries()) {
    await page.evaluate(async (id) => {
      await globalThis.hol175Profile.open?.sheet.close();
      const actor = game.actors.get(id);
      globalThis.hol175Profile.open = actor;
      await actor.sheet.render({ force: true });
      actor.sheet.bringToFront();
    }, fixture.id);
    const button = page.locator('[data-action="updateProfile"]');
    assert.equal(await button.count(), 1);
    await button.click();
    await page.waitForFunction(
      ({ id, currentCommit, partial }) => {
        const actor = game.actors.get(id);
        return partial
          ? actor.getFlag("heroes-of-legend", "profileUpdate")?.sourceCommit ===
              currentCommit
          : actor.getFlag("heroes-of-legend", "sourceCommit") === currentCommit;
      },
      { id: fixture.id, currentCommit, partial: index === 1 },
    );
    const after = await page.evaluate((id) => {
      const actor = game.actors.get(id),
        data = actor.toObject(),
        ID = "heroes-of-legend";
      return {
        cv: data.system.cv,
        sourceCommit: data.flags[ID].sourceCommit,
        templates: data.flags[ID].monsterAbilityTemplates,
        classificationCv: data.flags[ID].classification?.cv,
        actions: data.system.actions,
        flavor: data.system.details?.flavorMarkdown,
        profileUpdate: data.flags[ID].profileUpdate,
        protected: {
          name: data.name,
          img: data.img,
          prototypeToken: data.prototypeToken,
          health: data.system.health,
          attributes: data.system.attributes,
          speed: data.system.speed,
          armor: data.system.armor,
          resistances: data.system.resistances,
          stability: data.system.stability,
          attacks: data.system.attacks,
          restrictions: data.system.restrictions,
          items: data.items,
          effects: data.effects,
          localNote: data.flags[ID].localNote,
          commandHistory: data.flags[ID].commandHistory,
        },
      };
    }, fixture.id);
    assert.deepEqual(after.protected, fixture.protected);
    if (index < 2) assert.equal(after.classificationCv, after.cv);
    if (index === 0) {
      assert(
        after.actions.entries.some(
          (action) => action.abilityId === "monster-fall-to-pieces",
        ),
      );
      assert(
        after.templates.some(
          (template) => template.id === "monster-fall-to-pieces",
        ),
      );
    } else if (index === 1) {
      assert.equal(after.flavor, "Local elemental description");
      assert(
        after.actions.entries.some((action) => action.id === "local-trick"),
      );
      assert.equal(after.sourceCommit, fixture.oldCommit);
      assert.equal(after.cv, 22);
    } else {
      assert.equal(after.cv, 22);
      assert.equal(after.protected.restrictions.reactions, false);
    }
    const replay = await page.evaluate(async (id) => {
      const actor = game.actors.get(id),
        before = JSON.stringify(actor.toObject());
      const { updateCreatureProfile } = await import(
        "/systems/heroes-of-legend/services/profile-update.mjs"
      );
      const result = await updateCreatureProfile(actor);
      return { result, unchanged: JSON.stringify(actor.toObject()) === before };
    }, fixture.id);
    assert.deepEqual(replay.result.updated, []);
    assert(
      replay.unchanged,
      "Profile replay must not reset state or rewrite metadata",
    );
  }
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native current-profile update adds shared creature Reactions/CV/templates, preserves custom blocks and injured creature/summon state, command history, effects/items, names/art and repeated-update identity.",
  );
} finally {
  try {
    if (joined)
      await page.evaluate(async () => {
        const state = globalThis.hol175Profile;
        if (!state) return;
        const failures = [];
        for (const id of state.ids.reverse())
          try {
            await game.actors.get(id)?.sheet.close();
            await game.actors.get(id)?.delete();
          } catch (error) {
            failures.push(error.message);
          }
        if (state.ids.some((id) => game.actors.has(id)))
          failures.push("Profile fixtures remain");
        if (failures.length)
          throw new Error(
            `Profile fixture cleanup failed: ${failures.join("; ")}`,
          );
      });
  } finally {
    await browser.close();
  }
}
