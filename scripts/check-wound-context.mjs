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
  throw new Error(
    "Use a local disposable world and enable HOL_TEST_ALLOW_WRITES=1.",
  );

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  }),
  errors = [];
let joined = false,
  fixture = null,
  page = null;
try {
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, process.env.HOL_TEST_USER ?? "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  joined = true;
  fixture = await page.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    if (game.settings.get("heroes-of-legend", "creationAuthorityClient"))
      throw new Error("Wound context fixture requires an unbound coordinator.");
    await bindCreationAuthority();
    const id = "heroes-of-legend",
      woundModifier = (data) => ({
        woundId: data.woundId,
        injury: data.injury,
        sourceCommit: "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
        source: {
          path: "design/rules/wounds.md",
          sha256:
            "58c42a717e00aa74310523cde3850a5af1c97ef58c8d3766933538964baf17c9",
        },
        ...data.effect,
      }),
      effects = [
        {
          name: "Leg: torn knee ligaments · physical",
          flags: {
            [id]: {
              woundEvent: "context-physical",
              woundModifier: woundModifier({
                woundId: "wound-physical-346",
                injury: "Leg: torn knee ligaments",
                effect: {
                  kind: "rollModifier",
                  polarity: "bane",
                  amount: 1,
                  context: "physical",
                  printedContext: "physical activities",
                  requiresContext: true,
                },
              }),
            },
          },
        },
        {
          name: "Severely fragmented thought · mental",
          flags: {
            [id]: {
              woundEvent: "context-mental",
              woundModifier: woundModifier({
                woundId: "wound-mental-445",
                injury: "Severely fragmented thought",
                effect: {
                  kind: "rollModifier",
                  polarity: "bane",
                  amount: 2,
                  context: "mental",
                  printedContext: "mental activities",
                  requiresContext: true,
                },
              }),
            },
          },
        },
        {
          name: "Face: jagged cheek scar · intimidate",
          flags: {
            [id]: {
              woundEvent: "context-social",
              woundModifier: woundModifier({
                woundId: "wound-physical-133",
                injury: "Face: jagged cheek scar",
                effect: {
                  kind: "rollModifier",
                  polarity: "boon",
                  amount: 1,
                  context: "intimidate",
                  printedContext: "intimidate",
                  requiresContext: true,
                },
              }),
            },
          },
        },
        {
          name: "Face: jagged cheek scar · persuade",
          flags: {
            [id]: {
              woundEvent: "context-social",
              woundModifier: woundModifier({
                woundId: "wound-physical-133",
                injury: "Face: jagged cheek scar",
                effect: {
                  kind: "rollModifier",
                  polarity: "bane",
                  amount: 1,
                  context: "persuade",
                  printedContext:
                    "persuade when visible scar influences interaction",
                  requiresContext: true,
                },
              }),
            },
          },
        },
        {
          name: "Leg: badly sprained knee · movement",
          flags: {
            [id]: {
              woundEvent: "context-movement",
              woundModifier: woundModifier({
                woundId: "wound-physical-256",
                injury: "Leg: badly sprained knee",
                effect: { kind: "movementPenalty", amount: 2 },
              }),
            },
          },
        },
      ],
      actor = await Actor.create({
        name: "Wound context fixture",
        type: "character",
        system: { attributes: { brawn: { base: 1 } } },
        flags: {
          [id]: {
            development: { creationSummary: { speedBase: 6 } },
          },
        },
        items: [
          {
            name: "Fixture carried load",
            type: "equipment",
            system: {
              catalogId: "fixture-load",
              quantity: 1,
              bulk: 14,
              hands: 0,
              inventoryDie: 4,
            },
          },
        ],
      }),
      created = await actor.createEmbeddedDocuments("ActiveEffect", effects),
      effectIds = Object.fromEntries(
        created.map((effect) => [
          effect.getFlag(id, "woundModifier").context ??
            effect.getFlag(id, "woundModifier").kind,
          effect.id,
        ]),
      ),
      combat = await Combat.create({ active: true }),
      [participant] = await combat.createEmbeddedDocuments("Combatant", [
        {
          actorId: actor.id,
          name: actor.name,
          flags: { [id]: { side: "players" } },
        },
      ]);
    return {
      actor: actor.id,
      combat: combat.id,
      participant: participant.id,
      effectIds,
    };
  });
  await page.evaluate(async (actorId) => {
    await game.actors.get(actorId).sheet.render({ force: true });
  }, fixture.actor);
  await page.locator(".hol-character [data-attribute=brawn]").click();
  const dialog = page.locator(".hol-roll-dialog"),
    wounds = dialog.locator(".hol-wound-context");
  await wounds.first().waitFor();
  assert.equal(await wounds.count(), 4);
  assert.equal(await dialog.locator('[data-action="roll"]').isDisabled(), true);
  const text = await wounds.allInnerTexts();
  assert(text.some((value) => value.includes("physical activities")));
  assert(text.some((value) => value.includes("mental activities")));
  assert(text.some((value) => value.includes("intimidate")));
  assert(
    text.some((value) =>
      value.includes("persuade when visible scar influences interaction"),
    ),
  );
  const choose = async (context, choice) =>
    dialog
      .locator(
        `.hol-wound-context[data-effect-id="${fixture.effectIds[context]}"] select`,
      )
      .selectOption(choice);
  await choose("physical", "applies");
  await choose("mental", "does-not-apply");
  await choose("intimidate", "applies");
  await choose("persuade", "applies");
  assert.equal(await dialog.locator("output").innerText(), "4d6kl3 + (1)");
  assert.match(
    await dialog.locator(".hol-roll-totals").innerText(),
    /1 Boons · 2 Banes · 1 canceled pairs/,
  );
  assert.equal(await dialog.locator(".hol-roll-sources li").count(), 3);
  await dialog.screenshot({ path: "test-results/wound-roll-context.png" });
  const oldRoll = await page.evaluate(() => {
    const app = [...foundry.applications.instances.values()].find(
      (app) =>
        app.rendered && app.element?.classList.contains("hol-roll-dialog"),
    );
    app.readDraft();
    return {
      basis: structuredClone(app.basis),
      draft: structuredClone(app.draft),
    };
  });

  await page.evaluate(
    async ({ actorId, effectId }) => {
      await game.actors.get(actorId).effects.get(effectId).update({
        disabled: true,
      });
    },
    { actorId: fixture.actor, effectId: fixture.effectIds.physical },
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".hol-roll-dialog .hol-note")
      ?.textContent.includes("Active wound modifiers changed"),
  );
  assert.equal(await wounds.count(), 3);
  assert.match(
    await page.evaluate(
      async ({ actorId, oldRoll }) => {
        const { rollPrepared } = await import(
          "/systems/heroes-of-legend/services/roll.mjs"
        );
        try {
          await rollPrepared(
            game.actors.get(actorId),
            oldRoll.basis,
            oldRoll.draft,
          );
          return "unexpected roll";
        } catch (error) {
          return error.message;
        }
      },
      { actorId: fixture.actor, oldRoll },
    ),
    /Roll sources changed/,
  );

  assert.equal(await dialog.locator('[data-action="roll"]').isDisabled(), true);
  await page.evaluate(
    async ({ actorId, effectId }) => {
      await game.actors.get(actorId).effects.get(effectId).delete();
    },
    { actorId: fixture.actor, effectId: fixture.effectIds.mental },
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".hol-roll-dialog .hol-wound-context")
        .length === 2,
  );
  assert.equal(await dialog.locator('[data-action="roll"]').isDisabled(), true);
  await dialog.locator("[data-action=close]").click();

  const request = async (kind, payload = {}) => {
    const id = await page.evaluate(
      async ({ combatId, kind, payload }) => {
        const { requestCombat } = await import(
          "/systems/heroes-of-legend/services/combat.mjs"
        );
        return (await requestCombat(game.combats.get(combatId), kind, payload))
          .id;
      },
      { combatId: fixture.combat, kind, payload },
    );
    await page.waitForFunction(
      ({ combatId, id }) =>
        game.combats
          .get(combatId)
          .getFlag("heroes-of-legend", "operationReceipts")?.[id]?.applied,
      { combatId: fixture.combat, id },
    );
    return id;
  };
  await request("start");
  await request("choose", { id: fixture.participant });
  let movement = await page.evaluate(async (f) => {
    const { displayedBudget } = await import(
      "/systems/heroes-of-legend/services/turn-budget.mjs"
    );
    return displayedBudget(game.combats.get(f.combat), f.participant);
  }, fixture);
  assert.equal(movement.speed, 3);
  assert.equal(movement.movementProfile.encumbrance, 1);
  assert.equal(movement.movementProfile.speedBeforeWounds, 5);
  assert.equal(movement.movementProfile.woundPenalty, 2);
  assert.match(movement.movementBreakdown, /encumbrance 1 − wounds 2/);
  await page.evaluate(() => {
    ui.sidebar.expand();
    ui.sidebar.changeTab("combat", "primary");
  });
  await page
    .locator(".hol-encounter")
    .getByText("Speed 3 = base 6 + 0 − encumbrance 1 − wounds 2", {
      exact: false,
    })
    .waitFor();
  await page
    .locator(".hol-encounter")
    .screenshot({ path: "test-results/wound-movement-breakdown.png" });

  await request("finish");
  await request("choose", {
    id: fixture.participant,
    speedOverride: 4,
    reason: "Explicit DA movement ruling",
  });
  movement = await page.evaluate(async (f) => {
    const { displayedBudget } = await import(
      "/systems/heroes-of-legend/services/turn-budget.mjs"
    );
    return displayedBudget(game.combats.get(f.combat), f.participant);
  }, fixture);
  assert.equal(movement.speed, 4);
  assert.equal(movement.movementProfile.source, "da-speed-override");
  assert.match(movement.movementBreakdown, /Explicit DA movement ruling/);
  assert.deepEqual(errors, []);
  console.info(
    "PASS: native wound applicability controls, explicit social/physical/mental choices, ordinary cancellation, disabled/deleted-source invalidation, movement floor with encumbrance, tracker breakdown, explicit DA override and screenshots.",
  );
} finally {
  if (joined && page)
    await page
      .evaluate(async (f) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (f?.combat)
          for (const message of game.messages.filter(
            (message) =>
              message.getFlag("heroes-of-legend", "combatRequest")
                ?.combatUuid === `Combat.${f.combat}` ||
              message.getFlag("heroes-of-legend", "roll")?.actorUuid ===
                `Actor.${f.actor}`,
          ))
            await message.delete();
        if (f?.combat) await game.combats.get(f.combat)?.delete();
        if (f?.actor) await game.actors.get(f.actor)?.delete();
      }, fixture)
      .catch((error) => {
        console.error("Cleanup:", error.message);
        process.exitCode = 1;
      });
  await context.close();
  await browser.close();
}
