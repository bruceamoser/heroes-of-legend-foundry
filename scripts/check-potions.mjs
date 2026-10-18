import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
import { stableFoundryId } from "./content/item-packs.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use an authorized disposable local world.");

const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  }),
  errors = [],
  packItemId = (catalogId) => stableFoundryId(catalogId);
let gm,
  giver,
  recipient,
  first,
  fixtureTag,
  failure,
  authorityBound = false;

const formatBrowserErrors = (captured) =>
  captured.length
    ? captured.map((error, index) => `[${index + 1}] ${error}`).join("\n")
    : "(none captured)";
const cleanupErrors = [];

function recordCleanupError(label, error) {
  const wrapped = new Error(
    `${label}: ${error instanceof Error ? error.message : String(error)}`,
  );
  cleanupErrors.push(wrapped);
  console.error(`Cleanup failed: ${wrapped.message}`);
}

async function waitForClientReady(page) {
  await page.waitForFunction(
    () =>
      globalThis.game?.ready === true &&
      game.canvas?.initialized === true &&
      !game.canvas.loading,
  );
}

async function waitForSceneCanvas(page, { sceneId, tokenIds = [], label }) {
  try {
    await page.waitForFunction(
      ({ sceneId, tokenIds }) => {
        const scene = game.scenes.get(sceneId);
        return Boolean(
          game.ready &&
            canvas.ready &&
            canvas.initialized &&
            !canvas.loading &&
            canvas.scene?.id === sceneId &&
            tokenIds.every((id) => {
              const token = scene?.tokens.get(id);
              return Boolean(
                token?.rendered &&
                  token.object &&
                  !token.object.destroyed &&
                  canvas.tokens.get(id) === token.object,
              );
            }),
        );
      },
      { sceneId, tokenIds },
    );
  } catch (error) {
    throw new Error(
      `${label} did not reach a fully rendered Canvas scene ${sceneId}.`,
      { cause: error },
    );
  }
}

async function viewScene(page, fixture, label) {
  await waitForClientReady(page);
  await page.evaluate(async ({ sceneId }) => {
    const scene = game.scenes.get(sceneId);
    if (!scene) throw new Error(`The fixture Scene ${sceneId} is unavailable.`);
    if ((await scene.view()) !== scene)
      throw new Error(`The fixture Scene ${sceneId} view did not complete.`);
  }, fixture);
  await waitForSceneCanvas(page, { ...fixture, label });
}

async function waitForCanvasStable(page) {
  await page.waitForFunction(
    () =>
      globalThis.game?.ready === true &&
      game.canvas?.initialized === true &&
      !game.canvas.loading,
  );
}

async function stabilizeFixtureCanvas(tag) {
  await waitForCanvasStable(gm.page);
  const viewingTrackedScene = await gm.page.evaluate((tag) => {
    const tracked = globalThis.__holPotionFixture;
    if (!tracked || tracked.tag !== tag)
      throw new Error("Fixture cleanup tracking is unavailable.");
    return Boolean(
      canvas.scene && new Set(tracked.scenes).has(canvas.scene.id),
    );
  }, tag);
  if (!viewingTrackedScene) return;
  await gm.page.evaluate(async () => {
    const scene = canvas.scene;
    if (!scene) return;
    await scene.unview();
  });
  await gm.page.waitForFunction(
    (tag) => {
      const tracked = globalThis.__holPotionFixture;
      return Boolean(
        game.ready &&
          canvas.initialized &&
          !canvas.loading &&
          (!canvas.scene || !tracked?.scenes.includes(canvas.scene.id)),
      );
    },
    tag,
  );
}

async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  context.setDefaultTimeout(60000);
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  });
  const page = await context.newPage(),
    connectionErrors = [];
  page.on("pageerror", (error) => {
    const message = error.stack ?? error.message;
    connectionErrors.push(message);
    errors.push(message);
  });
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await waitForClientReady(page);
  await page
    .waitForFunction(
      () =>
        globalThis.game?.ready &&
        Object.hasOwn(globalThis.game, "heroesOfLegend"),
      undefined,
      { timeout: 2000 },
    )
    .catch(() => {});
  const startup = await page.evaluate(() => {
    const ID = "heroes-of-legend";
    let authorityMeta = { registered: false, error: null };
    try {
      game.settings.get(ID, "authorityMeta");
      authorityMeta = { registered: true, error: null };
    } catch (error) {
      authorityMeta.error = error.message;
    }
    return {
      ready: game.ready === true,
      systemId: game.system?.id ?? null,
      systemVersion: game.system?.version ?? null,
      readyHook: Object.hasOwn(game, "heroesOfLegend"),
      dataModels: Boolean(
        CONFIG.Actor?.dataModels?.character &&
          CONFIG.Actor?.dataModels?.creature &&
          CONFIG.Item?.dataModels?.ability &&
          CONFIG.Item?.dataModels?.equipment,
      ),
      authorityMeta,
    };
  });
  if (
    !startup.ready ||
    startup.systemId !== "heroes-of-legend" ||
    !startup.readyHook ||
    !startup.dataModels ||
    !startup.authorityMeta.registered
  )
    throw new Error(
      [
        "Heroes of Legend did not initialize after Foundry became ready; refusing to bind the potion coordinator.",
        `ready=${startup.ready} system=${startup.systemId ?? "(missing)"} version=${startup.systemVersion ?? "(missing)"}`,
        `readyHook=${startup.readyHook} dataModels=${startup.dataModels}`,
        `authorityMeta=${startup.authorityMeta.registered ? "registered" : `missing (${startup.authorityMeta.error ?? "unknown error"})`}`,
        "Captured browser page errors:",
        formatBrowserErrors(connectionErrors),
      ].join("\n"),
    );
  // Keep the real chat log visible on every client during rapid fixture cards.
  // Hidden-sidebar toast insertion can outlive a temporary request card.
  await page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
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

async function startFixtureTracking() {
  fixtureTag = await gm.page.evaluate(() => {
    const tag = foundry.utils.randomID(12),
      ID = "heroes-of-legend",
      classes = {
        users: User,
        actors: Actor,
        scenes: Scene,
        combats: Combat,
      };
    globalThis.__holPotionFixture = {
      tag,
      users: [],
      actors: [],
      scenes: [],
      combats: [],
    };
    globalThis.__holPotionTrack = (kind, document) => {
      const ids = globalThis.__holPotionFixture[kind];
      if (!ids.includes(document.id)) ids.push(document.id);
    };
    globalThis.__holPotionCreate = async (kind, data) => {
      const documentClass = classes[kind];
      if (!documentClass)
        throw new Error(`Unknown potion fixture document kind: ${kind}`);
      const flags = structuredClone(data.flags ?? {});
      flags[ID] = {
        ...(flags[ID] ?? {}),
        fixtureTag: tag,
      };
      const document = await documentClass.create({ ...data, flags });
      globalThis.__holPotionTrack(kind, document);
      return document;
    };
    globalThis.__holPotionPackItem = async (packName, foundryId) => {
      const pack = game.packs.get(`heroes-of-legend.${packName}`),
        document = await pack?.getDocument(foundryId);
      if (!document)
        throw new Error(`Missing compendium fixture Item ${foundryId}.`);
      return document.toObject();
    };
    return tag;
  });
}

