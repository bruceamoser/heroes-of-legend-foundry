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
  throw new Error("Use authorized disposable local world");
const browser = await chromium.launch(),
  errors = [];
let first, second, fixture;
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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
try {
  first = await join("Gamemaster");
  fixture = await first.page.evaluate(async () => {
    if (game.settings.get("heroes-of-legend", "creationAuthorityClient"))
      throw new Error("Expected an unbound coordinator");
    const user = await User.create({
      name: `Coordinator GM ${foundry.utils.randomID(4)}`,
      role: CONST.USER_ROLES.GAMEMASTER,
    });
    const actor = await Actor.create({
      name: "HOL coordinator fixture",
      type: "character",
    });
    return { user: user.id, name: user.name, actor: actor.id };
  });
  second = await join(fixture.name);
  const active = await first.page.evaluate(() => game.users.activeGM.id);
  const primary = active === fixture.user ? second : first,
    other = active === fixture.user ? first : second;
  const attempts = await Promise.all([
    primary.page.evaluate(async () => {
      const { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      try {
        await bindCreationAuthority();
        return "bound";
      } catch (e) {
        return e.message;
      }
    }),
    other.page.evaluate(async () => {
      const { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      try {
        await bindCreationAuthority();
        return "bound";
      } catch (e) {
        return e.message;
      }
    }),
  ]);
  assert.equal(attempts.filter((r) => r === "bound").length, 1);
  assert.equal(attempts[0], "bound");
  await primary.page.evaluate(async () => {
    const { AuthorityPanel } = await import(
      "/systems/heroes-of-legend/applications/authority.mjs"
    );
    globalThis.holPanel = new AuthorityPanel();
    await holPanel.render({ force: true });
  });
  await primary.page.locator(".hol-authority [data-action=release]").waitFor();
  assert(
    await primary.page
      .locator(".hol-authority [data-action=release]")
      .isEnabled(),
  );
  await mkdir("test-results", { recursive: true });
  await primary.page
    .locator(".hol-authority")
    .screenshot({ path: "test-results/coordinator.png" });
  await primary.page.evaluate(() => holPanel.close());
  const duplicate = await primary.context.newPage();
  duplicate.on("pageerror", (e) => errors.push(e.message));
  await duplicate.goto(`${url}/game`);
  await duplicate.waitForFunction(() => game.ready);
  const duplicateDenied = await duplicate.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    try {
      await bindCreationAuthority();
      return false;
    } catch (e) {
      return e.message.includes("live tab");
    }
  });
  assert(duplicateDenied);
  await primary.page.evaluate(async (id) => {
    const { enqueueCharacterOperation, writeCharacterActor } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    globalThis.holHeldJob = enqueueCharacterOperation(async () => {
      await new Promise((resolve) => (globalThis.holContinue = resolve));
      await writeCharacterActor(game.actors.get(id), {
        "flags.heroes-of-legend.coordinatorCount": 1,
      });
    });
  }, fixture.actor);
  await primary.page.waitForFunction(() => typeof holContinue === "function");
  await primary.page.evaluate(async () => {
    const { releaseAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    globalThis.holRelease = releaseAuthority();
  });
  assert(
    await primary.page.evaluate(
      () => game.settings.get("heroes-of-legend", "authorityWork").busy,
    ),
  );
  assert(
    await other.page.evaluate(async () => {
      const { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      try {
        await bindCreationAuthority();
        return false;
      } catch {
        return true;
      }
    }),
  );
  await primary.page.evaluate(async () => {
    holContinue();
    await holHeldJob;
    await holRelease;
  });
  assert.equal(
    await primary.page.evaluate(() =>
      game.settings.get("heroes-of-legend", "creationAuthorityClient"),
    ),
    "",
  );
  await duplicate.close();
  await primary.context.close();
  await other.page.waitForFunction(() => game.users.activeGM?.isSelf);
  await other.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  assert.equal(
    await other.page.evaluate(
      (id) =>
        game.actors.get(id).getFlag("heroes-of-legend", "coordinatorCount"),
      fixture.actor,
    ),
    1,
  );
  // An acknowledged Actor receipt lets a new tab reconcile an interrupted metadata checkpoint.
  const requestId = await other.page.evaluate(async (id) => {
    const m = await ChatMessage.create({
      content: "Coordinator checkpoint fixture",
    });
    // Add request metadata after creation, so no production handler starts this fixture.
    await m.update({
      "flags.heroes-of-legend.creationRequest": {
        actorUuid: `Actor.${id}`,
        revision: 1,
      },
    });
    const { enqueueCharacterOperation, writeCharacterActor } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    const actor = game.actors.get(id),
      nativeUpdate = actor.update.bind(actor);
    actor.update = async (...args) => {
      const result = await nativeUpdate(...args);
      await new Promise(() => {});
      return result;
    };
    globalThis.holInterrupted = enqueueCharacterOperation(
      async () => {
        await writeCharacterActor(actor, {
          [`flags.heroes-of-legend.operationReceipts.${m.id}`]: {
            applied: true,
          },
          "flags.heroes-of-legend.creationReceipt": {
            status: "complete",
            revision: 1,
            createdIds: [],
          },
        });
        await new Promise(() => {});
      },
      { requestId: m.id },
    );
    return m.id;
  }, fixture.actor);
  await other.page.waitForFunction(
    ({ actor, id }) =>
      game.actors.get(actor).getFlag("heroes-of-legend", "operationReceipts")?.[
        id
      ]?.applied,
    { actor: fixture.actor, id: requestId },
  );
  await other.page.reload();
  await other.page.waitForFunction(() => game.ready);
  await other.page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  await other.page.waitForFunction(
    () => !game.settings.get("heroes-of-legend", "authorityWork").busy,
  );
  const suspended = await other.page.evaluate(async () => {
    const {
      enqueueCharacterOperation,
      writeCharacterActor,
      bindCreationAuthority,
    } = await import("/systems/heroes-of-legend/services/authority.mjs");
    try {
      await enqueueCharacterOperation(() =>
        writeCharacterActor(
          {
            update: async () => {
              throw new Error("Injected unknown write outcome");
            },
          },
          {},
        ),
      );
    } catch {}
    try {
      await bindCreationAuthority();
      return false;
    } catch (e) {
      return e.message.includes("uncertain write");
    }
  });
  assert(suspended);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: simultaneous distinct-GM activation, same-GM duplicate tab exclusion, queued in-flight release, handoff, committed-write/lost-acknowledgment recovery and suspension of unknown outcomes.",
  );
  // Cleanup is an explicit disposable-world reset, not a production failover path.
  await other.page.evaluate(async (f) => {
    for (const m of game.messages.filter(
      (m) =>
        m.getFlag("heroes-of-legend", "creationRequest")?.actorUuid ===
        `Actor.${f.actor}`,
    ))
      await m.delete();
    await game.actors.get(f.actor)?.delete();
    await game.settings.set("heroes-of-legend", "creationAuthorityClient", "");
    await game.settings.set("heroes-of-legend", "authorityMeta", {});
    await game.settings.set("heroes-of-legend", "authorityWork", {});
    if (game.user.id !== f.user) await game.users.get(f.user)?.delete();
  }, fixture);
  if (await other.page.evaluate((id) => game.user.id === id, fixture.user)) {
    await other.context.close();
    const cleanup = await join("Gamemaster");
    await cleanup.page.evaluate(async (id) => {
      await game.users.get(id)?.delete();
    }, fixture.user);
  }
  fixture = null;
} finally {
  if (fixture) console.error("Coordinator fixture may need cleanup", fixture);
  await browser.close();
}
