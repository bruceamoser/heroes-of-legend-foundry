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
  pageErrors = [];
let gm, owner, observer, secondGm, fixture;

async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    pageErrors.push(error.stack ?? error.message),
  );
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}

async function bind(page) {
  return page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
}

async function release(page) {
  return page.evaluate(async () => {
    const { releaseAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await releaseAuthority();
  });
}

async function stageRequest(page, actorId, itemId, reason) {
  return page.evaluate(
    async ({ actorId, itemId, reason }) => {
      const ID = "heroes-of-legend";
      const { inventoryBasis } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      const actor = game.actors.get(actorId),
        item = actor.items.get(itemId),
        basis = inventoryBasis(actor, item);
      return (
        await ChatMessage.create({
          content: `Staged supply check for ${item.name}.`,
          whisper: game.users
            .filter(
              (user) =>
                user.isGM ||
                user.id === game.user.id ||
                actor.testUserPermission(user, "OWNER"),
            )
            .map((user) => user.id),
          flags: {
            [ID]: {
              inventoryRequest: {
                actorUuid: actor.uuid,
                basis,
                reason,
              },
            },
          },
        })
      ).id;
    },
    { actorId, itemId, reason },
  );
}

async function resolve(gmPage, id, actorUuid = null) {
  return gmPage.evaluate(
    async ({ id, actorUuid }) => {
      const { resolveInventoryRequest } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      return resolveInventoryRequest(id, actorUuid);
    },
    { id, actorUuid },
  );
}

async function inventoryState(page, actorId) {
  return page.evaluate((actorId) => {
    const actor = game.actors.get(actorId);
    return {
      revision: actor.getFlag("heroes-of-legend", "inventoryRevision") ?? 0,
      pending: actor.getFlag("heroes-of-legend", "pendingInventory"),
      hp: actor.system.health.value,
      items: Object.fromEntries(
        actor.items.map((item) => [
          item.id,
          {
            die: item.system.inventoryDie,
            quantity: item.system.quantity,
            source: item.getFlag("heroes-of-legend", "source"),
          },
        ]),
      ),
    };
  }, actorId);
}

try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const ID = "heroes-of-legend";
    const owner = await User.create({
      name: `Supply owner ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const observer = await User.create({
      name: `Supply observer ${foundry.utils.randomID(5)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const secondGm = await User.create({
      name: `Supply second GM ${foundry.utils.randomID(5)}`,
      // Assistant has native GM privileges while Gamemaster remains designated.
      role: CONST.USER_ROLES.ASSISTANT,
    });
    const actor = await Actor.create({
      name: "Inventory check fixture",
      type: "character",
      ownership: { [owner.id]: 3, [observer.id]: 2 },
      system: { health: { value: 9, baseMax: 12 } },
      items: [
        {
          name: "Field tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-field-tonic",
            quantity: 7,
            bulk: 1,
            hands: 0,
            inventoryDie: 20,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-field-tonic",
                path: "fixtures/field-tonic.md",
                sha256: "a".repeat(64),
              },
            },
          },
        },
        {
          name: "Race tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-race-tonic",
            quantity: 5,
            bulk: 1,
            hands: 0,
            inventoryDie: 6,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-race-tonic",
                path: "fixtures/race-tonic.md",
                sha256: "c".repeat(64),
              },
            },
          },
        },
        {
          name: "Known-result tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-known-tonic",
            quantity: 4,
            bulk: 1,
            hands: 0,
            inventoryDie: 8,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-known-tonic",
                path: "fixtures/known-tonic.md",
                sha256: "d".repeat(64),
              },
            },
          },
        },
        {
          name: "Drift tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-drift-tonic",
            quantity: 1,
            bulk: 1,
            hands: 0,
            inventoryDie: 10,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-drift-tonic",
                path: "fixtures/drift-tonic.md",
                sha256: "e".repeat(64),
              },
            },
          },
        },
        {
          name: "Unrelated rope",
          type: "equipment",
          system: { quantity: 3, bulk: 1, hands: 0, inventoryDie: 0 },
        },
        {
          name: "Unknown-result flask",
          type: "equipment",
          system: {
            catalogId: "fixture-unknown-flask",
            quantity: 2,
            bulk: 1,
            hands: 0,
            inventoryDie: 6,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-unknown-flask",
                path: "fixtures/unknown-flask.md",
                sha256: "b".repeat(64),
              },
            },
          },
        },
        {
          name: "Stale-result tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-stale-result-tonic",
            quantity: 3,
            bulk: 1,
            hands: 0,
            inventoryDie: 6,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-stale-result-tonic",
                path: "fixtures/stale-result-tonic.md",
                sha256: "f".repeat(64),
              },
            },
          },
        },
        {
          name: "Open-panel tonic",
          type: "equipment",
          system: {
            catalogId: "fixture-open-panel-tonic",
            quantity: 2,
            bulk: 1,
            hands: 0,
            inventoryDie: 6,
          },
          flags: {
            [ID]: {
              source: {
                id: "fixture-open-panel-tonic",
                path: "fixtures/open-panel-tonic.md",
                sha256: "1".repeat(64),
              },
            },
          },
        },
        {
          name: "Empty supply",
          type: "equipment",
          system: { quantity: 1, bulk: 1, hands: 0, inventoryDie: 0 },
        },
        {
          name: "Clearing tonic out",
          type: "equipment",
          system: {
            catalogId: "item-clearing-tonic",
            quantity: 1,
            bulk: 1,
            hands: 0,
            inventoryDie: 0,
          },
        },
        {
          name: "Ordinary sword",
          type: "equipment",
          system: {
            catalogId: "item-ordinary-melee-weapon",
            quantity: 1,
            bulk: 1,
            hands: 1,
            inventoryDie: 0,
          },
        },
      ],
    });
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const byCatalog = (catalogId) =>
      actor.items.find((item) => item.system.catalogId === catalogId).id;
    return {
      actorId: actor.id,
      gmId: game.user.id,
      ownerId: owner.id,
      ownerName: owner.name,
      observerId: observer.id,
      observerName: observer.name,
      secondGmId: secondGm.id,
      secondGmName: secondGm.name,
      fieldId: byCatalog("fixture-field-tonic"),
      raceId: byCatalog("fixture-race-tonic"),
      knownId: byCatalog("fixture-known-tonic"),
      driftId: byCatalog("fixture-drift-tonic"),
      unknownId: byCatalog("fixture-unknown-flask"),
      staleResultId: byCatalog("fixture-stale-result-tonic"),
      panelId: byCatalog("fixture-open-panel-tonic"),
      emptyId: actor.items.find((item) => item.name === "Empty supply").id,
      outId: actor.items.find((item) => item.name === "Clearing tonic out").id,
      swordId: actor.items.find((item) => item.name === "Ordinary sword").id,
      ropeId: actor.items.find((item) => item.name === "Unrelated rope").id,
    };
  });
  owner = await join(fixture.ownerName);
  observer = await join(fixture.observerName);
  secondGm = await join(fixture.secondGmName);

  for (const [itemId, expectedOut] of [
    [fixture.swordId, false],
    [fixture.outId, true],
  ]) {
    await owner.page.evaluate(
      ({ actorId, itemId }) => {
        void game.actors
          .get(actorId)
          .items.get(itemId)
          .sheet.render({ force: true });
      },
      { actorId: fixture.actorId, itemId },
    );
    const sheet = owner.page.locator(".hol-equipment").filter({
      hasText:
        itemId === fixture.swordId ? "Ordinary sword" : "Clearing tonic out",
    });
    await sheet.waitFor();
    assert.equal(
      (await sheet.textContent()).includes("supply is out"),
      expectedOut,
    );
    if (itemId === fixture.swordId)
      assert.equal(await sheet.locator("[data-action=supply]").count(), 0);
  }

  await owner.page.evaluate(
    ({ actorId, itemId }) => {
      const item = game.actors.get(actorId).items.get(itemId);
      item.sheet.render({ force: true });
    },
    { actorId: fixture.actorId, itemId: fixture.fieldId },
  );
  await owner.page
    .locator(".hol-equipment")
    .filter({ hasText: "Field tonic" })
    .locator("[data-action=supply]")
    .click();
  const panel = owner.page.locator(".hol-inventory");
  await panel.waitFor();
  await panel.screenshot({ path: "test-results/inventory-supply-dialog.png" });
  assert.match(await panel.textContent(), /Supply d20/);
  assert.match(await panel.textContent(), /changes only supply/);
  assert.match(await panel.textContent(), /quantity/i);
  assert.equal(await panel.locator("[name=reason]").inputValue(), "");
  await panel.locator("[data-action=check]").click();

  const settled = await owner.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    for (let attempt = 0; attempt < 100; attempt++) {
      const request = game.messages.find((message) => {
        const request = message.getFlag("heroes-of-legend", "inventoryRequest"),
          receipt = actor.getFlag("heroes-of-legend", "operationReceipts")?.[
            message.id
          ];
        return (
          request?.actorUuid === actor.uuid &&
          request.reason === "" &&
          receipt?.kind === "inventory" &&
          receipt.applied === true
        );
      });
      if (request) return request.id;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const pending = actor.getFlag("heroes-of-legend", "pendingInventory"),
      requests = game.messages
        .filter(
          (message) =>
            message.getFlag("heroes-of-legend", "inventoryRequest")
              ?.actorUuid === actor.uuid,
        )
        .map((message) => ({
          id: message.id,
          content: message.content,
          receipt:
            actor.getFlag("heroes-of-legend", "operationReceipts")?.[
              message.id
            ] ?? null,
        }));
    throw new Error(
      `Owner inventory request did not settle. Pending phase: ${pending?.phase ?? "none"}. Request chat: ${JSON.stringify(requests)}`,
    );
  }, fixture.actorId);
  let check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.hp, 9);
  assert.equal(check.items[fixture.fieldId].quantity, 7);
  assert.equal(check.items[fixture.ropeId].quantity, 3);
  assert.equal(check.revision, 1);
  assert.equal(check.pending, null);
  const firstPresentation = await gm.page.evaluate(
    ({ id, ownerId }) => {
      const message = game.messages.get(id);
      return {
        author: message.author.id,
        whisper: message.whisper,
        rolls: message.rolls.length,
        result: message.getFlag("heroes-of-legend", "inventoryResult"),
        nativeEvaluation: message.getFlag("heroes-of-legend", "inventoryResult")
          ?.nativeRoll?.evaluated,
        nativeFormula: message.getFlag("heroes-of-legend", "inventoryResult")
          ?.nativeRoll?.formula,
      };
    },
    { id: settled, ownerId: fixture.ownerId },
  );
  assert.equal(firstPresentation.author, fixture.ownerId);
  assert(firstPresentation.whisper.includes(fixture.gmId));
  assert(firstPresentation.whisper.includes(fixture.ownerId));
  assert(!firstPresentation.whisper.includes(fixture.observerId));
  assert.equal(firstPresentation.rolls, 1);
  assert.equal(firstPresentation.nativeEvaluation, true);
  assert.equal(firstPresentation.nativeFormula, "1d20");
  assert.equal(
    firstPresentation.result.result.retained,
    firstPresentation.result.retainedFace,
  );
  assert.equal(
    (await resolve(gm.page, settled, `Actor.${fixture.actorId}`)).replay,
    true,
  );
  assert.equal((await inventoryState(gm.page, fixture.actorId)).revision, 1);

  // An unapplied equipment request is history, not a durable supply conflict.
  const rejectedEquipment = await owner.page.evaluate(async (actorId) => {
    const actor = game.actors.get(actorId);
    const { equipmentBasis, requestEquipment } = await import(
      "/systems/heroes-of-legend/services/equipment.mjs"
    );
    return (
      await requestEquipment(
        actor,
        equipmentBasis(actor),
        [],
        actor.getFlag("heroes-of-legend", "handCapacity") ?? 2,
        "Deliberately incomplete equipment fixture",
      )
    ).id;
  }, fixture.actorId);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Equipment needs attention"),
    rejectedEquipment,
  );
  const afterEquipmentHistory = await stageRequest(
    owner.page,
    fixture.actorId,
    fixture.fieldId,
    "Supply check after an unapplied equipment request",
  );
  await gm.page.waitForFunction(
    ({ actorId, id }) =>
      game.actors
        .get(actorId)
        .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.applied,
    { actorId: fixture.actorId, id: afterEquipmentHistory },
  );
  assert.equal((await inventoryState(gm.page, fixture.actorId)).revision, 2);

  // A forged request still uses its native author, so Observer permission is denied.
  const observerRequest = await observer.page.evaluate(
    async ({ actorId, itemId }) => {
      const ID = "heroes-of-legend";
      const { inventoryBasis } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      const actor = game.actors.get(actorId);
      return (
        await ChatMessage.create({
          content: "Observer supply request.",
          flags: {
            [ID]: {
              inventoryRequest: {
                actorUuid: actor.uuid,
                basis: inventoryBasis(actor, actor.items.get(itemId)),
                reason: "Forged observer request",
              },
            },
          },
        })
      ).id;
    },
    { actorId: fixture.actorId, itemId: fixture.fieldId },
  );
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Only an owner or the DA"),
    observerRequest,
  );

  // Stage two requests from the same basis while no GM is processing them.
  await release(gm.page);
  const forgedDie = await owner.page.evaluate(
    async ({ actorId, itemId }) => {
      const ID = "heroes-of-legend";
      const { inventoryBasis } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      const actor = game.actors.get(actorId),
        basis = inventoryBasis(actor, actor.items.get(itemId));
      basis.item.inventoryDie = 7;
      return (
        await ChatMessage.create({
          content: "Forged unsupported supply die.",
          flags: {
            [ID]: {
              inventoryRequest: {
                actorUuid: actor.uuid,
                basis,
                reason: "Forged unsupported die fixture",
              },
            },
          },
        })
      ).id;
    },
    { actorId: fixture.actorId, itemId: fixture.fieldId },
  );
  const race = await Promise.all([
    stageRequest(owner.page, fixture.actorId, fixture.raceId, "Race request A"),
    stageRequest(owner.page, fixture.actorId, fixture.raceId, "Race request B"),
  ]);
  await bind(gm.page);
  const forgedDieResult = await gm.page.evaluate(async (id) => {
    const evaluate = foundry.dice.Roll.prototype.evaluate;
    let evaluations = 0;
    foundry.dice.Roll.prototype.evaluate = function (...args) {
      evaluations++;
      return evaluate.apply(this, args);
    };
    const { resolveInventoryRequest } = await import(
      "/systems/heroes-of-legend/services/inventory.mjs"
    );
    let error;
    try {
      await resolveInventoryRequest(id);
    } catch (caught) {
      error = caught.message;
    } finally {
      foundry.dice.Roll.prototype.evaluate = evaluate;
    }
    return { error, evaluations };
  }, forgedDie);
  assert.match(forgedDieResult.error, /Supply die/);
  assert.equal(forgedDieResult.evaluations, 0);
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.revision, 2);
  const raceResults = await gm.page.evaluate(async (ids) => {
    const { resolveInventoryRequest } = await import(
      "/systems/heroes-of-legend/services/inventory.mjs"
    );
    return Promise.all(
      ids.map(async (id) => {
        try {
          return { id, ...(await resolveInventoryRequest(id)) };
        } catch (error) {
          return { id, error: error.message };
        }
      }),
    );
  }, race);
  assert.equal(
    raceResults.filter((result) => result.status === "complete").length,
    1,
  );
  assert.match(
    raceResults.find((result) => result.error).error,
    /changed|already out/,
  );
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.revision, 3);
  assert.equal(check.items[fixture.raceId].quantity, 5);
  assert.equal(check.items[fixture.ropeId].quantity, 3);
  assert.equal(check.pending, null);

  // A pre-write settlement failure leaves a known result that resumes without dice.
  await release(gm.page);
  const knownRequest = await stageRequest(
    owner.page,
    fixture.actorId,
    fixture.knownId,
    "Known-result settlement fixture",
  );
  await bind(gm.page);
  const knownFailure = await gm.page.evaluate(
    async ({ actorId, id }) => {
      const actor = game.actors.get(actorId),
        original = actor.validate,
        { resolveInventoryRequest } = await import(
          "/systems/heroes-of-legend/services/inventory.mjs"
        );
      let failed = false;
      actor.validate = function (...args) {
        const pending = actor.getFlag("heroes-of-legend", "pendingInventory");
        if (
          !failed &&
          pending?.requestId === id &&
          pending.phase === "result" &&
          args[0]?.changes?.items
        ) {
          failed = true;
          throw new Error("Injected known pre-write settlement failure");
        }
        return original.apply(this, args);
      };
      let failure;
      try {
        await resolveInventoryRequest(id);
      } catch (error) {
        failure = error.message;
      } finally {
        actor.validate = original;
      }
      const pending = actor.getFlag("heroes-of-legend", "pendingInventory");
      if (pending?.requestId !== id || pending.phase !== "result")
        throw new Error(
          `Known result was not persisted before settlement: ${failure}`,
        );
      return pending;
    },
    { actorId: fixture.actorId, id: knownRequest },
  );
  assert.equal(knownFailure.phase, "result");
  assert.ok(knownFailure.nativeRoll);
  await secondGm.page.evaluate(
    ({ actorId, nativeRoll }) => {
      const actor = game.actors.get(actorId),
        corrupted = structuredClone(nativeRoll);
      corrupted.total += 1;
      corrupted.terms[0].results[0].result = corrupted.total;
      return actor.update({
        "flags.heroes-of-legend.pendingInventory.nativeRoll": corrupted,
      });
    },
    { actorId: fixture.actorId, nativeRoll: knownFailure.nativeRoll },
  );
  const mismatchedResume = await secondGm.page.evaluate(async (actorId) => {
    const { requestInventoryResume } = await import(
      "/systems/heroes-of-legend/services/inventory.mjs"
    );
    return (await requestInventoryResume(game.actors.get(actorId))).id;
  }, fixture.actorId);
  await gm.page.waitForFunction(
    (id) =>
      game.messages.get(id).content.includes("does not match its recorded die"),
    mismatchedResume,
  );
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending.phase, "result");
  assert.equal(check.revision, 3);

  await gm.page.evaluate(
    ({ actorId, nativeRoll }) => {
      const actor = game.actors.get(actorId);
      return actor.update({
        "flags.heroes-of-legend.pendingInventory.nativeRoll": nativeRoll,
      });
    },
    { actorId: fixture.actorId, nativeRoll: knownFailure.nativeRoll },
  );
  await secondGm.page.evaluate(
    async ({ actorId, itemId }) => {
      const { InventoryPanel } = await import(
        "/systems/heroes-of-legend/applications/inventory.mjs"
      );
      await new InventoryPanel(game.actors.get(actorId), itemId).render({
        force: true,
      });
    },
    { actorId: fixture.actorId, itemId: fixture.knownId },
  );
  await secondGm.page.locator(".hol-inventory [data-action=resume]").click();
  await gm.page.waitForFunction(
    ({ actorId, secondGmId, originalId }) => {
      const actor = game.actors.get(actorId);
      return Object.entries(
        actor.getFlag("heroes-of-legend", "operationReceipts") ?? {},
      ).some(
        ([id, receipt]) =>
          id !== originalId &&
          receipt.applied &&
          receipt.kind === "inventory" &&
          game.messages.get(id)?.author.id === secondGmId,
      );
    },
    {
      actorId: fixture.actorId,
      secondGmId: fixture.secondGmId,
      originalId: knownRequest,
    },
  );
  const secondGmReceipt = await gm.page.evaluate(
    ({ actorId, secondGmId, originalId }) => {
      const actor = game.actors.get(actorId);
      return Object.entries(
        actor.getFlag("heroes-of-legend", "operationReceipts") ?? {},
      ).find(
        ([id, receipt]) =>
          id !== originalId &&
          receipt.applied &&
          receipt.kind === "inventory" &&
          game.messages.get(id)?.author.id === secondGmId,
      );
    },
    {
      actorId: fixture.actorId,
      secondGmId: fixture.secondGmId,
      originalId: knownRequest,
    },
  );
  assert(secondGmReceipt);
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.revision, 4);
  assert.equal(
    await gm.page.evaluate(
      () => game.settings.get("heroes-of-legend", "authorityWork").targetUuid,
    ),
    `Actor.${fixture.actorId}`,
  );

  // A panel opened at d6 must not silently submit a later d4 basis.
  await owner.page.evaluate(
    ({ actorId, itemId }) => {
      void game.actors
        .get(actorId)
        .items.get(itemId)
        .sheet.render({ force: true });
    },
    { actorId: fixture.actorId, itemId: fixture.panelId },
  );
  await owner.page
    .locator(".hol-equipment")
    .filter({ hasText: "Open-panel tonic" })
    .locator("[data-action=supply]")
    .click();
  const openPanel = owner.page.locator(".hol-inventory");
  await openPanel.waitFor();
  assert.match(await openPanel.textContent(), /Supply d6/);
  await owner.page.evaluate(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).update({
        "system.inventoryDie": 4,
      }),
    { actorId: fixture.actorId, itemId: fixture.panelId },
  );
  await owner.page.evaluate(() => {
    globalThis.__holInventoryErrors = [];
    globalThis.__holInventoryRestoreError = ui.notifications.error;
    ui.notifications.error = (message) => {
      globalThis.__holInventoryErrors.push(message);
    };
  });
  await openPanel
    .locator("[name=reason]")
    .fill("Panel basis changed after it opened");
  await openPanel.locator("[data-action=check]").click();
  await owner.page.waitForFunction(
    () => globalThis.__holInventoryErrors.length > 0,
  );
  const stalePanel = await owner.page.evaluate(() => {
    const errors = globalThis.__holInventoryErrors;
    ui.notifications.error = globalThis.__holInventoryRestoreError;
    delete globalThis.__holInventoryRestoreError;
    return {
      errors,
      submitted: game.messages.some(
        (message) =>
          message.getFlag("heroes-of-legend", "inventoryRequest")?.reason ===
          "Panel basis changed after it opened",
      ),
    };
  });
  assert.match(stalePanel.errors[0], /changed/);
  assert.equal(stalePanel.submitted, false);
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.items[fixture.panelId].die, 4);
  assert.equal(check.revision, 4);

  // Direct source and quantity edits between request and processing reject a stale basis.
  for (const field of ["source", "quantity"]) {
    await release(gm.page);
    const staleRequest = await stageRequest(
      owner.page,
      fixture.actorId,
      fixture.driftId,
      `Stale ${field} fixture`,
    );
    await gm.page.evaluate(
      ({ actorId, itemId, field }) => {
        const item = game.actors.get(actorId).items.get(itemId);
        return item.update(
          field === "source"
            ? {
                "flags.heroes-of-legend.source.path":
                  "fixtures/directly-edited.md",
              }
            : { "system.quantity": item.system.quantity + 1 },
        );
      },
      { actorId: fixture.actorId, itemId: fixture.driftId, field },
    );
    await bind(gm.page);
    const stale = await gm.page.evaluate(
      async ({ id, actorId }) => {
        const { resolveInventoryRequest } = await import(
          "/systems/heroes-of-legend/services/inventory.mjs"
        );
        try {
          await resolveInventoryRequest(id, `Actor.${actorId}`);
        } catch (error) {
          return error.message;
        }
      },
      { id: staleRequest, actorId: fixture.actorId },
    );
    assert.match(stale, /changed/);
  }
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.items[fixture.driftId].quantity, 2);

  // A stale saved result can be closed explicitly, audited and retried later.
  await release(gm.page);
  const staleResultRequest = await stageRequest(
    owner.page,
    fixture.actorId,
    fixture.staleResultId,
    "Stale saved-result fixture",
  );
  await bind(gm.page);
  const staleSaved = await gm.page.evaluate(
    async ({ actorId, id }) => {
      const actor = game.actors.get(actorId),
        original = actor.validate,
        { resolveInventoryRequest } = await import(
          "/systems/heroes-of-legend/services/inventory.mjs"
        );
      let failed = false;
      actor.validate = function (...args) {
        const pending = actor.getFlag("heroes-of-legend", "pendingInventory");
        if (
          !failed &&
          pending?.requestId === id &&
          pending.phase === "result" &&
          args[0]?.changes?.items
        ) {
          failed = true;
          throw new Error("Injected stale saved-result failure");
        }
        return original.apply(this, args);
      };
      try {
        await resolveInventoryRequest(id);
      } catch {
        /* The saved result intentionally remains for DA review. */
      } finally {
        actor.validate = original;
      }
      return actor.getFlag("heroes-of-legend", "pendingInventory");
    },
    { actorId: fixture.actorId, id: staleResultRequest },
  );
  assert.equal(staleSaved.phase, "result");
  await gm.page.evaluate(
    ({ actorId, itemId }) => {
      const item = game.actors.get(actorId).items.get(itemId);
      return item.update({ "system.quantity": item.system.quantity + 1 });
    },
    { actorId: fixture.actorId, itemId: fixture.staleResultId },
  );
  await secondGm.page.evaluate(
    async ({ actorId, itemId }) => {
      const { InventoryPanel } = await import(
        "/systems/heroes-of-legend/applications/inventory.mjs"
      );
      await new InventoryPanel(game.actors.get(actorId), itemId).render({
        force: true,
      });
    },
    { actorId: fixture.actorId, itemId: fixture.staleResultId },
  );
  const abandonPanel = secondGm.page.locator(".hol-inventory");
  await abandonPanel
    .locator("[name=abandonReason]")
    .fill("Item quantity changed after the result was saved");
  await abandonPanel.locator("[data-action=abandon]").click();
  await gm.page.waitForFunction(
    ({ actorId, id }) =>
      game.actors
        .get(actorId)
        .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.status ===
      "abandoned",
    { actorId: fixture.actorId, id: staleResultRequest },
  );
  const abandoned = await gm.page.evaluate(
    ({ actorId, id }) => {
      const actor = game.actors.get(actorId),
        result = actor.getFlag("heroes-of-legend", "inventoryResults")?.[id],
        receipts = Object.entries(
          actor.getFlag("heroes-of-legend", "operationReceipts") ?? {},
        );
      return {
        pending: actor.getFlag("heroes-of-legend", "pendingInventory"),
        revision: actor.getFlag("heroes-of-legend", "inventoryRevision"),
        quantity: actor.items.get(result.target.itemId).system.quantity,
        die: actor.items.get(result.target.itemId).system.inventoryDie,
        result,
        receipt: actor.getFlag("heroes-of-legend", "operationReceipts")?.[id],
        alias: receipts.find(
          ([receiptId, receipt]) =>
            receiptId !== id &&
            receipt.status === "abandoned" &&
            receipt.resultId === id,
        ),
      };
    },
    { actorId: fixture.actorId, id: staleResultRequest },
  );
  assert.equal(abandoned.pending, null);
  assert.equal(abandoned.revision, 5);
  assert.equal(abandoned.quantity, 4);
  assert.equal(abandoned.die, staleSaved.target.inventoryDie);
  assert.equal(abandoned.result.target.quantity, 3);
  assert.ok(abandoned.result.nativeRoll);
  assert.equal(abandoned.result.disposition.status, "abandoned");
  assert.match(abandoned.result.disposition.reason, /quantity changed/);
  assert.equal(abandoned.receipt.status, "abandoned");
  assert(abandoned.alias);
  const abandonedReplay = await gm.page.evaluate(async (id) => {
    const evaluate = foundry.dice.Roll.prototype.evaluate;
    foundry.dice.Roll.prototype.evaluate = () => {
      throw new Error("Abandoned supply result evaluated dice");
    };
    try {
      const { resolveInventoryRequest } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      return await resolveInventoryRequest(id);
    } finally {
      foundry.dice.Roll.prototype.evaluate = evaluate;
    }
  }, staleResultRequest);
  assert.equal(abandonedReplay.replay, true);
  assert.equal((await inventoryState(gm.page, fixture.actorId)).revision, 5);
  const continuedRequest = await stageRequest(
    owner.page,
    fixture.actorId,
    fixture.staleResultId,
    "Supply check after reviewed stale result",
  );
  await gm.page.waitForFunction(
    ({ actorId, id }) =>
      game.actors
        .get(actorId)
        .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.applied,
    { actorId: fixture.actorId, id: continuedRequest },
  );
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.revision, 6);

  const empty = await owner.page.evaluate(
    async ({ actorId, itemId }) => {
      const { requestInventory } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      const actor = game.actors.get(actorId);
      try {
        await requestInventory(
          actor,
          actor.items.get(itemId),
          "Empty supply fixture",
        );
      } catch (error) {
        return error.message;
      }
    },
    { actorId: fixture.actorId, itemId: fixture.emptyId },
  );
  assert.match(empty, /Supply die/);

  // An unresolved result can be recovered once from the durable snapshot after chat deletion.
  await release(gm.page);
  const unknownRequest = await stageRequest(
    owner.page,
    fixture.actorId,
    fixture.unknownId,
    "Unknown native result fixture",
  );
  await bind(gm.page);
  const unknown = await gm.page.evaluate(async (id) => {
    const evaluate = foundry.dice.Roll.prototype.evaluate;
    foundry.dice.Roll.prototype.evaluate = () => {
      throw new Error("Injected unknown native roll");
    };
    try {
      const { resolveInventoryRequest } = await import(
        "/systems/heroes-of-legend/services/inventory.mjs"
      );
      await resolveInventoryRequest(id);
    } catch (error) {
      return error.message;
    } finally {
      foundry.dice.Roll.prototype.evaluate = evaluate;
    }
  }, unknownRequest);
  assert.match(unknown, /Injected unknown native roll/);
  assert.equal(
    await gm.page.evaluate(
      (actorId) =>
        game.actors.get(actorId).getFlag("heroes-of-legend", "pendingInventory")
          .phase,
      fixture.actorId,
    ),
    "reserved",
  );
  const noReroll = await gm.page.evaluate(async (id) => {
    const { resolveInventoryRequest } = await import(
      "/systems/heroes-of-legend/services/inventory.mjs"
    );
    try {
      await resolveInventoryRequest(id);
    } catch (error) {
      return error.message;
    }
  }, unknownRequest);
  assert.match(noReroll, /do not roll again/);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await gm.page.evaluate(
    (id) => game.messages.get(id)?.delete(),
    unknownRequest,
  );

  await secondGm.page.evaluate(
    async ({ actorId, itemId }) => {
      const { InventoryPanel } = await import(
        "/systems/heroes-of-legend/applications/inventory.mjs"
      );
      await new InventoryPanel(game.actors.get(actorId), itemId).render({
        force: true,
      });
    },
    { actorId: fixture.actorId, itemId: fixture.unknownId },
  );
  const recoveryPanel = secondGm.page.locator(".hol-inventory");
  await recoveryPanel.locator("[name=retainedFace]").fill("1");
  await recoveryPanel
    .locator("[name=recoveryReason]")
    .fill("DA recovered the retained face after chat deletion");
  await recoveryPanel.locator("[data-action=recover]").click();
  await gm.page.waitForFunction(
    ({ actorId, requestId }) =>
      game.actors
        .get(actorId)
        .getFlag("heroes-of-legend", "operationReceipts")?.[requestId]?.applied,
    { actorId: fixture.actorId, requestId: unknownRequest },
  );
  check = await inventoryState(gm.page, fixture.actorId);
  assert.equal(check.pending, null);
  assert.equal(check.items[fixture.unknownId].quantity, 2);
  assert.equal(check.revision, 7);
  const recoveredResult = await gm.page.evaluate(
    ({ actorId, requestId }) =>
      game.actors
        .get(actorId)
        .getFlag("heroes-of-legend", "inventoryResults")?.[requestId],
    { actorId: fixture.actorId, requestId: unknownRequest },
  );
  assert.equal(recoveredResult.nativeRoll, null);
  assert.equal(
    recoveredResult.provenance.recovery.authorId,
    fixture.secondGmId,
  );
  assert.match(recoveredResult.provenance.recovery.reason, /chat deletion/);

  const tokenFixture = await gm.page.evaluate(async (actorId) => {
    const base = game.actors.get(actorId),
      scene = await Scene.create({
        name: `Inventory synthetic ${foundry.utils.randomID(5)}`,
      }),
      [token] = await scene.createEmbeddedDocuments("Token", [
        {
          name: "Synthetic supply token",
          actorId,
          actorLink: false,
        },
      ]);
    return {
      sceneId: scene.id,
      tokenId: token.id,
      actorUuid: token.actor.uuid,
      actorName: token.actor.name,
      revision: token.actor.getFlag("heroes-of-legend", "inventoryRevision"),
      base: {
        items: base.toObject().items,
        revision: base.getFlag("heroes-of-legend", "inventoryRevision"),
        pending: base.getFlag("heroes-of-legend", "pendingInventory"),
      },
    };
  }, fixture.actorId);
  fixture.tokenUuid = tokenFixture.actorUuid;
  fixture.tokenSceneId = tokenFixture.sceneId;
  await release(gm.page);
  const syntheticRequest = await gm.page.evaluate(
    async ({ actorUuid, itemId }) => {
      const ID = "heroes-of-legend",
        actor = await fromUuid(actorUuid),
        { inventoryBasis } = await import(
          "/systems/heroes-of-legend/services/inventory.mjs"
        );
      return (
        await ChatMessage.create({
          content: "Synthetic saved-result fixture.",
          flags: {
            [ID]: {
              inventoryRequest: {
                actorUuid,
                basis: inventoryBasis(actor, actor.items.get(itemId)),
                reason: "Synthetic saved result after chat deletion",
              },
            },
          },
        })
      ).id;
    },
    { actorUuid: tokenFixture.actorUuid, itemId: fixture.fieldId },
  );
  await bind(gm.page);
  await gm.page.evaluate(
    async ({ actorUuid, id }) => {
      const actor = await fromUuid(actorUuid),
        original = actor.validate,
        { resolveInventoryRequest } = await import(
          "/systems/heroes-of-legend/services/inventory.mjs"
        );
      actor.validate = function (...args) {
        const pending = actor.getFlag("heroes-of-legend", "pendingInventory");
        if (
          pending?.requestId === id &&
          pending.phase === "result" &&
          args[0]?.changes?.items
        )
          throw new Error("Injected synthetic saved-result failure");
        return original.apply(this, args);
      };
      try {
        await resolveInventoryRequest(id);
      } catch {
        /* The exact synthetic Actor retains its saved result. */
      } finally {
        actor.validate = original;
      }
    },
    { actorUuid: tokenFixture.actorUuid, id: syntheticRequest },
  );
  assert.equal(
    await gm.page.evaluate(
      () => game.settings.get("heroes-of-legend", "authorityWork").targetUuid,
    ),
    tokenFixture.actorUuid,
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await gm.page.evaluate(
    (id) => game.messages.get(id)?.delete(),
    syntheticRequest,
  );
  await secondGm.page.evaluate(async () => {
    const { AuthorityPanel } = await import(
      "/systems/heroes-of-legend/applications/authority.mjs"
    );
    await new AuthorityPanel().render({ force: true });
  });
  const syntheticRow = secondGm.page
    .locator(".hol-authority li")
    .filter({ hasText: tokenFixture.actorName });
  await syntheticRow.waitFor();
  assert.match(await syntheticRow.textContent(), /saved result/);
  assert.equal(
    await syntheticRow
      .locator("[data-action=openInventory]")
      .getAttribute("data-actor"),
    tokenFixture.actorUuid,
  );
  await syntheticRow.locator("[data-action=openInventory]").click();
  await secondGm.page.locator(".hol-inventory [data-action=resume]").click();
  await gm.page.waitForFunction(
    ({ sceneId, tokenId, secondGmId }) => {
      const actor = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor;
      if (
        !actor ||
        actor.getFlag("heroes-of-legend", "pendingInventory") !== null
      )
        return false;
      return Object.entries(
        actor.getFlag("heroes-of-legend", "operationReceipts") ?? {},
      ).some(
        ([id, receipt]) =>
          receipt.applied &&
          receipt.kind === "inventory" &&
          game.messages.get(id)?.author.id === secondGmId,
      );
    },
    {
      sceneId: tokenFixture.sceneId,
      tokenId: tokenFixture.tokenId,
      secondGmId: fixture.secondGmId,
    },
  );
  const tokenResult = await gm.page.evaluate(
    ({ baseActorId, sceneId, tokenId, actorUuid, itemId, requestId }) => {
      const base = game.actors.get(baseActorId),
        synthetic = game.scenes.get(sceneId).tokens.get(tokenId).actor,
        result = synthetic.getFlag("heroes-of-legend", "inventoryResults")?.[
          requestId
        ];
      return {
        exact: synthetic.uuid === actorUuid,
        baseItems: base.toObject().items,
        baseRevision: base.getFlag("heroes-of-legend", "inventoryRevision"),
        basePending: base.getFlag("heroes-of-legend", "pendingInventory"),
        syntheticRevision: synthetic.getFlag(
          "heroes-of-legend",
          "inventoryRevision",
        ),
        syntheticPending: synthetic.getFlag(
          "heroes-of-legend",
          "pendingInventory",
        ),
        syntheticDie: synthetic.items.get(itemId).system.inventoryDie,
        syntheticResult: result,
      };
    },
    {
      baseActorId: fixture.actorId,
      sceneId: tokenFixture.sceneId,
      tokenId: tokenFixture.tokenId,
      actorUuid: tokenFixture.actorUuid,
      itemId: fixture.fieldId,
      requestId: syntheticRequest,
    },
  );
  assert.equal(tokenResult.exact, true);
  assert.deepEqual(tokenResult.baseItems, tokenFixture.base.items);
  assert.equal(tokenResult.baseRevision, tokenFixture.base.revision);
  assert.equal(tokenResult.basePending, tokenFixture.base.pending);
  assert.equal(tokenResult.syntheticRevision, tokenFixture.revision + 1);
  assert.equal(tokenResult.syntheticPending, null);
  assert.equal(tokenResult.syntheticResult.target.itemId, fixture.fieldId);
  assert.equal(
    tokenResult.syntheticDie,
    tokenResult.syntheticResult.result.after,
  );
  const deletedChatAck = await gm.page.evaluate(async (actorUuid) => {
    const requestId = `fixture-synthetic-ack-${foundry.utils.randomID(8)}`,
      { enqueueCharacterOperation, writeAuthorityDocument } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      ),
      actor = await fromUuid(actorUuid);
    let error;
    try {
      await enqueueCharacterOperation(
        async () => {
          await writeAuthorityDocument(actor, {
            [`flags.heroes-of-legend.operationReceipts.${requestId}`]: {
              applied: true,
              kind: "inventory",
              authorId: game.user.id,
              request: "{}",
            },
          });
          throw new Error("Injected lost acknowledgment after saved receipt");
        },
        { requestId, targetUuid: actorUuid },
      );
    } catch (caught) {
      error = caught.message;
    }
    const work = game.settings.get("heroes-of-legend", "authorityWork");
    return { error, work };
  }, tokenFixture.actorUuid);
  assert.match(deletedChatAck.error, /lost acknowledgment/);
  assert.equal(deletedChatAck.work.busy, false);
  assert.equal(deletedChatAck.work.uncertain, false);
  assert.equal(deletedChatAck.work.targetUuid, tokenFixture.actorUuid);

  await gm.page.reload();
  await gm.page.waitForFunction(() => globalThis.game?.ready);
  await bind(gm.page);
  const reloaded = await inventoryState(gm.page, fixture.actorId);
  assert.equal(reloaded.revision, 7);
  assert.equal(reloaded.pending, null);
  assert.equal(reloaded.items[fixture.fieldId].quantity, 7);
  assert.equal(reloaded.items[fixture.unknownId].quantity, 2);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS native supply UI, no-supply gear, equipment-history independence, stale panel basis, forged dice, saved-roll validation, second-GM resume, explicit stale-result closure, synthetic-token recovery, quantity preservation and reload.",
  );
} finally {
  await secondGm?.context.close();
  await observer?.context.close();
  await owner?.context.close();
  if (gm && fixture)
    await gm.page
      .evaluate(
        async ({
          actorId,
          ownerId,
          observerId,
          secondGmId,
          tokenUuid,
          tokenSceneId,
        }) => {
          const { bindCreationAuthority, releaseAuthority } = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          );
          await bindCreationAuthority();
          await releaseAuthority();
          await new Promise((resolve) => setTimeout(resolve, 500));
          for (const message of game.messages.filter((entry) =>
            [`Actor.${actorId}`, tokenUuid].includes(
              entry.getFlag("heroes-of-legend", "inventoryRequest")?.actorUuid,
            ),
          ))
            await message.delete();
          await game.scenes.get(tokenSceneId)?.delete();
          await game.actors.get(actorId)?.delete();
          await game.users.get(ownerId)?.delete();
          await game.users.get(observerId)?.delete();
          await game.users.get(secondGmId)?.delete();
        },
        fixture,
      )
      .catch(console.error);
  await browser.close();
}
