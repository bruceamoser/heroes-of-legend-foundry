import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";
const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error("Use a disposable local world.");
const browser = await chromium.launch();
let gm, player, f;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("core.noCanvas", "true");
  });
  const page = await context.newPage();
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { page, context };
}
async function waitReceipt(id) {
  await gm.page.waitForFunction(
    ({ a, id }) =>
      game.actors.get(a).getFlag("heroes-of-legend", "operationReceipts")?.[id]
        ?.applied,
    { a: f.actor, id },
  );
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `Hands ${foundry.utils.randomID(5)}`,
      role: 1,
    });
    const actor = await Actor.create({
      name: "Equipment test",
      type: "character",
      ownership: { [user.id]: 3 },
      items: [
        {
          name: "Sword stack",
          type: "equipment",
          system: { hands: 1, quantity: 10 },
        },
        { name: "Shield", type: "equipment", system: { hands: 1 } },
        { name: "Bow", type: "equipment", system: { hands: 2 } },
      ],
    });
    return { actor: actor.id, user: user.id, name: user.name };
  });
  player = await join(f.name);
  await player.page.evaluate(async (f) => {
    await game.actors.get(f.actor).sheet.render({ force: true });
  }, f);
  await player.page.locator(".hol-character [data-action=equipment]").click();
  const panel = player.page.locator(".hol-hands");
  await panel.waitFor();
  await panel
    .locator("[data-equipment-id]")
    .filter({ hasText: "Sword stack" })
    .locator("[name=held]")
    .check();
  await panel
    .locator("[data-equipment-id]")
    .filter({ hasText: "Shield" })
    .locator("[name=held]")
    .check();
  await panel.locator("[data-action=save]").click();
  await gm.page.waitForFunction(
    (f) =>
      game.actors.get(f.actor).items.filter((i) => i.system.held).length === 2,
    f,
  );
  const result = await gm.page.evaluate(async (f) => {
    const actor = game.actors.get(f.actor),
      service = await import(
        "/systems/heroes-of-legend/services/equipment.mjs"
      );
    const request = game.messages.find(
      (m) =>
        m.getFlag("heroes-of-legend", "equipmentRequest")?.actorUuid ===
        actor.uuid,
    );
    const replay = await service.resolveEquipmentRequest(request.id);
    const before = service.equipmentBasis(actor);
    await actor.items
      .find((i) => i.name === "Sword stack")
      .update({ "system.quantity": 9 });
    const stale = await service.requestEquipment(
      actor,
      before,
      before.items,
      before.capacity,
    );
    return { replay: replay.replay, stale: stale.id };
  }, f);
  assert.equal(result.replay, true);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("state changed"),
    result.stale,
  );
  const combatId = await gm.page.evaluate(async (f) => {
    const c = await Combat.create({});
    const [p] = await c.createEmbeddedDocuments("Combatant", [
      { actorId: f.actor },
    ]);
    const { startEncounter } = await import(
      "/systems/heroes-of-legend/rules/encounter.mjs"
    );
    await c.setFlag(
      "heroes-of-legend",
      "encounter",
      startEncounter([{ id: p.id, side: "players" }], [6, 6, 6]),
    );
    return c.id;
  }, f);
  f.combat = combatId;
  const denied = await player.page.evaluate(async (f) => {
    const s = await import("/systems/heroes-of-legend/services/equipment.mjs"),
      a = game.actors.get(f.actor),
      b = s.equipmentBasis(a);
    return (await s.requestEquipment(a, b, b.items, 3, "Player claims ruling"))
      .id;
  }, f);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("require the DA"),
    denied,
  );
  const correction = await gm.page.evaluate(async (f) => {
    const s = await import("/systems/heroes-of-legend/services/equipment.mjs"),
      a = game.actors.get(f.actor),
      b = s.equipmentBasis(a);
    return (
      await s.requestEquipment(
        a,
        b,
        b.items.map((i) => ({ ...i, held: false })),
        3,
        "Test anatomy correction",
      )
    ).id;
  }, f);
  await waitReceipt(correction);
  await player.page.reload();
  await player.page.waitForFunction(() => globalThis.game?.ready);
  assert.deepEqual(
    await player.page.evaluate((f) => {
      const a = game.actors.get(f.actor);
      return {
        capacity: a.getFlag("heroes-of-legend", "handCapacity"),
        held: a.items.filter((i) => i.system.held).length,
      };
    }, f),
    { capacity: 3, held: 0 },
  );
  await gm.page.evaluate(async (f) => {
    await game.actors.get(f.actor).update({ [`ownership.${f.user}`]: 2 });
  }, f);
  const observer = await player.page.evaluate(async (f) => {
    const s = await import("/systems/heroes-of-legend/services/equipment.mjs"),
      a = game.actors.get(f.actor),
      b = s.equipmentBasis(a);
    return (await s.requestEquipment(a, b, b.items, b.capacity)).id;
  }, f);
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Only an owner"),
    observer,
  );
  await gm.page.evaluate(async (f) => {
    const { EquipmentPanel } = await import(
      "/systems/heroes-of-legend/applications/equipment.mjs"
    );
    await new EquipmentPanel(game.actors.get(f.actor)).render({ force: true });
  }, f);
  await gm.page
    .locator(".hol-hands")
    .screenshot({ path: "test-results/held-equipment.png" });
  console.log(
    "PASS native held equipment, owner UI, stack state, replay, stale inventory, DA encounter correction, observer denial, reload.",
  );
} finally {
  await player?.context.close();
  if (gm && f)
    await gm.page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const m of game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "equipmentRequest")?.actorUuid ===
            `Actor.${f.actor}`,
        ))
          await m.delete();
        await game.combats.get(f.combat)?.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, f)
      .catch(console.error);
  await browser.close();
}