async function verifyNativeGeometryFixtures(fixture) {
  const result = await gm.page.evaluate(
    async ({ sceneId, giverTokenId, recipientTokenId, recipientActorId }) => {
      const { nativeTokenAdjacency } = await import(
          "/systems/heroes-of-legend/services/native-adjacency.mjs"
        ),
        scene = game.scenes.get(sceneId),
        giver = scene.tokens.get(giverTokenId),
        recipient = scene.tokens.get(recipientTokenId);
      if (!giver || !recipient)
        throw new Error("The native geometry fixture tokens are unavailable.");
      const levelId = (level) =>
          level?.id ?? level?._id ?? level ?? null,
        elevationSnapshot = (token) => {
          const source = token._source ?? token,
            movement = token.movement ?? {};
          return {
            tokenUuid: token.uuid,
            sourceElevation: Number(source.elevation ?? token.elevation ?? 0),
            derivedElevation: Number(token.elevation ?? 0),
            sourceLevel: levelId(source.level),
            derivedLevel: levelId(token.level),
            rendered: token.rendered === true,
            movement: {
              state: movement.state ?? null,
              originElevation: movement.origin?.elevation ?? null,
              destinationElevation: movement.destination?.elevation ?? null,
              passedElevation:
                movement.passed?.waypoints?.at(-1)?.elevation ?? null,
              pendingElevation:
                movement.pending?.waypoints?.at(0)?.elevation ?? null,
            },
          };
        },
        settleTokenMovement = async (token) => {
          if (token.rendered && token.object?.movementAnimationPromise)
            await token.object.movementAnimationPromise;
          const animation = token.movement?.animation;
          await animation?.started;
          await animation?.ended;
        },
        drawPlaceable = async (document, label) => {
          if (!document.rendered || !document.object)
            throw new Error(`${label} is not rendered on the fixture Canvas.`);
          // Creation schedules its native draw; a second draw races Wall graphics.
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          if (document.object.destroyed || !document.object.parent)
            throw new Error(`${label} did not finish its native Canvas draw.`);
        },
        setRecipientElevation = async (requestedElevation) => {
          const updated = await recipient.update({
            elevation: requestedElevation,
          });
          if (!updated)
            throw new Error(
              `Token elevation update ${requestedElevation} was not applied.`,
            );
          await settleTokenMovement(updated);
          const snapshot = elevationSnapshot(updated);
          if (
            snapshot.sourceElevation !== requestedElevation ||
            snapshot.derivedElevation !== requestedElevation
          )
            throw new Error(
              `Token elevation ${requestedElevation} did not reach a stable source and derived state:\n${JSON.stringify(snapshot, null, 2)}`,
            );
          return snapshot;
        },
        elevationDiagnostics = (requestedElevation) => ({
          requestedElevation,
          giver: elevationSnapshot(giver),
          recipient: elevationSnapshot(recipient),
          scene: {
            sceneUuid: scene.uuid,
            sceneLevelIds: [...scene.levels.keys()],
            activeCanvasSceneUuid: canvas.scene?.uuid ?? null,
            activeCanvasLevelId: canvas.level?.id ?? null,
            canvasReady: canvas.ready === true,
          },
        });
      const adjacent = nativeTokenAdjacency(giver, recipient);
      let large = null,
        wall = null;
      try {
        [large] = await scene.createEmbeddedDocuments("Token", [
          {
            name: "Large-footprint fixture",
            actorId: recipientActorId,
            actorLink: true,
            x: 200,
            y: 100,
            width: 2,
            height: 1,
          },
        ]);
        await drawPlaceable(large, "temporary large Token");
        const largeFootprint = nativeTokenAdjacency(giver, large);
        [wall] = await scene.createEmbeddedDocuments("Wall", [
          {
            c: [200, 0, 200, 200],
            move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
          },
        ]);
        await drawPlaceable(wall, "temporary Wall");
        const walled = nativeTokenAdjacency(giver, recipient);
        await wall.delete();
        wall = null;
        await setRecipientElevation(5);
        const altitudeDiagnostics = elevationDiagnostics(5);
        const altitude = nativeTokenAdjacency(giver, recipient);
        await setRecipientElevation(0);
        return {
          adjacent,
          largeFootprint,
          walled,
          altitude,
          altitudeDiagnostics,
        };
      } finally {
        const cleanupFailures = [],
          attempt = async (label, operation) => {
            try {
              await operation();
            } catch (error) {
              cleanupFailures.push(
                `${label}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          };
        if (wall)
          await attempt("delete temporary Wall", () => wall.delete());
        if (large)
          await attempt("delete temporary Token", () => large.delete());
        const sourceElevation = Number(
          (recipient._source ?? recipient).elevation ?? recipient.elevation,
        );
        if (sourceElevation !== 0 || Number(recipient.elevation) !== 0) {
          await attempt("restore recipient elevation", async () => {
            const restored = await recipient.update({ elevation: 0 });
            if (!restored)
              throw new Error("The recipient elevation update failed.");
            await settleTokenMovement(restored);
          });
        }
        if (cleanupFailures.length)
          throw new AggregateError(
            cleanupFailures,
            "Native geometry fixture cleanup failed.",
          );
      }
    },
    fixture,
  );
  assert.equal(result.adjacent.status, "adjacent");
  assert.equal(result.adjacent.spaces, 1);
  assert.notEqual(result.adjacent.distance, 5);
  assert.equal(result.largeFootprint.status, "adjacent");
  assert.equal(result.largeFootprint.spaces, 1);
  assert.equal(result.walled.status, "unverified");
  assert.match(result.walled.reason, /collision backend/);
  const altitudeDiagnostics = JSON.stringify(
    result.altitudeDiagnostics,
    null,
    2,
  );
  assert.equal(
    result.altitude.status,
    "unverified",
    `The stable altitude fixture did not produce an unverified adjacency:\n${altitudeDiagnostics}`,
  );
  assert.match(
    result.altitude.reason,
    /different elevations/,
    `The stable altitude fixture reached the wrong unavailable reason:\n${altitudeDiagnostics}`,
  );
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
  syntheticGiver = false,
}) {
  const scenario = await gm.page.evaluate(
    async ({
      name,
      bottleId,
      bottleFoundryId,
      actionFoundryId,
      inventoryDie,
      giverHp,
      recipient,
      syntheticGiver,
    }) => {
      const ID = "heroes-of-legend",
        { requestCombat, resolveCombatRequest } = await import(
          "/systems/heroes-of-legend/services/combat.mjs"
        ),
        { survivalState } = await import(
          "/systems/heroes-of-legend/rules/survival.mjs"
        ),
        bottleData = await globalThis.__holPotionPackItem(
          "equipment",
          bottleFoundryId,
        ),
        actionData = await globalThis.__holPotionPackItem(
          "abilities",
          actionFoundryId,
        );
      bottleData.system.inventoryDie = inventoryDie;
      bottleData.system.quantity = 1;
      const giverBase = await globalThis.__holPotionCreate("actors", {
        name: `${name} giver`,
        type: "character",
        system: { health: { value: giverHp, baseMax: 30 } },
        flags: {
          [ID]: {
            development: { creationSummary: { speedBase: 5 } },
          },
        },
        items: [bottleData, actionData],
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
        recipientActor = await globalThis.__holPotionCreate("actors", {
          name: `${name} recipient`,
          type: "character",
          system: {
            health: { value: recipient.hp, baseMax: recipient.maxHp },
          },
          flags: {
            [ID]: {
              development: { creationSummary: { speedBase: 5 } },
              survival: recipientSurvival,
            },
          },
        });
      }
      let scene = null,
        giverToken = null;
      if (syntheticGiver) {
        scene = await globalThis.__holPotionCreate("scenes", {
          name: `${name} scene`,
          grid: { type: 1, size: 100, distance: 5, units: "ft" },
          tokenVision: false,
          navigation: false,
          active: false,
        });
        [giverToken] = await scene.createEmbeddedDocuments("Token", [
          {
            name: giverBase.name,
            actorId: giverBase.id,
            actorLink: false,
            x: 100,
            y: 100,
            width: 1,
            height: 1,
          },
        ]);
      }
      const giverActor = await fromUuid(
          giverToken?.actor?.uuid ?? giverBase.uuid,
        ),
        giverItems = giverActor?.items;
      if (!giverActor || !giverItems)
        throw new Error("The exact potion giver Actor is unavailable.");
      const combat = await globalThis.__holPotionCreate("combats", {
        active: true,
        ...(scene ? { scene: scene.id } : {}),
      });
      await combat.createEmbeddedDocuments(
          "Combatant",
          [giverActor, recipientActor]
            .filter(Boolean)
            .map((actor, index) => ({
              ...(index === 0 && giverToken
                ? {
                    tokenId: giverToken.id,
                    sceneId: scene.id,
                    actorId: giverBase.id,
                  }
                : { actorId: actor.id }),
              name: actor.name,
              flags: {
                // Helper scenarios are friendly potion recipients, including at 0 HP.
                [ID]: { side: "players" },
              },
            })),
        );
      const exactCombatant = (actor, token = null) => {
          const matches = combat.combatants.filter(
            (combatant) =>
              combatant.actor?.uuid === actor.uuid &&
              (token
                ? combatant.token?.uuid === token.uuid
                : !combatant.token),
          );
          if (matches.length !== 1)
            throw new Error(
              `Expected one exact combatant for ${actor.name}; found ${matches.length}.`,
            );
          return matches[0];
        },
        giverCombatant = exactCombatant(giverActor, giverToken),
        recipientCombatant = recipientActor
          ? exactCombatant(recipientActor)
          : null;
      let message = await requestCombat(combat, "start");
      await resolveCombatRequest(message.id);
      message = await requestCombat(combat, "choose", {
        id: giverCombatant.id,
      });
      await resolveCombatRequest(message.id);
      const exactGiver = await fromUuid(giverCombatant.actor.uuid),
        bottle = exactGiver.items.find(
          (item) => item.system.catalogId === bottleId,
        ),
        ability = exactGiver.items.find((item) =>
          item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion",
        );
      if (!bottle || !ability)
        throw new Error("The compendium bottle or potion action was not embedded.");
      return {
        giverBaseActorId: giverBase.id,
        giverActorId: exactGiver.id,
        giverActorUuid: exactGiver.uuid,
        recipientActorId: recipientActor?.id ?? null,
        recipientActorUuid: recipientActor?.uuid ?? null,
        recipientSurvival,
        sceneId: scene?.id ?? null,
        giverTokenId: giverToken?.id ?? null,
        combatId: combat.id,
        combatUuid: combat.uuid,
        giverParticipantId: giverCombatant.id,
        recipientParticipantId: recipientCombatant?.id ?? null,
        bottleId: bottle.id,
        bottleUuid: bottle.uuid,
        abilityId: ability.id,
        abilityUuid: ability.uuid,
        bottleDescription: bottle.system.description,
        abilityDescription: ability.system.description,
        bottleSource: bottle.getFlag(ID, "source"),
        abilitySource: ability.getFlag(ID, "source"),
      };
    },
    {
      name,
      bottleId,
      bottleFoundryId: packItemId(bottleId),
      actionFoundryId: packItemId("ability-use-a-healing-potion"),
      inventoryDie,
      giverHp,
      recipient,
      syntheticGiver,
    },
  );
  if (scenario.sceneId)
    await viewScene(
      gm.page,
      {
        sceneId: scenario.sceneId,
        tokenIds: [scenario.giverTokenId],
      },
      `${name} synthetic scene`,
    );
  return scenario;
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
            ? { mode: "da-ruling" }
            : { mode: "native" },
        daWillingness: Boolean(scenario.recipientParticipantId),
        daWillingnessReason: "",
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
    async ({ combatId, actorUuid, expectedHp }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat?.getFlag("heroes-of-legend", "potionOperations") ?? {},
        )[0],
        giver = await fromUuid(actorUuid),
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
      actorUuid: scenario.giverActorUuid,
      expectedHp,
    },
  );
}

potionScenarios: try {
  gm = await join("Gamemaster");
  await bind(gm);
  authorityBound = true;
  await startFixtureTracking();
  first = await gm.page.evaluate(async ({ bottleFoundryId, actionFoundryId, broochFoundryId }) => {
    const ID = "heroes-of-legend",
      bottleData = await globalThis.__holPotionPackItem(
        "equipment",
        bottleFoundryId,
      ),
      broochData = await globalThis.__holPotionPackItem(
        "equipment",
        broochFoundryId,
      ),
      actionData = await globalThis.__holPotionPackItem(
        "abilities",
        actionFoundryId,
      );
    bottleData.system.inventoryDie = 4;
    bottleData.system.quantity = 1;
    broochData.system.quantity = 1;
    broochData.system.worn = true;
    const ownerA = await globalThis.__holPotionCreate("users", {
        name: `Potion giver ${foundry.utils.randomID(5)}`,
        role: CONST.USER_ROLES.PLAYER,
      }),
      ownerB = await globalThis.__holPotionCreate("users", {
        name: `Potion recipient ${foundry.utils.randomID(5)}`,
        role: CONST.USER_ROLES.PLAYER,
      }),
      giverActor = await globalThis.__holPotionCreate("actors", {
        name: "Potion giver hero",
        type: "character",
        ownership: { [ownerA.id]: 3 },
        system: { health: { value: 5, baseMax: 20 } },
        flags: {
          [ID]: {
            development: { creationSummary: { speedBase: 5 } },
          },
        },
        items: [
          bottleData,
          {
            name: "Held sword",
            type: "equipment",
            system: { quantity: 1, bulk: 1, hands: 1, held: true },
          },
          actionData,
        ],
      }),
      recipientActor = await globalThis.__holPotionCreate("actors", {
        name: "Potion recipient hero",
        type: "character",
        ownership: { [ownerB.id]: 3 },
        system: { health: { value: 5, baseMax: 20 } },
        flags: {
          [ID]: {
            development: { creationSummary: { speedBase: 5 } },
          },
        },
        items: [broochData],
      }),
      scene = await globalThis.__holPotionCreate("scenes", {
        name: `Potion fixture ${foundry.utils.randomID(4)}`,
        grid: { type: 1, size: 100, distance: 5, units: "ft" },
        tokenVision: false,
        navigation: false,
        active: false,
        ownership: {
          default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
        },
      }),
      tokens = await scene.createEmbeddedDocuments("Token", [
        {
          name: giverActor.name,
          actorId: giverActor.id,
          x: 100,
          y: 100,
          width: 1,
          height: 1,
          actorLink: true,
        },
        {
          name: recipientActor.name,
          actorId: recipientActor.id,
          x: 200,
          y: 100,
          width: 1,
          height: 1,
          actorLink: true,
        },
      ]);
    const tokenByActorId = new Map(
        tokens.map((token) => [token.actorId, token]),
      ),
      giverToken = tokenByActorId.get(giverActor.id),
      recipientToken = tokenByActorId.get(recipientActor.id);
    if (
      tokens.length !== 2 ||
      tokenByActorId.size !== 2 ||
      !giverToken ||
      !recipientToken
    )
      throw new Error(
        "The multiplayer fixture tokens did not preserve their Actor identities.",
      );
    const combat = await globalThis.__holPotionCreate("combats", {
      scene: scene.id,
      active: true,
    });
    await combat.createEmbeddedDocuments(
        "Combatant",
        [
          { token: giverToken, side: "players" },
          { token: recipientToken, side: "opposition" },
        ].map(({ token, side }) => ({
          tokenId: token.id,
          sceneId: scene.id,
          actorId: token.actorId,
          name: token.name,
          flags: { [ID]: { side } },
        })),
      );
    const exactCombatant = (actor, token) => {
        const matches = combat.combatants.filter(
          (combatant) =>
            combatant.actor?.uuid === actor.uuid &&
            combatant.token?.uuid === token.uuid,
        );
        if (matches.length !== 1)
          throw new Error(
            `Expected one exact combatant for ${token.uuid}; found ${matches.length}.`,
          );
        return matches[0];
      },
      giverCombatant = exactCombatant(giverActor, giverToken),
      recipientCombatant = exactCombatant(recipientActor, recipientToken),
      exactGiver = await fromUuid(giverCombatant.actor.uuid),
      exactRecipient = await fromUuid(recipientCombatant.actor.uuid);
    return {
      ownerAId: ownerA.id,
      ownerAName: ownerA.name,
      ownerBId: ownerB.id,
      ownerBName: ownerB.name,
      giverActorId: exactGiver.id,
      giverActorUuid: exactGiver.uuid,
      recipientActorId: recipientActor.id,
      recipientActorUuid: exactRecipient.uuid,
      abilityId: exactGiver.items.find(
        (item) => item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion",
      ).id,
      abilityDescription: exactGiver.items.find(
        (item) => item.getFlag(ID, "catalogId") === "ability-use-a-healing-potion",
      ).system.description,
      bottleId: exactGiver.items.find(
        (item) => item.system.catalogId === "item-lesser-healing-bottle",
      ).id,
      bottleDescription: exactGiver.items.find(
        (item) => item.system.catalogId === "item-lesser-healing-bottle",
      ).system.description,
      sceneId: scene.id,
      giverTokenId: giverToken.id,
      recipientTokenId: recipientToken.id,
      combat: combat.id,
      combatId: combat.id,
      giverParticipantId: giverCombatant.id,
      recipientParticipantId: recipientCombatant.id,
    };
  }, {
    bottleFoundryId: packItemId("item-lesser-healing-bottle"),
    actionFoundryId: packItemId("ability-use-a-healing-potion"),
    broochFoundryId: packItemId("item-gravebound-brooch"),
  });
  assert.match(first.bottleDescription, /hol-item-reference/);
  assert.match(first.abilityDescription, /<h2>Rules<\/h2>/);
  await viewScene(gm.page, first, "primary potion fixture scene");
  await verifyNativeGeometryFixtures(first);
  giver = await join(first.ownerAName);
  recipient = await join(first.ownerBName);
  await Promise.all([
    viewScene(
      giver.page,
      { sceneId: first.sceneId, tokenIds: [first.giverTokenId] },
      "potion giver fixture scene",
    ),
    viewScene(
      recipient.page,
      { sceneId: first.sceneId, tokenIds: [first.recipientTokenId] },
      "potion recipient fixture scene",
    ),
  ]);

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
  if (process.env.HOL_TEST_ADVISORY_ONLY === "1") {
    await gm.page.evaluate(async f => {
      const combat = game.combats.get(f.combat), state = foundry.utils.deepClone(combat.getFlag("heroes-of-legend", "encounter"));
      state.current = f.recipientParticipantId;
      state.budgets[f.giverParticipantId].remaining.maneuver = 0;
      state.budgets[f.recipientParticipantId].remaining.reaction = 0;
      await combat.setFlag("heroes-of-legend", "encounter", state);
    }, first);
    await giver.page.waitForFunction(f => game.combats.get(f.combat)?.getFlag("heroes-of-legend", "encounter")?.current === f.recipientParticipantId, first);
  }

  await gm.page.evaluate(async ({ giverActorUuid, abilityId }) => {
    canvas.tokens.setTargets([]);
    const { openPotionPreparation } = await import(
      "/systems/heroes-of-legend/applications/potions.mjs"
    );
    const actor = await fromUuid(giverActorUuid);
    globalThis.__holPotionUi = await openPotionPreparation(actor.items.get(abilityId));
  }, first);
  const gmPreparation = gm.page.locator(".hol-potion-preparation");
  await gmPreparation.waitFor();
  assert.equal(await gmPreparation.locator("select[name=recipientParticipantId]").count(), 0);
  assert.match(await gmPreparation.locator('[data-preview="recipient-name"]').textContent(), /self/);
  await gm.page.evaluate(({ recipientTokenId }) => canvas.tokens.setTargets([recipientTokenId]), first);
  const gmSubmitReady = (ready) => gm.page.waitForFunction((ready) =>
    document.querySelector(".hol-potion-preparation [data-action=submit]")?.disabled === !ready,
    ready,
  );
  await gmSubmitReady(false);
  await gmPreparation.locator("[name=willing]").check();
  await gmSubmitReady(true);
  await gmPreparation.locator("[name=willing]").uncheck();
  await gmSubmitReady(false);
  await gmPreparation.locator("[data-panel=da-exceptions] > summary").click();
  await gmPreparation.locator("[name=daWillingness]").check();
  await gmSubmitReady(true);
  await gm.page.evaluate(async ({ sceneId, recipientTokenId }) => {
    await game.scenes.get(sceneId).tokens.get(recipientTokenId).update({ elevation: 5 });
  }, first);
  await gmPreparation.locator("[name=daWillingness]").uncheck();
  await gmPreparation.locator("[name=daWillingness]").check();
  // Geometry remains advisory, including altitude disagreement.
  await gmSubmitReady(true);
  assert.equal(await gmPreparation.locator("[name=daWillingnessReason]").inputValue(), "");
  await gmSubmitReady(true);
  await gm.page.screenshot({ path: "/tmp/hol116-ui-rulings.png" });
  await gm.page.evaluate(async ({ sceneId, recipientTokenId }) => {
    await game.scenes.get(sceneId).tokens.get(recipientTokenId).update({ elevation: 0 });
    await globalThis.__holPotionUi.close();
    canvas.tokens.setTargets([]);
    delete globalThis.__holPotionUi;
  }, first);
  await giver.page.evaluate(
    async ({ actorUuid, itemId }) => {
      const actor = await fromUuid(actorUuid);
      await actor.items.get(itemId).sheet.render({ force: true });
    },
    { actorUuid: first.giverActorUuid, itemId: first.abilityId },
  );
  assert.match(
    await giver.page.locator(".hol-item-reference").textContent(),
    /Restore the bottle’s printed fixed HP/,
  );
  await giver.page
    .locator(".hol-ability")
    .getByRole("button", { name: "Prepare Use a Healing Potion" })
    .click();
  const preparation = giver.page.locator(".hol-potion-preparation");
  await preparation.waitFor();
  assert.equal(await preparation.locator("select[name=recipientParticipantId]").count(), 0);
  await giver.page.evaluate(({ recipientTokenId }) => canvas.tokens.setTargets([recipientTokenId]), first);
  await giver.page.waitForFunction(() =>
    document.querySelector('.hol-potion-preparation [data-preview="recipient-name"]')?.textContent === "Potion recipient hero");
  await giver.page.screenshot({ path: "/tmp/hol116-ui-consent.png" });
  await preparation.locator("[data-action=submit]").click();
  await recipient.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await recipient.page.locator("#chat .hol-potion-consent").last().waitFor();
  await recipient.page.locator("#chat .hol-potion-consent").last().click();
  await waitPotion({ combatId: first.combat });
  const other = await gm.page.evaluate(
    async ({ combatId, giverActorUuid, recipientActorUuid }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        giverActor = await fromUuid(giverActorUuid),
        recipientActor = await fromUuid(recipientActorUuid),
        encounter = combat.getFlag("heroes-of-legend", "encounter"),
        giverBudget = encounter.budgets[operation.giver.participantId],
        recipientBudget =
          encounter.budgets[operation.recipient.participantId];
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
          giverBudget.remaining.maneuver,
        recipientReaction: recipientBudget.remaining.reaction,
        giverTurnId: giverBudget.turnId,
        recipientTurnId: recipientBudget.turnId,
        giverActionReceipt:
          giverBudget.operations[operation.requestId],
        recipientReactionReceipt:
          recipientBudget.operations[operation.reactionOperationId],
        supplier: giverActor.items.get(operation.source.bottleItem.itemId)
          .system.inventoryDie,
        supplyReceipt: giverActor.getFlag(
          "heroes-of-legend",
          "potionReceipts",
        )?.[operation.requestId]?.supply,
      };
    },
    {
      combatId: first.combat,
      giverActorUuid: first.giverActorUuid,
      recipientActorUuid: first.recipientActorUuid,
    },
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
  assert.equal(other.operation.geometry.distance, 1);
  assert.equal(other.operation.willingness.kind, "recipient-owner");
  assert.equal(
    other.operation.authorId,
    first.ownerBId,
    "The consenting recipient is the final request author.",
  );
  assert.equal(other.operation.giver.turnId, other.giverTurnId);
  assert.equal(other.operation.recipient.turnId, other.recipientTurnId);
  assert.deepEqual(other.operation.giver.actionReceipt, other.giverActionReceipt);
  assert.deepEqual(
    other.operation.recipient.reactionReceipt,
    other.recipientReactionReceipt,
  );
  assert.equal(
    Object.hasOwn(other.operation.giver.actionReceipt, "turnId"),
    false,
  );
  assert.equal(
    Object.hasOwn(other.operation.recipient.reactionReceipt, "turnId"),
    false,
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
  console.info("PASS native UI, two-owner consent, geometry, costs and completed replay");
  if (process.env.HOL_TEST_ADVISORY_ONLY === "1") {
    assert.equal(other.operation.giver.actionReceipt.trackedCost.spent, 0);
    assert.equal(other.operation.recipient.reactionReceipt.trackedCost.spent, 0);
    assert.deepEqual(errors, []);
    console.info("PASS: native owner potion entry off turn with empty Maneuver and recipient Reaction; owner consent, real healing and supply exactly once, clamped counters and transport replay retained.");
    break potionScenarios;
  }


  await gm.page.evaluate(() => {
    if (globalThis.__holPotionRollPatch) return;
    const native = foundry.dice.Roll.prototype.evaluate;
    foundry.dice.Roll.prototype.evaluate = async function (...args) {
      if (
        String(this.formula).replace(/\s+/g, "") === "1d4"
      ) {
        globalThis.__holPotionSupplyEvaluations =
          (globalThis.__holPotionSupplyEvaluations ?? 0) + 1;
        if (globalThis.__holPotionFailNextSupply) {
          globalThis.__holPotionFailNextSupply = false;
          throw new Error("Injected unknown potion supply dice");
        }
      }
      const evaluated = await native.apply(this, args);
      if (
        String(this.formula).replace(/\s+/g, "") === "1d4" &&
        globalThis.__holPotionInvalidItemTargetUuid
      ) {
        const actor = await fromUuid(
            globalThis.__holPotionInvalidItemTargetUuid,
          ),
          original = actor?.toObject;
        if (!actor || typeof original !== "function")
          throw new Error("The invalid-Item fixture Actor is unavailable.");
        globalThis.__holPotionInvalidToObject = {
          actorUuid: actor.uuid,
          original,
        };
        actor.toObject = function (...toObjectArgs) {
          const data = original.apply(this, toObjectArgs);
          data.items ??= [];
          data.items.push({
            _id: foundry.utils.randomID(16),
            name: "Injected invalid embedded Item",
            type: "equipment",
            system: {
              schemaVersion: 1,
              catalogId: "fixture-invalid-item",
              quantity: 0,
              bulk: 1,
              hands: 0,
              inventoryDie: 0,
              held: false,
              worn: false,
              description: "",
            },
          });
          return data;
        };
        globalThis.__holPotionInvalidItemTargetUuid = null;
      }
      return evaluated;
    };
    globalThis.__holPotionRollPatch = true;
    globalThis.__holPotionSupplyEvaluations = 0;
  });

  const recovered = await stageScenario({
    name: "Final d4",
    bottleId: "item-lesser-healing-bottle",
    giverHp: 1,
    syntheticGiver: true,
  });
  await gm.page.evaluate(() => {
    globalThis.__holPotionFailNextSupply = true;
  });
  const recoveredRequest = await useScenario(recovered);
  await waitSupplyRolling(recovered, 7);
  await gm.page.waitForFunction((id) =>
    game.messages.get(id)?.content.includes("Injected unknown potion supply dice"), recoveredRequest);
  const interleaving = await gm.page.evaluate(async ({ combatId, giverActorUuid }) => {
    const ID = "heroes-of-legend", combat = game.combats.get(combatId),
      actor = await fromUuid(giverActorUuid),
      before = JSON.stringify({ encounter: combat.getFlag(ID, "encounter"), actor: actor.toObject() });
    const cases = [
      ["playerAttackRequest", {
        handler: "player-basic-melee-v1", source: { path: "design/cards/basic-melee.md" },
        itemUuid: `${giverActorUuid}.Item.fixture`, actorUuid: giverActorUuid,
        combatUuid: combat.uuid, participantId: "fixture", basis: {}, draft: {},
      }, "player-attacks", "resolvePlayerBasicMeleeRequest"],
      ["npcAttackRequest", { combatUuid: combat.uuid }, "npc-attacks", "resolveNpcAttack"],
      ["abilityRequest", { combatUuid: combat.uuid }, "abilities", "resolveAbilityRequest"],
      ...["start", "choose", "finish", "roster", "convert"].map((kind) =>
        ["combatRequest", { combatUuid: combat.uuid, kind }, "combat", "resolveCombatRequest"]),
    ];
    let refused = 0;
    for (const [flag, request, module, method] of cases) {
      // Admit through the selected coordinator once, without duplicate create-hook alerts.
      const message = await ChatMessage.create({ content: "Fixture interleaving refusal" });
      await message.update({ [`flags.${ID}.${flag}`]: request });
      try {
        const service = await import(`/systems/heroes-of-legend/services/${module}.mjs`);
        await service[method](message.id);
        throw new Error(`Interleaved ${flag} unexpectedly succeeded`);
      } catch (error) {
        if (!/pending encounter action|pending healing potion/.test(error.message)) throw error;
        refused++;
      } finally {
        // Let native chat notification insertion finish before deleting its card.
        await new Promise((resolve) => setTimeout(resolve, 350));
        await message.delete();
      }
    }
    const after = JSON.stringify({ encounter: combat.getFlag(ID, "encounter"), actor: actor.toObject() });
    return { refused, unchanged: before === after, before: JSON.parse(before), after: JSON.parse(after) };
  }, recovered);
  assert.equal(interleaving.refused, 8);
  assert.deepEqual(interleaving.after, interleaving.before);
  console.info("PASS eight native interleaving refusals with unchanged Actor and budgets");
  const healedBeforeRecovery = await gm.page.evaluate(
    async (uuid) => (await fromUuid(uuid)).system.health.value,
    recovered.giverActorUuid,
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
      );
    },
    { id: recoveredRequest, combatId: recovered.combatId },
  );
  await waitPotion(recovered);
  const finalUse = await gm.page.evaluate(
    async ({ actorUuid, combatId }) => {
      const actor = await fromUuid(actorUuid),
        combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0];
      return {
        operation,
        actorUuid: actor.uuid,
        operationGiverActorUuid: operation.giver.actorUuid,
        hp: actor.system.health.value,
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        currentSource: actor.items
          .get(operation.source.bottleItem.itemId)
          .getFlag("heroes-of-legend", "source"),
        items: actor.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          quantity: item.system.quantity,
          description: item.system.description,
          source: item.getFlag("heroes-of-legend", "source"),
        })),
        status: combat.getFlag("heroes-of-legend", "operationReceipts")[
          operation.requestId
        ].status,
        receipt: actor.getFlag("heroes-of-legend", "potionReceipts")?.[
          operation.requestId
        ]?.supply,
      };
    },
    {
      actorUuid: recovered.giverActorUuid,
      combatId: recovered.combatId,
    },
  );
  assert.equal(finalUse.hp, 7);
  assert.equal(finalUse.actorUuid, recovered.giverActorUuid);
  assert.equal(finalUse.operationGiverActorUuid, finalUse.actorUuid);
  assert.notEqual(
    finalUse.actorUuid,
    `Actor.${recovered.giverBaseActorId}`,
    "The fixture must preserve the unlinked token's synthetic Actor identity.",
  );
  assert.equal(finalUse.items.length, 2);
  assert.deepEqual(
    finalUse.currentSource,
    recovered.bottleSource,
    "The supply update must retain the exact compendium bottle source.",
  );
  assert.equal(
    finalUse.items.find((item) => item.id === recovered.bottleId).description,
    recovered.bottleDescription,
  );
  assert.equal(
    finalUse.items.find((item) => item.id === recovered.abilityId).description,
    recovered.abilityDescription,
  );
  assert.equal(finalUse.die, 0);
  assert.equal(finalUse.status, "complete");
  console.info("PASS synthetic Actor final d4-to-out recovery");
  assert.equal(finalUse.receipt.result.retained, 1);
  assert.equal(finalUse.receipt.nativeRoll, null);
  assert.equal(
    finalUse.receipt.recovery.reason,
    "",
  );
  assert.equal(
    await gm.page.evaluate(() => globalThis.__holPotionSupplyEvaluations),
    1,
    "Recovering an unknown supply face must not reroll it.",
  );

  const changed = await stageScenario({
    name: "Changed source",
    bottleId: "item-greater-healing-bottle",
    giverHp: 1,
  });
  await gm.page.evaluate(() => {
    globalThis.__holPotionFailNextSupply = true;
  });
  const changedRequest = await useScenario(changed);
  await waitSupplyRolling(changed, 11);
  await gm.page.waitForFunction((id) =>
    game.messages.get(id)?.content.includes("Injected unknown potion supply dice"), changedRequest);
  await gm.page.evaluate(
    async ({ actorUuid, bottleId, id }) => {
      const item = (await fromUuid(actorUuid)).items.get(bottleId);
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
        if (!/reconcile/i.test(error.message)) {
          const combat = game.combats.find((entry) => entry.getFlag("heroes-of-legend", "potionOperations")?.[id]);
          const operation = combat?.getFlag("heroes-of-legend", "potionOperations")?.[id];
          const child = item.actor.getFlag("heroes-of-legend", "potionSupplyOperations")?.[operation?.supplyOperationId];
          throw new Error(`${error.message}\n${JSON.stringify({ id, operation, child }, null, 2)}`);
        }
      }
    },
    {
      actorUuid: changed.giverActorUuid,
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
    );
  }, changedRequest);
  await waitPotion(changed);
  const reconciled = await gm.page.evaluate(
    async ({ actorUuid, combatId }) => {
      const actor = await fromUuid(actorUuid),
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
        operation,
        currentSource: actor.items.get(operation.source.bottleItem.itemId).getFlag("heroes-of-legend", "source"),
      };
    },
    {
      actorUuid: changed.giverActorUuid,
      combatId: changed.combatId,
    },
  );
  assert.equal(reconciled.hp, 11);
  assert.equal(reconciled.die, 4);
  assert.equal(reconciled.status, "reconciled-without-supply");
  assert.equal(reconciled.disposition.choice, "waive-supply");
  assert.equal(
    reconciled.currentSource.sha256,
    "0".repeat(64),
    "The fixture must exercise an exact source substitution.",
  );
  assert.deepEqual(
    reconciled.operation.source.bottleItem.source,
    changed.bottleSource,
    "The operation retains its original reviewed bottle source.",
  );

  const invalidItem = await stageScenario({
    name: "Invalid embedded Item",
    bottleId: "item-lesser-healing-bottle",
    giverHp: 1,
  });
  const evaluationsBeforeInvalid = await gm.page.evaluate(
    () => globalThis.__holPotionSupplyEvaluations,
  );
  await gm.page.evaluate((uuid) => {
    globalThis.__holPotionInvalidItemTargetUuid = uuid;
  }, invalidItem.giverActorUuid);
  const invalidItemRequest = await useScenario(invalidItem);
  await gm.page.waitForFunction(
    ({ id }) =>
      game.messages.get(id)?.content.includes("Potion use needs attention"),
    { id: invalidItemRequest },
  );
  const rejectedSupply = await gm.page.evaluate(
    async ({ actorUuid, combatId }) => {
      const actor = await fromUuid(actorUuid),
        combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        child =
          actor.getFlag("heroes-of-legend", "potionSupplyOperations")?.[
            operation.supplyOperationId
          ];
      return {
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        receipt: actor.getFlag("heroes-of-legend", "potionReceipts")?.[
          operation.requestId
        ]?.supply,
        phase: child?.phase,
        itemCount: actor.items.size,
      };
    },
    {
      actorUuid: invalidItem.giverActorUuid,
      combatId: invalidItem.combatId,
    },
  );
  assert.equal(rejectedSupply.die, 4);
  assert.equal(rejectedSupply.receipt, undefined);
  assert.equal(rejectedSupply.phase, "rolled");
  assert.equal(rejectedSupply.itemCount, 2);
  await gm.page.evaluate(
    async ({ actorUuid, id, combatUuid }) => {
      const actor = await fromUuid(actorUuid);
      if (
        globalThis.__holPotionInvalidToObject?.actorUuid !== actor.uuid ||
        typeof globalThis.__holPotionInvalidToObject.original !== "function"
      )
        throw new Error("The invalid-Item fixture did not reach prevalidation.");
      actor.toObject = globalThis.__holPotionInvalidToObject.original;
      globalThis.__holPotionInvalidToObject = null;
      const { resolvePotionRequest } = await import(
        "/systems/heroes-of-legend/services/potions.mjs"
      );
      await resolvePotionRequest(id, combatUuid);
    },
    {
      actorUuid: invalidItem.giverActorUuid,
      id: invalidItemRequest,
      combatUuid: invalidItem.combatUuid,
    },
  );
  await waitPotion(invalidItem);
  const validItemWrite = await gm.page.evaluate(
    async ({ actorUuid, combatId }) => {
      const actor = await fromUuid(actorUuid),
        combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0];
      return {
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        itemCount: actor.items.size,
        invalid:
          actor.items.some((item) =>
            item.name.includes("Injected invalid"),
          ),
      };
    },
    {
      actorUuid: invalidItem.giverActorUuid,
      combatId: invalidItem.combatId,
    },
  );
  assert.equal(validItemWrite.itemCount, 2);
  assert.equal(validItemWrite.invalid, false);
  assert([0, 4].includes(validItemWrite.die));
  assert.equal(
    await gm.page.evaluate(() => globalThis.__holPotionSupplyEvaluations),
    evaluationsBeforeInvalid + 1,
    "The rejected embedded Item must not cause a second supply roll.",
  );

  const zero = await stageScenario({
    name: "Zero HP",
    bottleId: "item-superior-healing-bottle",
    giverHp: 2,
    recipient: { hp: 0, maxHp: 20 },
  });
  await useScenario(zero);
  await waitPotion(zero);
  const zeroResult = await gm.page.evaluate(
    async ({ recipientActorUuid, combatId }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        actor = await fromUuid(recipientActorUuid);
      return {
        operation,
        hp: actor.system.health.value,
        survival: actor.getFlag("heroes-of-legend", "survival"),
        reaction:
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.recipient.participantId
          ].remaining.reaction,
      };
    },
    {
      recipientActorUuid: zero.recipientActorUuid,
      combatId: zero.combatId,
    },
  );
  assert.equal(zeroResult.hp, 16);
  assert.equal(zeroResult.survival.status, "active");
  assert.equal(zeroResult.survival.marks, 0);
  assert.equal(zeroResult.reaction, 1);
  assert.equal(zeroResult.operation.reactionCommitted, false);
  assert.equal(zeroResult.operation.recipient.reactionReceipt, null);

  const interrupted = await stageScenario({
    name: "Interrupted",
    bottleId: "item-lesser-healing-bottle",
    giverHp: 3,
  });
  await useScenario(interrupted, { continuesAfterInterruption: false });
  await waitPotion(interrupted);
  const interruptedResult = await gm.page.evaluate(
    async ({ actorUuid, combatId }) => {
      const combat = game.combats.get(combatId),
        operation = Object.values(
          combat.getFlag("heroes-of-legend", "potionOperations"),
        )[0],
        actor = await fromUuid(actorUuid),
        giverBudget =
          combat.getFlag("heroes-of-legend", "encounter").budgets[
            operation.giver.participantId
          ];
      return {
        operation,
        hp: actor.system.health.value,
        die: actor.items.get(operation.source.bottleItem.itemId).system
          .inventoryDie,
        maneuver: giverBudget.remaining.maneuver,
        actionReceipt: giverBudget.operations[operation.requestId],
        status: combat.getFlag("heroes-of-legend", "operationReceipts")[
          operation.requestId
        ].status,
      };
    },
    {
      actorUuid: interrupted.giverActorUuid,
      combatId: interrupted.combatId,
    },
  );
  assert.equal(interruptedResult.hp, 3);
  assert.equal(interruptedResult.die, 4);
  assert.equal(interruptedResult.maneuver, 0);
  assert.equal(interruptedResult.status, "interrupted");
  assert.equal(interruptedResult.operation.reactionCommitted, false);
  assert.equal(interruptedResult.actionReceipt.status, "interrupted");
  assert.deepEqual(
    interruptedResult.operation.giver.actionReceipt,
    interruptedResult.actionReceipt,
  );
  assert.equal(
    Object.hasOwn(interruptedResult.actionReceipt, "turnId"),
    false,
  );
  // Reuse tracked fixture Actors, but remove their encounter for genuine free play.
  await gm.page.evaluate(async (scenario) => {
    await game.combats.get(scenario.combatId).delete();
    const ID = "heroes-of-legend", giver = await fromUuid(scenario.giverActorUuid),
      recipient = await fromUuid(scenario.recipientActorUuid);
    const { survivalState } = await import("/systems/heroes-of-legend/rules/survival.mjs");
    for (const actor of [giver, recipient]) {
      await actor.update({ "system.health.value": 2,
        [`flags.${ID}.survival`]: survivalState({ hp: 2, maxHp: actor.system.health.max, gritAvailable: actor.system.grit?.available ?? 0, ownTurn: 0 }) });
    }
    await giver.items.get(scenario.bottleId).update({ "system.inventoryDie": 4 });
    await game.scenes.get(scenario.sceneId).tokens.get(scenario.recipientTokenId).update({ x: 1500 });
  }, first);
  await viewScene(gm.page, first, "free-play potion scene");
  await giver.page.evaluate(async (scenario) => {
    canvas.tokens.setTargets([]);
    const actor = await fromUuid(scenario.giverActorUuid),
      { openPotionPreparation } = await import("/systems/heroes-of-legend/applications/potions.mjs");
    await openPotionPreparation(actor.items.get(scenario.bottleId));
  }, first);
  const freePreparation = giver.page.locator(".hol-potion-preparation");
  await freePreparation.waitFor();
  assert.equal(await freePreparation.locator("select[name=bottleUuid]").count(), 0);
  await freePreparation.locator("[data-action=submit]").click();
  await gm.page.waitForFunction(({ giverActorUuid }) => {
    const actor = fromUuidSync(giverActorUuid);
    return Object.values(actor.getFlag("heroes-of-legend", "potionOperations") ?? {}).some((operation) => operation.status === "complete");
  }, first);
  const freeSelf = await gm.page.evaluate(async ({ giverActorUuid }) => {
    const actor = await fromUuid(giverActorUuid), operation = Object.values(actor.getFlag("heroes-of-legend", "potionOperations"))[0],
      { resolvePotionRequest } = await import("/systems/heroes-of-legend/services/potions.mjs"),
      before = JSON.stringify(actor.toObject());
    await resolvePotionRequest(operation.requestId); await resolvePotionRequest(operation.requestId);
    return { unchanged: before === JSON.stringify(actor.toObject()), operation };
  }, first);
  assert.equal(freeSelf.unchanged, true);
  assert.equal(freeSelf.operation.outsideCombat, true);
  assert.equal(freeSelf.operation.giver.turnId, null);
  console.info("PASS native Actor-host self-use and duplicate replay without Combat");
  await freePreparation.waitFor({ state: "detached" });
  // A fresh offer still uses genuine recipient-owner one-click consent.
  await gm.page.evaluate(async ({ giverActorUuid, bottleId }) => {
    const actor = await fromUuid(giverActorUuid);
    await actor.items.get(bottleId).update({ "system.inventoryDie": 4 });
  }, first);
  await giver.page.evaluate(async (scenario) => {
    canvas.tokens.setTargets([scenario.recipientTokenId]);
    const actor = await fromUuid(scenario.giverActorUuid),
      { openPotionPreparation } = await import("/systems/heroes-of-legend/applications/potions.mjs");
    await openPotionPreparation(actor.items.get(scenario.bottleId));
  }, first);
  await freePreparation.waitFor();
  await giver.page.waitForFunction(() => document.querySelector(".hol-potion-preparation [data-action=submit]")?.textContent === "Offer potion");
  await giver.page.screenshot({ path: "/tmp/hol135-ui-offer.png" });
  const consentCount = await recipient.page.locator("#chat .hol-potion-consent").count();
  await freePreparation.locator("[data-action=submit]").click();
  await recipient.page.waitForFunction((count) => document.querySelectorAll("#chat .hol-potion-consent").length > count, consentCount);
  await recipient.page.locator("#chat .hol-potion-consent").last().waitFor();
  await recipient.page.locator("#chat .hol-potion-consent").last().click();
  await gm.page.waitForFunction(({ giverActorUuid }) => {
    const actor = fromUuidSync(giverActorUuid);
    return Object.values(actor.getFlag("heroes-of-legend", "potionOperations") ?? {}).filter((operation) => operation.status === "complete").length === 2;
  }, first);
  const freeOffer = await gm.page.evaluate(async ({ giverActorUuid, recipientActorUuid }) => {
    const actor = await fromUuid(giverActorUuid), recipient = await fromUuid(recipientActorUuid),
      operation = Object.values(actor.getFlag("heroes-of-legend", "potionOperations")).find((operation) => operation.requestSnapshot.relation === "other");
    return { operation, hp: recipient.system.health.value };
  }, first);
  assert.equal(freeOffer.operation.willingness.kind, "recipient-owner");
  assert.equal(freeOffer.operation.geometry.adjacent, false);
  assert.equal(freeOffer.operation.plan.costs.recipient.reaction, 0);
  assert.ok(freeOffer.hp > 2);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: compendium descriptions, 5-unit/large-footprint/wall/altitude adjacency, two-owner consent, exact budget receipts, synthetic Actor identity, Life resistance, 0 HP, invalid Item prevalidation, dropped response, single-roll recovery, source reconciliation, interruption, Actor-host free-play self/offer UI and truthful advisory range.",
  );
} catch (error) {
  failure = error;
  if (errors.length)
    console.error(
      `Captured browser page errors:\n${formatBrowserErrors(errors)}`,
    );
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
  for (const [label, connection] of [
    ["potion giver context", giver],
    ["potion recipient context", recipient],
  ]) {
    if (!connection) continue;
    try {
      await connection.context.close();
    } catch (error) {
      recordCleanupError(label, error);
    }
  }
  if (gm && authorityBound) {
    let released = false;
    try {
      try {
        await gm.page.evaluate(async () => {
          const pending = globalThis.__holPotionInvalidToObject;
          if (!pending) return;
          const actor = await fromUuid(pending.actorUuid);
          if (actor && typeof pending.original === "function")
            actor.toObject = pending.original;
          globalThis.__holPotionInvalidToObject = null;
        });
      } catch (error) {
        recordCleanupError("restore patched Actor#toObject", error);
      }
      await gm.page.evaluate(async () => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
      });
      released = true;
    } catch (error) {
      let fixtureState = null;
      if (fixtureTag)
        fixtureState = await gm.page
          .evaluate(() => {
            const tracked = globalThis.__holPotionFixture;
            return Boolean(
              tracked &&
                ["users", "actors", "scenes", "combats"].some(
                  (kind) => tracked[kind]?.length > 0,
                ),
            );
          })
          .catch(() => null);
      const fixtureDisposition =
        fixtureState === true
          ? "tracked fixture documents were left for recovery"
          : fixtureState === false
            ? "no tracked fixture documents had been created"
            : fixtureTag
              ? "fixture document state could not be inspected"
              : "fixture tracking had not started";
      recordCleanupError(
        `Coordinator release after authority acquisition (${fixtureDisposition})`,
        error,
      );
    }
    if (released && fixtureTag) {
      try {
        // Native scrolling text can retain token references for two seconds.
        await gm.page.waitForTimeout(2100);
        await stabilizeFixtureCanvas(fixtureTag);
        const failures = await gm.page.evaluate(
          async ({ tag }) => {
            const ID = "heroes-of-legend",
              tracked = structuredClone(globalThis.__holPotionFixture);
            if (!tracked || tracked.tag !== tag)
              throw new Error("Fixture cleanup tracking is unavailable.");
            const exact = (document, id, label) => {
                if (!document) return null;
                if (document.getFlag(ID, "fixtureTag") !== tag)
                  throw new Error(
                    `Refusing to clean an unknown ${label} replacement: ${id}`,
                  );
                return document;
              },
              failures = [],
              attempt = async (label, operation) => {
                try {
                  await operation();
                } catch (error) {
                  failures.push(
                    `${label}: ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
              },
              combats = tracked.combats.map((id) =>
                exact(game.combats.get(id), id, "Combat"),
              ),
              combatUuids = new Set(
                tracked.combats.map((id) => `Combat.${id}`),
              );
            for (const message of game.messages.contents) {
              const request =
                  message.getFlag(ID, "potionRequest") ??
                  message.getFlag(ID, "potionProposal") ??
                  message.getFlag(ID, "combatRequest"),
                scoped =
                  request?.combatUuid && combatUuids.has(request.combatUuid);
              if (scoped)
                await attempt(`delete fixture ChatMessage ${message.id}`, () =>
                  message.delete(),
                );
            }
            for (const combat of combats)
              if (combat)
                await attempt(`delete fixture Combat ${combat.id}`, () =>
                  combat.delete(),
                );
            for (const id of tracked.scenes) {
              const scene = exact(game.scenes.get(id), id, "Scene");
              if (scene)
                await attempt(`delete fixture Scene ${id}`, () =>
                  scene.delete(),
                );
            }
            for (const id of tracked.actors) {
              const actor = exact(game.actors.get(id), id, "Actor");
              if (actor)
                await attempt(`delete fixture Actor ${id}`, () =>
                  actor.delete(),
                );
            }
            for (const id of tracked.users) {
              const user = exact(game.users.get(id), id, "User");
              if (user)
                await attempt(`delete fixture User ${id}`, () =>
                  user.delete(),
                );
            }
            if (!failures.length) {
              delete globalThis.__holPotionFixture;
              delete globalThis.__holPotionTrack;
              delete globalThis.__holPotionCreate;
              delete globalThis.__holPotionPackItem;
            }
            return failures;
          },
          { tag: fixtureTag },
        );
        for (const cleanupFailure of failures)
          recordCleanupError("fixture cleanup", cleanupFailure);
      } catch (error) {
        recordCleanupError("fixture cleanup", error);
      }
    }
  }
  try {
    await browser.close();
  } catch (error) {
    recordCleanupError("browser teardown", error);
  }
}
if (!failure && errors.length)
  failure = new Error(`Browser page errors, including teardown:\n${formatBrowserErrors(errors)}`);
if (failure) {
  if (cleanupErrors.length)
    failure.message += `\nCleanup also failed:\n${cleanupErrors
      .map((error) => `- ${error.message}`)
      .join("\n")}`;
  throw failure;
}
if (cleanupErrors.length)
  throw new AggregateError(cleanupErrors, "Fixture teardown failed.");
