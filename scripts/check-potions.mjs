import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");

const browser = await chromium.launch(),
  errors = [],
  fixtures = { users: [], actors: [], combats: [], scenes: [], messages: [] };
let gm, giver, recipient, first, failure, cleanupError;

async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}

async function bind(connection) {
  await connection.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
}

async function combatRequest(kind, payload = {}, combatId = first.combat) {
  return gm.page.evaluate(
    async ({ combatId, kind, payload }) => {
      const { requestCombat, resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
      const combat = game.combats.get(combatId),
        message = await requestCombat(combat, kind, payload);
      return resolveCombatRequest(message.id);
    },
    { combatId, kind, payload },
  );
}

async function stageScenario({
  name,
  bottleId,
  inventoryDie = 4,
  giverHp = 1,
  recipient = null,
}) {
  return gm.page.evaluate(
    async ({ name, bottleId, inventoryDie, giverHp, recipient }) => {
      const ID = "heroes-of-legend",
        { loadCatalogs } = await import(
          "/systems/heroes-of-legend/services/catalog.mjs"
        ),
        { requestCombat, resolveCombatRequest } = await import(
          "/systems/heroes-of-legend/services/combat.mjs"
        ),
        { survivalState } = await import(
          "/systems/heroes-of-legend/rules/survival.mjs"
        ),
        inventory = (await loadCatalogs()).inventory,
        equipment = inventory.equipment.find((record) => record.id === bottleId),
        action = inventory.acquisitions.find(
          (record) => record.id === "ability-use-a-healing-potion",
        );
      const giverActor = await Actor.create({
        name: `${name} giver`,
        type: "character",
        system: { health: { value: giverHp, baseMax: 30 } },
        items: [
          {
            name: equipment.name,
            type: "equipment",
            system: {
              catalogId: equipment.id,
              quantity: 1,
              bulk: equipment.bulk,
              hands: 0,
              inventoryDie,
            },
            flags: { [ID]: { source: equipment.source } },
          },
          {
            name: "Use a Healing Potion",
            type: "ability",
            flags: {
              [ID]: {
                catalogId: "ability-use-a-healing-potion",
                source: action.source,
              },
            },
          },
        ],
      });
      let recipientActor = null,
        recipientSurvival = null;
      if (recipient) {
        recipientSurvival = survivalState({
          hp: recipient.hp,
          maxHp: recipient.maxHp,
          status: recipient.hp > 0 ? "active" : "dying",
          marks: recipient.hp > 0 ? 0 : 1,
        });
        recipientActor = await Actor.create({
          name: `${name} recipient`,
          type: "character",
          system: {
            health: { value: recipient.hp, baseMax: recipient.maxHp },
          },
          flags: { [ID]: { survival: recipientSurvival } },
        });
      }
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments(
          "Combatant",
          [giverActor, recipientActor]
            .filter(Boolean)
            .map((actor, index) => ({
              actorId: actor.id,
              name: actor.name,
              flags: {
                [ID]: { side: index ? "opposition" : "players" },
              },
            })),
        );
      const giverCombatant = combat.combatants.find(
          (combatant) => combatant.actorId === giverActor.id,
        ),
        recipientCombatant = recipientActor
          ? combat.combatants.find(
              (combatant) => combatant.actorId === recipientActor.id,
            )
          : null;
      let message = await requestCombat(combat, "start");
      await resolveCombatRequest(message.id);
      let state = combat.getFlag(ID, "encounter");
      if (state.nextSide === "opposition") {
        message = await requestCombat(combat, "choose", {
          id: recipientCombatant.id,
        });
        await resolveCombatRequest(message.id);
        message = await requestCombat(combat, "finish");
        await resolveCombatRequest(message.id);
      }
      message = await requestCombat(combat, "choose", {
        id: giverCombatant.id,
      });
      await resolveCombatRequest(message.id);
      const bottle = giverActor.items.find(
          (item) => item.system.catalogId === bottleId,
        ),
        ability = giverActor.items.find((item) =>
          item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion",
        );
      return {
        giverActorId: giverActor.id,
        giverActorUuid: giverActor.uuid,
        recipientActorId: recipientActor?.id ?? null,
        recipientActorUuid: recipientActor?.uuid ?? null,
        recipientSurvival,
        combatId: combat.id,
        combatUuid: combat.uuid,
        giverParticipantId: giverCombatant.id,
        recipientParticipantId: recipientCombatant?.id ?? null,
        bottleId: bottle.id,
        bottleUuid: bottle.uuid,
        abilityId: ability.id,
        abilityUuid: ability.uuid,
      };
    },
    { name, bottleId, inventoryDie, giverHp, recipient },
  );
}

async function useScenario(scenario, options = {}) {
  return gm.page.evaluate(
    async ({ scenario, options }) => {
      const { requestPotionUse } = await import(
        "/systems/heroes-of-legend/services/potions.mjs"
      );
      const message = await requestPotionUse({
        sourceItemUuid: scenario.abilityUuid,
        bottleItemUuid: scenario.bottleUuid,
        combatUuid: scenario.combatUuid,
        giverParticipantId: scenario.giverParticipantId,
        recipientParticipantId:
          scenario.recipientParticipantId ?? scenario.giverParticipantId,
        willing: Boolean(options.willing),
        continuesAfterInterruption:
          options.continuesAfterInterruption !== false,
        geometry:
          scenario.recipientParticipantId
            ? { mode: "da-ruling", reason: "Fixture adjacency ruling" }
            : { mode: "native" },
        daWillingnessReason: scenario.recipientParticipantId
          ? "Fixture recipient willingness ruling"
          : "",
      });
      return message?.message?.id ?? message?.id ?? null;
    },
    { scenario, options },
  );
}

async function waitPotion(scenario, predicate = "applied") {
  await gm.page.waitForFunction(
    ({ combatId, predicate }) => {
      const combat = game.combats.get(combatId),
        operations = Object.values(
          combat?.getFlag("heroes-of-legend", "potionOperations") ?? {},
        );
      return operations.some((operation) =>
        predicate === "pending"
          ? combat.getFlag("heroes-of-legend", "pendingPotion") ===
            operation.requestId
          : combat.getFlag("heroes-of-legend", "operationReceipts")?.[
              operation.requestId
            ]?.applied,
      );
    },
    { combatId: scenario.combatId, predicate },
  );
}

async function waitSupplyRolling(scenario, expectedHp) {
  await gm.page.waitForFunction(
    ({ combatId, actorId, expectedHp }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat?.getFlag("heroes-of-legend", "potionOperations") ?? {},
        )[0],
        giver = game.actors.get(actorId),
        child =
          giver?.getFlag("heroes-of-legend", "potionSupplyOperations")?.[
            operation?.supplyOperationId
          ];
      return (
        giver?.system.health.value === expectedHp &&
        child?.phase === "rolling"
      );
    },
    {
      combatId: scenario.combatId,
      actorId: scenario.giverActorId,
      expectedHp,
    },
  );
}

