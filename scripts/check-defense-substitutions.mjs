import assert from "node:assert/strict";
import { chromium } from "playwright";
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
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(url);
  await selectTestUser(page, "Gamemaster");
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => globalThis.game?.ready);
  const fixture = await page.evaluate(async () => {
    const created = (globalThis.__hol171Substitution = {
      actor: null,
      attack: null,
      request: null,
      dialog: null,
      settings: Object.fromEntries(
        ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
          (key) => [
            key,
            structuredClone(game.settings.get("heroes-of-legend", key)),
          ],
        ),
      ),
    });
    const ID = "heroes-of-legend";
    const { bindCreationAuthority, authorityBrowserId, isCreationAuthority } =
      await import("/systems/heroes-of-legend/services/authority.mjs");
    const original = created.settings,
      bound = original.creationAuthorityClient,
      meta = original.authorityMeta,
      work = original.authorityWork;
    if (
      bound &&
      !isCreationAuthority() &&
      meta.launch === game.world.lastPlayed &&
      meta.browserId !== authorityBrowserId()
    ) {
      if (
        meta.clientId !== bound ||
        work.clientId !== bound ||
        work.busy !== false ||
        work.uncertain
      )
        throw new Error(
          "An earlier coordinator has unsettled work; do not replace it.",
        );
      await game.settings.set(ID, "creationAuthorityClient", "");
      await game.settings.set(ID, "authorityMeta", {});
      await game.settings.set(ID, "authorityWork", {});
    }
    await bindCreationAuthority({ restartConfirmed: true });
    const actor = await Actor.create({
      name: "HOL171 substitution disposable defender",
      type: "character",
      system: {
        attributes: {
          agility: { base: 0 },
          brawn: { base: 2 },
          knowledge: { base: 1 },
          reason: { base: 0 },
        },
      },
      flags: {
        "heroes-of-legend": {
          development: { creationSummary: { speedBase: 6 } },
        },
      },
    });
    created.actor = actor.id;
    const { DEFENSE_SUBSTITUTIONS } = await import(
      "/systems/heroes-of-legend/rules/defense-substitutions.mjs"
    );
    const items = await actor.createEmbeddedDocuments(
      "Item",
      Object.entries(DEFENSE_SUBSTITUTIONS).map(([id, rule]) => ({
        name: id.replace("ability-", "").replaceAll("-", " "),
        type: "ability",
        flags: {
          "heroes-of-legend": {
            catalogId: id,
            source: { path: rule.path, sha256: rule.sha256 },
          },
        },
      })),
    );
    const attack = await ChatMessage.create({
      content: "HOL171 substitution fixture",
      flags: {
        "heroes-of-legend": {
          attackCard: {
            perspective: "defender",
            title: "Fixture attack",
            attackerName: "Fixture",
            attributeKey: "agility",
            threat: { boons: 0, banes: 0 },
            damage: { weak: 4, standard: 3, strong: 2 },
          },
        },
      },
    });
    created.attack = attack.id;
    const { SharedRollDialog } = await import(
      "/systems/heroes-of-legend/dialogs/attribute-roll.mjs"
    );
    created.dialog = new SharedRollDialog(actor, "agility", {
      mode: "defense",
      attackMessageId: attack.id,
    });
    await created.dialog.render({ force: true });
    return {
      options: items.map((item) => ({
        id: item.getFlag("heroes-of-legend", "catalogId"),
        uuid: item.uuid,
      })),
      attributes: Object.fromEntries(
        ["agility", "brawn", "knowledge", "reason"].map((key) => [
          key,
          actor.system.attributes[key].effective,
        ]),
      ),
    };
  });
  const dialog = page.locator(".hol-roll-dialog"),
    select = dialog.locator('[name="defenseSubstitutionItemUuid"]');
  assert.equal(await select.locator("option").count(), 5);
  assert.equal(
    await dialog.locator("output").innerText(),
    `3d6 + (${fixture.attributes.agility})`,
  );
  const expected = {
    "ability-catch-the-mechanism": ["knowledge", 0],
    "ability-steel-at-the-wrist": ["brawn", 0],
    "ability-snare-the-missile": ["knowledge", 1],
    "ability-thought-before-the-blow": ["reason", 1],
  };
  for (const option of fixture.options) {
    const [key, boon] = expected[option.id];
    await select.selectOption(option.uuid);
    assert.equal(
      await dialog.locator("output").innerText(),
      `${boon ? "4d6kh3" : "3d6"} + (${fixture.attributes[key]})`,
    );
    assert.match(
      await dialog.locator("[data-roll-attribute]").innerText(),
      new RegExp(String(fixture.attributes[key])),
    );
  }
  await select.selectOption("");
  assert.equal(
    await dialog.locator("output").innerText(),
    `3d6 + (${fixture.attributes.agility})`,
  );
  const snapshot = await page.evaluate(
    async (uuid) => {
      const fixture = globalThis.__hol171Substitution,
        actor = game.actors.get(fixture.actor);
      const { evaluatePreparedRoll } = await import(
        "/systems/heroes-of-legend/services/roll.mjs"
      );
      const { rollBasis } = await import(
        "/systems/heroes-of-legend/services/roll-preparation.mjs"
      );
      return (
        await evaluatePreparedRoll(
          actor,
          rollBasis(actor, "agility", "defense", fixture.attack),
          {
            defenseSubstitutionItemUuid: uuid,
            perception: {},
            woundApplicability: {},
          },
        )
      ).snapshot;
    },
    fixture.options.find(
      (option) => option.id === "ability-thought-before-the-blow",
    ).uuid,
  );
  assert.equal(snapshot.attributeKey, "agility");
  assert.equal(snapshot.resolvedAttributeKey, "reason");
  assert.equal(snapshot.boons, 1);
  assert.equal(snapshot.attackMessageId != null, true);
  const requestId = await page.evaluate(
    async (uuid) => {
      const fixture = globalThis.__hol171Substitution,
        actor = game.actors.get(fixture.actor);
      const { requestDefense } = await import(
        "/systems/heroes-of-legend/services/defense-responses.mjs"
      );
      const { rollBasis } = await import(
        "/systems/heroes-of-legend/services/roll-preparation.mjs"
      );
      const request = await requestDefense(
        actor,
        rollBasis(actor, "agility", "defense", fixture.attack),
        {
          defenseSubstitutionItemUuid: uuid,
          perception: {},
          woundApplicability: {},
        },
      );
      fixture.request = request.id;
      return request.id;
    },
    fixture.options.find((option) => option.id === "ability-snare-the-missile")
      .uuid,
  );
  await page.waitForFunction((id) => {
    const message = game.messages.get(id),
      attack = game.messages.get(__hol171Substitution.attack);
    return (
      message?.getFlag("heroes-of-legend", "defenseStatus") === "failed" ||
      attack
        ?.getFlag("heroes-of-legend", "defenseResponses")
        ?.some((row) => row.requestId === id && row.status === "resolved")
    );
  }, requestId);
  const recorded = await page.evaluate((id) => {
    const message = game.messages.get(id);
    return {
      snapshot: message.getFlag("heroes-of-legend", "roll"),
      flavor: message.flavor,
      status: message.getFlag("heroes-of-legend", "defenseStatus"),
      responses: game.messages
        .get(__hol171Substitution.attack)
        .getFlag("heroes-of-legend", "defenseResponses"),
    };
  }, requestId);
  assert.equal(recorded.status, "rolled");
  assert.equal(recorded.snapshot.attributeKey, "agility");
  assert.equal(recorded.snapshot.resolvedAttributeKey, "knowledge");
  assert.equal(
    recorded.snapshot.attackMessageId,
    await page.evaluate(() => __hol171Substitution.attack),
  );
  assert.match(recorded.flavor, /Knowledge/i);
  assert.equal(
    recorded.responses.filter(
      (row) => row.requestId === requestId && row.status === "resolved",
    ).length,
    1,
  );
} finally {
  try {
    const failures = await page.evaluate(async () => {
      const fixture = globalThis.__hol171Substitution;
      if (!fixture) return ["Fixture state was lost before cleanup."];
      const failures = [];
      for (const [label, task] of [
        ["dialog", () => fixture.dialog?.close()],
        [
          "request",
          () => fixture.request && game.messages.get(fixture.request)?.delete(),
        ],
        [
          "attack",
          () => fixture.attack && game.messages.get(fixture.attack)?.delete(),
        ],
        [
          "actor",
          () => fixture.actor && game.actors.get(fixture.actor)?.delete(),
        ],
      ])
        try {
          await task();
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
        }
      if (
        game.messages.has(fixture.request) ||
        game.messages.has(fixture.attack) ||
        game.actors.has(fixture.actor)
      )
        failures.push("Fixture documents remain after cleanup.");
      try {
        const ID = "heroes-of-legend",
          authority = await import(
            "/systems/heroes-of-legend/services/authority.mjs"
          ),
          work = game.settings.get(ID, "authorityWork"),
          current = Object.fromEntries(
            ["creationAuthorityClient", "authorityMeta", "authorityWork"].map(
              (key) => [key, game.settings.get(ID, key)],
            ),
          );
        let restore = false;
        if (authority.isCreationAuthority()) {
          if (work?.busy || work?.uncertain)
            throw new Error(
              "Coordinator work is unsettled; settings were preserved for recovery.",
            );
          await authority.releaseAuthority();
          restore = true;
        } else if (
          !current.creationAuthorityClient &&
          !Object.keys(current.authorityMeta ?? {}).length &&
          !Object.keys(current.authorityWork ?? {}).length
        ) {
          restore = true;
        } else if (
          JSON.stringify(current) !== JSON.stringify(fixture.settings)
        ) {
          throw new Error(
            "Another coordinator owns the world; settings were preserved.",
          );
        }
        if (restore) {
          const saved =
            fixture.settings.creationAuthorityClient === game.socket.id
              ? {
                  creationAuthorityClient: "",
                  authorityMeta: {},
                  authorityWork: {},
                }
              : fixture.settings;
          for (const [key, value] of Object.entries(saved))
            await game.settings.set(ID, key, value);
        }
      } catch (error) {
        failures.push(`coordinator: ${error.message}`);
      }
      delete globalThis.__hol171Substitution;
      return failures;
    });
    assert.deepEqual(
      failures,
      [],
      "Defense substitution fixture cleanup failed.",
    );
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
console.info(
  "PASS: four pinned owned substitutions and ordinary defense preview in one native dialog; actual stat/Boon snapshot and one GM response; cleanup; no page errors.",
);
