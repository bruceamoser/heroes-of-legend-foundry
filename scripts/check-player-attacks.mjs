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
  browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  }),
  errors = [],
  cleanupRegistryKey = "__holPlayerAttackFixtureCleanup";
let gm,
  player,
  users,
  scenarios = [],
  activeFixture = null,
  authorityClaimed = false,
  scenarioDiagnostic = "fixture setup";
await mkdir("test-results", { recursive: true });

function markDiagnostic(label) {
  scenarioDiagnostic = label;
  console.info(`SCENARIO: ${label}`);
}

async function waitForClientReady(page) {
  await page.waitForFunction(
    () =>
      globalThis.game?.ready &&
      game.canvas.initialized &&
      !game.canvas.loading,
    undefined,
    { polling: 100 },
  );
}

async function initializeCleanupRegistry() {
  await gm.page.evaluate((key) => {
    const registry = {
      users: [],
      actors: [],
      scenes: [],
      combats: [],
      track(kind, document) {
        if (
          document?.id &&
          Array.isArray(registry[kind]) &&
          !registry[kind].includes(document.id)
        )
          registry[kind].push(document.id);
      },
    };
    globalThis[key] = registry;
  }, cleanupRegistryKey);
}

async function assertCoordinatorUnbound() {
  const current = await gm.page.evaluate(() => {
    const ID = "heroes-of-legend";
    return {
      client: game.settings.get(ID, "creationAuthorityClient"),
      meta: game.settings.get(ID, "authorityMeta"),
      work: game.settings.get(ID, "authorityWork"),
    };
  });
  if (
    current.client ||
    Object.keys(current.meta ?? {}).length ||
    Object.keys(current.work ?? {}).length
  )
    throw new Error(
      "The disposable world coordinator is already bound. Release it before running this fixture.",
    );
}

async function join(name) {
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.setDefaultTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "false");
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  });
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await waitForClientReady(page);
  return { context, page };
}

async function bind() {
  if (!authorityClaimed)
    throw new Error("The fixture has not claimed coordinator cleanup.");
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
}