try {
  gm = await join("Gamemaster");
  await bind(gm);
  first = await gm.page.evaluate(async () => {
    const ID = "heroes-of-legend",
      { loadCatalogs } = await import(
        "/systems/heroes-of-legend/services/catalog.mjs"
      ),
      inventory = (await loadCatalogs()).inventory,
      lesser = inventory.equipment.find(
        (record) => record.id === "item-lesser-healing-bottle",
      ),
      brooch = inventory.equipment.find(
        (record) => record.id === "item-gravebound-brooch",
      ),
      action = inventory.acquisitions.find(
        (record) => record.id === "ability-use-a-healing-potion",
      ),
      ownerA = await User.create({
        name: `Potion giver ${foundry.utils.randomID(5)}`,
        role: CONST.USER_ROLES.PLAYER,
      }),
      ownerB = await User.create({
        name: `Potion recipient ${foundry.utils.randomID(5)}`,
        role: CONST.USER_ROLES.PLAYER,
      }),
      giverActor = await Actor.create({
        name: "Potion giver hero",
        type: "character",
        ownership: { [ownerA.id]: 3 },
        system: { health: { value: 5, baseMax: 20 } },
        items: [
          {
            name: lesser.name,
            type: "equipment",
            system: {
              catalogId: lesser.id,
              quantity: 1,
              bulk: lesser.bulk,
              hands: 0,
              inventoryDie: 4,
            },
            flags: { [ID]: { source: lesser.source } },
          },
          {
            name: "Held sword",
            type: "equipment",
            system: { quantity: 1, bulk: 1, hands: 1, held: true },
          },
          {
            name: "Use a Healing Potion",
            type: "ability",
            flags: {
              [ID]: {
                catalogId: "ability-use-a-healing-potion",
                source: action.source,
              },
            },
          },
        ],
      }),
      recipientActor = await Actor.create({
        name: "Potion recipient hero",
        type: "character",
        ownership: { [ownerB.id]: 3 },
        system: { health: { value: 5, baseMax: 20 } },
        items: [
          {
            name: brooch.name,
            type: "equipment",
            system: {
              catalogId: brooch.id,
              quantity: 1,
              bulk: brooch.bulk,
              hands: 0,
              worn: true,
            },
            flags: { [ID]: { source: brooch.source } },
          },
        ],
      }),
      scene = await Scene.create({
        name: `Potion fixture ${foundry.utils.randomID(4)}`,
        grid: { type: 1, size: 100, distance: 1, units: "sq" },
        tokenVision: false,
        navigation: false,
      }),
      tokens = await scene.createEmbeddedDocuments("Token", [
        {
          name: giverActor.name,
          actorId: giverActor.id,
          x: 100,
          y: 100,
          width: 1,
          height: 1,
        },
        {
          name: recipientActor.name,
          actorId: recipientActor.id,
          x: 200,
          y: 100,
          width: 1,
          height: 1,
        },
      ]);
    await scene.activate();
    const combat = await Combat.create({ scene: scene.id, active: true });
    await combat.createEmbeddedDocuments(
        "Combatant",
        tokens.map((token, index) => ({
          tokenId: token.id,
          sceneId: scene.id,
          actorId: token.actorId,
          name: token.name,
          flags: {
            [ID]: { side: index ? "opposition" : "players" },
          },
        })),
      );
    const giverCombatant = combat.combatants.find(
        (combatant) => combatant.tokenId === tokens[0].id,
      ),
      recipientCombatant = combat.combatants.find(
        (combatant) => combatant.tokenId === tokens[1].id,
      );
    return {
      ownerAId: ownerA.id,
      ownerAName: ownerA.name,
      ownerBId: ownerB.id,
      ownerBName: ownerB.name,
      giverActorId: giverActor.id,
      recipientActorId: recipientActor.id,
      abilityId: giverActor.items.find(
        (item) => item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion",
      ).id,
      bottleId: giverActor.items.find(
        (item) => item.system.catalogId === lesser.id,
      ).id,
      sceneId: scene.id,
      combat: combat.id,
      giverParticipantId: giverCombatant.id,
      recipientParticipantId: recipientCombatant.id,
    };
  });
  fixtures.users.push(first.ownerAId, first.ownerBId);
  fixtures.actors.push(first.giverActorId, first.recipientActorId);
  fixtures.scenes.push(first.sceneId);
  fixtures.combats.push(first.combat);
  giver = await join(first.ownerAName);
  recipient = await join(first.ownerBName);

  let message = await gm.page.evaluate(async (combatId) => {
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    return (await requestCombat(game.combats.get(combatId), "start")).id;
  }, first.combat);
  await gm.page.evaluate(async (id) => {
    const { resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    await resolveCombatRequest(id);
  }, message);
  let state = await gm.page.evaluate(
    (id) => game.combats.get(id).getFlag("heroes-of-legend", "encounter"),
    first.combat,
  );
  if (state.nextSide === "opposition") {
    await combatRequest("choose", { id: first.recipientParticipantId });
    await combatRequest("finish");
  }
  await combatRequest("choose", { id: first.giverParticipantId });
  await giver.page.evaluate(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).sheet.render({ force: true }),
    { actorId: first.giverActorId, itemId: first.abilityId },
  );
  await giver.page
    .locator(".hol-ability")
    .getByRole("button", { name: "Prepare Use a Healing Potion" })
    .click();
  const preparation = giver.page.locator(".hol-potion-preparation");
  await preparation.waitFor();
  await preparation
    .locator("[name=recipientParticipantId]")
    .selectOption(first.recipientParticipantId);
  await preparation.locator("[data-action=submit]").click();
  await recipient.page.locator(".hol-potion-consent").last().waitFor();
  await recipient.page.locator(".hol-potion-consent").last().click();
  await waitPotion({ combatId: first.combat });
  const other = await gm.page.evaluate(
    ({ combatId, giverActorId, recipientActorId }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        giverActor = game.actors.get(giverActorId),
        recipientActor = game.actors.get(recipientActorId);
      return {
        operation,
        giverActorUuid: giverActor.uuid,
        recipientActorUuid: recipientActor.uuid,
        bottleItemUuid: giverActor.items.get(
          operation.source.bottleItem.itemId,
        ).uuid,
        giverHp: giverActor.system.health.value,
        recipientHp: recipientActor.system.health.value,
        recipientSurvival: recipientActor.getFlag(
          "heroes-of-legend",
          "survival",
        ),
        giverManeuver:
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.giver.participantId
          ].remaining.maneuver,
        recipientReaction:
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.recipient.participantId
          ].remaining.reaction,
        supplier: giverActor.items.get(operation.source.bottleItem.itemId)
          .system.inventoryDie,
        supplyReceipt: giverActor.getFlag(
          "heroes-of-legend",
          "potionReceipts",
        )?.[operation.requestId]?.supply,
      };
    },
    first,
  );
  assert.equal(other.recipientHp, 10);
  assert.equal(other.recipientSurvival.hp, 10);
  assert.equal(other.giverManeuver, 0);
  assert.equal(other.recipientReaction, 0);
  assert([0, 4].includes(other.supplier));
  assert.equal(other.supplyReceipt.result.before, 4);
  assert.equal(other.supplyReceipt.nativeRoll.evaluated, true);
  assert.equal(other.operation.giver.actorUuid, other.giverActorUuid);
  assert.equal(
    other.operation.source.bottleItem.itemUuid,
    other.bottleItemUuid,
  );
  assert.equal(
    other.operation.recipient.actorUuid,
    other.recipientActorUuid,
  );
  assert.equal(other.operation.geometry.kind, "native");
  assert.equal(other.operation.willingness.kind, "recipient-owner");
  assert.equal(
    other.operation.authorId,
    first.ownerBId,
    "The consenting recipient is the final request author.",
  );
  const replay = await gm.page.evaluate(async ({ combatId }) => {
    const { resolvePotionRequest } = await import(
      "/systems/heroes-of-legend/services/potions.mjs"
    );
    const combat = game.combats.get(combatId),
      operation = Object.values(
        combat.getFlag("heroes-of-legend", "potionOperations"),
      )[0];
    return resolvePotionRequest(operation.requestId, combat.uuid);
  }, first);
  assert.equal(replay.replay, true);

  await gm.page.evaluate(() => {
    if (globalThis.__holPotionRollPatch) return;
    const native = foundry.dice.Roll.prototype.evaluate;
    foundry.dice.Roll.prototype.evaluate = function (...args) {
      if (
        globalThis.__holPotionFailNextSupply &&
        String(this.formula).replace(/\s+/g, "") === "1d4"
      ) {
        globalThis.__holPotionFailNextSupply = false;
        throw new Error("Injected unknown potion supply dice");
      }
      return native.apply(this, args);
    };
    globalThis.__holPotionRollPatch = true;
  });

  const recovered = await stageScenario({
    name: "Final d4",
    bottleId: "item-lesser-healing-bottle",
    giverHp: 1,
  });
  fixtures.actors.push(recovered.giverActorId);
  fixtures.combats.push(recovered.combatId);
  await gm.page.evaluate(() => {
    globalThis.__holPotionFailNextSupply = true;
  });
  const recoveredRequest = await useScenario(recovered);
  fixtures.messages.push(recoveredRequest);
  await waitSupplyRolling(recovered, 7);
  const healedBeforeRecovery = await gm.page.evaluate(
    (id) => game.actors.get(id).system.health.value,
    recovered.giverActorId,
  );
  assert.equal(healedBeforeRecovery, 7);
  await Promise.all([
    gm.page.waitForTimeout(500),
    giver.page.waitForTimeout(500),
  ]);
  await gm.page.evaluate(
    async ({ id, combatId }) => {
      await game.messages.get(id)?.delete();
      const { resolvePotionRequest } = await import(
        "/systems/heroes-of-legend/services/potions.mjs"
      );
      try {
        await resolvePotionRequest(id, `Combat.${combatId}`);
      } catch (error) {
        if (!/may have rolled/.test(error.message)) throw error;
      }
      const { recoverPotionSupplyOperation } = await import(
        "/systems/heroes-of-legend/services/potions.mjs"
      );
      await recoverPotionSupplyOperation(
        id,
        1,
        "Fixture recovered the observed final d4 face",
      );
    },
    { id: recoveredRequest, combatId: recovered.combatId },
  );
  await waitPotion(recovered);
  const finalUse = await gm.page.evaluate(
    ({ actorId, combatId }) => {
      const actor = game.actors.get(actorId),
        combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0];
      return {
        hp: actor.system.health.value,
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        status: combat.getFlag("heroes-of-legend", "operationReceipts")[
          operation.requestId
        ].status,
        receipt: actor.getFlag("heroes-of-legend", "potionReceipts")?.[
          operation.requestId
        ]?.supply,
      };
    },
    recovered,
  );
  assert.equal(finalUse.hp, 7);
  assert.equal(finalUse.die, 0);
  assert.equal(finalUse.status, "complete");
  assert.equal(finalUse.receipt.result.retained, 1);
  assert.equal(finalUse.receipt.nativeRoll, null);
  assert.equal(
    finalUse.receipt.recovery.reason,
    "Fixture recovered the observed final d4 face",
  );

  const changed = await stageScenario({
    name: "Changed source",
    bottleId: "item-greater-healing-bottle",
    giverHp: 1,
  });
  fixtures.actors.push(changed.giverActorId);
  fixtures.combats.push(changed.combatId);
  await gm.page.evaluate(() => {
    globalThis.__holPotionFailNextSupply = true;
  });
  const changedRequest = await useScenario(changed);
  fixtures.messages.push(changedRequest);
  await waitSupplyRolling(changed, 11);
  await gm.page.evaluate(
    async ({ actorId, bottleId, id }) => {
      const item = game.actors.get(actorId).items.get(bottleId);
      await item.update({
        "flags.heroes-of-legend.source.sha256": "0".repeat(64),
      });
      const { recoverPotionSupplyOperation } = await import(
        "/systems/heroes-of-legend/services/potions.mjs"
      );
      try {
        await recoverPotionSupplyOperation(
          id,
          2,
          "Fixture recovered a changed-source supply roll",
        );
      } catch (error) {
        if (!/reconcile/i.test(error.message)) throw error;
      }
    },
    {
      actorId: changed.giverActorId,
      bottleId: changed.bottleId,
      id: changedRequest,
    },
  );
  await gm.page.evaluate(async (id) => {
    const { reconcilePotionOperation } = await import(
      "/systems/heroes-of-legend/services/potions.mjs"
    );
    await reconcilePotionOperation(
      id,
      "waive-supply",
      "Fixture closes the changed bottle without charging a replacement",
    );
  }, changedRequest);
  await waitPotion(changed);
  const reconciled = await gm.page.evaluate(
    ({ actorId, combatId }) => {
      const actor = game.actors.get(actorId),
        combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0];
      return {
        hp: actor.system.health.value,
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        status: combat.getFlag("heroes-of-legend", "operationReceipts")[
          operation.requestId
        ].status,
        disposition: operation.reconciliation.disposition,
      };
    },
    changed,
  );
  assert.equal(reconciled.hp, 11);
  assert.equal(reconciled.die, 4);
  assert.equal(reconciled.status, "reconciled-without-supply");
  assert.equal(reconciled.disposition.choice, "waive-supply");

  const zero = await stageScenario({
    name: "Zero HP",
    bottleId: "item-superior-healing-bottle",
    giverHp: 2,
    recipient: { hp: 0, maxHp: 20 },
  });
  fixtures.actors.push(zero.giverActorId, zero.recipientActorId);
  fixtures.combats.push(zero.combatId);
  await useScenario(zero);
  await waitPotion(zero);
  const zeroResult = await gm.page.evaluate(
    ({ recipientActorId, combatId }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        actor = game.actors.get(recipientActorId);
      return {
        hp: actor.system.health.value,
        survival: actor.getFlag("heroes-of-legend", "survival"),
        reaction:
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.recipient.participantId
          ].remaining.reaction,
      };
    },
    zero,
  );
  assert.equal(zeroResult.hp, 16);
  assert.equal(zeroResult.survival.status, "active");
  assert.equal(zeroResult.survival.marks, 0);
  assert.equal(zeroResult.reaction, 1);

  const interrupted = await stageScenario({
    name: "Interrupted",
    bottleId: "item-lesser-healing-bottle",
    giverHp: 3,
  });
  fixtures.actors.push(interrupted.giverActorId);
  fixtures.combats.push(interrupted.combatId);
  await useScenario(interrupted, { continuesAfterInterruption: false });
  await waitPotion(interrupted);
  const interruptedResult = await gm.page.evaluate(
    ({ actorId, combatId }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        actor = game.actors.get(actorId);
      return {
        hp: actor.system.health.value,
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        maneuver:
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.giver.participantId
          ].remaining.maneuver,
        status: combat.getFlag("heroes-of-legend", "operationReceipts")[
          operation.requestId
        ].status,
      };
    },
    interrupted,
  );
  assert.equal(interruptedResult.hp, 3);
  assert.equal(interruptedResult.die, 4);
  assert.equal(interruptedResult.maneuver, 0);
  assert.equal(interruptedResult.status, "interrupted");
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native two-owner consent, exact identities, Life resistance, 0 HP without Reaction, all durable receipts, dropped response, final d4 recovery, source reconciliation and interruption before healing.",
  );
} catch (error) {
  failure = error;
  if (gm?.page)
    console.error(
      await gm.page
        .evaluate(() => ({
          notifications: document.querySelector("#notifications")?.innerText,
          messages: game.messages.contents
            .slice(-8)
            .map((message) => message.content),
        }))
        .catch(() => null),
    );
} finally {
  await giver?.context.close().catch(() => {});
  await recipient?.context.close().catch(() => {});
  if (gm) {
    let released = false;
    try {
      await gm.page.evaluate(async () => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
      });
      released = true;
    } catch (error) {
      cleanupError = new Error(
        `Coordinator release failed; fixture documents were left for recovery: ${error.message}`,
      );
      console.error(cleanupError.message);
    }
    if (released)
      await gm.page
        .evaluate(async (fixtures) => {
          const combatUuids = new Set(
            fixtures.combats.map((id) => `Combat.${id}`),
          );
          for (const message of game.messages.contents) {
            const request =
                message.getFlag("heroes-of-legend", "potionRequest") ??
                message.getFlag("heroes-of-legend", "potionProposal") ??
                message.getFlag("heroes-of-legend", "combatRequest"),
              scoped =
                request?.combatUuid && combatUuids.has(request.combatUuid);
            if (scoped) await message.delete().catch(() => {});
          }
          for (const id of fixtures.combats)
            await game.combats.get(id)?.delete();
          for (const id of fixtures.scenes)
            await game.scenes.get(id)?.delete();
          for (const id of fixtures.actors)
            await game.actors.get(id)?.delete();
          for (const id of fixtures.users) await game.users.get(id)?.delete();
        }, fixtures)
        .catch((error) => {
          cleanupError = new Error(`Fixture cleanup failed: ${error.message}`);
          console.error(cleanupError.message);
        });
  }
  await browser.close();
}
if (failure) throw failure;
if (cleanupError) throw cleanupError;
