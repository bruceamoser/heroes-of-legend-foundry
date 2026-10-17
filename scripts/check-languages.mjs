import { chromium } from "playwright";
import assert from "node:assert/strict";
import { selectTestUser } from "./helpers/login.mjs";

const url = process.env.HOL_TEST_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  process.env.HOL_TEST_ALLOW_WRITES !== "1"
)
  throw new Error(
    "Use an explicitly authorized disposable local Foundry world",
  );

const browser = await chromium.launch(),
  errors = [];
let gm, owner, fixture;

async function join(name) {
  const context = await browser.newContext();
  await context.addInitScript(() =>
    localStorage.setItem("core.noCanvas", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await selectTestUser(page, name);
  await page.locator("button[name=join]").click();
  await page.waitForFunction(() => game.ready);
  return page;
}

try {
  gm = await join(process.env.HOL_TEST_USER ?? "Gamemaster");
  fixture = await gm.evaluate(() => {
    if (game.settings.get("heroes-of-legend", "creationAuthorityClient"))
      throw new Error("Test requires an unbound creation authority");
    return {
      priorLanguages: game.settings.get(
        "heroes-of-legend",
        "campaignLanguages",
      ),
      fixtureId: foundry.utils.randomID(12),
    };
  });
  Object.assign(
    fixture,
    await gm.evaluate(async (fixtureId) => {
      const { bindCreationAuthority } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      await bindCreationAuthority();
      const { createDefaultLanguageConfiguration } = await import(
        "/systems/heroes-of-legend/rules/languages.mjs"
      );
      const { writeCampaignLanguages } = await import(
        "/systems/heroes-of-legend/services/languages.mjs"
      );
      const { loadCatalogs } = await import(
        "/systems/heroes-of-legend/services/catalog.mjs"
      );
      const configured = createDefaultLanguageConfiguration();
      configured.definitions.find((language) => language.id === "common").name =
        "Marsh Common";
      configured.definitions.push(
        {
          id: "reed-speech",
          name: "Reed Speech",
          ordinary: true,
          form: "spoken",
          writing: true,
        },
        {
          id: "river-speech",
          name: "River Speech",
          ordinary: true,
          form: "spoken",
          writing: true,
        },
      );
      const first = await writeCampaignLanguages(configured);
      const { commit } = await loadCatalogs();
      const account = await User.create({
        name: `Language Owner ${foundry.utils.randomID(4)}`,
        role: CONST.USER_ROLES.PLAYER,
        flags: { "heroes-of-legend": { languageFixture: fixtureId } },
      });
      const baseDraft = (home, traits, extraSpoken = []) => ({
        name: "Language fixture",
        attributes: {
          brawn: 1,
          fortitude: 0,
          agility: 0,
          guile: 0,
          knowledge: 1,
          reason: 1,
        },
        ancestryId: "ancestry-human",
        traitIds: traits,
        languages: { home, extraSpoken },
        culture: { id: "origin-culture-deep-halls", pair: 0 },
        background: { id: "origin-background-bridge-worker", pair: 0 },
        classId: "class-intellect",
        classDisciplines: ["discipline-craft", "discipline-scholarship"],
        signatureId: "ability-signature-intellect-spot-the-leverage",
        acquisitions: {
          "ability-trail-workshop": {
            recipes: ["recipe-travel-food", "recipe-bound-torches"],
          },
        },
        purchases: {
          0: [{ id: "ability-conditioned-body" }],
          1: [{ id: "ability-conditioned-body" }],
        },
        shopping: [],
      });
      const createDraftActor = (name, draft, extra = {}) =>
        Actor.create({
          name,
          type: "character",
          ownership: { [account.id]: 3 },
          flags: {
            "heroes-of-legend": {
              languageFixture: fixtureId,
              creationDraft: {
                schemaVersion: 1,
                sourceCommit: commit,
                languageBasis: first.basis,
                revision: 1,
                step: 1,
                data: draft,
              },
            },
          },
          ...extra,
        });
      const optionActor = await createDraftActor("Language option fixture", {
        ...baseDraft("removed-home", [
          "trait-human-weathered",
          "trait-human-many-homes",
        ]),
        culture: undefined,
        background: undefined,
        classId: "",
        classDisciplines: [],
        signatureId: "",
        acquisitions: {},
        purchases: { 0: [], 1: [] },
      });
      const customActor = await createDraftActor(
        "Custom language fixture",
        baseDraft(
          "river-speech",
          ["trait-human-weathered", "trait-human-many-homes"],
          ["reed-speech", "dwarven"],
        ),
        {
          system: { biography: "Preserve this biography" },
          items: [
            { name: "Personal language item", type: "ability" },
            {
              name: "Existing craft tools",
              type: "equipment",
              system: { catalogId: "item-craft-tools" },
            },
          ],
        },
      );
      const signedActor = await createDraftActor(
        "Signed language fixture",
        baseDraft("way-sign", [
          "trait-human-weathered",
          "trait-human-far-walker",
        ]),
      );
      const duplicateActor = await createDraftActor(
        "Duplicate language fixture",
        {
          ...baseDraft(
            "dwarven",
            ["trait-human-weathered", "trait-human-many-homes"],
            ["dwarven", "way-sign"],
          ),
          culture: undefined,
          background: undefined,
          classId: "",
          classDisciplines: [],
          signatureId: "",
          acquisitions: {},
          purchases: { 0: [], 1: [] },
        },
      );
      const reviewActor = await createDraftActor(
        "Language review basis fixture",
        baseDraft(
          "river-speech",
          ["trait-human-weathered", "trait-human-many-homes"],
          ["reed-speech", "dwarven"],
        ),
      );
      await reviewActor.update({
        "flags.heroes-of-legend.creationDraft.step": 7,
      });
      const staleActor = await createDraftActor(
        "Stale language fixture",
        baseDraft(
          "river-speech",
          ["trait-human-weathered", "trait-human-many-homes"],
          ["reed-speech", "dwarven"],
        ),
      );
      return {
        account: account.id,
        accountName: account.name,
        firstBasis: first.basis,
        definitionCount: first.definitions.length,
        optionActor: optionActor.id,
        customActor: customActor.id,
        signedActor: signedActor.id,
        duplicateActor: duplicateActor.id,
        reviewActor: reviewActor.id,
        staleActor: staleActor.id,
        current: {
          schemaVersion: 1,
          definitions: first.definitions,
        },
      };
    }, fixture.fixtureId),
  );

  owner = await join(fixture.accountName);
  const nonGmWriteDenied = await owner.evaluate(async (configuration) => {
    const { writeCampaignLanguages } = await import(
      "/systems/heroes-of-legend/services/languages.mjs"
    );
    try {
      await writeCampaignLanguages(configuration);
      return false;
    } catch (error) {
      return error.message.includes("Only a GM");
    }
  }, fixture.current);
  assert(nonGmWriteDenied);

  const invalidFailsClosed = await gm.evaluate(async (configuration) => {
    const invalid = structuredClone(configuration);
    invalid.definitions.find((language) => language.id === "common").ordinary =
      false;
    await game.settings.set("heroes-of-legend", "campaignLanguages", invalid);
    const { getCampaignLanguageConfiguration } = await import(
      "/systems/heroes-of-legend/services/languages.mjs"
    );
    let rejected = false;
    try {
      getCampaignLanguageConfiguration();
    } catch (error) {
      rejected =
        error.message.includes("Common must remain an ordinary language") &&
        error.message.includes("invalid");
    }
    await game.settings.set(
      "heroes-of-legend",
      "campaignLanguages",
      configuration,
    );
    return rejected;
  }, fixture.current);
  assert(invalidFailsClosed);

  await gm.evaluate(async () => {
    const { CampaignLanguageSettings } = await import(
      "/systems/heroes-of-legend/applications/languages.mjs"
    );
    globalThis.holLanguageSettings = new CampaignLanguageSettings();
    await globalThis.holLanguageSettings.render({ force: true });
  });
  const settingsWindow = gm.locator(".hol-language-settings");
  await settingsWindow.waitFor();
  assert.equal(
    await settingsWindow.locator("[data-language-row]").count(),
    fixture.definitionCount,
  );
  assert.notEqual(
    await settingsWindow
      .locator('[data-language-row] [name="languageId"]')
      .first()
      .getAttribute("readonly"),
    null,
  );
  assert.match(
    await settingsWindow.innerText(),
    /9bc9b4fe3256e68880b92c45facf0f25b98a1ea3/,
  );

  await owner.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    globalThis.holCreation = new CreationWizard(game.actors.get(id));
    await globalThis.holCreation.render({ force: true });
  }, fixture.optionActor);
  const wizard = owner.locator(".hol-creation");
  const home = wizard.locator('[data-language-choice="home"]');
  const extra = wizard.locator('[data-language-choice="extra"]');
  assert.equal(
    await home.locator("[data-language-option]").count(),
    fixture.definitionCount + 1,
  );
  assert.equal(
    await extra.locator("[data-language-option]").count(),
    fixture.definitionCount,
  );
  assert(
    await home.locator('[data-language-option="draconic"] input').isDisabled(),
  );
  assert(
    await home.locator('[data-language-option="common"] input').isDisabled(),
  );
  assert(
    !(await home
      .locator('[data-language-option="way-sign"] input')
      .isDisabled()),
  );
  assert(
    await extra.locator('[data-language-option="way-sign"] input').isDisabled(),
  );
  assert(
    await extra.locator('[data-language-option="draconic"] input').isDisabled(),
  );
  assert.match(
    await extra.locator('[data-language-option="way-sign"]').innerText(),
    /signed.*spoken-only/i,
  );
  assert.match(
    await extra.locator('[data-language-option="draconic"]').innerText(),
    /uncommon.*unavailable/i,
  );
  const removed = home.locator('[data-language-option="removed-home"]');
  assert(await removed.locator("input").isChecked());
  assert(await removed.locator("input").isDisabled());
  assert.match(await removed.innerText(), /no longer defined/i);

  await owner.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    await globalThis.holCreation.close();
    globalThis.holCreation = new CreationWizard(game.actors.get(id));
    await globalThis.holCreation.render({ force: true });
  }, fixture.duplicateActor);
  const duplicateWizard = owner.locator(".hol-creation");
  const duplicateHome = duplicateWizard.locator(
    '[data-language-choice="home"] [data-language-option="dwarven"]',
  );
  assert(await duplicateHome.locator("input").isChecked());
  assert(await duplicateHome.locator("input").isDisabled());
  assert.match(await duplicateHome.innerText(), /extra language/i);
  const duplicateExtra = duplicateWizard.locator(
    '[data-language-choice="extra"] [data-language-option="dwarven"]',
  );
  assert(await duplicateExtra.locator("input").isChecked());
  assert(!(await duplicateExtra.locator("input").isDisabled()));
  assert.match(await duplicateExtra.innerText(), /home language/i);
  const signedRepair = duplicateWizard.locator(
    '[data-language-choice="extra"] [data-language-option="way-sign"]',
  );
  assert(await signedRepair.locator("input").isChecked());
  assert(!(await signedRepair.locator("input").isDisabled()));
  assert.match(await signedRepair.innerText(), /signed.*spoken-only/i);
  await duplicateExtra.locator("input").uncheck();
  assert(await duplicateExtra.locator("input").isDisabled());

  const request = (actor) =>
    owner.evaluate(async (id) => {
      const { requestCreation } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      return (await requestCreation(game.actors.get(id), 1)).id;
    }, actor);
  const customRequest = await request(fixture.customActor);
  const signedRequest = await request(fixture.signedActor);
  await gm.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          game.actors.get(id).getFlag("heroes-of-legend", "creationReceipt")
            ?.status === "complete",
      ),
    [fixture.customActor, fixture.signedActor],
  );

  const committed = await gm.evaluate(
    ({ custom, signed }) => {
      const customActor = game.actors.get(custom),
        signedActor = game.actors.get(signed),
        customSummary = customActor.getFlag(
          "heroes-of-legend",
          "development",
        ).creationSummary,
        signedSummary = signedActor.getFlag(
          "heroes-of-legend",
          "development",
        ).creationSummary;
      return {
        languages: customSummary.languages,
        signed: signedSummary.languages,
        biography: customActor.system.biography,
        personal: customActor.items.some(
          (item) => item.name === "Personal language item",
        ),
        equipment: customActor.items.some(
          (item) => item.name === "Existing craft tools",
        ),
        languageBasis: customActor.getFlag(
          "heroes-of-legend",
          "creationReceipt",
        ).languageBasis,
      };
    },
    { custom: fixture.customActor, signed: fixture.signedActor },
  );
  assert.equal(committed.languages[0].name, "Marsh Common");
  assert.equal(committed.languages[1].id, "river-speech");
  assert.equal(committed.languages[1].permissions.read, true);
  assert.deepEqual(
    committed.languages.slice(2).map((language) => language.id),
    ["reed-speech", "dwarven"],
  );
  assert(
    committed.languages
      .slice(2)
      .every(
        (language) =>
          language.permissions.speak &&
          !language.permissions.read &&
          !language.permissions.write,
      ),
  );
  assert.equal(committed.signed[1].id, "way-sign");
  assert.equal(committed.signed[1].permissions.sign, true);
  assert.equal(committed.signed[1].permissions.speak, false);
  assert.equal(committed.biography, "Preserve this biography");
  assert(committed.personal);
  assert(committed.equipment);
  assert.equal(committed.languageBasis, fixture.firstBasis);

  await owner.evaluate(async (id) => {
    const { CreationWizard } = await import(
      "/systems/heroes-of-legend/applications/creation.mjs"
    );
    await globalThis.holCreation.close();
    globalThis.holCreation = new CreationWizard(game.actors.get(id));
    await globalThis.holCreation.render({ force: true });
  }, fixture.reviewActor);
  const reviewWizard = owner.locator(".hol-creation");
  await reviewWizard.waitFor();

  const changed = await gm.evaluate(async () => {
    const { createDefaultLanguageConfiguration } = await import(
      "/systems/heroes-of-legend/rules/languages.mjs"
    );
    const { writeCampaignLanguages } = await import(
      "/systems/heroes-of-legend/services/languages.mjs"
    );
    const next = createDefaultLanguageConfiguration();
    next.definitions.find((language) => language.id === "common").name =
      "Second Common";
    next.definitions.push(
      {
        id: "reed-speech",
        name: "Reed Speech",
        ordinary: true,
        form: "spoken",
        writing: true,
      },
      {
        id: "river-speech",
        name: "River Speech",
        ordinary: true,
        form: "spoken",
        writing: true,
      },
    );
    return writeCampaignLanguages(next);
  });
  assert.notEqual(changed.basis, fixture.firstBasis);

  await reviewWizard
    .getByRole("button", { name: "Save choices", exact: true })
    .click();
  await owner.waitForFunction(() => {
    const wizard = document.querySelector(".hol-creation");
    return (
      wizard &&
      wizard.textContent.includes(
        "Campaign languages changed after this draft was saved",
      )
    );
  });
  const rejectedBasisSave = await gm.evaluate((id) => {
    const draft = game.actors
      .get(id)
      .getFlag("heroes-of-legend", "creationDraft");
    return { revision: draft.revision, basis: draft.languageBasis };
  }, fixture.reviewActor);
  assert.equal(rejectedBasisSave.revision, 1);
  assert.equal(rejectedBasisSave.basis, fixture.firstBasis);

  await reviewWizard
    .getByRole("button", { name: "Save choices", exact: true })
    .click();
  await gm.waitForFunction(
    (id) =>
      game.actors.get(id).getFlag("heroes-of-legend", "creationDraft")
        ?.revision === 2,
    fixture.reviewActor,
  );
  const acceptedBasisSave = await gm.evaluate((id) => {
    const draft = game.actors
      .get(id)
      .getFlag("heroes-of-legend", "creationDraft");
    return { revision: draft.revision, basis: draft.languageBasis };
  }, fixture.reviewActor);
  assert.equal(acceptedBasisSave.revision, 2);
  assert.equal(acceptedBasisSave.basis, changed.basis);

  const staleRequest = await request(fixture.staleActor);
  await gm.waitForFunction(
    (id) =>
      game.messages
        .get(id)
        ?.content.includes("Campaign language settings changed"),
    staleRequest,
  );
  const staleUntouched = await gm.evaluate(
    (id) => !game.actors.get(id).getFlag("heroes-of-legend", "creationReceipt"),
    fixture.staleActor,
  );
  assert(staleUntouched);

  const preserved = await gm.evaluate(
    async ({ actor, requestId }) => {
      const before = JSON.stringify(
        game.actors.get(actor).getFlag("heroes-of-legend", "development")
          .creationSummary.languages,
      );
      const { resolveCreationRequest } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      const result = await resolveCreationRequest(requestId);
      const after = JSON.stringify(
        game.actors.get(actor).getFlag("heroes-of-legend", "development")
          .creationSummary.languages,
      );
      return { replay: result.replay, unchanged: before === after };
    },
    { actor: fixture.customActor, requestId: customRequest },
  );
  assert(preserved.replay);
  assert(preserved.unchanged);
  assert.deepEqual(errors, []);
  console.info(
    "PASS V14 languages: source defaults with explicit custom languages, GM configuration, rendered-basis save rejection, duplicate repair, removed-choice disabling, spoken/signed grants, stale-basis rejection, non-GM denial and committed-grant preservation.",
  );
} finally {
  if (gm && fixture)
    await gm
      .evaluate(async (data) => {
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await globalThis.holLanguageSettings?.close();
        await releaseAuthority().catch(() => {});
        const fixtureActors =
          game.actors?.filter(
            (actor) =>
              actor.getFlag("heroes-of-legend", "languageFixture") ===
              data.fixtureId,
          ) ?? [];
        for (const message of game.messages.filter((entry) =>
          fixtureActors.some(
            (actor) =>
              entry.getFlag("heroes-of-legend", "creationRequest")
                ?.actorUuid === actor.uuid,
          ),
        ))
          await message.delete();
        for (const actor of fixtureActors) await actor.delete();
        const account =
          game.users.get(data.account) ??
          game.users.find(
            (user) =>
              user.getFlag("heroes-of-legend", "languageFixture") ===
              data.fixtureId,
          );
        await account?.delete();
        await game.settings.set(
          "heroes-of-legend",
          "campaignLanguages",
          data.priorLanguages,
        );
      }, fixture)
      .catch((error) => console.error(error.message));
  await browser.close();
}
