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
let page;
const errors = [];
try {
  const context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);

  const fixture = await page.evaluate(async () => {
    const ID = "heroes-of-legend";
    const created = (globalThis.__holHighGuardFixture = {
      actors: [],
      combat: null,
      messages: [],
      settings: Object.fromEntries(
        ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
          (key) => [key, structuredClone(game.settings.get(ID, key))],
        ),
      ),
    });
    const { bindCreationAuthority, authorityBrowserId, isCreationAuthority } =
      await import("/systems/heroes-of-legend/services/authority.mjs");
    const original = created.settings,
      bound = original.creationAuthorityClient,
      meta = original.authorityMeta,
      work = original.authorityWork;
    // An earlier disposable browser may have closed during this same launch.
    // Clear only its known idle checkpoint before claiming this test browser.
    if (
      bound &&
      !isCreationAuthority() &&
      meta.launch === game.world.lastPlayed &&
      meta.browserId !== authorityBrowserId()
    ) {
      if (
        meta.clientId !== bound ||
        work.clientId !== bound ||
        work.busy !== false ||
        work.uncertain
      )
        throw new Error(
          "An earlier coordinator has unsettled work; do not replace it.",
        );
      await game.settings.set(ID, "creationAuthorityClient", "");
      await game.settings.set(ID, "authorityMeta", {});
      await game.settings.set(ID, "authorityWork", {});
    }
    await bindCreationAuthority({ restartConfirmed: true });
    const hero = await Actor.create({
      name: "High Guard disposable defender",
      type: "character",
      flags: {
        "heroes-of-legend": {
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    created.actors.push(hero.id);
    const npc = await Actor.create({
      name: "High Guard disposable attacker",
      type: "creature",
      system: {
        threat: { boons: 0, banes: 0 },
        basicMelee: { weak: 2, standard: 3, strong: 4 },
      },
    });
    created.actors.push(npc.id);
    const { ABILITY_DEFINITIONS } = await import(
      "/systems/heroes-of-legend/rules/ability-definitions.mjs"
    );
    const items = await hero.createEmbeddedDocuments("Item", [
      ...["ability-defend", "ability-shield-block", "ability-high-guard"].map(
        (id) => ({
          name: ABILITY_DEFINITIONS[id].name,
          type: "ability",
          flags: {
            "heroes-of-legend": {
              catalogId: id,
              source: ABILITY_DEFINITIONS[id].source,
            },
          },
        }),
      ),
      {
        name: "Held ordinary shield",
        type: "equipment",
        system: {
          catalogId: "item-ordinary-shield",
          quantity: 1,
          bulk: 1,
          hands: 1,
          held: true,
        },
      },
    ]);
    const combat = await Combat.create({ active: true });
    created.combat = combat.id;
    const combatants = await combat.createEmbeddedDocuments("Combatant", [
      {
        actorId: hero.id,
        name: hero.name,
        flags: { "heroes-of-legend": { side: "players" } },
      },
      {
        actorId: npc.id,
        name: npc.name,
        flags: { "heroes-of-legend": { side: "opposition" } },
      },
    ]);
    const heroParticipant = combatants.find(
      (entry) => entry.actorId === hero.id,
    );
    const npcParticipant = combatants.find((entry) => entry.actorId === npc.id);
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const turn = async (type, options) =>
      resolveCombatRequest((await requestCombat(combat, type, options)).id);
    await turn("start");
    if (
      combat.getFlag("heroes-of-legend", "encounter").nextSide === "opposition"
    ) {
      await turn("choose", { id: npcParticipant.id });
      await turn("finish");
    }
    await turn("choose", { id: heroParticipant.id });
    return {
      hero: hero.id,
      npc: npc.id,
      combat: combat.id,
      heroParticipant: heroParticipant.id,
      npcParticipant: npcParticipant.id,
      defend: items.find(
        (item) =>
          item.getFlag("heroes-of-legend", "catalogId") === "ability-defend",
      ).uuid,
      block: items.find(
        (item) =>
          item.getFlag("heroes-of-legend", "catalogId") ===
          "ability-shield-block",
      ).uuid,
      high: items.find(
        (item) =>
          item.getFlag("heroes-of-legend", "catalogId") ===
          "ability-high-guard",
      ).uuid,
      shield: items.find(
        (item) => item.system.catalogId === "item-ordinary-shield",
      ).uuid,
    };
  });

  const activate = async (itemUuid, attackMessageId = null) =>
    page.evaluate(
      async ({ f, itemUuid, attackMessageId }) => {
        const { requestAbility } = await import(
          "/systems/heroes-of-legend/services/abilities.mjs"
        );
        const message = await requestAbility(
          await fromUuid(itemUuid),
          game.combats.get(f.combat),
          f.heroParticipant,
          {
            attackMessageId,
            shieldItemUuid: attackMessageId ? f.shield : null,
          },
        );
        globalThis.__holHighGuardFixture.messages.push(message.id);
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const status = game.messages
            .get(message.id)
            ?.getFlag("heroes-of-legend", "abilityStatus");
          if (status?.status === "complete") return message.id;
          if (status?.status === "failed") throw new Error(status.error);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("High Guard fixture ability settlement timed out.");
      },
      { f: fixture, itemUuid, attackMessageId },
    );
  const state = async (incomingAttack = true) =>
    page.evaluate(
      async ({ f, incomingAttack }) => {
        const combat = game.combats.get(f.combat);
        const hero = game.actors.get(f.hero);
        const { defenseBenefits } = await import(
          "/systems/heroes-of-legend/services/benefits.mjs"
        );
        return {
          reaction: combat.getFlag("heroes-of-legend", "encounter").budgets[
            f.heroParticipant
          ].remaining.reaction,
          effects: hero.effects
            .filter((effect) => effect.active)
            .map((effect) => ({
              key: effect.getFlag("heroes-of-legend", "benefit")?.key,
              sourceId: effect.getFlag("heroes-of-legend", "benefit")?.sourceId,
              id: effect.id,
            })),
          sources: defenseBenefits(hero, { incomingAttack }).map(
            ({ label, amount }) => [label, amount],
          ),
        };
      },
      { f: fixture, incomingAttack },
    );

  await activate(fixture.defend);
  const attack = await page.evaluate(async (f) => {
    const combat = game.combats.get(f.combat);
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const turn = async (type, options) =>
      resolveCombatRequest((await requestCombat(combat, type, options)).id);
    await turn("finish");
    await turn("choose", { id: f.npcParticipant });
    const message = await ChatMessage.create({
      content: "High Guard disposable incoming attack",
    });
    globalThis.__holHighGuardFixture.messages.push(message.id);
    const snapshot = {
      id: message.id,
      actorUuid: `Actor.${f.npc}`,
      attackerName: "High Guard fixture attacker",
      attributeKey: "agility",
      threat: { boons: 0, banes: 0 },
      damage: { weak: 2, standard: 3, strong: 4 },
      suggestedDefenderTokenUuids: [],
      perspective: "defender",
      title: "Basic Melee",
      blockable: true,
      hasBlockableJudgment: true,
      combatId: f.combat,
    };
    await combat.update({
      [`flags.heroes-of-legend.attacks.${message.id}`]: snapshot,
      [`flags.heroes-of-legend.operationReceipts.${message.id}`]: {
        applied: true,
        kind: "npc-attack",
      },
    });
    await message.update({ [`flags.heroes-of-legend.attackCard`]: snapshot });
    return message.id;
  }, fixture);
  const highRequest = await activate(fixture.high, attack);
  let current = await state();
  assert.equal(current.reaction, 0);
  assert.deepEqual(current.sources, [
    ["Defend maneuver", 1],
    ["High Guard", 2],
  ]);
  assert.deepEqual(current.effects.map(({ key }) => key).sort(), [
    "defend",
    "shield-block",
  ]);
  const rollBenefits = await page.evaluate(
    async ({ f, attack }) => {
      const { rollBasis } = await import(
        "/systems/heroes-of-legend/services/roll-preparation.mjs"
      );
      return rollBasis(
        game.actors.get(f.hero),
        "agility",
        "defense",
        attack,
      ).benefits.map(({ label, amount }) => [label, amount]);
    },
    { f: fixture, attack },
  );
  assert.deepEqual(rollBenefits, [
    ["Defend maneuver", 1],
    ["High Guard", 2],
  ]);
  const highEffect = current.effects.find(({ key }) => key === "shield-block");
  assert.equal(highEffect.sourceId, "ability-high-guard");
  const highCost = await page.evaluate(
    ({ id, combat, participant }) => {
      const state = game.combats
        .get(combat)
        .getFlag("heroes-of-legend", "encounter");
      return state.budgets[participant].operations[id];
    },
    {
      id: highRequest,
      combat: fixture.combat,
      participant: fixture.heroParticipant,
    },
  );
  assert.equal(highCost.category, "reaction");
  assert.equal(highCost.trackedCost.spent, 1);

  await activate(fixture.block, attack);
  current = await state();
  assert.equal(current.reaction, 0);
  assert.deepEqual(current.sources, [
    ["Defend maneuver", 1],
    ["High Guard", 2],
  ]);
  assert.equal(
    current.effects.find(({ key }) => key === "shield-block").id,
    highEffect.id,
  );
  const replay = await page.evaluate(
    async ({ id, combat }) => {
      const { resolveAbilityRequest } = await import(
        "/systems/heroes-of-legend/services/abilities.mjs"
      );
      return resolveAbilityRequest(id, `Combat.${combat}`);
    },
    { id: highRequest, combat: fixture.combat },
  );
  assert.equal(replay.replay, true);
  assert.deepEqual((await state()).sources, [
    ["Defend maneuver", 1],
    ["High Guard", 2],
  ]);

  await page.evaluate(async (f) => {
    await (await fromUuid(f.shield)).update({ "system.held": false });
  }, fixture);
  assert.deepEqual((await state()).sources, [["Defend maneuver", 1]]);
  await page.evaluate(async (f) => {
    await (await fromUuid(f.shield)).update({ "system.held": true });
  }, fixture);
  assert.deepEqual((await state()).sources, [
    ["Defend maneuver", 1],
    ["High Guard", 2],
  ]);
  await page.evaluate(async (f) => {
    const combat = game.combats.get(f.combat);
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const turn = async (type, options) =>
      resolveCombatRequest((await requestCombat(combat, type, options)).id);
    await turn("finish");
    await turn("choose", { id: f.heroParticipant });
  }, fixture);
  assert.deepEqual((await state()).sources, []);

  // A later use can replace an ordinary Shield Block without adding its Boon.
  const secondAttack = await page.evaluate(async (f) => {
    const combat = game.combats.get(f.combat);
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    const turn = async (type, options) =>
      resolveCombatRequest((await requestCombat(combat, type, options)).id);
    await turn("finish");
    await turn("choose", { id: f.npcParticipant });
    const message = await ChatMessage.create({
      content: "High Guard upgrade attack",
    });
    globalThis.__holHighGuardFixture.messages.push(message.id);
    const snapshot = {
      id: message.id,
      actorUuid: `Actor.${f.npc}`,
      attackerName: "High Guard fixture attacker",
      attributeKey: "agility",
      threat: { boons: 0, banes: 0 },
      damage: { weak: 2, standard: 3, strong: 4 },
      suggestedDefenderTokenUuids: [],
      perspective: "defender",
      title: "Basic Melee",
      blockable: true,
      hasBlockableJudgment: true,
      combatId: f.combat,
    };
    await combat.update({
      [`flags.heroes-of-legend.attacks.${message.id}`]: snapshot,
      [`flags.heroes-of-legend.operationReceipts.${message.id}`]: {
        applied: true,
        kind: "npc-attack",
      },
    });
    await message.update({ [`flags.heroes-of-legend.attackCard`]: snapshot });
    return message.id;
  }, fixture);
  await activate(fixture.block, secondAttack);
  assert.deepEqual((await state()).sources, [["Shield Block", 1]]);
  await activate(fixture.high, secondAttack);
  current = await state();
  assert.deepEqual(current.sources, [["High Guard", 2]]);
  assert.deepEqual(
    current.effects.map(({ key }) => key),
    ["shield-block"],
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: High Guard spends one Reaction, shares one shield benefit, Defend reaches three Boons, both replacement directions preserve two, held shield and turn expiry apply, replay is idempotent.",
  );
} finally {
  if (page) {
    const cleanup = await page
      .evaluate(async () => {
        const f = globalThis.__holHighGuardFixture;
        if (!f) return [];
        const failures = [];
        for (const id of f.messages) {
          try {
            await game.messages.get(id)?.delete();
          } catch (error) {
            failures.push(`message ${id}: ${error.message}`);
          }
        }
        if (f.combat) {
          try {
            await game.combats.get(f.combat)?.delete();
          } catch (error) {
            failures.push(`combat ${f.combat}: ${error.message}`);
          }
        }
        for (const id of f.actors) {
          try {
            await game.actors.get(id)?.delete();
          } catch (error) {
            failures.push(`actor ${id}: ${error.message}`);
          }
        }
        try {
          const ID = "heroes-of-legend",
            authority = await import(
              "/systems/heroes-of-legend/services/authority.mjs"
            ),
            work = game.settings.get(ID, "authorityWork"),
            current = Object.fromEntries(
              ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
                (key) => [key, game.settings.get(ID, key)],
              ),
            );
          let restore = false;
          if (authority.isCreationAuthority()) {
            if (work?.busy || work?.uncertain)
              throw new Error(
                "Coordinator work is unsettled; settings were preserved for recovery.",
              );
            await authority.releaseAuthority();
            restore = true;
          } else if (
            !current.creationAuthorityClient &&
            !Object.keys(current.authorityMeta ?? {}).length &&
            !Object.keys(current.authorityWork ?? {}).length
          ) {
            restore = true;
          } else if (JSON.stringify(current) !== JSON.stringify(f.settings)) {
            throw new Error(
              "Another coordinator owns the world; settings were preserved.",
            );
          }
          if (restore) {
            // A binding to this closing browser would become stale immediately.
            const saved =
              f.settings.creationAuthorityClient === game.socket.id
                ? {
                    creationAuthorityClient: "",
                    authorityMeta: {},
                    authorityWork: {},
                  }
                : f.settings;
            for (const [key, value] of Object.entries(saved))
              await game.settings.set(ID, key, value);
          }
        } catch (error) {
          failures.push(`coordinator: ${error.message}`);
        }
        delete globalThis.__holHighGuardFixture;
        return failures;
      })
      .catch((error) => [`cleanup unavailable: ${error.message}`]);
    await browser.close();
    assert.deepEqual(
      cleanup,
      [],
      "Disposable High Guard fixture cleanup failed",
    );
  } else {
    await browser.close();
  }
}
