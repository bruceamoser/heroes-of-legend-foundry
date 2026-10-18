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
const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  }),
  errors = [];
let gm, player, fixture, attack;
async function join(name, canvas = false) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript((canvas) => {
    localStorage.setItem("core.noCanvas", String(!canvas));
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  }, canvas);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  if (canvas)
    await page.waitForFunction(() => game.canvas.initialized && !game.canvas.loading);
  return { context, page };
}
async function screenshot(label) {
  await player.page
    .locator(".hol-roll-dialog")
    .screenshot({ path: `test-results/${label}.png` });
}
async function openPrompt(id = attack) {
  await player.page.evaluate(
    async ({ actor, attack }) => {
      const { promptDefenseRoll } = await import(
        "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
      );
      await promptDefenseRoll(game.actors.get(actor), "agility", {
        attackMessageId: attack,
      });
    },
    { actor: fixture.hero, attack: id },
  );
  return player.page.locator(".hol-roll-dialog");
}
async function closePrompt(dialog) {
  await dialog.locator("[data-action=close]").click();
  await dialog.waitFor({ state: "detached" });
}
async function createAttack(options = {}) {
  return gm.page.evaluate(
    async ({ f, options }) => {
      const message = await ChatMessage.create({
        content: "Shield Block runtime defense fixture",
        flags: {
          "heroes-of-legend": {
            attackCard: {},
          },
        },
      });
      globalThis.__holShieldBlockFixture.attackIds.push(message.id);
      const snapshot = {
        id: message.id,
        actorUuid: `Actor.${f.npc}`,
        attackerName: "Shield break fixture",
        attributeKey: "agility",
        threat: { boons: 0, banes: 0 },
        damage: { weak: 2, standard: 3, strong: 4 },
        suggestedDefenderTokenUuids: [f.token],
        perspective: "defender",
        title: "Basic Melee",
        ...(options.legacy
          ? {}
          : {
              blockable: options.blockable,
              hasBlockableJudgment: true,
              combatId: f.combat,
            }),
      };
      await game.combats.get(f.combat).update({
        [`flags.heroes-of-legend.attacks.${message.id}`]: snapshot,
        [`flags.heroes-of-legend.operationReceipts.${message.id}`]: {
          applied: true,
          kind: "npc-attack",
        },
      });
      await message.update({
        content: "Shield Block runtime defense fixture",
        [`flags.heroes-of-legend.attackCard`]: snapshot,
      });
      return message.id;
    },
    { f: fixture, options },
  );
}
async function state() {
  return gm.page.evaluate((f) => {
    const combat = game.combats.get(f.combat),
      encounter = combat.getFlag("heroes-of-legend", "encounter"),
      hero = game.actors.get(f.hero);
    return {
      current: encounter.current,
      budget: encounter.budgets[f.heroCombatant],
      pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
      effects: hero.effects.map((effect) => ({
        id: effect.id,
        key: effect.getFlag("heroes-of-legend", "benefit")?.key,
        disabled: effect.disabled,
      })),
      items: hero.items.map((item) => ({
        id: item.id,
        type: item.type,
        held: item.system?.held,
      })),
    };
  }, fixture);
}
async function actorState(combatantId) {
  return gm.page.evaluate(
    ({ combatId, combatantId }) => {
      const combat = game.combats.get(combatId),
        encounter = combat.getFlag("heroes-of-legend", "encounter"),
        combatant = combat.combatants.get(combatantId),
        actor = combatant?.actor;
      if (!actor)
        throw new Error(`Fixture combatant ${combatantId} has no actor.`);
      return {
        pending: combat.getFlag("heroes-of-legend", "pendingAbility"),
        budget: encounter.budgets[combatantId],
        effects: actor.effects.map((effect) => ({
          id: effect.id,
          key: effect.getFlag("heroes-of-legend", "benefit")?.key,
        })),
        shieldHeld: actor.items.find(
          (item) => item.system?.catalogId === "item-ordinary-shield",
        )?.system.held,
      };
    },
    { combatId: fixture.combat, combatantId },
  );
}
async function waitForAbility(definitionId, actorId = fixture.hero) {
  return gm.page.evaluate(
    async ({ definitionId, actorUuid, combatUuid }) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const message = game.messages.find((entry) => {
          const request = entry.getFlag("heroes-of-legend", "abilityRequest");
          const status = entry.getFlag("heroes-of-legend", "abilityStatus");
          return (
            request?.actorUuid === actorUuid &&
            request?.combatUuid === combatUuid &&
            status?.definitionId === definitionId &&
            status?.status === "complete"
          );
        });
        if (message) return message.id;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for ${definitionId}.`);
    },
    {
      definitionId,
      actorUuid: `Actor.${actorId}`,
      combatUuid: `Combat.${fixture.combat}`,
    },
  );
}
try {
  gm = await join("Gamemaster", true);
  fixture = await gm.page.evaluate(async () => {
    const created = (globalThis.__holShieldBlockFixture = {
      attackIds: [],
    });
    const player = await User.create({
      name: `Shield player ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    Object.assign(created, { player: player.id, playerName: player.name });
    const npc = await Actor.create({
      name: "Shield attack NPC",
      type: "creature",
      system: {
        threat: { boons: 0, banes: 0 },
        basicMelee: { weak: 2, standard: 3, strong: 4 },
      },
    });
    created.npc = npc.id;
    const hero = await Actor.create({
      name: "Non-owner shield defender",
      type: "character",
      ownership: { [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: {
        "heroes-of-legend": {
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    created.hero = hero.id;
    const interruptionHero = await Actor.create({
      name: "Interrupted shield defender",
      type: "character",
      ownership: { [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: {
        "heroes-of-legend": {
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    created.interruptionHero = interruptionHero.id;
    const { ABILITY_DEFINITIONS } = await import(
      "/systems/heroes-of-legend/rules/ability-definitions.mjs"
    );
    const items = await hero.createEmbeddedDocuments("Item", [
      {
        name: "Defend",
        type: "ability",
        flags: {
          "heroes-of-legend": {
            catalogId: "ability-defend",
            source: ABILITY_DEFINITIONS["ability-defend"].source,
            automation: "pending",
          },
        },
      },
      {
        name: "Shield Block",
        type: "ability",
        flags: {
          "heroes-of-legend": {
            catalogId: "ability-shield-block",
            source: ABILITY_DEFINITIONS["ability-shield-block"].source,
            automation: "pending",
          },
        },
      },
      {
        name: "Renamed shield",
        type: "equipment",
        system: {
          catalogId: "item-ordinary-shield",
          quantity: 1,
          bulk: 1,
          hands: 1,
          held: false,
        },
      },
    ]);
    const interruptionItems = await interruptionHero.createEmbeddedDocuments(
      "Item",
      [
        {
          name: "Shield Block",
          type: "ability",
          flags: {
            "heroes-of-legend": {
              catalogId: "ability-shield-block",
              source: ABILITY_DEFINITIONS["ability-shield-block"].source,
              automation: "pending",
            },
          },
        },
        {
          name: "Stable shield",
          type: "equipment",
          system: {
            catalogId: "item-ordinary-shield",
            quantity: 1,
            bulk: 1,
            hands: 1,
            held: true,
          },
        },
      ],
    );
    const scene = await Scene.create({
      name: "Shield Block defense targets",
      active: false,
      width: 1000,
      height: 1000,
    });
    created.scene = scene.id;
    const [token] = await scene.createEmbeddedDocuments("Token", [
      {
        name: hero.name,
        actorId: hero.id,
        actorLink: true,
        x: 100,
        y: 100,
      },
    ]);
    created.token = token.uuid;
    await scene.view();
    canvas.tokens.get(token.id).setTarget(true, { releaseOthers: true });
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
      {
        actorId: interruptionHero.id,
        name: interruptionHero.name,
        flags: { "heroes-of-legend": { side: "players" } },
      },
    ]);
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    const { requestCombat, resolveCombatRequest } = await import(
      "/systems/heroes-of-legend/services/combat.mjs"
    );
    await bindCreationAuthority();
    await resolveCombatRequest((await requestCombat(combat, "start")).id);
    let current = combat.getFlag("heroes-of-legend", "encounter");
    const heroCombatant = combatants.find((entry) => entry.actorId === hero.id),
      npcCombatant = combatants.find((entry) => entry.actorId === npc.id);
    Object.assign(created, {
      heroCombatant: heroCombatant.id,
      npcCombatant: npcCombatant.id,
      interruptionCombatant: combatants.find(
        (entry) => entry.actorId === interruptionHero.id,
      ).id,
    });
    if (current.nextSide === "opposition") {
      await resolveCombatRequest(
        (
          await requestCombat(combat, "choose", {
            id: npcCombatant.id,
          })
        ).id,
      );
      await resolveCombatRequest((await requestCombat(combat, "finish")).id);
    }
    await resolveCombatRequest(
      (
        await requestCombat(combat, "choose", {
          id: heroCombatant.id,
        })
      ).id,
    );
    await npc.sheet.render({ force: true });
    Object.assign(created, {
      defendItem: items.find((item) => item.name === "Defend").uuid,
      shieldItem: items.find((item) => item.name === "Renamed shield").id,
      interruptionShieldItem: interruptionItems.find(
        (item) => item.name === "Stable shield",
      ).id,
      interruptionShieldUuid: interruptionItems.find(
        (item) => item.name === "Stable shield",
      ).uuid,
      interruptionShieldAbility: interruptionItems.find(
        (item) => item.name === "Shield Block",
      ).uuid,
    });
    return created;
  });
  player = await join(fixture.playerName);
  assert.equal(
    await player.page.evaluate(
      (id) => game.actors.get(id).isOwner,
      fixture.hero,
    ),
    false,
  );

  // Defend is a maneuver on the defender's own turn.
  await gm.page.evaluate(async (uuid) => {
    await (await fromUuid(uuid)).sheet.render({ force: true });
  }, fixture.defendItem);
  await gm.page
    .locator(".hol-ability")
    .getByRole("button", { name: "Use Defend", exact: true })
    .click();
  await waitForAbility("ability-defend");
  await gm.page.locator(".hol-ability [data-action=close]").click();
  let s = await state();
  assert.equal(s.budget.remaining.maneuver, 0);
  assert.deepEqual(
    s.effects.map((effect) => effect.key),
    ["defend"],
  );

  // End the hero's turn and create a real GM NPC attack with an explicit judgment.
  await gm.page.evaluate(async (f) => {
    const combat = game.combats.get(f.combat),
      { requestCombat, resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
    await resolveCombatRequest((await requestCombat(combat, "finish")).id);
    if (
      combat.getFlag("heroes-of-legend", "encounter").nextSide === "players"
    ) {
      await resolveCombatRequest(
        (await requestCombat(combat, "choose", { id: f.interruptionCombatant }))
          .id,
      );
      await resolveCombatRequest((await requestCombat(combat, "finish")).id);
    }
    await resolveCombatRequest(
      (
        await requestCombat(combat, "choose", {
          id: f.npcCombatant,
        })
      ).id,
    );
  }, fixture);
  await gm.page.locator("[data-npc-blockable]").selectOption("true");
  await gm.page
    .locator(".hol-creature")
    .getByRole("button", { name: "Declare NPC Basic Melee", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      game.messages.some(
        (message) =>
          message.getFlag("heroes-of-legend", "attackCard")?.blockable ===
            true &&
          message.getFlag("heroes-of-legend", "attackCard")?.combatId ===
            f.combat,
      ),
    fixture,
  );
  attack = await gm.page.evaluate(
    (f) =>
      game.messages.find(
        (message) =>
          message.getFlag("heroes-of-legend", "attackCard")?.blockable ===
            true &&
          message.getFlag("heroes-of-legend", "attackCard")?.combatId ===
            f.combat,
      ).id,
    fixture,
  );
  await gm.page.evaluate(
    (id) => globalThis.__holShieldBlockFixture.attackIds.push(id),
    attack,
  );
  assert.equal((await state()).current, fixture.npcCombatant);

  // The non-owner player sees the off-turn choice and the missing held shield.
  await player.page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("chat", "primary");
  });
  await player.page
    .locator(`[data-message-id="${attack}"] .hol-defend-button`)
    .filter({ visible: true })
    .first()
    .click();
  let dialog = player.page.locator(".hol-roll-dialog");
  assert(
    await dialog.getByRole("button", { name: /Shield Block/ }).isDisabled(),
  );
  assert.match(await dialog.innerText(), /A held shield is required/);
  assert.match(
    await dialog.locator(".hol-roll-sources").innerText(),
    /Defend maneuver/,
  );
  await screenshot("shield-block-held-requirement");
  await closePrompt(dialog);

  // Hold the stable-ID shield and reopen the same attack.
  await gm.page.evaluate(async (f) => {
    await game.actors
      .get(f.hero)
      .items.get(f.shieldItem)
      .update({ "system.held": true });
  }, fixture);
  await player.page.waitForFunction(
    (f) =>
      game.actors.get(f.hero)?.items.get(f.shieldItem)?.system.held === true,
    fixture,
  );
  await player.page
    .locator(`[data-message-id="${attack}"] .hol-defend-button`)
    .filter({ visible: true })
    .first()
    .click();
  dialog = player.page.locator(".hol-roll-dialog");
  const shieldButton = dialog.getByRole("button", {
    name: /Shield Block/,
  });
  if (!(await shieldButton.isEnabled()))
    console.error(
      "Defense context",
      await player.page.evaluate(
        (f) => ({
          heroUuid: game.actors.get(f.hero)?.uuid,
          combats: game.combats.map((c) => ({
            id: c.id,
            participants: c.combatants.map((p) => ({
              id: p.id,
              actorUuid: p.actor?.uuid,
            })),
            state: c.getFlag("heroes-of-legend", "encounter"),
          })),
          attack: game.messages
            .get(f.attack)
            ?.getFlag("heroes-of-legend", "attackCard"),
        }),
        { ...fixture, attack },
      ),
    );
  assert.equal(await shieldButton.isEnabled(), true, await dialog.innerText());
  assert.match(await dialog.innerText(), /No Maneuver remains for Defend/);
  assert.match(await dialog.innerText(), /defender's own turn/);
  const beforeItems = (await state()).items.length;
  await shieldButton.click();
  const shieldBlockRequest = await waitForAbility("ability-shield-block");
  s = await state();
  assert.equal(s.pending, null);
  assert.equal(s.budget.remaining.reaction, 0);
  assert.deepEqual(s.effects.map((effect) => effect.key).sort(), [
    "defend",
    "shield-block",
  ]);
  assert.equal(s.items.length, beforeItems);
  assert.equal(
    await gm.page.evaluate(
      (id) =>
        game.messages.filter(
          (message) =>
            message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
        ).length,
      attack,
    ),
    0,
  );
  await player.page.waitForFunction(() =>
    document
      .querySelector(".hol-roll-dialog .hol-roll-sources")
      ?.innerText.includes("Shield Block"),
  );
  assert.match(
    await dialog.locator(".hol-roll-sources").innerText(),
    /Defend maneuver[\s\S]*Shield Block/,
  );
  assert(
    await dialog.getByRole("button", { name: /Shield Block/ }).isDisabled(),
  );
  assert.match(
    await dialog.innerText(),
    /No Reaction remains for Shield Block/,
  );
  await screenshot("shield-block-defense-dialog");
  await dialog.getByRole("button", { name: "Roll", exact: true }).click();
  await gm.page.waitForFunction(
    (id) =>
      game.messages.some(
        (message) =>
          message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
      ),
    attack,
  );
  const roll = await gm.page.evaluate(
    (id) =>
      game.messages
        .find(
          (message) =>
            message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
        )
        .getFlag("heroes-of-legend", "roll"),
    attack,
  );
  assert.deepEqual(
    roll.sources.map((source) => source.label),
    ["Defend maneuver", "Shield Block"],
  );
  assert.equal(roll.boons, 2);

  // Replaying the settled reservation cannot spend a second Reaction or add another effect.
  const authorship = await gm.page.evaluate(
    async ({ id, combat }) => {
      const message = game.messages.get(id),
        request = message.getFlag("heroes-of-legend", "abilityRequest"),
        operation = game.combats
          .get(combat)
          .getFlag("heroes-of-legend", "abilityOperations")[id],
        item = await fromUuid(request.itemUuid);
      return {
        messageAuthor: message.author.id,
        operationAuthor: operation.authorId,
        operationSource: operation.source,
        itemSource: item.getFlag("heroes-of-legend", "source"),
        receiptSource: game.actors
          .get(request.actorUuid.split(".")[1])
          .getFlag("heroes-of-legend", "abilityEffectReceipts")[id].source,
      };
    },
    { id: shieldBlockRequest, combat: fixture.combat },
  );
  assert.equal(authorship.messageAuthor, fixture.player);
  assert.equal(authorship.operationAuthor, fixture.player);
  assert.deepEqual(authorship.operationSource, authorship.itemSource);
  assert.deepEqual(authorship.receiptSource, authorship.itemSource);
  assert.equal(
    authorship.operationSource.sha256,
    "bd890d5b177b2c0eded18b75901adba56c0162c25f7f6a4710298cd662421e94",
  );
  const beforeReplay = await state();
  const replay = await gm.page.evaluate(
    async ({ id, combat }) => {
      const { resolveAbilityRequest } = await import(
        "/systems/heroes-of-legend/services/abilities.mjs"
      );
      return resolveAbilityRequest(id, `Combat.${combat}`);
    },
    { id: shieldBlockRequest, combat: fixture.combat },
  );
  assert(replay.replay);
  assert.deepEqual(await state(), beforeReplay);

  // A judged non-blockable attack and a legacy unjudged card do not expose Shield Block.
  const denied = await createAttack({ blockable: false });
  dialog = await openPrompt(denied);
  assert(
    await dialog.getByRole("button", { name: /Shield Block/ }).isDisabled(),
  );
  assert.match(await dialog.innerText(), /judged this attack not blockable/);
  assert.doesNotMatch(
    await dialog.locator(".hol-roll-sources").innerText(),
    /Shield Block:/,
  );
  await closePrompt(dialog);
  const legacy = await createAttack({ legacy: true });
  dialog = await openPrompt(legacy);
  assert(
    await dialog.getByRole("button", { name: /Shield Block/ }).isDisabled(),
  );
  assert.match(
    await dialog.innerText(),
    /has not judged this attack blockable/,
  );
  assert.equal(
    await dialog.getByRole("button", { name: "Roll", exact: true }).isEnabled(),
    true,
  );
  await closePrompt(dialog);
  const tampered = await createAttack({ blockable: true });
  await gm.page.evaluate(async (id) => {
    await game.messages
      .get(id)
      .update({ "flags.heroes-of-legend.attackCard.blockable": false });
  }, tampered);
  const tamperedReview = await player.page.evaluate(
    async ({ actor, attack }) => {
      const { rollBasis } = await import(
          "/systems/heroes-of-legend/services/roll-preparation.mjs"
        ),
        { reviewedDefenseAbilityOptions } = await import(
          "/systems/heroes-of-legend/services/abilities.mjs"
        ),
        basis = rollBasis(game.actors.get(actor), "agility", "defense", attack),
        shieldBlock = reviewedDefenseAbilityOptions(game.actors.get(actor), {
          attackMessageId: attack,
        }).options.find((option) => option.id === "ability-shield-block");
      return {
        ordinaryBlockable: basis.incoming.blockable,
        shieldAvailable: shieldBlock?.available,
        reasons: shieldBlock?.reasons?.join(" "),
      };
    },
    { actor: fixture.hero, attack: tampered },
  );
  assert.equal(tamperedReview.ordinaryBlockable, false);
  assert.equal(tamperedReview.shieldAvailable, false);
  assert.match(tamperedReview.reasons, /DA judgment could not be verified/);

  // A reservation that loses its held shield is interrupted, not refunded or repeated.
  const interruptedAttack = await createAttack({ blockable: true });
  await gm.page.evaluate((actorId) => {
    const actor = game.actors.get(actorId),
      native = actor.toObject.bind(actor);
    actor.toObject = (...args) => {
      const combats = game.combats.contents.filter((combat) => {
        const pending = combat.getFlag("heroes-of-legend", "pendingAbility");
        return (
          pending &&
          combat.getFlag("heroes-of-legend", "abilityOperations")?.[pending]
            ?.actorUuid === actor.uuid
        );
      });
      if (combats.length)
        throw new Error("Injected failure after Shield Block reservation");
      return native(...args);
    };
  }, fixture.interruptionHero);
  const interruptedRequest = await player.page.evaluate(
    async (f) => {
      const { requestAbility } = await import(
        "/systems/heroes-of-legend/services/abilities.mjs"
      );
      return (
        await requestAbility(
          await fromUuid(f.interruptionShieldAbility),
          game.combats.get(f.combat),
          f.interruptionCombatant,
          {
            attackMessageId: f.interruptedAttack,
            shieldItemUuid: f.interruptionShieldUuid,
          },
        )
      ).id;
    },
    { ...fixture, interruptedAttack },
  );
  await gm.page.waitForFunction(
    ({ id, combat }) => {
      const message = game.messages.get(id);
      return (
        message?.content.includes("Injected failure") &&
        message.getFlag("heroes-of-legend", "abilityStatus")?.status ===
          "failed" &&
        Boolean(
          game.combats
            .get(combat)
            .getFlag("heroes-of-legend", "pendingAbility"),
        )
      );
    },
    { id: interruptedRequest, combat: fixture.combat },
  );
  await player.page.evaluate(
    async ({ actor, attack }) => {
      const { promptDefenseRoll } = await import(
        "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
      );
      await promptDefenseRoll(game.actors.get(actor), "agility", {
        attackMessageId: attack,
      });
    },
    { actor: fixture.interruptionHero, attack: interruptedAttack },
  );
  const pendingDialog = player.page.locator(".hol-roll-dialog");
  assert.match(
    await pendingDialog.innerText(),
    /earlier action is still pending/,
  );
  assert(
    await pendingDialog
      .getByRole("button", { name: "Roll", exact: true })
      .isDisabled(),
  );
  await closePrompt(pendingDialog);
  await gm.page.evaluate(
    (actorId) => delete game.actors.get(actorId).toObject,
    fixture.interruptionHero,
  );
  await gm.page.evaluate(async (f) => {
    await game.actors
      .get(f.interruptionHero)
      .items.get(f.interruptionShieldItem)
      .update({ "system.held": false });
  }, fixture);
  // Recovery uses the operation's stored request and author after this entry is gone.
  await gm.page.evaluate(
    async (id) => game.messages.get(id).delete(),
    interruptedRequest,
  );
  await gm.page.evaluate(async () => {
    const { AuthorityPanel } = await import(
      "/systems/heroes-of-legend/applications/authority.mjs"
    );
    await new AuthorityPanel().render({ force: true });
  });
  await gm.page
    .locator(".hol-authority")
    .getByRole("button", { name: "Resume reserved action", exact: true })
    .click();
  await gm.page.waitForFunction(
    (f) =>
      !game.combats.get(f.combat).getFlag("heroes-of-legend", "pendingAbility"),
    fixture,
  );
  const interrupted = await actorState(fixture.interruptionCombatant);
  assert.equal(interrupted.budget.remaining.reaction, 0);
  assert.deepEqual(interrupted.effects, []);
  assert.equal(interrupted.shieldHeld, false);
  assert.equal(
    await gm.page.evaluate(
      ({ id, combat }) =>
        game.combats
          .get(combat)
          .getFlag("heroes-of-legend", "abilityOperations")?.[id]?.status,
      { id: interruptedRequest, combat: fixture.combat },
    ),
    "interrupted",
  );

  // Dropping the source shield removes the conditional Boon without deleting the effect.
  await gm.page.evaluate(async (f) => {
    await game.actors
      .get(f.hero)
      .items.get(f.shieldItem)
      .update({ "system.held": false });
  }, fixture);
  const dropped = await createAttack({ blockable: true });
  dialog = await openPrompt(dropped);
  assert.match(await dialog.innerText(), /A held shield is required/);
  assert.doesNotMatch(
    await dialog.locator(".hol-roll-sources").innerText(),
    /Shield Block:/,
  );
  await closePrompt(dialog);
  s = await state();
  assert.deepEqual(s.effects.map((effect) => effect.key).sort(), [
    "defend",
    "shield-block",
  ]);

  // Selecting the hero's next turn expires both anchors and reconciles native effects.
  await gm.page.evaluate(async (f) => {
    const combat = game.combats.get(f.combat),
      { requestCombat, resolveCombatRequest } = await import(
        "/systems/heroes-of-legend/services/combat.mjs"
      );
    await resolveCombatRequest((await requestCombat(combat, "finish")).id);
    await resolveCombatRequest(
      (
        await requestCombat(combat, "choose", {
          id: f.heroCombatant,
        })
      ).id,
    );
  }, fixture);
  await gm.page.waitForFunction(
    (f) =>
      game.actors
        .get(f.hero)
        .effects.filter(
          (effect) =>
            effect.getFlag("heroes-of-legend", "benefit") && !effect.disabled,
        ).length === 0,
    fixture,
  );
  s = await state();
  assert.equal(s.current, fixture.heroCombatant);
  assert.deepEqual(
    s.effects.map((effect) => effect.disabled),
    [true, true],
  );

  // A generic defense dialog without an attack routes standalone Defend through
  // the existing owned/coordinated action path.
  await gm.page.evaluate(async (actorId) => {
    const { promptDefenseRoll } = await import(
      "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
    );
    await promptDefenseRoll(game.actors.get(actorId), "agility");
  }, fixture.hero);
  dialog = gm.page.locator(".hol-roll-dialog");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Use Defend", exact: true })
      .isEnabled(),
    true,
  );
  await dialog.getByRole("button", { name: "Use Defend", exact: true }).click();
  await gm.page.waitForFunction(
    (actorId) =>
      game.actors
        .get(actorId)
        .effects.some(
          (effect) =>
            effect.getFlag("heroes-of-legend", "benefit")?.key === "defend" &&
            !effect.disabled,
        ),
    fixture.hero,
  );
  s = await state();
  assert.equal(s.budget.remaining.maneuver, 0);
  await closePrompt(dialog);

  // Ordinary defense remains usable for an authentic historic card after its
  // encounter is gone; budget-backed abilities still fail closed.
  const historical = await createAttack({ blockable: true });
  await gm.page.evaluate(
    async (combatId) => game.combats.get(combatId).delete(),
    fixture.combat,
  );
  dialog = await openPrompt(historical);
  assert.equal(
    await dialog.getByRole("button", { name: "Roll", exact: true }).isEnabled(),
    true,
  );
  assert(
    await dialog.getByRole("button", { name: /Shield Block/ }).isDisabled(),
  );
  await dialog.getByRole("button", { name: "Roll", exact: true }).click();
  await gm.page.waitForFunction(
    (id) =>
      game.messages.some(
        (message) =>
          message.getFlag("heroes-of-legend", "roll")?.attackMessageId === id,
      ),
    historical,
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: explicit DA blockability, authentic attack context, non-owner off-turn Shield Block, held stable-ID shield, one Reaction, Defend stacking, no duplicate effect/cost, conditional benefit, deleted-request recovery, historical-card defense after encounter removal, standalone Defend routing, dialog activation and next-own-turn expiry.",
  );
} catch (error) {
  console.error(
    await gm?.page.evaluate(() => ({
      notifications: document.querySelector("#notifications")?.innerText,
      messages: game.messages.contents.slice(-8).map((message) => ({
        id: message.id,
        content: message.content,
        flags: message.flags["heroes-of-legend"],
      })),
    })),
  );
  throw error;
} finally {
  await player?.context.close();
  const cleanupFixture = gm
    ? ((await gm.page
        .evaluate(() => globalThis.__holShieldBlockFixture ?? null)
        .catch(() => null)) ?? fixture)
    : fixture;
  if (gm && cleanupFixture)
    await gm.page
      .evaluate(
        async ({ f, attackIds }) => {
          const ID = "heroes-of-legend",
            matchesAttack = (id) => attackIds.includes(id),
            combatUuid = `Combat.${f.combat}`,
            { releaseAuthority } = await import(
              "/systems/heroes-of-legend/services/authority.mjs"
            );
          await releaseAuthority().catch((error) =>
            console.error("Authority cleanup:", error.message),
          );
          for (const message of game.messages.filter(
            (entry) =>
              matchesAttack(entry.id) ||
              (f.combat &&
                (entry.getFlag(ID, "attackCard")?.combatId === f.combat ||
                  entry.getFlag(ID, "abilityRequest")?.combatUuid ===
                    combatUuid ||
                  entry.getFlag(ID, "combatRequest")?.combatUuid ===
                    combatUuid)) ||
              matchesAttack(
                entry.getFlag(ID, "defenseRequest")?.attackMessageId,
              ) ||
              matchesAttack(entry.getFlag(ID, "roll")?.attackMessageId),
          ))
            await message
              .delete()
              .catch((error) =>
                console.error(`Cleanup message ${message.id}:`, error.message),
              );
          const documents = [
            f.combat && game.combats.get(f.combat),
            f.scene && game.scenes.get(f.scene),
            f.interruptionHero && game.actors.get(f.interruptionHero),
            f.hero && game.actors.get(f.hero),
            f.npc && game.actors.get(f.npc),
            f.player && game.users.get(f.player),
          ].filter(Boolean);
          for (const document of documents)
            await document
              .delete()
              .catch((error) =>
                console.error(
                  `Cleanup ${document.documentName} ${document.id}:`,
                  error.message,
                ),
              );
        },
        {
          f: cleanupFixture,
          attackIds: cleanupFixture.attackIds ?? [],
        },
      )
      .catch((error) => console.error("Cleanup:", error.message));
  if (gm)
    await gm.page
      .evaluate(() => delete globalThis.__holShieldBlockFixture)
      .catch(() => {});
  await browser.close();
}
