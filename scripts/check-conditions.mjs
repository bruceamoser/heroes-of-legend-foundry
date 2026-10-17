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
const browser = await chromium.launch(),
  errors = [];
let gm, player, fixture;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return { context, page };
}
async function request(
  kind,
  payload = {},
  page = gm.page,
  uuid = fixture.actorUuid,
) {
  const id = await page.evaluate(
    async ({ kind, payload, uuid }) => {
      const { requestCondition } = await import(
        "/systems/heroes-of-legend/services/conditions.mjs"
      );
      return (await requestCondition(await fromUuid(uuid), kind, payload)).id;
    },
    { kind, payload, uuid },
  );
  await gm.page.waitForFunction((id) => game.messages.has(id), id);
  const result = await gm.page.evaluate(async (id) => {
    const { resolveConditionRequest } = await import(
      "/systems/heroes-of-legend/services/conditions.mjs"
    );
    try {
      return await resolveConditionRequest(id);
    } catch (e) {
      return { error: e.message };
    }
  }, id);
  return { id, result };
}
async function records(uuid = fixture.actorUuid) {
  return gm.page.evaluate(async (uuid) => {
    const { actorContributions } = await import(
      "/systems/heroes-of-legend/services/conditions.mjs"
    );
    return actorContributions(await fromUuid(uuid));
  }, uuid);
}
try {
  gm = await join("Gamemaster");
  fixture = await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    const user = await User.create({
      name: `HOL condition player ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.PLAYER,
    });
    const actor = await Actor.create({
      name: "Condition fixture",
      type: "character",
      ownership: { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    });
    await actor.createEmbeddedDocuments("ActiveEffect", [
      { name: "Unrelated fixture", flags: { other: { preserve: true } } },
    ]);
    const scene = await Scene.create({
      name: "HOL condition token fixture",
      active: false,
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      { name: actor.name, actorId: actor.id, actorLink: false },
    ]);
    return {
      actor: actor.id,
      actorUuid: actor.uuid,
      scene: scene.id,
      tokenUuid: token.actor.uuid,
      user: user.id,
      name: user.name,
    };
  });
  player = await join(fixture.name);
  const denied = await request(
    "add",
    {
      key: "burning",
      rating: 3,
      persistence: "temporary",
      source: "Unauthorized player",
    },
    player.page,
  );
  assert.match(denied.result.error, /DA must/);
  const first = await request("add", {
    key: "burning",
    rating: 3,
    persistence: "temporary",
    source: "Torch",
  });
  assert.equal(first.result.status, "complete");
  assert.equal((await records()).length, 1);
  const star = await request("add", {
    key: "burning",
    rating: 1,
    persistence: "starred",
    source: "Lasting wound",
  });
  assert.equal(star.result.status, "complete");
  let r = await records();
  const temporary = r.find((c) => c.persistence === "temporary"),
    starred = r.find((c) => c.persistence === "starred");
  const reduced = await request("reduce", {
    effectId: temporary.id,
    amount: 1,
  });
  assert.equal(reduced.result.status, "complete");
  assert.equal((await records()).find((c) => c.id === temporary.id).rating, 2);
  const blocked = await request("reduce", { effectId: starred.id, amount: 1 });
  assert.match(blocked.result.error, /persistent/);
  const native = await gm.page.evaluate(async (uuid) => {
    const a = await fromUuid(uuid);
    return {
      status: a.statuses.has("hol.burning"),
      unrelated: a.effects.some((e) => e.flags.other?.preserve),
      effects: a.effects.size,
    };
  }, fixture.actorUuid);
  assert(native.status);
  assert(native.unrelated);
  await gm.page.evaluate(async (uuid) => {
    await (await fromUuid(uuid)).toggleStatusEffect("hol.burning");
  }, fixture.actorUuid);
  const panel = gm.page.locator(".hol-conditions");
  await panel.locator("[name=source]").fill("Freezing rain");
  await panel.locator("[name=key]").selectOption("freezing");
  await panel.locator("[name=source]").fill("Freezing rain");
  await panel.locator("[name=rating]").fill("2");
  await panel.getByRole("button", { name: "Add source", exact: true }).click();
  await gm.page.waitForFunction(
    (id) =>
      game.actors
        .get(id)
        .effects.some(
          (e) => e.getFlag("heroes-of-legend", "condition")?.key === "freezing",
        ),
    fixture.actor,
  );
  assert.equal((await records()).length, 3);
  await mkdir("test-results", { recursive: true });
  await gm.page.evaluate(() => ui.notifications.clear());
  await panel.screenshot({ path: "test-results/conditions.png" });
  await request("remove", { effectId: temporary.id });
  assert.equal((await records()).length, 2);
  assert((await records()).some((c) => c.id === starred.id));
  const token = await request(
    "add",
    {
      key: "poisoned",
      rating: 2,
      persistence: "temporary",
      source: "Token-only poison",
    },
    gm.page,
    fixture.tokenUuid,
  );
  assert.equal(token.result.status, "complete");
  assert((await records(fixture.tokenUuid)).some((c) => c.key === "poisoned"));
  assert(!(await records()).some((c) => c.key === "poisoned"));
  const before = await records();
  await gm.page.reload();
  await gm.page.waitForFunction(() => game.ready);
  await gm.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  assert.deepEqual(await records(), before);
  const replay = await gm.page.evaluate(async (id) => {
    const { resolveConditionRequest } = await import(
      "/systems/heroes-of-legend/services/conditions.mjs"
    );
    return resolveConditionRequest(id);
  }, first.id);
  assert(replay.replay);
  assert.deepEqual(await records(), before);
  assert((await records(fixture.tokenUuid)).some((c) => c.key === "poisoned"));
  await request("remove", { effectId: starred.id });
  assert.equal(
    await gm.page.evaluate(
      async (uuid) => (await fromUuid(uuid)).statuses.has("hol.burning"),
      fixture.actorUuid,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native sourced ActiveEffects, GM permission, temporary/starred separation, source-specific reduction/removal, preserved unrelated effects, HUD entry/panel, unlinked-token isolation, reload and replay.",
  );
} catch (e) {
  console.error(
    await gm?.page.evaluate(() => ({
      notifications: document.querySelector("#notifications")?.innerText,
      messages: game.messages.contents.slice(-5).map((m) => m.content),
    })),
  );
  throw e;
} finally {
  await player?.context.close();
  if (gm && fixture)
    await gm.page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const m of game.messages.filter((m) =>
          [f.actorUuid, f.tokenUuid].includes(
            m.getFlag("heroes-of-legend", "conditionRequest")?.actorUuid,
          ),
        ))
          await m.delete();
        await game.scenes.get(f.scene)?.delete();
        await game.actors.get(f.actor)?.delete();
        await game.users.get(f.user)?.delete();
      }, fixture)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