async function release() {
  if (!authorityClaimed)
    throw new Error("The fixture has not claimed coordinator cleanup.");
  await gm.page.evaluate(async () => {
    const { isCreationAuthority, releaseAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    if (!isCreationAuthority())
      throw new Error("Fixture coordinator ownership changed.");
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
  targetHidden = false,
  wounds = 0,
}) {
  markDiagnostic(`${label}: create scenario documents`);
  const setup = await gm.page.evaluate(
    async ({
      ownerId,
      targetOwnerId,
      targetType,
      label,
      source,
      attackerFootprint,
      targetFootprint,
      wall,
      targetHidden,
      cleanupRegistryKey,
    }) => {
      const ID = "heroes-of-legend",
        cleanup = globalThis[cleanupRegistryKey],
        owner = game.users.get(ownerId),
        targetOwner = game.users.get(targetOwnerId);
      if (!cleanup) throw new Error("Fixture cleanup tracking is unavailable.");
      const attacker = await Actor.create({
          name: `${label} attacker`,
          type: "character",
          ownership: { [owner.id]: 3 },
          flags: {
            [ID]: { development: { creationSummary: { speedBase: 5 } } },
          },
          system: {
            attributes: { brawn: { base: 2 } },
            health: { value: 12, baseMax: 12 },
          },
        });
      cleanup.track("actors", attacker);
      await attacker.createEmbeddedDocuments("Item", [
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
      ]);
      const target = await Actor.create({
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
        });
      cleanup.track("actors", target);
      const scene = await Scene.create({
          name: `${label} player attack fixture`,
          width: 1500,
          height: 1000,
          grid: { type: 1, size: 100, distance: 5, units: "ft" },
          tokenVision: false,
          globalLight: true,
          // The first Scene in a world is otherwise activated and drawn
          // asynchronously by core, outside this document-creation phase.
          active: false,
        });
      cleanup.track("scenes", scene);
      const tokens = await scene.createEmbeddedDocuments("Token", [
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
            hidden: targetHidden,
          },
        ]),
        attackerToken = tokens.find(
          (token) =>
            token.actorId === attacker.id && token.name === attacker.name,
        ),
        targetToken = tokens.find(
          (token) =>
            token.actorId === target.id && token.name === target.name,
        );
      if (!attackerToken || !targetToken)
        throw new Error("Fixture tokens cannot be matched to their Actors.");
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
      const ability = attacker.items.find((item) => item.type === "ability"),
        weapon = attacker.items.find((item) => item.type === "equipment");
      if (!ability || !weapon)
        throw new Error("Fixture attacker Items were not created.");
      return {
        label,
        attacker: attacker.id,
        attackerActorUuid: attackerToken.actor.uuid,
        attackerTokenUuid: attackerToken.uuid,
        attackerTokenId: attackerToken.id,
        abilityId: ability.id,
        weaponId: weapon.id,
        target: target.id,
        targetActorUuid: targetToken.actor.uuid,
        targetTokenUuid: targetToken.uuid,
        targetTokenId: targetToken.id,
        targetType,
        scene: scene.id,
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
      targetHidden,
      cleanupRegistryKey,
    },
  );
  activeFixture = setup;

  // Synthetic-token effects emit canvas render flags, so this Scene must be
  // fully drawn before the effect and encounter phase starts.
  markDiagnostic(`${label}: view scenario`);
  await viewScenario(gm.page, setup);

  markDiagnostic(`${label}: create scenario effects and encounter`);
  const fixture = await gm.page.evaluate(
    async ({ fixture, wounds, cleanupRegistryKey }) => {
      const ID = "heroes-of-legend",
        cleanup = globalThis[cleanupRegistryKey],
        scene = game.scenes.get(fixture.scene),
        attacker = game.actors.get(fixture.attacker),
        target = game.actors.get(fixture.target),
        attackerToken = scene?.tokens.get(fixture.attackerTokenId),
        targetToken = scene?.tokens.get(fixture.targetTokenId);
      if (!cleanup) throw new Error("Fixture cleanup tracking is unavailable.");
      if (!scene || !attacker || !target || !attackerToken || !targetToken)
        throw new Error("Fixture documents are unavailable after viewing.");
      if (fixture.targetType === "creature")
        await targetToken.actor.createEmbeddedDocuments("ActiveEffect", [
          {
            _id: "holGrappleFixt01",
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
      const woundEffectIds = [];
      if (wounds) {
        const contexts = [
            ["physical", "physical activities", "holWoundPhys0001"],
            ["mental", "mental activities", "holWoundMental01"],
          ],
          woundEffects = await attackerToken.actor.createEmbeddedDocuments(
            "ActiveEffect",
            contexts
              .slice(0, wounds)
              .map(([context, printedContext, effectId], index) => ({
                _id: effectId,
                name: `Fixture wound ${index + 1} · rollModifier`,
                flags: {
                  [ID]: {
                    woundEvent: `fixture-wound-event-${index + 1}`,
                    woundModifier: {
                      kind: "rollModifier",
                      woundId: `wound-${context}-fixture`,
                      injury: `Fixture ${context} injury`,
                      source: {
                        path: "design/rules/wounds.md",
                        sha256: "c".repeat(64),
                      },
                      sourceCommit:
                        "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
                      polarity: "bane",
                      amount: 1,
                      context,
                      printedContext,
                      requiresContext: true,
                    },
                  },
                },
              })),
          );
        woundEffectIds.push(...woundEffects.map((effect) => effect.id));
      }
      const combat = await Combat.create({
        active: true,
        scene: scene.id,
        name: `${fixture.label} encounter`,
      });
      cleanup.track("combats", combat);
      const [attackerCombatant] = await combat.createEmbeddedDocuments(
        "Combatant",
        [
          {
            actorId: attacker.id,
            tokenId: attackerToken.id,
            sceneId: scene.id,
            name: attacker.name,
            flags: { [ID]: { side: "players" } },
          },
        ],
      ),
      { requestCombat, resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
      if (
        combat.scene?.uuid !== scene.uuid ||
        attackerCombatant.token?.uuid !== attackerToken.uuid ||
        attackerCombatant.actor?.uuid !== attackerToken.actor.uuid
      )
        throw new Error(
          "Player attack fixture Combat and Combatant did not resolve to one Scene token.",
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
      return {
        ...fixture,
        combat: combat.id,
        participant: attackerCombatant.id,
        woundEffectIds,
      };
    },
    {
      fixture: setup,
      wounds,
      cleanupRegistryKey,
    },
  );
  activeFixture = fixture;
  scenarios.push(fixture);
  return fixture;
}

async function viewScenario(page, fixture) {
  const viewState = {
    sceneId: fixture.scene,
    attackerTokenId: fixture.attackerTokenId,
    targetTokenId: fixture.targetTokenId,
  };
  await page.waitForFunction(
    ({ sceneId, attackerTokenId, targetTokenId }) => {
      const scene = game.scenes.get(sceneId);
      return Boolean(
        game.ready &&
          scene?.tokens.get(attackerTokenId) &&
          scene.tokens.get(targetTokenId) &&
          canvas.initialized &&
          !canvas.loading,
      );
    },
    viewState,
    { polling: 100 },
  );
  // Foundry scrolling status text owns a two-second animation. Let it finish
  // before Scene.view tears down its PIXI container.
  await page.waitForTimeout(2100);
  await page.evaluate(async (fixture) => {
    const scene = game.scenes.get(fixture.scene);
    if (!scene) throw new Error("The fixture Scene is unavailable.");
    if ((await scene.view()) !== scene)
      throw new Error("The fixture Scene view did not complete.");
  }, fixture);
  await page.waitForFunction(
    ({ sceneId, attackerTokenId, targetTokenId }) =>
      canvas.ready &&
      canvas.initialized &&
      !canvas.loading &&
      canvas.scene?.id === sceneId &&
      Boolean(
        canvas.tokens.get(attackerTokenId) &&
          canvas.tokens.get(targetTokenId),
      ),
    viewState,
    { polling: 100 },
  );
}

async function activateScenario(fixture) {
  markDiagnostic(`${fixture.label}: activate scenario`);
  await Promise.all([
    viewScenario(gm.page, fixture),
    viewScenario(player.page, fixture),
  ]);
  await Promise.all(
    [gm.page, player.page].map((page) =>
      page.evaluate((fixture) => {
        const acting = canvas.tokens.get(fixture.attackerTokenId),
          target = canvas.tokens.get(fixture.targetTokenId);
        if (!acting || !target)
          throw new Error("The active fixture tokens are unavailable.");
        acting.control({ releaseOthers: true });
        target.setTarget(true, { releaseOthers: true });
      }, fixture),
    ),
  );
}

async function updateFixtureToken(page, fixture, tokenId, changes) {
  await page.evaluate(
    async ({ sceneId, tokenId, changes }) => {
      const token = game.scenes.get(sceneId)?.tokens.get(tokenId);
      if (!token) throw new Error("The fixture Token is unavailable.");
      if (!(await token.update(changes, { animate: false })))
        throw new Error("The fixture Token update failed.");
      await token.movement.animation.ended;
    },
    { sceneId: fixture.scene, tokenId, changes },
  );
  await Promise.all(
    [gm.page, player.page].map((clientPage) =>
      clientPage.waitForFunction(
        ({ sceneId, tokenId, changes }) => {
          const token = game.scenes.get(sceneId)?.tokens.get(tokenId),
            placeable =
              canvas.scene?.id === sceneId
                ? canvas.tokens.get(tokenId)
                : null;
          if (
            !canvas.ready ||
            canvas.scene?.id !== sceneId ||
            !token ||
            !Object.entries(changes).every(
              ([key, value]) => token[key] === value,
            )
          )
            return false;
          if (("x" in changes || "y" in changes) && !placeable) return false;
          return (
            !placeable ||
            (placeable.position.x === token.x &&
              placeable.position.y === token.y)
          );
        },
        { sceneId: fixture.scene, tokenId, changes },
      ),
    ),
  );
}

async function requestData(fixture, selection = {}) {
  markDiagnostic(`${fixture.label}: prepare request`);
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

async function waitForAttackCard(fixture) {
  const outcome = await (
    await player.page.waitForFunction((fixture) => {
      const combatUuid = game.combats.get(fixture.combat)?.uuid,
        message = game.messages.contents.findLast(
          (candidate) =>
            candidate.getFlag("heroes-of-legend", "playerAttackRequest")
              ?.combatUuid === combatUuid,
        );
      if (!message) return null;
      if (
        message.getFlag("heroes-of-legend", "playerAttack")?.combatId ===
        fixture.combat
      )
        return { status: "complete", id: message.id };
      const status = message.getFlag(
        "heroes-of-legend",
        "playerAttackStatus",
      );
      return ["failed", "interrupted"].includes(status)
        ? { status, id: message.id, content: message.content }
        : null;
    }, fixture)
  ).jsonValue();
  if (outcome.status !== "complete")
    throw new Error(
      `Basic Melee request ${outcome.id} ${outcome.status}: ${outcome.content}`,
    );
  return outcome.id;
}

async function mainState(fixture) {
  return gm.page.evaluate((fixture) => {
    const combat = game.combats.get(fixture.combat),
      state = combat.getFlag("heroes-of-legend", "encounter");
    return state.budgets[fixture.participant].remaining.main;
  }, fixture);
}

try {
  gm = await join("Gamemaster");
  await initializeCleanupRegistry();
  await assertCoordinatorUnbound();
  authorityClaimed = true;
  const createdUsers = await (async () => {
    return gm.page.evaluate(async (cleanupRegistryKey) => {
      const cleanup = globalThis[cleanupRegistryKey],
        owner = await User.create({
          name: `Basic Melee owner ${foundry.utils.randomID(5)}`,
          role: CONST.USER_ROLES.PLAYER,
        });
      cleanup.track("users", owner);
      const targetOwner = await User.create({
          name: `PvP target owner ${foundry.utils.randomID(5)}`,
          role: CONST.USER_ROLES.PLAYER,
        });
      cleanup.track("users", targetOwner);
      return { owner: owner.id, targetOwner: targetOwner.id };
    }, cleanupRegistryKey);
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
  assert.equal(baseline.basis.geometry.status, "adjacent");
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

  const hiddenTarget = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Hidden target",
    targetHidden: true,
  });
  markDiagnostic(`${hiddenTarget.label}: player visibility`);
  await Promise.all([
    viewScenario(player.page, hiddenTarget),
    viewScenario(gm.page, hiddenTarget),
  ]);
  const hiddenForPlayer = await player.page.evaluate(async (fixture) => {
    const scene = game.scenes.get(fixture.scene);
    canvas.tokens.get(fixture.attackerTokenId).control({ releaseOthers: true });
    const actor = await fromUuid(fixture.attackerActorUuid),
      targetToken = scene.tokens.get(fixture.targetTokenId),
      { basicMeleeDialogContext } = await import(
        "/systems/heroes-of-legend/services/player-attacks.mjs"
      ),
      context = basicMeleeDialogContext(
        actor.items.get(fixture.abilityId),
        game.combats.get(fixture.combat),
        fixture.participant,
        {
          weaponItemUuid: actor.items.get(fixture.weaponId).uuid,
          targetTokenUuid: fixture.targetTokenUuid,
          draft: { woundApplicability: {} },
        },
      );
    return {
      nativeVisible: targetToken.object?.isVisible,
      targetUuids: context.targets.map((target) => target.uuid),
      reasons: context.reasons,
    };
  }, hiddenTarget);
  assert.equal(hiddenForPlayer.nativeVisible, false);
  assert.deepEqual(hiddenForPlayer.targetUuids, []);
  assert.match(hiddenForPlayer.reasons.join(" "), /not visible or available/);
  await assert.rejects(
    () => requestData(hiddenTarget),
    /not visible or available/,
  );
  markDiagnostic(`${hiddenTarget.label}: GM visibility`);
  const hiddenForGm = await gm.page.evaluate(async (fixture) => {
    const scene = game.scenes.get(fixture.scene);
    canvas.tokens.get(fixture.attackerTokenId).control({ releaseOthers: true });
    const actor = await fromUuid(fixture.attackerActorUuid),
      targetToken = scene.tokens.get(fixture.targetTokenId),
      { basicMeleeDialogContext, playerBasicMeleeRequestData } = await import(
        "/systems/heroes-of-legend/services/player-attacks.mjs"
      ),
      context = basicMeleeDialogContext(
        actor.items.get(fixture.abilityId),
        game.combats.get(fixture.combat),
        fixture.participant,
        {
          weaponItemUuid: actor.items.get(fixture.weaponId).uuid,
          targetTokenUuid: fixture.targetTokenUuid,
          draft: { woundApplicability: {} },
        },
      ),
      request = playerBasicMeleeRequestData(
        actor.items.get(fixture.abilityId),
        game.combats.get(fixture.combat),
        fixture.participant,
        {
          weaponItemUuid: actor.items.get(fixture.weaponId).uuid,
          targetTokenUuid: fixture.targetTokenUuid,
          draft: { woundApplicability: {} },
        },
      );
    return {
      nativeVisible: targetToken.object?.isVisible,
      targetUuids: context.targets.map((target) => target.uuid),
      targetTokenUuid: context.targetTokenUuid,
      requestTargetUuid: request.basis.targetTokenUuid,
    };
  }, hiddenTarget);
  assert.equal(hiddenForGm.nativeVisible, true);
  assert.deepEqual(hiddenForGm.targetUuids, [hiddenTarget.targetTokenUuid]);
  assert.equal(hiddenForGm.targetTokenUuid, hiddenTarget.targetTokenUuid);
  assert.equal(hiddenForGm.requestTargetUuid, hiddenTarget.targetTokenUuid);

  const woundScenario = await makeScenario({
    ownerId: users.owner,
    targetOwnerId: users.targetOwner,
    targetType: "creature",
    label: "Wounds",
    wounds: 2,
  });
  await activateScenario(woundScenario);
  await player.page.evaluate(async (fixture) => {
    const actor = await fromUuid(fixture.attackerActorUuid),
      { BasicMeleeDialog } = await import(
        "/systems/heroes-of-legend/dialogs/player-attack.mjs"
      );
    window.holWoundDialog = new BasicMeleeDialog(
      actor.items.get(fixture.abilityId),
      game.combats.get(fixture.combat),
      fixture.participant,
    );
    await window.holWoundDialog.render({ force: true });
  }, woundScenario);
  const woundDialog = player.page.locator(".hol-player-attack");
  await woundDialog.locator(".hol-wound-context").first().waitFor();
  assert.equal(await woundDialog.locator("select[name=weaponItemUuid] option").count(), 2);
  assert.equal(await woundDialog.locator("select[name=targetTokenUuid]").inputValue(), woundScenario.targetTokenUuid);
  assert.equal(await woundDialog.locator(".hol-wound-context").count(), 2);
  const woundEffectOrder = await woundDialog
    .locator(".hol-wound-context")
    .evaluateAll((fieldsets) =>
      fieldsets.map((fieldset) => fieldset.dataset.effectId),
    );
  const woundAttack = woundDialog.getByRole("button", {
    name: "Commit one Main Action and roll",
    exact: true,
  });
  assert.equal(await woundAttack.isEnabled(), false);
  for (const index of [0, 1])
    await woundDialog
      .locator(`select[name="wound-${index}"]`)
      .selectOption("applies");
  await player.page.waitForFunction(
    () =>
      !document.querySelector(
        ".hol-player-attack [data-action=attack]",
      )?.disabled,
  );
  await gm.page.evaluate(
    async ({ fixture, effectId }) =>
      (await fromUuid(fixture.attackerActorUuid)).updateEmbeddedDocuments(
        "ActiveEffect",
        [
          {
            _id: effectId,
            "flags.heroes-of-legend.woundModifier.amount": 2,
          },
        ],
      ),
    { fixture: woundScenario, effectId: woundEffectOrder[0] },
  );
  await woundDialog
    .getByRole("alert")
    .filter({ hasText: "Active wound modifiers changed" })
    .waitFor();
  assert.deepEqual(
    await woundDialog
      .locator(".hol-wound-context select")
      .evaluateAll((selects) => selects.map((select) => select.value)),
    ["", ""],
  );
  assert.equal(await woundAttack.isEnabled(), false);
  await woundDialog
    .locator(`select[name="wound-0"]`)
    .selectOption("applies");
  await woundDialog
    .locator(`select[name="wound-1"]`)
    .selectOption("does-not-apply");
  await player.page.waitForFunction(
    () =>
      !document.querySelector(
        ".hol-player-attack [data-action=attack]",
      )?.disabled,
  );
  await woundAttack.click();
  const woundAttackId = await waitForAttackCard(woundScenario);
  const woundResult = await gm.page.evaluate(
    ({ fixture, id }) => {
      const operation = game.combats
          .get(fixture.combat)
          .getFlag("heroes-of-legend", "playerAttackOperations")[id],
        snapshot = operation.result.snapshot;
      return {
        draft: operation.draft.woundApplicability,
        saved: snapshot.woundApplicability,
        woundEffects: snapshot.sources
          .filter((source) => source.wound)
          .map((source) => source.wound.effectId),
        woundAmounts: snapshot.sources
          .filter((source) => source.wound)
          .map((source) => source.amount),
      };
    },
    { fixture: woundScenario, id: woundAttackId },
  );
  const expectedWoundApplicability = Object.fromEntries(
    woundEffectOrder.map((effectId, index) => [
      effectId,
      index === 0 ? "applies" : "does-not-apply",
    ]),
  );
  assert.deepEqual(woundResult.draft, expectedWoundApplicability);
  assert.deepEqual(woundResult.saved, expectedWoundApplicability);
  assert.deepEqual(woundResult.woundEffects, [woundEffectOrder[0]]);
  assert.deepEqual(woundResult.woundAmounts, [2]);

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
      await fromUuid(fixture.attackerTokenUuid),
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
      await fromUuid(fixture.attackerTokenUuid),
      await fromUuid(fixture.targetTokenUuid),
    );
  }, blockedFootprints);
  assert.equal(blockedGeometry.status, "unverified");
  assert.equal(blockedGeometry.collision, "blocked");
  await activateScenario(primary);

  const staleCases = [
    {
      name: "weapon",
      expected: /Hold a compatible melee weapon/,
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
      expected: /within one adjacent square/,
      mutate: async (fixture) =>
        updateFixtureToken(
          gm.page,
          fixture,
          fixture.targetTokenId,
          { x: 900 },
        ),
      restore: async (fixture) =>
        updateFixtureToken(
          gm.page,
          fixture,
          fixture.targetTokenId,
          { x: 200 },
        ),
    },
    {
      name: "visibility",
      expected: /hidden from its request author/,
      mutate: async (fixture) =>
        updateFixtureToken(
          gm.page,
          fixture,
          fixture.targetTokenId,
          { hidden: true },
        ),
      restore: async (fixture) =>
        updateFixtureToken(
          gm.page,
          fixture,
          fixture.targetTokenId,
          { hidden: false },
        ),
    },
    {
      name: "source",
      expected: /weapon, target, roll sources or adjacency changed/,
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
    markDiagnostic(`${primary.label}: stale ${stale.name}`);
    const id = await stageRequest(baseline);
    await stale.mutate(primary);
    await bind();
    const result = await resolveAttack(id);
    assert.match(result.error ?? "", stale.expected);
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
  markDiagnostic(`${nonadjacent.label}: DA exception request`);
  await updateFixtureToken(
    gm.page,
    nonadjacent,
    nonadjacent.targetTokenId,
    { x: 900 },
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
  const attackId = await waitForAttackCard(primary);
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
        dice: message.rolls[0]
          ? JSON.parse(JSON.stringify(message.rolls[0].toJSON()))
          : null,
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
  await gm.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await gm.page
    .locator(`#chat [data-message-id="${attackId}"]`)
    .scrollIntoViewIfNeeded();
  await gm.page.waitForTimeout(500);
  await gm.page.screenshot({ path: "test-results/player-basic-melee-chat.png" });
  markDiagnostic("Primary: exact replay");
  const replay = await resolveAttack(attackId);
  assert.equal(replay.result.replay, true);
  assert.equal(
    await gm.page.evaluate(
      (id) => JSON.stringify(game.messages.get(id).rolls[0].toJSON()),
      attackId,
  ),
    JSON.stringify(rolled.dice),
  );
  assert.equal(await mainState(primary), 0);

  markDiagnostic("Primary: forged projection recovery");
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
        roll: JSON.parse(JSON.stringify(message.rolls[0].toJSON())),
        authoritativeRoll: operation.result.roll,
      };
    },
    { fixture: primary, id: attackId },
  );
  assert.equal(restoredProjection.damage, rolled.damage);
  assert.equal(restoredProjection.recovery, null);
  assert.deepEqual(restoredProjection.roll, restoredProjection.authoritativeRoll);

  markDiagnostic("Primary: reload and damage once");
  await player.page.reload();
  await waitForClientReady(player.page);
  await player.page.waitForFunction(
    (id) => Boolean(game.messages.get(id)?.getFlag("heroes-of-legend", "roll")),
    attackId,
  );

  await gm.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await gm.page
    .locator(`#chat [data-message-id="${attackId}"] .hol-player-attack-damage`)
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
    .locator(`#chat [data-message-id="${attackId}"] .hol-player-attack-damage`)
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
    /pending encounter action|No main|condition prevents|The encounter changed/,
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
          roll: game.messages.get(id).getFlag("heroes-of-legend", "roll") ?? null,
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
        operationWoundApplicability:
          operation.result.snapshot.woundApplicability,
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
  assert.deepEqual(recovery.operationWoundApplicability, {});
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
        chatRoll: message.getFlag("heroes-of-legend", "roll") ?? null,
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
      roll: JSON.parse(JSON.stringify(message.rolls[0].toJSON())),
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
        {
          acknowledgeMissingPlayerBasicMeleePresentation,
          recoverPlayerBasicMeleeRequest,
          playerBasicMeleeDamage,
          pendingPlayerAttacks,
        } = await import(
          "/systems/heroes-of-legend/services/player-attacks.mjs"
        ),
        { DamagePanel } = await import(
          "/systems/heroes-of-legend/applications/damage.mjs"
        ),
        { AuthorityPanel } = await import(
          "/systems/heroes-of-legend/applications/authority.mjs"
        );
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Deleted-source recovery rerolled dice");
      };
      let combat, pendingAfterRecovery;
      try {
        await recoverPlayerBasicMeleeRequest(id, {
          retained: [2, 3, 4],
          reason: "DA preserved the observed deleted-source dice",
        });
        combat = game.combats.get(fixture.combat);
        pendingAfterRecovery = combat.getFlag(
          "heroes-of-legend",
          "pendingAbility",
        );
        await acknowledgeMissingPlayerBasicMeleePresentation(id, {
          reason:
            "DA acknowledged the deleted presentation and preserved its result",
        });
      } finally {
        foundry.dice.Roll.prototype.evaluate = original;
      }
      const operation = combat.getFlag(
          "heroes-of-legend",
          "playerAttackOperations",
        )[id],
        receipt = combat.getFlag("heroes-of-legend", "operationReceipts")[id],
        damage = playerBasicMeleeDamage(id),
        pendingAfterAcknowledgement = combat.getFlag(
          "heroes-of-legend",
          "pendingAbility",
        );
      await combat.update({
        "flags.heroes-of-legend.pendingAbility": "unrelated-action",
      });
      await acknowledgeMissingPlayerBasicMeleePresentation(id, {
        reason: "Idempotent acknowledgement replay",
      });
      const unrelatedPending = combat.getFlag(
          "heroes-of-legend",
          "pendingAbility",
        ),
        authorityContext = await new AuthorityPanel()._prepareContext(),
        authorityAttack = authorityContext.pendingAttacks.find(
          (entry) => entry.id === id,
        ),
        damageTarget = await fromUuid(damage.actorUuid),
        damagePanel = new DamagePanel(damageTarget, null, id),
        damagePanelContext = await damagePanel._prepareContext({});
      await combat.update({
        "flags.heroes-of-legend.pendingAbility": null,
      });
      return {
        result: operation.result,
        receipt,
        damage,
        pendingAfterRecovery,
        pendingAfterAcknowledgement,
        unrelatedPending,
        unrelatedPendingVisible: authorityContext.pendingAbilities.some(
          (entry) =>
            entry.combatUuid === combat.uuid &&
            entry.id === "unrelated-action",
        ),
        authorityAttack,
        attention: pendingPlayerAttacks(combat).includes(id),
        damagePanel: {
          actorUuid: damageTarget.uuid,
          fromAttack: damagePanelContext.fromAttack,
          lockedSource: damagePanelContext.lockedSource,
          amount: damagePanelContext.rows.find(
            (row) => row.type === "physical",
          )?.amount,
        },
      };
    },
    { id: deletedId, fixture: deletedSource },
  );
  assert.equal(deletedRecovery.result.roll, null);
  assert.deepEqual(deletedRecovery.result.snapshot.retained, [2, 3, 4]);
  assert.equal(deletedRecovery.receipt.presentation, "missing");
  assert.match(
    deletedRecovery.receipt.presentationAcknowledgement.reason,
    /preserved its result/,
  );
  assert.equal(deletedRecovery.damage.components[0].amount, 3);
  assert.equal(deletedRecovery.damage.actorUuid, deletedSource.targetActorUuid);
  assert.equal(deletedRecovery.pendingAfterRecovery, deletedId);
  assert.equal(deletedRecovery.pendingAfterAcknowledgement, null);
  assert.equal(deletedRecovery.unrelatedPending, "unrelated-action");
  assert.equal(deletedRecovery.unrelatedPendingVisible, true);
  assert.equal(deletedRecovery.authorityAttack.acknowledged, true);
  assert.equal(deletedRecovery.authorityAttack.sourceAvailable, false);
  assert.equal(deletedRecovery.authorityAttack.damageAvailable, true);
  assert.equal(deletedRecovery.attention, true);
  assert.deepEqual(deletedRecovery.damagePanel, {
    actorUuid: deletedSource.targetActorUuid,
    fromAttack: true,
    lockedSource: true,
    amount: 3,
  });
  const deletedDamage = await gm.page.evaluate(async ({ id, fixture }) => {
    const { damageBasis, requestDamage, resolveDamageRequest } = await import(
      "/systems/heroes-of-legend/services/damage.mjs"
    );
    const actor = await fromUuid(fixture.targetActorUuid);
    const before = actor.system.health.value;
    const after = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const message = await requestDamage(actor, damageBasis(actor), {
        components: [{ type: "physical", amount: 99 }],
        resistances: [],
        weaknesses: [],
        reason: "Preserved deleted-source Basic Melee result",
      }, null, id);
      await resolveDamageRequest(message.id);
      after.push(actor.system.health.value);
    }
    return { before, after, record: actor.getFlag(
      "heroes-of-legend", "damageEvents"
    )?.[`player-basic-melee-${id}`] };
  }, { id: deletedId, fixture: deletedSource });
  assert.equal(deletedDamage.before, 12);
  assert.deepEqual(deletedDamage.after, [10, 10]);
  assert.equal(deletedDamage.record.attackMessageId, deletedId);
  assert.equal(deletedDamage.record.event.total, 2);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native target visibility with DA adjudication, wound applicability refresh, encounter preservation, 5-unit grid-space adjacency, large footprints, collision-blocked geometry, reasoned nonadjacency exception, authoritative result projection/replay, forged roll/recovery and hidden-target rejection, late presentation recovery, acknowledged deleted-source recovery with operation-ID damage, PvP one-roll, Main once and linked damage deduplication.",
  );
} catch (error) {
  const diagnostics = {
    label: scenarioDiagnostic,
    pageErrors: errors.slice(-10),
  };
  if (gm?.page && !gm.page.isClosed())
    diagnostics.gm = await gm.page
      .evaluate((fixture) => {
        const scene = fixture ? game.scenes.get(fixture.scene) : null;
        return {
          gameReady: game.ready,
          fixture: fixture
            ? {
                sceneFound: Boolean(scene),
                attackerTokenFound: Boolean(
                  scene?.tokens.get(fixture.attackerTokenId),
                ),
                targetTokenFound: Boolean(
                  scene?.tokens.get(fixture.targetTokenId),
                ),
              }
            : null,
          canvas: {
            ready: canvas.ready,
            initialized: canvas.initialized,
            loading: canvas.loading,
            sceneId: canvas.scene?.id ?? null,
          },
          messages: JSON.stringify(
            game.messages.contents
              .filter((message) =>
                message.getFlag("heroes-of-legend", "playerAttackRequest"),
              )
              .slice(-4)
              .map((message) => ({
                id: message.id,
                content: message.content,
                status: message.getFlag(
                  "heroes-of-legend",
                  "playerAttackStatus",
                ),
                complete: Boolean(
                  message.getFlag("heroes-of-legend", "playerAttack"),
                ),
              })),
          ),
        };
      }, activeFixture)
      .catch((diagnosticError) => ({
        error: diagnosticError.message,
      }));
  if (player?.page && !player.page.isClosed())
    diagnostics.player = await player.page
      .evaluate((fixture) => {
        const combat = fixture ? game.combats.get(fixture.combat) : null;
        return {
          combatFound: Boolean(combat),
          matches: JSON.stringify(
            game.messages.contents
              .filter((message) =>
                message.getFlag("heroes-of-legend", "playerAttackRequest"),
              )
              .slice(-4)
              .map((message) => ({
                id: message.id,
                requestCombatUuid: message.getFlag(
                  "heroes-of-legend",
                  "playerAttackRequest",
                )?.combatUuid,
                combatUuid: combat?.uuid ?? null,
                status: message.getFlag(
                  "heroes-of-legend",
                  "playerAttackStatus",
                ),
                complete: Boolean(
                  message.getFlag("heroes-of-legend", "playerAttack"),
                ),
              })),
          ),
          canvas: {
            ready: canvas.ready,
            initialized: canvas.initialized,
            loading: canvas.loading,
            sceneId: canvas.scene?.id ?? null,
          },
        };
      }, activeFixture)
      .catch((diagnosticError) => ({
        error: diagnosticError.message,
      }));
  console.error(
    `Attack fixture diagnostics [${scenarioDiagnostic}]:`,
    diagnostics,
  );
  if (error instanceof Error) {
    error.message = `[${scenarioDiagnostic}] ${error.message}`;
    error.stack = `${error.name}: ${error.message}\n${(
      error.stack ?? ""
    )
      .split("\n")
      .slice(1)
      .join("\n")}`;
  }
  throw error;
} finally {
  try {
    await player?.context.close();
  } catch (error) {
    console.error("Player cleanup:", error.message);
    process.exitCode = 1;
  }
  if (gm?.page && !gm.page.isClosed()) {
    if (authorityClaimed) {
      await gm.page
        .evaluate(async () => {
          const { isCreationAuthority, releaseAuthority } = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          );
          if (isCreationAuthority()) await releaseAuthority();
        })
        .catch((error) => {
          console.error("Coordinator cleanup:", error.message);
          process.exitCode = 1;
        });
    }
    await gm.page
      .evaluate(
        async ({ scenarios, cleanupRegistryKey }) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const cleanup = globalThis[cleanupRegistryKey] ?? {
              users: [],
              actors: [],
              scenes: [],
              combats: [],
            },
            combats = new Set([
              ...cleanup.combats.map((id) => `Combat.${id}`),
              ...scenarios.map((fixture) => `Combat.${fixture.combat}`),
            ]),
            actors = new Set([
              ...cleanup.actors.map((id) => `Actor.${id}`),
              ...scenarios.flatMap((fixture) => [
                fixture.attackerActorUuid,
                fixture.targetActorUuid,
              ]),
            ]);
          for (const message of game.messages.filter(
            (message) =>
              combats.has(message.getFlag("heroes-of-legend", "combatRequest")?.combatUuid) ||
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
          for (const id of combats)
            await (await fromUuid(id))?.delete();
          for (const id of cleanup.scenes)
            await game.scenes.get(id)?.delete();
          for (const id of cleanup.actors)
            await game.actors.get(id)?.delete();
          for (const id of cleanup.users)
            await game.users.get(id)?.delete();
          delete globalThis[cleanupRegistryKey];
        },
        { scenarios, cleanupRegistryKey },
      )
      .catch((error) => {
        console.error("Fixture cleanup:", error.message);
        process.exitCode = 1;
      });
  } else if (authorityClaimed) {
    console.error("Fixture cleanup: the GM page is unavailable.");
    process.exitCode = 1;
  }
  try {
    await browser.close();
  } catch (error) {
    console.error("Browser cleanup:", error.message);
    process.exitCode = 1;
  }
}
