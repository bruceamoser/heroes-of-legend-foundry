import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw Error("Use a disposable local world.");
const browser = await chromium.launch();
let gm, player, fixture;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}
async function waitReceipt(actorUuid, id) {
  await gm.page.waitForFunction(
    ({ actorUuid, id }) =>
      fromUuidSync(actorUuid)?.getFlag(
        "heroes-of-legend",
        "operationReceipts",
      )?.[id]?.applied,
    { actorUuid, id },
  );
}
async function requestDamage(actorUuid, draft, basis = null) {
  return gm.page.evaluate(
    async ({ actorUuid, draft, basis }) => {
      const service = await import(
          "/systems/heroes-of-legend/services/damage.mjs"
        ),
        actor = fromUuidSync(actorUuid);
      return (
        await service.requestDamage(
          actor,
          basis ?? service.damageBasis(actor),
          draft,
        )
      ).id;
    },
    { actorUuid, draft, basis },
  );
}
async function requestRecovery(actorUuid, draft, basis = null) {
  return gm.page.evaluate(
    async ({ actorUuid, draft, basis }) => {
      const damage = await import(
          "/systems/heroes-of-legend/services/damage.mjs"
        ),
        recovery = await import(
          "/systems/heroes-of-legend/services/recovery.mjs"
        ),
        actor = fromUuidSync(actorUuid);
      return (
        await recovery.requestRecovery(
          actor,
          basis ?? damage.damageBasis(actor),
          draft,
        )
      ).id;
    },
    { actorUuid, draft, basis },
  );
}
async function state(actorUuid) {
  return gm.page.evaluate((actorUuid) => {
    const actor = fromUuidSync(actorUuid),
      basis = actor
        ? actor.system && actor.type === "character"
          ? {
              hp: actor.system.health.value,
              equipmentRevision: actor.getFlag(
                "heroes-of-legend",
                "equipmentRevision",
              ),
              worn: Object.fromEntries(
                actor.items
                  .filter((item) => item.type === "equipment")
                  .map((item) => [item.name, item.system.worn]),
              ),
            }
          : null
        : null;
    return basis;
  }, actorUuid);
}
try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const ID = "heroes-of-legend",
      { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      ),
      { PASSIVE_DEFENSE_DEFINITIONS } = await import(
        "/systems/heroes-of-legend/rules/passive-defenses.mjs"
      );
    await bindCreationAuthority();
    const user = await User.create({
      name: `Passive defense ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const provenance = (catalogId) =>
      PASSIVE_DEFENSE_DEFINITIONS[catalogId].source;
    const ability = (name, catalogId) => ({
      name,
      type: "ability",
      flags: { [ID]: { catalogId, source: provenance(catalogId) } },
    });
    const equipment = (name, catalogId) => ({
      name,
      type: "equipment",
      system: {
        catalogId,
        bulk: 1,
        hands: 0,
        quantity: 1,
        held: false,
        worn: false,
      },
      flags: { [ID]: { source: provenance(catalogId) } },
    });
    const actor = await Actor.create({
      name: "Passive defense test",
      type: "character",
      system: { health: { value: 20, baseMax: 20 } },
      ownership: { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      items: [
        ability("Wear Medium Armor", "ability-wear-medium-armor"),
        {
          name: "Native custom ability",
          type: "ability",
        },
        equipment("Ordinary Medium Armor", "item-ordinary-medium-armor"),
        equipment("Winter Lining", "item-winter-lining"),
        equipment("Gravebound Brooch", "item-gravebound-brooch"),
        {
          name: "Unknown warm narrative",
          type: "equipment",
          system: {
            catalogId: "narrative-only-cold-item",
            description: "Narrative says Cold resistance 3 while worn.",
            bulk: 1,
            hands: 0,
            quantity: 1,
            held: false,
            worn: false,
          },
        },
      ],
    });
    const customAbility = actor.items.find(
      (item) => item.name === "Native custom ability",
    );
    if (
      !customAbility ||
      customAbility.getFlag(ID, "catalogId") != null ||
      customAbility.getFlag(ID, "source") != null
    )
      throw new Error("Native custom ability fixture must have no HOL flags.");
    const isolated = await Actor.create({
      name: "Passive isolation control",
      type: "character",
      system: { health: { value: 20, baseMax: 20 } },
    });
    return {
      actor: actor.uuid,
      isolated: isolated.uuid,
      user: user.id,
      name: user.name,
    };
  });

  player = await join(fixture.name);
  await player.page.evaluate(async (actorUuid) => {
    await fromUuidSync(actorUuid).sheet.render({ force: true });
  }, fixture.actor);
  await player.page.locator(".hol-character [data-action=equipment]").click();
  const panel = player.page.locator(".hol-hands");
  await panel.waitFor();
  for (const name of [
    "Ordinary Medium Armor",
    "Winter Lining",
    "Gravebound Brooch",
  ])
    await panel
      .locator("[data-equipment-id]")
      .filter({ hasText: name })
      .locator("[name=worn]")
      .check();
  await panel.screenshot({ path: "test-results/passive-equipment.png" });
  await panel.locator("[data-action=save]").click();
  await gm.page.waitForFunction(
    (actorUuid) =>
      fromUuidSync(actorUuid)
        .items.filter((item) => item.type === "equipment")
        .filter((item) => item.system.worn).length === 3,
    fixture.actor,
  );
  assert.deepEqual((await state(fixture.actor)).worn, {
    "Ordinary Medium Armor": true,
    "Winter Lining": true,
    "Gravebound Brooch": true,
    "Unknown warm narrative": false,
  });

  const equipmentReplay = await gm.page.evaluate(async (actorUuid) => {
    const request = game.messages.find(
        (message) =>
          message.getFlag("heroes-of-legend", "equipmentRequest")?.actorUuid ===
          actorUuid,
      ),
      service = await import(
        "/systems/heroes-of-legend/services/equipment.mjs"
      );
    return service.resolveEquipmentRequest(request.id);
  }, fixture.actor);
  assert.equal(equipmentReplay.replay, true);
  await player.page.reload();
  await player.page.waitForFunction(() => globalThis.game?.ready);
  assert.deepEqual(
    await player.page.evaluate(
      (actorUuid) =>
        fromUuidSync(actorUuid)
          .items.filter((item) => item.system.worn)
          .map((item) => item.name)
          .sort(),
      fixture.actor,
    ),
    ["Gravebound Brooch", "Ordinary Medium Armor", "Winter Lining"],
  );

  const physical = await requestDamage(fixture.actor, {
    components: [{ type: "physical", amount: 5 }],
    reason: "Native passive armor fixture",
  });
  await waitReceipt(fixture.actor, physical);
  assert.equal((await state(fixture.actor)).hp, 17);
  assert.equal(
    (
      await gm.page.evaluate(
        async ({ actorUuid, id }) => {
          const { resolveDamageRequest } = await import(
            "/systems/heroes-of-legend/services/damage.mjs"
          );
          return resolveDamageRequest(id);
        },
        { actorUuid: fixture.actor, id: physical },
      )
    ).replay,
    true,
  );

  const life = await requestDamage(fixture.actor, {
    components: [{ type: "life", amount: 3 }],
    reason: "Native passive Life resistance fixture",
  });
  await waitReceipt(fixture.actor, life);
  assert.equal((await state(fixture.actor)).hp, 15);
  const healing = await requestRecovery(fixture.actor, {
    kind: "heal",
    amount: 3,
    lifeResistance: 0,
    reason: "Native brooch healing fixture",
  });
  await waitReceipt(fixture.actor, healing);
  assert.equal((await state(fixture.actor)).hp, 17);
  assert.equal(
    (
      await gm.page.evaluate(async (id) => {
        const { resolveRecoveryRequest } = await import(
          "/systems/heroes-of-legend/services/recovery.mjs"
        );
        return resolveRecoveryRequest(id);
      }, healing)
    ).replay,
    true,
  );

  const isolated = await requestDamage(fixture.isolated, {
    components: [{ type: "physical", amount: 4 }],
    reason: "Passive source isolation fixture",
  });
  await waitReceipt(fixture.isolated, isolated);
  assert.equal((await state(fixture.isolated)).hp, 16);

  const staleDamage = await gm.page.evaluate(async (actorUuid) => {
    const service = await import(
        "/systems/heroes-of-legend/services/damage.mjs"
      ),
      actor = fromUuidSync(actorUuid),
      basis = service.damageBasis(actor);
    await actor.items
      .find((item) => item.name === "Ordinary Medium Armor")
      .update({ "system.worn": false });
    return (
      await service.requestDamage(actor, basis, {
        components: [{ type: "physical", amount: 1 }],
        reason: "Stale worn armor snapshot",
      })
    ).id;
  }, fixture.actor);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("defenses changed"),
    staleDamage,
  );
  assert.equal((await state(fixture.actor)).hp, 17);

  const staleRecovery = await gm.page.evaluate(async (actorUuid) => {
    const damage = await import(
        "/systems/heroes-of-legend/services/damage.mjs"
      ),
      recovery = await import(
        "/systems/heroes-of-legend/services/recovery.mjs"
      ),
      actor = fromUuidSync(actorUuid),
      basis = damage.damageBasis(actor);
    await actor.items
      .find((item) => item.name === "Gravebound Brooch")
      .update({ "system.worn": false });
    return (
      await recovery.requestRecovery(actor, basis, {
        kind: "heal",
        amount: 1,
        lifeResistance: 0,
        reason: "Stale worn brooch snapshot",
      })
    ).id;
  }, fixture.actor);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("defenses changed"),
    staleRecovery,
  );
  assert.equal((await state(fixture.actor)).hp, 17);
  console.log(
    "PASS native worn equipment, source isolation, automatic Physical/Life damage, brooch healing, replay, stale worn damage/recovery rejection and reload.",
  );
} finally {
  await player?.context.close();
  if (gm && fixture)
    await gm.page
      .evaluate(async (fixture) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const message of game.messages.filter(
          (message) =>
            [fixture.actor, fixture.isolated].includes(
              message.getFlag("heroes-of-legend", "damageRequest")?.actorUuid,
            ) ||
            [fixture.actor, fixture.isolated].includes(
              message.getFlag("heroes-of-legend", "recoveryRequest")?.actorUuid,
            ) ||
            message.getFlag("heroes-of-legend", "equipmentRequest")
              ?.actorUuid === fixture.actor,
        ))
          await message.delete();
        await fromUuidSync(fixture.actor)?.delete();
        await fromUuidSync(fixture.isolated)?.delete();
        await game.users.get(fixture.user)?.delete();
      }, fixture)
      .catch(console.error);
  await browser.close();
}
