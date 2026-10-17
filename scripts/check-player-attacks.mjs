import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");

const ID = "heroes-of-legend",
  SOURCE = {
    path: "design/cards/basic-melee.md",
    sha256:
      "9d6e0b6ca75363b94c6886fb3c53087f854098f024aac232395c61fdc438ae40",
  },
  browser = await chromium.launch(),
  errors = [];
let gm, player, users, scenarios = [];
await mkdir("test-results", { recursive: true });

async function join(name) {
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.setDefaultTimeout(45000);
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}

async function bind() {
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
}

async function release() {
  await gm.page.evaluate(async () => {
    const { releaseAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await releaseAuthority();
  });
}

async function makeScenario({
  ownerId,
  targetOwnerId,
  targetType,
  label,
  attackerFootprint = 1,
  targetFootprint = 1,
  wall = false,
}) {
  const fixture = await gm.page.evaluate(
    async ({
      ownerId,
      targetOwnerId,
      targetType,
      label,
      source,
      attackerFootprint,
      targetFootprint,
      wall,
    }) => {
      const ID = "heroes-of-legend",
        owner = game.users.get(ownerId),
        targetOwner = game.users.get(targetOwnerId),
        attacker = await Actor.create({
          name: `${label} attacker`,
          type: "character",
          ownership: { [owner.id]: 3 },
          system: {
            attributes: { brawn: { base: 2 } },
            health: { value: 12, baseMax: 12 },
          },
          items: [
            {
              name: "Basic Melee",
              type: "ability",
              system: {
                description: "Synthetic player Basic Melee fixture.",
                activity: { action: "main", attribute: "brawn" },
              },
              flags: { [ID]: { catalogId: "ability-basic-melee", source } },
            },
            {
              name: "Worn sword",
              type: "equipment",
              system: {
                catalogId: "item-ordinary-melee-weapon",
                quantity: 1,
                bulk: 1,
                hands: 1,
                held: true,
              },
            },
          ],
        }),
        target = await Actor.create({
          name: `${label} target`,
          type: targetType,
          ownership: { [targetOwner.id]: 3 },
          system:
            targetType === "creature"
              ? {
                  health: { value: 12, baseMax: 12 },
                  evasion: { boons: 1, banes: 0 },
                  armor: 1,
                }
              : { health: { value: 12, baseMax: 12 } },
        }),
        scene = await Scene.create({
          name: `${label} player attack fixture`,
          width: 1500,
          height: 1000,
          grid: { type: 1, size: 100, distance: 5, units: "ft" },
          tokenVision: false,
          globalLight: true,
        }),
        tokens = await scene.createEmbeddedDocuments("Token", [
          {
            name: attacker.name,
            actorId: attacker.id,
            actorLink: false,
            ownership: { [owner.id]: 3 },
            x: 100,
            y: 100,
            width: attackerFootprint,
            height: attackerFootprint,
          },
          {
            name: target.name,
            actorId: target.id,
            actorLink: false,
            ownership: { [targetOwner.id]: 3, [owner.id]: 2 },
            x: 100 + attackerFootprint * 100,
            y: 100,
            width: targetFootprint,
            height: targetFootprint,
          },
        ]);
      if (wall)
        await scene.createEmbeddedDocuments("Wall", [
          {
            c: [
              100 + attackerFootprint * 100,
              0,
              100 + attackerFootprint * 100,
              400,
            ],
            move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
          },
        ]);
      if (targetType === "creature")
        await tokens[1].actor.createEmbeddedDocuments("ActiveEffect", [
          {
            name: "Grappled 2",
            statuses: ["hol.grappled"],
            flags: {
              [ID]: {
                condition: {
                  key: "grappled",
                  rating: 2,
                  persistence: "maintained",
                  source: "Synthetic attacker hold",
                  order: 1,
                },
              },
            },
          },
        ]);
      const combat = await Combat.create({
          active: true,
          sceneId: scene.id,
          name: `${label} encounter`,
        }),
        [attackerCombatant] = await combat.createEmbeddedDocuments(
          "Combatant",
          [
            {
              actorId: attacker.id,
              tokenId: tokens[0].id,
              name: attacker.name,
              flags: { [ID]: { side: "players" } },
            },
          ],
        ),
        { requestCombat, resolveCombatRequest } = await import(
          "/systems/heroes-of-legend/services/combat.mjs"
        );
      await resolveCombatRequest(
        (await requestCombat(combat, "start")).id,
      );
      await resolveCombatRequest(
        (
          await requestCombat(combat, "choose", {
            id: attackerCombatant.id,
          })
        ).id,
      );
      await scene.view();
      return {
        label,
        attacker: attacker.id,
        attackerActorUuid: tokens[0].actor.uuid,
        attackerTokenId: tokens[0].id,
        abilityId: attacker.items.find(
          (item) => item.type === "ability",
        ).id,
        weaponId: attacker.items.find(
          (item) => item.type === "equipment",
        ).id,
        target: target.id,
        targetActorUuid: tokens[1].actor.uuid,
        targetTokenUuid: tokens[1].uuid,
        targetTokenId: tokens[1].id,
        scene: scene.id,
        combat: combat.id,
        participant: attackerCombatant.id,
      };
    },
    {
      ownerId,
      targetOwnerId,
      targetType,
      label,
      source: SOURCE,
      attackerFootprint,
      targetFootprint,
      wall,
    },
  );
  scenarios.push(fixture);
  return fixture;
}

async function activateScenario(fixture) {
  await player.page.evaluate(async (fixture) => {
    const scene = game.scenes.get(fixture.scene);
    await scene.view();
    const acting = canvas.tokens.get(fixture.attackerTokenId),
      target = canvas.tokens.get(fixture.targetTokenId);
    acting.control({ releaseOthers: true });
    target.setTarget(true, { releaseOthers: true });
  }, fixture);
}

async function requestData(fixture, selection = {}) {
  return player.page.evaluate(async ({ fixture, selection }) => {
    const actor = await fromUuid(fixture.attackerActorUuid),
      { playerBasicMeleeRequestData } = await import(
        "/systems/heroes-of-legend/services/player-attacks.mjs"
      );
    return playerBasicMeleeRequestData(
      actor.items.get(fixture.abilityId),
      game.combats.get(fixture.combat),
      fixture.participant,
      {
        weaponItemUuid: actor.items.get(fixture.weaponId).uuid,
        targetTokenUuid: fixture.targetTokenUuid,
        draft: {
          boons: 0,
          banes: 0,
          boonsLabel: "Situational Boons",
          banesLabel: "Situational Banes",
          perception: {},
          woundApplicability: {},
          rulingReason: "",
          ...(selection.draft ?? {}),
        },
        rulingReason: selection.rulingReason ?? "",
      },
    );
  }, { fixture, selection });
}

async function stageRequest(request) {
  return player.page.evaluate(async (request) => {
    const actor = await fromUuid(request.actorUuid),
      token = await fromUuid(request.basis.actorTokenUuid);
    return (
      await ChatMessage.create({
        content: "Staged Basic Melee request.",
        speaker: ChatMessage.getSpeaker({ actor, token }),
        flags: { "heroes-of-legend": { playerAttackRequest: request } },
      })
    ).id;
  }, request);
}

async function stageGmRequest(request) {
  return gm.page.evaluate(async (request) => {
    const actor = await fromUuid(request.actorUuid),
      token = await fromUuid(request.basis.actorTokenUuid);
    return (
      await ChatMessage.create({
        content: "Staged DA-backed Basic Melee request.",
        speaker: ChatMessage.getSpeaker({ actor, token }),
        flags: { "heroes-of-legend": { playerAttackRequest: request } },
      })
    ).id;
  }, request);
}

async function resolveAttack(id) {
  return gm.page.evaluate(async (id) => {
    const { resolvePlayerBasicMeleeRequest } = await import(
      "/systems/heroes-of-legend/services/player-attacks.mjs"
    );
    try {
      return { result: await resolvePlayerBasicMeleeRequest(id) };
    } catch (error) {
      return { error: error.message };
    }
  }, id);
}

async function mainState(fixture) {
  return gm.page.evaluate((fixture) => {
    const combat = game.combats.get(fixture.combat),
      state = combat.getFlag("heroes-of-legend", "encounter");
    return state.budgets[fixture.participant].remaining.main;
  }, fixture);
}

try {
  const createdUsers = await (async () => {
    gm = await join("Gamemaster");
    return gm.page.evaluate(async () => {
      const owner = await User.create({
          name: `Basic Melee owner ${foundry.utils.randomID(5)}`,
          role: CONST.USER_ROLES.PLAYER,
        }),
        targetOwner = await User.create({
          name: `PvP target owner ${foundry.utils.randomID(5)}`,
          role: CONST.USER_ROLES.PLAYER,
        });
      return { owner: owner.id, targetOwner: targetOwner.id };
    });
  })();
  users = createdUsers;
  await bind();
  const primary = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Primary",
  });
  player = await join(
    await gm.page.evaluate((id) => game.users.get(id).name, users.owner),
  );
  await activateScenario(primary);
  const baseline = await requestData(primary);
  const encounterBefore = await gm.page.evaluate((fixture) => {
    const state = game.combats
      .get(fixture.combat)
      .getFlag("heroes-of-legend", "encounter");
    return {
      revision: state.revision,
      encounter: {
        roster: state.roster,
        current: state.current,
        nextSide: state.nextSide,
        startingSide: state.startingSide,
        round: state.round,
        serial: state.serial,
        acted: state.acted,
        opening: state.opening,
        history: state.history,
        movementProfiles: state.movementProfiles ?? null,
        speedRulings: state.speedRulings ?? null,
      },
    };
  }, primary);

  const largeFootprints = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Large",
    attackerFootprint: 2,
    targetFootprint: 2,
  });
  await activateScenario(largeFootprints);
  const largeGeometry = await gm.page.evaluate(async (fixture) => {
    const { nativeBasicMeleeAdjacency } = await import(
      "/systems/heroes-of-legend/services/player-attacks.mjs"
    );
    return nativeBasicMeleeAdjacency(
      await fromUuid(fixture.attackerActorUuid),
      await fromUuid(fixture.targetTokenUuid),
    );
  }, largeFootprints);
  assert.equal(largeGeometry.status, "adjacent");
  assert.equal(largeGeometry.spaces, 1);
  assert.equal(largeGeometry.collision, "clear");

  const blockedFootprints = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Wall",
    wall: true,
  });
  await activateScenario(blockedFootprints);
  const blockedGeometry = await gm.page.evaluate(async (fixture) => {
    const { nativeBasicMeleeAdjacency } = await import(
      "/systems/heroes-of-legend/services/player-attacks.mjs"
    );
    return nativeBasicMeleeAdjacency(
      await fromUuid(fixture.attackerActorUuid),
      await fromUuid(fixture.targetTokenUuid),
    );
  }, blockedFootprints);
  assert.equal(blockedGeometry.status, "unverified");
  assert.equal(blockedGeometry.collision, "blocked");
  await activateScenario(primary);

  const staleCases = [
    {
      name: "weapon",
      mutate: async (fixture) =>
        gm.page.evaluate(async (fixture) => {
          const actor = await fromUuid(fixture.attackerActorUuid);
          await actor.items
            .get(fixture.weaponId)
            .update({ "system.held": false });
        }, fixture),
      restore: async (fixture) =>
        gm.page.evaluate(async (fixture) => {
          const actor = await fromUuid(fixture.attackerActorUuid);
          await actor.items
            .get(fixture.weaponId)
            .update({ "system.held": true });
        }, fixture),
    },
    {
      name: "target",
      mutate: async (fixture) =>
        gm.page.evaluate(
          (fixture) =>
            game.scenes
              .get(fixture.scene)
              .tokens.get(fixture.targetTokenId)
              .update({ x: 900 }),
          fixture,
        ),
      restore: async (fixture) =>
        gm.page.evaluate(
          (fixture) =>
            game.scenes
              .get(fixture.scene)
              .tokens.get(fixture.targetTokenId)
              .update({ x: 200 }),
          fixture,
        ),
    },
    {
      name: "source",
      mutate: async (fixture) =>
        gm.page.evaluate(async (fixture) => {
          const target = await fromUuid(fixture.targetActorUuid);
          await target.createEmbeddedDocuments("ActiveEffect", [
            {
              name: "Grappled 1",
              statuses: ["hol.grappled"],
              flags: {
                "heroes-of-legend": {
                  condition: {
                    key: "grappled",
                    rating: 1,
                    persistence: "maintained",
                    source: "Stale-source fixture",
                    order: 2,
                  },
                },
              },
            },
          ]);
        }, fixture),
      restore: async (fixture) =>
        gm.page.evaluate(async (fixture) => {
          const target = await fromUuid(fixture.targetActorUuid),
            stale = target.effects.find(
              (effect) =>
                effect.getFlag("heroes-of-legend", "condition")?.source ===
                "Stale-source fixture",
            );
          if (stale)
            await target.deleteEmbeddedDocuments("ActiveEffect", [stale.id]);
        }, fixture),
    },
  ];
  await release();
  for (const stale of staleCases) {
    const id = await stageRequest(baseline);
    await stale.mutate(primary);
    await bind();
    const result = await resolveAttack(id);
    assert.match(
      result.error,
      /weapon, target, roll sources or adjacency changed|within one adjacent square|Hold a compatible melee weapon/,
    );
    assert.equal(await mainState(primary), 1);
    assert.equal(
      await gm.page.evaluate(
        ({ combat, id }) =>
          Boolean(
            game.combats
              .get(combat)
              .getFlag("heroes-of-legend", "playerAttackOperations")?.[id],
          ),
        { combat: primary.combat, id },
      ),
      false,
    );
    await release();
    await stale.restore(primary);
  }
  await bind();

  const nonadjacent = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "DA exception",
  });
  await activateScenario(nonadjacent);
  await gm.page.evaluate(
    (fixture) =>
      game.scenes
        .get(fixture.scene)
        .tokens.get(fixture.targetTokenId)
        .update({ x: 900 }),
    nonadjacent,
  );
  const exceptionRequest = await gm.page.evaluate(async (fixture) => {
    const actor = await fromUuid(fixture.attackerActorUuid),
      { playerBasicMeleeRequestData } = await import(
        "/systems/heroes-of-legend/services/player-attacks.mjs"
      );
    return playerBasicMeleeRequestData(
      actor.items.get(fixture.abilityId),
      game.combats.get(fixture.combat),
      fixture.participant,
      {
        weaponItemUuid: actor.items.get(fixture.weaponId).uuid,
        targetTokenUuid: fixture.targetTokenUuid,
        rulingReason: "The DA confirms melee reach across the fixture gap.",
        draft: {
          boons: 0,
          banes: 0,
          boonsLabel: "Situational Boons",
          banesLabel: "Situational Banes",
          perception: {},
          woundApplicability: {},
        },
      },
    );
  }, nonadjacent);
  assert.equal(exceptionRequest.basis.geometry.status, "not-adjacent");
  assert.match(exceptionRequest.ruling.reason, /melee reach/);
  await release();
  const exceptionId = await stageGmRequest(exceptionRequest);
  await bind();
  const exceptionResult = await resolveAttack(exceptionId);
  assert.equal(exceptionResult.result.status, "complete");
  assert.equal(await mainState(nonadjacent), 0);
  const exceptionOperation = await gm.page.evaluate(
    ({ fixture, id }) =>
      game.combats
        .get(fixture.combat)
        .getFlag("heroes-of-legend", "playerAttackOperations")[id],
    { fixture: nonadjacent, id: exceptionId },
  );
  assert.match(exceptionOperation.ruling.reason, /melee reach/);
  assert.equal(exceptionOperation.result.snapshot.attackOutcome.type, "physical");
  await activateScenario(primary);

  await player.page.evaluate(async (fixture) => {
    const actor = await fromUuid(fixture.attackerActorUuid);
    await actor.sheet.render({ force: true });
    await actor.items.get(fixture.abilityId).sheet.render({ force: true });
  }, primary);
  await player.page
    .locator(".hol-ability")
    .getByRole("button", { name: "Use Basic Melee", exact: true })
    .click();
  const dialog = player.page.locator(".hol-player-attack");
  await dialog.locator(".hol-roll-sources").getByText("Target Evasion", {
    exact: false,
  }).waitFor();
  await dialog.locator(".hol-roll-sources").getByText("Target is Grappled", {
    exact: false,
  }).waitFor();
  assert.equal(await dialog.locator("output").innerText(), "6d6kh3 + (2)");
  await dialog.screenshot({
    path: "test-results/player-basic-melee-dialog.png",
  });
  await dialog
    .getByRole("button", {
      name: "Commit one Main Action and roll",
      exact: true,
    })
    .click();
  await player.page.waitForFunction(
    (fixture) =>
      game.messages.some(
        (message) =>
          message.getFlag("heroes-of-legend", "playerAttack")?.combatId ===
          fixture.combat,
      ),
    primary,
  );
  const attackId = await player.page.evaluate(
    (fixture) =>
      game.messages.find(
        (message) =>
          message.getFlag("heroes-of-legend", "playerAttack")?.combatId ===
          fixture.combat,
      ).id,
    primary,
  );
  const rolled = await gm.page.evaluate(
    ({ fixture, id }) => {
      const message = game.messages.get(id),
        roll = message.getFlag("heroes-of-legend", "roll"),
        card = message.getFlag("heroes-of-legend", "playerAttack"),
        combat = game.combats.get(fixture.combat),
        operation = combat.getFlag("heroes-of-legend", "playerAttackOperations")[
          id
        ],
        state = combat.getFlag("heroes-of-legend", "encounter");
      return {
        author: message.author.id,
        rolls: message.rolls.length,
        dice: message.rolls[0]?.toJSON(),
        actorUuid: roll.actorUuid,
        actorTokenUuid: roll.actorTokenUuid,
        targetActorUuid: roll.targetActorUuid,
        targetTokenUuid: roll.targetTokenUuid,
        tier: roll.tier,
        damage: card.damage,
        source: operation.source,
        draft: operation.draft,
        operationRoll: operation.result?.roll,
        actionReceipt: operation.actionReceipt,
        revision: state.revision,
        encounter: {
          roster: state.roster,
          current: state.current,
          nextSide: state.nextSide,
          startingSide: state.startingSide,
          round: state.round,
          serial: state.serial,
          acted: state.acted,
          opening: state.opening,
          history: state.history,
          movementProfiles: state.movementProfiles ?? null,
          speedRulings: state.speedRulings ?? null,
        },
        main: state.budgets[fixture.participant].remaining.main,
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
        defenseRequests: game.messages.filter(
          (message) =>
            message.getFlag("heroes-of-legend", "defenseRequest") &&
            message.getFlag("heroes-of-legend", "defenseRequest")
              .attackMessageId === id,
        ).length,
      };
    },
    { fixture: primary, id: attackId },
  );
  assert.equal(rolled.author, users.owner);
  assert.equal(rolled.rolls, 1);
  assert.equal(rolled.actorUuid, primary.attackerActorUuid);
  assert.equal(rolled.actorTokenUuid, baseline.basis.actorTokenUuid);
  assert.equal(rolled.targetActorUuid, primary.targetActorUuid);
  assert.equal(rolled.targetTokenUuid, baseline.basis.targetTokenUuid);
  assert.equal(
    rolled.damage,
    { weak: 2, standard: 3, strong: 5 }[rolled.tier],
  );
  assert.deepEqual(rolled.source, SOURCE);
  assert.deepEqual(rolled.draft, baseline.draft);
  assert.equal(rolled.revision, encounterBefore.revision + 2);
  assert.deepEqual(rolled.encounter, encounterBefore.encounter);
  assert.equal(rolled.actionReceipt.status, "resolving");
  assert.equal(rolled.actionReceipt.sourceId, "ability-basic-melee");
  assert.equal(rolled.actionReceipt.category, "main");
  assert.deepEqual(rolled.operationRoll, rolled.dice);
  assert.equal(rolled.main, 0);
  assert.equal(rolled.pending, null);
  assert.equal(rolled.defenseRequests, 0);
  await gm.page
    .locator(`[data-message-id="${attackId}"]`)
    .screenshot({ path: "test-results/player-basic-melee-chat.png" });
  const replay = await resolveAttack(attackId);
  assert.equal(replay.result.replay, true);
  assert.equal(
    await gm.page.evaluate(
      (id) => game.messages.get(id).rolls[0].toJSON(),
      attackId,
  ).then((dice) => JSON.stringify(dice)),
    JSON.stringify(rolled.dice),
  );
  assert.equal(await mainState(primary), 0);

  await player.page.evaluate((id) => {
    const message = game.messages.get(id),
      saved = message.getFlag("heroes-of-legend", "roll"),
      card = message.getFlag("heroes-of-legend", "playerAttack"),
      forgedRoll = message.rolls[0].toJSON();
    const die = forgedRoll.terms.find((term) =>
      Array.isArray(term.results),
    );
    for (const result of die.results) result.result = 6;
    return message.update({
      rolls: [foundry.dice.Roll.fromJSON(JSON.stringify(forgedRoll))],
      "flags.heroes-of-legend.roll": {
        ...saved,
        attribute: 99,
        retained: [6, 6, 6],
        tier: "strong",
        total: 117,
        natural: "critical",
        attackOutcome: { damage: 5, type: "physical", applied: false },
        recovery: {
          userId: game.user.id,
          reason: "Forged player recovery",
          retained: [6, 6, 6],
        },
      },
      "flags.heroes-of-legend.playerAttack": {
        ...card,
        damage: 5,
        tier: "strong",
        total: 117,
        retained: [6, 6, 6],
        recovery: {
          userId: game.user.id,
          reason: "Forged player recovery",
          retained: [6, 6, 6],
        },
      },
    });
  }, attackId);
  const forgedDamage = await gm.page.evaluate(async (id) => {
    const { playerBasicMeleeDamage } = await import(
      "/systems/heroes-of-legend/services/player-attacks.mjs"
    );
    return playerBasicMeleeDamage(id);
  }, attackId);
  assert.equal(forgedDamage.components[0].amount, rolled.damage);
  const projectionReplay = await resolveAttack(attackId);
  assert.equal(projectionReplay.result.replay, true);
  const restoredProjection = await gm.page.evaluate(
    ({ fixture, id }) => {
      const message = game.messages.get(id),
        operation = game.combats
          .get(fixture.combat)
          .getFlag("heroes-of-legend", "playerAttackOperations")[id];
      return {
        damage: message.getFlag("heroes-of-legend", "playerAttack").damage,
        recovery: message.getFlag("heroes-of-legend", "playerAttack").recovery,
        roll: message.rolls[0].toJSON(),
        authoritativeRoll: operation.result.roll,
      };
    },
    { fixture: primary, id: attackId },
  );
  assert.equal(restoredProjection.damage, rolled.damage);
  assert.equal(restoredProjection.recovery, null);
  assert.deepEqual(restoredProjection.roll, restoredProjection.authoritativeRoll);

  await player.page.reload();
  await player.page.waitForFunction(() => globalThis.game?.ready);
  await player.page.waitForFunction(
    (id) => Boolean(game.messages.get(id)?.getFlag("heroes-of-legend", "roll")),
    attackId,
  );

  await gm.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await gm.page
    .locator(`[data-message-id="${attackId}"] .hol-player-attack-damage`)
    .click();
  const damage = gm.page.locator(".hol-damage");
  assert.equal(
    await damage
      .locator("[data-damage-type=physical] [name=amount]")
      .inputValue(),
    String(rolled.damage),
  );
  await damage.getByRole("button", { name: "Apply damage once" }).click();
  const expectedHp = 12 - Math.max(1, rolled.damage - 1);
  await gm.page.waitForFunction(
    ({ actorUuid, expectedHp }) =>
      fromUuidSync(actorUuid)?.system.health.value === expectedHp,
    { actorUuid: primary.targetActorUuid, expectedHp },
  );
  await gm.page
    .locator(`[data-message-id="${attackId}"] .hol-player-attack-damage`)
    .click();
  await gm.page
    .locator(".hol-damage")
    .getByRole("button", { name: "Apply damage once" })
    .click();
  await gm.page.waitForFunction(
    (actorUuid) =>
      game.messages.some((message) =>
        message.content.includes(
          "This Basic Melee damage was already applied",
        ),
      ),
    primary.targetActorUuid,
  );
  assert.equal(
    await gm.page.evaluate(
      (uuid) => fromUuidSync(uuid).system.health.value,
      primary.targetActorUuid,
    ),
    expectedHp,
  );

  const pvp = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "character",
    label: "PvP",
  });
  await activateScenario(pvp);
  const pvpRequest = await requestData(pvp);
  const pvpIds = await player.page.evaluate(async (request) => {
    const actor = await fromUuid(request.actorUuid),
      token = await fromUuid(request.basis.actorTokenUuid);
    return Promise.all(
      ["A", "B"].map((suffix) =>
        ChatMessage.create({
          content: `Double-submitted PvP Basic Melee ${suffix}.`,
          speaker: ChatMessage.getSpeaker({ actor, token }),
          flags: { "heroes-of-legend": { playerAttackRequest: request } },
        }).then((message) => message.id),
      ),
    );
  }, pvpRequest);
  await gm.page.waitForFunction(
    (ids) =>
      ids.filter(
        (id) =>
          game.messages.get(id)?.getFlag("heroes-of-legend", "playerAttack"),
      ).length === 1 &&
      ids.every((id) => {
        const message = game.messages.get(id);
        return (
          message?.getFlag("heroes-of-legend", "playerAttack") ||
          message?.content.includes("Basic Melee needs attention")
        );
      }),
    pvpIds,
  );
  const pvpResult = await gm.page.evaluate(
    ({ ids, fixture }) => {
      const rolled = ids.find((id) =>
          game.messages.get(id).getFlag("heroes-of-legend", "playerAttack"),
        ),
        failed = ids.find((id) => id !== rolled),
        message = game.messages.get(rolled),
        roll = message.getFlag("heroes-of-legend", "roll");
      return {
        rolled,
        rollCount: game.messages.filter(
          (message) =>
            message.getFlag("heroes-of-legend", "roll")?.targetTokenUuid ===
            roll.targetTokenUuid,
        ).length,
        targetActorUuid: roll.targetActorUuid,
        failedContent: game.messages.get(failed).content,
        main: game.combats
          .get(fixture.combat)
          .getFlag("heroes-of-legend", "encounter").budgets[
          fixture.participant
        ].remaining.main,
        defenses: game.messages.filter(
          (message) =>
            message.getFlag("heroes-of-legend", "defenseRequest")
              ?.attackMessageId === rolled,
        ).length,
      };
    },
    { ids: pvpIds, fixture: pvp },
  );
  assert.equal(pvpResult.rollCount, 1);
  assert.equal(pvpResult.targetActorUuid, pvp.targetActorUuid);
  assert.equal(pvpResult.main, 0);
  assert.equal(pvpResult.defenses, 0);
  assert.match(
    pvpResult.failedContent,
    /pending encounter action|No main|condition prevents/,
  );

  const unknownFixture = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Unknown",
  });
  await activateScenario(unknownFixture);
  const unknownRequest = await requestData(unknownFixture);
  await release();
  const unknownId = await stageRequest(unknownRequest);
  const unknown = await gm.page.evaluate(
    async ({ fixture, id }) => {
      const original = foundry.dice.Roll.prototype.evaluate,
        { bindCreationAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        ),
        { resolvePlayerBasicMeleeRequest } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        );
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Injected unknown native dice result");
      };
      try {
        await bindCreationAuthority();
        await resolvePlayerBasicMeleeRequest(id);
        return { error: null };
      } catch (error) {
        const combat = game.combats.get(fixture.combat);
        return {
          error: error.message,
          main: combat.getFlag("heroes-of-legend", "encounter").budgets[
            fixture.participant
          ].remaining.main,
          roll: game.messages.get(id).getFlag("heroes-of-legend", "roll"),
          pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
        };
      } finally {
        foundry.dice.Roll.prototype.evaluate = original;
      }
    },
    { fixture: unknownFixture, id: unknownId },
  );
  assert.match(unknown.error, /Injected unknown native dice result/);
  assert.equal(unknown.main, 0);
  assert.equal(unknown.roll, null);
  assert.equal(unknown.pending, unknownId);
  await player.page.evaluate(
    ({ id, authorId }) =>
      game.messages.get(id).update({
        "flags.heroes-of-legend.roll": {
          attribute: 99,
          retained: [6, 6, 6],
          tier: "strong",
          total: 117,
          recovery: {
            userId: authorId,
            reason: "Forged player recovery",
            retained: [6, 6, 6],
          },
        },
        "flags.heroes-of-legend.playerAttack": {
          operationId: id,
          damage: 5,
          type: "physical",
        },
      }),
    { id: unknownId, authorId: users.owner },
  );
  const recovery = await gm.page.evaluate(
    async ({ id, fixture }) => {
      const original = foundry.dice.Roll.prototype.evaluate,
        { recoverPlayerBasicMeleeRequest } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        );
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Recovery rerolled dice");
      };
      try {
        await recoverPlayerBasicMeleeRequest(id, {
          retained: [3, 4, 5],
          reason: "Observed dice preserved by the DA",
        });
      } finally {
        foundry.dice.Roll.prototype.evaluate = original;
      }
      const message = game.messages.get(id),
        roll = message.getFlag("heroes-of-legend", "roll"),
        combat = game.combats.get(fixture.combat),
        operation = combat.getFlag(
          "heroes-of-legend",
          "playerAttackOperations",
        )[id];
      return {
        retained: roll.retained,
        tier: roll.tier,
        recovery: roll.recovery,
        operationRetained: operation.result.snapshot.retained,
        operationRecovery: operation.result.recovery,
        operationRoll: operation.result.roll,
        gmUserId: game.user.id,
        nativeRolls: message.rolls.length,
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
      };
    },
    { id: unknownId, fixture: unknownFixture },
  );
  assert.deepEqual(recovery.retained, [3, 4, 5]);
  assert.equal(recovery.tier, "standard");
  assert.match(recovery.recovery.reason, /Observed dice/);
  assert.deepEqual(recovery.operationRetained, [3, 4, 5]);
  assert.equal(recovery.operationRecovery.userId, recovery.gmUserId);
  assert.match(recovery.operationRecovery.reason, /Observed dice/);
  assert.equal(recovery.operationRoll, null);
  assert.equal(recovery.nativeRolls, 0);
  assert.equal(recovery.pending, null);
  const recoveredReplay = await resolveAttack(unknownId);
  assert.equal(recoveredReplay.result.replay, true);

  const latePresentation = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Late presentation",
  });
  await activateScenario(latePresentation);
  const lateRequest = await requestData(latePresentation);
  await release();
  const lateId = await stageRequest(lateRequest);
  const late = await gm.page.evaluate(
    async ({ id, fixture }) => {
      const original = ChatMessage.prototype.update,
        { bindCreationAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        ),
        { resolvePlayerBasicMeleeRequest } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        );
      let rejectedPresentation = false;
      ChatMessage.prototype.update = function (changes, ...args) {
        if (
          this.id === id &&
          typeof changes?.content === "string" &&
          changes.content.includes("hol-player-attack-card")
        ) {
          rejectedPresentation = true;
          return Promise.reject(
            new Error("Injected late chat presentation failure"),
          );
        }
        return original.call(this, changes, ...args);
      };
      let error = null;
      try {
        await bindCreationAuthority();
        await resolvePlayerBasicMeleeRequest(id);
      } catch (caught) {
        error = caught.message;
      } finally {
        ChatMessage.prototype.update = original;
      }
      const combat = game.combats.get(fixture.combat),
        operation = combat.getFlag(
          "heroes-of-legend",
          "playerAttackOperations",
        )[id],
        message = game.messages.get(id);
      return {
        error,
        rejectedPresentation,
        result: operation.result,
        status: operation.status,
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
        chatRoll: message.getFlag("heroes-of-legend", "roll"),
        nativeRolls: message.rolls.length,
      };
    },
    { id: lateId, fixture: latePresentation },
  );
  assert.match(late.error, /late chat presentation failure/);
  assert.equal(late.rejectedPresentation, true);
  assert.equal(late.status, "complete");
  assert(late.result?.roll);
  assert.equal(late.pending, lateId);
  assert.equal(late.chatRoll, null);
  assert.equal(late.nativeRolls, 0);
  const lateReplay = await gm.page.evaluate(async ({ id, fixture }) => {
    const original = foundry.dice.Roll.prototype.evaluate,
      { resolvePlayerBasicMeleeRequest } = await import(
        "/systems/heroes-of-legend/services/player-attacks.mjs"
      );
    foundry.dice.Roll.prototype.evaluate = () => {
      throw new Error("Late presentation replay rerolled dice");
    };
    try {
      await resolvePlayerBasicMeleeRequest(id);
    } finally {
      foundry.dice.Roll.prototype.evaluate = original;
    }
    const combat = game.combats.get(fixture.combat),
      operation = combat.getFlag(
        "heroes-of-legend",
        "playerAttackOperations",
      )[id],
      receipt = combat.getFlag("heroes-of-legend", "operationReceipts")[id],
      message = game.messages.get(id);
    return {
      result: operation.result,
      pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
      receipt,
      roll: message.rolls[0].toJSON(),
      card: message.getFlag("heroes-of-legend", "playerAttack"),
    };
  }, { id: lateId, fixture: latePresentation });
  assert.deepEqual(lateReplay.result, late.result);
  assert.equal(lateReplay.pending, null);
  assert.equal(lateReplay.receipt.applied, true);
  assert.deepEqual(lateReplay.roll, late.result.roll);
  assert.equal(lateReplay.card.damage, late.result.snapshot.attackOutcome.damage);

  const deletedSource = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Deleted source",
  });
  await activateScenario(deletedSource);
  const deletedRequest = await requestData(deletedSource);
  await release();
  const deletedId = await stageRequest(deletedRequest);
  const unknownBeforeDelete = await gm.page.evaluate(
    async ({ id, fixture }) => {
      const original = foundry.dice.Roll.prototype.evaluate,
        { bindCreationAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        ),
        { resolvePlayerBasicMeleeRequest } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        );
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Deleted-source unknown dice");
      };
      try {
        await bindCreationAuthority();
        await resolvePlayerBasicMeleeRequest(id);
      } catch (error) {
        const combat = game.combats.get(fixture.combat);
        return {
          error: error.message,
          status: combat.getFlag(
            "heroes-of-legend",
            "playerAttackOperations",
          )[id].status,
        };
      } finally {
        foundry.dice.Roll.prototype.evaluate = original;
      }
      return { error: null, status: null };
    },
    { id: deletedId, fixture: deletedSource },
  );
  assert.match(unknownBeforeDelete.error, /Deleted-source unknown dice/);
  assert.equal(unknownBeforeDelete.status, "resolving");
  await gm.page.evaluate((id) => game.messages.get(id).delete(), deletedId);
  const deletedReplay = await resolveAttack(deletedId);
  assert.equal(deletedReplay.result.replay, true);
  assert.equal(deletedReplay.result.presentation, "deleted");
  const deletedRetained = await gm.page.evaluate(
    async ({ id, fixture }) => {
      const combat = game.combats.get(fixture.combat),
        operation = combat.getFlag(
          "heroes-of-legend",
          "playerAttackOperations",
        )[id],
        { pendingPlayerAttacks } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        );
      return {
        message: Boolean(game.messages.get(id)),
        requestRetained: operation.requestSignature,
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
        attention: pendingPlayerAttacks(combat).includes(id),
      };
    },
    { id: deletedId, fixture: deletedSource },
  );
  assert.equal(deletedRetained.message, false);
  assert(deletedRetained.requestRetained);
  assert.equal(deletedRetained.pending, deletedId);
  assert.equal(deletedRetained.attention, true);
  const deletedRecovery = await gm.page.evaluate(
    async ({ id, fixture }) => {
      const original = foundry.dice.Roll.prototype.evaluate,
        { recoverPlayerBasicMeleeRequest, playerBasicMeleeDamage } =
          await import(
            "/systems/heroes-of-legend/services/player-attacks.mjs"
          );
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Deleted-source recovery rerolled dice");
      };
      try {
        await recoverPlayerBasicMeleeRequest(id, {
          retained: [2, 3, 4],
          reason: "DA preserved the observed deleted-source dice",
        });
      } finally {
        foundry.dice.Roll.prototype.evaluate = original;
      }
      const combat = game.combats.get(fixture.combat),
        operation = combat.getFlag(
          "heroes-of-legend",
          "playerAttackOperations",
        )[id],
        receipt = combat.getFlag("heroes-of-legend", "operationReceipts")[id],
        damage = playerBasicMeleeDamage(id);
      return {
        result: operation.result,
        receipt,
        damage,
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
      };
    },
    { id: deletedId, fixture: deletedSource },
  );
  assert.equal(deletedRecovery.result.roll, null);
  assert.deepEqual(deletedRecovery.result.snapshot.retained, [2, 3, 4]);
  assert.equal(deletedRecovery.receipt.presentation, "missing");
  assert.equal(deletedRecovery.damage.components[0].amount, 3);
  assert.equal(deletedRecovery.pending, deletedId);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: encounter preservation, 5-unit grid-space adjacency, large footprints, collision-blocked geometry, reasoned nonadjacency exception, authoritative result projection/replay, forged roll and recovery rejection, late presentation recovery, deleted-source attention/recovery, PvP one-roll, Main once and linked damage deduplication.",
  );
} finally {
  await player?.context.close();
  if (gm && users) {
    await gm.page
      .evaluate(
        async ({ users, scenarios }) => {
          const { releaseAuthority } = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          );
          await releaseAuthority();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const combats = new Set(
              scenarios.map((fixture) => `Combat.${fixture.combat}`),
            ),
            actors = new Set(
              scenarios.flatMap((fixture) => [
                fixture.attackerActorUuid,
                fixture.targetActorUuid,
              ]),
            );
          for (const message of game.messages.filter(
            (message) =>
              combats.has(
                message.getFlag("heroes-of-legend", "playerAttackRequest")
                  ?.combatUuid,
              ) ||
              combats.has(
                `Combat.${message.getFlag("heroes-of-legend", "playerAttack")?.combatId}`,
              ) ||
              actors.has(
                message.getFlag("heroes-of-legend", "damageRequest")?.actorUuid,
              ),
          ))
            await message.delete();
          for (const fixture of scenarios)
            await game.combats.get(fixture.combat)?.delete();
          for (const fixture of scenarios)
            await game.scenes.get(fixture.scene)?.delete();
          for (const fixture of scenarios) {
            await game.actors.get(fixture.attacker)?.delete();
            await game.actors.get(fixture.target)?.delete();
          }
          for (const user of [users.owner, users.targetOwner])
            await game.users.get(user)?.delete();
        },
        { users, scenarios },
      )
      .catch((error) => console.error("Cleanup:", error.message));
  }
  await browser.close();
}
