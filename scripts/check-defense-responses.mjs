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
  errors = [];
let gm, p1, p2, f;
async function join(name) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  return { context, page };
}
async function submit(player, index, draft = {}) {
  return player.page.evaluate(
    async ({ f, index, draft }) => {
      const { rollBasis } = await import(
        "/systems/heroes-of-legend/services/roll-preparation.mjs"
      );
      const { requestDefense } = await import(
        "/systems/heroes-of-legend/services/defense-responses.mjs"
      );
      const a = game.actors.get(f.actors[index]);
      return (
        await requestDefense(
          a,
          rollBasis(a, "agility", "defense", f.attack),
          draft,
        )
      ).id;
    },
    { f, index, draft },
  );
}
async function settled(id) {
  await gm.page.waitForFunction(
    ({ attack, id }) =>
      game.messages
        .get(attack)
        .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.applied,
    { attack: f.attack, id },
  );
}
try {
  gm = await join("Gamemaster");
  f = await gm.page.evaluate(async () => {
    const users = [];
    for (let i = 0; i < 2; i++)
      users.push(
        await User.create({
          name: `Response player ${i} ${foundry.utils.randomID(4)}`,
          role: CONST.USER_ROLES.PLAYER,
        }),
      );
    const actors = [];
    for (let i = 0; i < 3; i++)
      actors.push(
        await Actor.create({
          name: `Response defender ${i}`,
          type: "character",
        }),
      );
    const attack = await ChatMessage.create({
      content:
        '<section class="hol-attack-card">Defense protocol fixture</section>',
      flags: {
        "heroes-of-legend": {
          attackCard: {
            id: "fixture",
            attackerName: "Fixture attacker",
            title: "Basic Melee",
            attributeKey: "agility",
            threat: { boons: 0, banes: 1 },
            damage: { weak: 5, standard: 3, strong: 2 },
            suggestedDefenderTokenUuids: [],
            perspective: "defender",
          },
        },
      },
    });
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
    return {
      users: users.map((u) => ({ id: u.id, name: u.name })),
      actors: actors.map((a) => a.id),
      attack: attack.id,
    };
  });
  p1 = await join(f.users[0].name);
  p2 = await join(f.users[1].name);
  const race = await Promise.all([submit(p1, 0), submit(p2, 0)]);
  await gm.page.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          game.messages.get(id).getFlag("heroes-of-legend", "roll") ||
          game.messages.get(id).content.includes("already has an attempt"),
      ),
    race,
  );
  const rolled = await gm.page.evaluate(
    (ids) =>
      ids.filter((id) =>
        game.messages.get(id).getFlag("heroes-of-legend", "roll"),
      ),
    race,
  );
  assert.equal(rolled.length, 1);
  await settled(rolled[0]);
  const original = await gm.page.evaluate((id) => {
    const m = game.messages.get(id);
    return {
      roll: m.getFlag("heroes-of-legend", "roll"),
      author: m.author.id,
      dice: m.rolls[0].toJSON(),
    };
  }, rolled[0]);
  assert.equal(original.roll.rollerId, original.author);
  assert(f.users.some((u) => u.id === original.author));
  const other = await submit(p2, 1);
  await settled(other);
  const replay = await gm.page.evaluate(async (id) => {
    const { resolveDefenseRequest } = await import(
      "/systems/heroes-of-legend/services/defense-responses.mjs"
    );
    return resolveDefenseRequest(id);
  }, rolled[0]);
  assert(replay.replay);
  await p1.page.evaluate(async (f) => {
    const { promptDefenseRoll } = await import(
      "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
    );
    await promptDefenseRoll(game.actors.get(f.actors[0]), "agility", {
      attackMessageId: f.attack,
    });
  }, f);
  const dialog = p1.page.locator(".hol-roll-dialog");
  assert(
    await dialog
      .getByRole("button", { name: "Roll", exact: true })
      .isDisabled(),
  );
  await dialog.locator('[name="additionalAttempt"]').check();
  await dialog
    .locator('[name="attemptReason"]')
    .fill("DA requests an explicit second attempt");
  await dialog.getByRole("button", { name: "Roll", exact: true }).click();
  await gm.page.waitForFunction(
    (f) =>
      game.messages
        .get(f.attack)
        .getFlag("heroes-of-legend", "defenseResponses")
        .filter(
          (r) =>
            r.actorUuid === `Actor.${f.actors[0]}` && r.status === "resolved",
        ).length === 2,
    f,
  );
  const oldBasis = await p2.page.evaluate(async (f) => {
    const { rollBasis } = await import(
      "/systems/heroes-of-legend/services/roll-preparation.mjs"
    );
    return rollBasis(
      game.actors.get(f.actors[1]),
      "agility",
      "defense",
      f.attack,
    );
  }, f);
  await gm.page.evaluate(
    async (f) =>
      game.actors
        .get(f.actors[1])
        .update({ "system.attributes.agility.base": 1 }),
    f,
  );
  const stale = await p2.page.evaluate(
    async ({ f, basis }) => {
      const { requestDefense } = await import(
        "/systems/heroes-of-legend/services/defense-responses.mjs"
      );
      return (
        await requestDefense(game.actors.get(f.actors[1]), basis, {
          additionalAttempt: true,
          attemptReason: "Stale context test",
        })
      ).id;
    },
    { f, basis: oldBasis },
  );
  await gm.page.waitForFunction(
    (id) => game.messages.get(id).content.includes("Roll sources changed"),
    stale,
  );
  assert.equal(
    await gm.page.evaluate((id) => game.messages.get(id).rolls.length, stale),
    0,
  );
  // Reconstruct the durable state after a saved child result but before final settlement.
  const recovered = await gm.page.evaluate(
    async ({ f, id }) => {
      const a = game.messages.get(f.attack),
        rows = structuredClone(
          a.getFlag("heroes-of-legend", "defenseResponses"),
        );
      rows.find((r) => r.requestId === id).status = "rolling";
      await a.update({
        "flags.heroes-of-legend.defenseResponses": rows,
        [`flags.heroes-of-legend.operationReceipts.-=${id}`]: null,
      });
      const { resolveDefenseRequest } = await import(
        "/systems/heroes-of-legend/services/defense-responses.mjs"
      );
      const evaluate = foundry.dice.Roll.prototype.evaluate;
      foundry.dice.Roll.prototype.evaluate = () => {
        throw new Error("Recovery attempted to evaluate dice again");
      };
      try {
        await resolveDefenseRequest(id);
      } finally {
        foundry.dice.Roll.prototype.evaluate = evaluate;
      }
      const m = game.messages.get(id);
      return {
        roll: m.getFlag("heroes-of-legend", "roll"),
        author: m.author.id,
        dice: m.rolls[0].toJSON(),
      };
    },
    { f, id: rolled[0] },
  );
  assert.deepEqual(recovered, original);
  // Reconstruct an uncertain rolling phase with no saved result; never reroll it.
  await gm.page.evaluate(async () => {
    const { releaseAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await releaseAuthority();
  });
  const pending = await p1.page.evaluate(
    async (f) =>
      ChatMessage.create({
        content: "Interrupted defense fixture",
        flags: {
          "heroes-of-legend": {
            defenseRequest: {
              attackMessageId: f.attack,
              actorUuid: `Actor.${f.actors[2]}`,
              basis: (
                await import(
                  "/systems/heroes-of-legend/services/roll-preparation.mjs"
                )
              ).rollBasis(
                game.actors.get(f.actors[2]),
                "agility",
                "defense",
                f.attack,
              ),
              draft: {},
            },
          },
        },
      }).then((m) => m.id),
    f,
  );
  const unknown = await gm.page.evaluate(
    async ({ f, id }) => {
      const a = game.messages.get(f.attack),
        m = game.messages.get(id),
        rows = structuredClone(
          a.getFlag("heroes-of-legend", "defenseResponses"),
        );
      rows.push({
        requestId: id,
        actorUuid: `Actor.${f.actors[2]}`,
        authorId: m.author.id,
        signature: await (
          await import(
            "/systems/heroes-of-legend/services/defense-responses.mjs"
          )
        ).defenseSignature(m.getFlag("heroes-of-legend", "defenseRequest")),
        attempt: 1,
        status: "rolling",
        reason: "Injected unresolved phase",
      });
      await a.update({ "flags.heroes-of-legend.defenseResponses": rows });
      const { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/authority.mjs"
      );
      await bindCreationAuthority();
      const { resolveDefenseRequest } = await import(
        "/systems/heroes-of-legend/services/defense-responses.mjs"
      );
      try {
        await resolveDefenseRequest(id);
      } catch (e) {
        return e.message;
      }
    },
    { f, id: pending },
  );
  assert.match(unknown, /will not reroll/);
  assert.equal(
    await gm.page.evaluate((id) => game.messages.get(id).rolls.length, pending),
    0,
  );
  await gm.page.evaluate(async () => {
    const { AuthorityPanel } = await import(
      "/systems/heroes-of-legend/applications/authority.mjs"
    );
    await new AuthorityPanel().render({ force: true });
  });
  await gm.page
    .locator(".hol-authority")
    .getByRole("button", { name: "Abandon unknown result", exact: true })
    .click();
  await gm.page
    .locator('[name="reason"]')
    .fill("No saved result; DA permits a new explicit attempt");
  await gm.page
    .getByRole("button", { name: "Record abandonment", exact: true })
    .click();
  await settled(pending);
  const disposition = await gm.page.evaluate(
    ({ f, id }) =>
      game.messages
        .get(f.attack)
        .getFlag("heroes-of-legend", "defenseResponses")
        .find((r) => r.requestId === id),
    { f, id: pending },
  );
  assert.equal(disposition.status, "abandoned");
  assert.match(disposition.disposition.reason, /DA permits/);
  await p1.page.evaluate(() =>
    game.settings.set("core", "messageMode", "blind"),
  );
  const after = await submit(p1, 2, {
    additionalAttempt: true,
    attemptReason: "DA reviewed the abandoned attempt",
  });
  await settled(after);
  const hidden = await gm.page.evaluate((id) => {
    const m = game.messages.get(id);
    return {
      blind: m.blind,
      whisper: m.whisper,
      author: m.author.id,
      roller: m.getFlag("heroes-of-legend", "roll").rollerId,
    };
  }, after);
  assert(hidden.blind);
  assert.equal(hidden.author, f.users[0].id);
  assert.equal(hidden.roller, hidden.author);
  assert(!hidden.whisper.includes(hidden.author));
  assert.equal(
    await gm.page.evaluate(
      (f) =>
        game.messages.filter(
          (m) =>
            m.getFlag("heroes-of-legend", "roll")?.attackMessageId === f.attack,
        ).length,
      f,
    ),
    4,
  );
  assert.deepEqual(
    await gm.page.evaluate(
      (f) => f.actors.map((id) => game.actors.get(id).system.health.value),
      f,
    ),
    [12, 12, 12],
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS: two-player same-defender race yields one official roll, independent defenders, original native author, explicit additional-attempt UI/reason, stale-source rejection, saved-result settlement without reroll, unresolved-roll DA disposition, blind mode and no HP mutation.",
  );
} finally {
  await p1?.context.close();
  await p2?.context.close();
  if (gm && f)
    await gm.page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        for (const m of game.messages.filter(
          (m) =>
            m.id === f.attack ||
            m.getFlag("heroes-of-legend", "defenseRequest")?.attackMessageId ===
              f.attack,
        ))
          await m.delete();
        for (const id of f.actors) await game.actors.get(id)?.delete();
        for (const u of f.users) await game.users.get(u.id)?.delete();
      }, f)
      .catch((e) => console.error("Cleanup:", e.message));
  await browser.close();
}
