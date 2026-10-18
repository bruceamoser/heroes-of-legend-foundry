import assert from "node:assert/strict";
import { chromium } from "playwright";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  const result = await page.evaluate(async () => {
    const ID = "heroes-of-legend",
      f = (globalThis.__hol169 = {
        actors: [],
        messages: [],
        dialogs: [],
        settings: {},
        scene: null,
        combat: null,
      });
    for (const key of [
      "creationAuthorityClient",
      "authorityMeta",
      "authorityWork",
    ])
      f.settings[key] = structuredClone(game.settings.get(ID, key));
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority({ restartConfirmed: true });
    const { ABILITY_DEFINITIONS: definitions } = await import(
      "/systems/heroes-of-legend/rules/ability-definitions.mjs"
    );
    const { startTurn, movementRemaining, convertAction } = await import(
      "/systems/heroes-of-legend/rules/actions.mjs"
    );
    const { requestAbility, resolveAbilityRequest } = await import(
      "/systems/heroes-of-legend/services/abilities.mjs"
    );
    const { rollBasis, prepareRoll } = await import(
      "/systems/heroes-of-legend/services/roll-preparation.mjs"
    );
    const { SharedRollDialog } = await import(
      "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
    );
    const hero = await Actor.create({
      name: "HOL169 performer",
      type: "character",
      flags: { [ID]: { development: { creationSummary: { speedBase: 4 } } } },
    });
    f.actors.push(hero.id);
    const ally = await Actor.create({
      name: "HOL169 ally",
      type: "character",
      flags: { [ID]: { development: { creationSummary: { speedBase: 4 } } } },
    });
    f.actors.push(ally.id);
    const items = await hero.createEmbeddedDocuments(
      "Item",
      [
        "disengage",
        "quick-exit",
        "catch-that",
        "look-over-here",
        "a-party-piece",
      ].map((key) => {
        const d = definitions[`ability-${key}`];
        return {
          name: d.name,
          type: "ability",
          flags: {
            [ID]: { catalogId: d.id, source: structuredClone(d.source) },
          },
        };
      }),
    );
    const item = (key) =>
      items.find((i) => i.getFlag(ID, "catalogId") === `ability-${key}`);
    const scene = await Scene.create({
      name: "HOL169 targets",
      active: false,
      width: 1000,
      height: 1000,
    });
    f.scene = scene.id;
    const [token] = await scene.createEmbeddedDocuments("Token", [
      { name: ally.name, actorId: ally.id, actorLink: true, x: 100, y: 100 },
    ]);
    const combat = await Combat.create({ active: false });
    f.combat = combat.id;
    const [participant] = await combat.createEmbeddedDocuments("Combatant", [
      { actorId: hero.id, name: hero.name },
    ]);
    await combat.setFlag(ID, "encounter", {
      current: participant.id,
      revision: 0,
      budgets: {
        [participant.id]: startTurn({ turnId: "hol169turn", speed: 4 }),
      },
    });
    async function use(key, options = {}) {
      const message = await requestAbility(
        item(key),
        combat,
        participant.id,
        options,
      );
      f.messages.push(message.id);
      await resolveAbilityRequest(message.id);
      const replay = await resolveAbilityRequest(message.id);
      if (!replay.replay)
        throw new Error("Simple action retransmission was not deduplicated.");
      return message;
    }
    await use("disengage");
    await use("disengage");
    let budget = combat.getFlag(ID, "encounter").budgets[participant.id];
    const movement = movementRemaining(budget);
    const converted = convertAction(
      convertAction(budget, {
        operationId: "mainToManeuver",
        from: "main",
        to: "maneuver",
      }),
      { operationId: "maneuverToMovement", from: "maneuver", to: "movement" },
    );
    await use("catch-that");
    const look = await use("look-over-here", { targetTokenUuid: token.uuid });
    budget = combat.getFlag(ID, "encounter").budgets[participant.id];
    const guile = rollBasis(hero, "guile");
    const party = prepareRoll(guile, { partyPiece: true });
    const dialog = new SharedRollDialog(hero, "guile");
    f.dialogs.push(dialog);
    await dialog.render({ force: true });
    const partyVisible = Boolean(
      dialog.element.querySelector('[name="partyPiece"]'),
    );
    const partyDefault = dialog.element.querySelector(
      '[name="partyPiece"]',
    ).checked;
    await dialog.close();
    const attack = await ChatMessage.create({
      content: "HOL169 sight-dependent attack",
      flags: {
        [ID]: {
          attackCard: {
            perspective: "defender",
            title: "Sight-dependent fixture",
            attackerName: "Fixture",
            attributeKey: "agility",
            threat: { boons: 0, banes: 0 },
            damage: { weak: 5, standard: 3, strong: 2 },
          },
        },
      },
    });
    f.messages.push(attack.id);
    const defense = new SharedRollDialog(ally, "agility", {
      mode: "defense",
      attackMessageId: attack.id,
    });
    f.dialogs.push(defense);
    await defense.render({ force: true });
    const lookVisible = Boolean(
      defense.element.querySelector('[name="lookOverHere"]'),
    );
    const lookDefault = defense.element.querySelector(
      '[name="lookOverHere"]',
    ).checked;
    const defenseBasis = rollBasis(ally, "agility", "defense", attack.id);
    const defensePlan = prepareRoll(defenseBasis, { lookOverHere: true });
    return {
      movement,
      converted: movementRemaining(converted),
      disengaged: budget.disengaged,
      reaction: budget.remaining.reaction,
      target:
        combat.getFlag(ID, "abilityOperations")[look.id].targetTokenUuid ===
        token.uuid,
      partyVisible,
      partyDefault,
      lookVisible,
      lookDefault,
      partyBoons: party.boons,
      defenseBoons: defensePlan.boons,
      effects: ally.effects.size,
      lookText: look.content,
    };
  });
  assert.equal(result.movement, 5);
  assert.equal(result.converted, 9);
  assert.equal(result.disengaged, true);
  assert.equal(result.reaction, 0);
  assert.equal(result.target, true);
  assert.equal(result.partyVisible, true);
  assert.equal(result.partyDefault, false);
  assert.equal(result.lookVisible, true);
  assert.equal(result.lookDefault, false);
  assert.equal(result.partyBoons, 1);
  assert.equal(result.defenseBoons, 1);
  assert.equal(result.effects, 0);
  assert.match(result.lookText, /does not cancel the attack/);
} finally {
  try {
    await page.evaluate(async () => {
      const f = globalThis.__hol169;
      if (!f) return;
      const failures = [];
      const clean = async (label, operation) => {
        try {
          await operation();
        } catch (e) {
          failures.push(`${label}: ${e.message}`);
        }
      };
      for (const dialog of f.dialogs)
        await clean("dialog", () => dialog.close());
      for (const id of f.messages)
        await clean(`message ${id}`, () => game.messages.get(id)?.delete());
      if (f.combat)
        await clean("combat", () => game.combats.get(f.combat)?.delete());
      if (f.scene)
        await clean("scene", () => game.scenes.get(f.scene)?.delete());
      for (const id of f.actors)
        await clean(`actor ${id}`, () => game.actors.get(id)?.delete());
      const { releaseAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      await clean("release authority", () => releaseAuthority());
      for (const [key, value] of Object.entries(f.settings))
        await clean(`setting ${key}`, () =>
          game.settings.set("heroes-of-legend", key, value),
        );
      if (
        f.actors.some((id) => game.actors.has(id)) ||
        game.combats.has(f.combat) ||
        game.scenes.has(f.scene) ||
        f.messages.some((id) => game.messages.has(id))
      )
        failures.push("Fixture documents remain.");
      if (failures.length) throw new Error(failures.join("; "));
    });
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
console.info(
  "PASS: native Disengage/Quick Exit once-per-turn movement, conversions, normal Reactions, target identity, action retransmission, optional Party Piece and ally Look Over Here defense Boons, no defense conditions, fixture cleanup and settings restoration.",
);
