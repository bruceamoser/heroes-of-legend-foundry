import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

const fixture = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/reference-heroes.json", import.meta.url),
    "utf8",
  ),
);
const permissionProfiles = {
  full: {
    understand: true,
    express: true,
    speak: true,
    sign: false,
    read: true,
    write: true,
  },
  "spoken-only": {
    understand: true,
    express: true,
    speak: true,
    sign: false,
    read: false,
    write: false,
  },
};
const sorted = (values) => [...values].sort();
const stageFacts = (ledger) =>
  [0, 1].map((stage) => {
    const entries = ledger.filter((entry) => entry.stage === stage);
    const pool = entries.find((entry) => entry.kind === "pool").delta;
    const compensation = entries
      .filter((entry) => entry.kind.startsWith("duplicate-"))
      .reduce((total, entry) => total + entry.delta, 0);
    const spent =
      -entries
        .filter((entry) => entry.kind === "purchase")
        .reduce((total, entry) => total + entry.delta, 0) || 0;
    const expired =
      -entries
        .filter((entry) => entry.kind === "expired-pool")
        .reduce((total, entry) => total + entry.delta, 0) || 0;
    return [pool, compensation, spent, expired];
  });
const check = (hero, field, actual, expected) =>
  assert.deepEqual(
    actual,
    expected,
    `${hero.name} persisted ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
const durableProjection = (snapshot) => ({
  name: snapshot.name,
  health: snapshot.health,
  grit: snapshot.grit,
  attributes: snapshot.attributes,
  movement: snapshot.movement,
  stability: snapshot.stability,
  abilities: snapshot.development.abilities,
  ranks: snapshot.development.ranks,
  recipes: snapshot.development.recipes,
  languages: snapshot.languages,
  coins: snapshot.coins,
  ledger: snapshot.ledger,
  abilityItems: snapshot.abilityItems
    .map((item) => [item.id, item.catalogId])
    .sort(),
  equipmentItems: snapshot.equipmentItems
    .map((item) => [
      item.id,
      item.catalogId,
      item.quantity,
      item.hands,
      item.worn,
    ])
    .sort(),
  receipt: snapshot.receipt,
  operation: snapshot.operation,
  draft: {
    sourceCommit: snapshot.draft.sourceCommit,
    languageBasis: snapshot.draft.languageBasis,
    revision: snapshot.draft.revision,
    step: snapshot.draft.step,
  },
  request: snapshot.request,
});

async function readPersistedActors(ids) {
  const ID = "heroes-of-legend";
  const { movementProfile } = await import(
    "/systems/heroes-of-legend/rules/movement-budget.mjs"
  );
  const { inventory } = await import(
    "/systems/heroes-of-legend/services/catalog.mjs"
  ).then(({ loadCatalogs }) => loadCatalogs());
  return ids.map((id) => {
    const actor = game.actors.get(id);
    if (!actor) throw new Error(`Fixture Actor ${id} is missing`);
    const development = actor.getFlag(ID, "development"),
      creationSummary = development?.creationSummary,
      receipt = actor.getFlag(ID, "creationReceipt"),
      draft = actor.getFlag(ID, "creationDraft"),
      requestMessage = receipt?.requestId
        ? game.messages.get(receipt.requestId)
        : null,
      request = requestMessage?.getFlag(ID, "creationRequest"),
      abilityItems = actor.items
        .filter((item) => item.type === "ability")
        .map((item) => ({
          id: item.id,
          name: item.name,
          catalogId: item.getFlag(ID, "catalogId"),
          creationGrant: item.getFlag(ID, "creationGrant"),
          grantKind: item.getFlag(ID, "grantKind"),
        })),
      equipmentItems = actor.items
        .filter((item) => item.type === "equipment")
        .map((item) => ({
          id: item.id,
          name: item.name,
          catalogId: item.system.catalogId,
          acquisitionInstance: item.getFlag(ID, "acquisitionInstance"),
          quantity: item.system.quantity,
          bulk: item.system.bulk,
          hands: item.system.hands,
          worn: item.system.worn,
        })),
      movement = movementProfile({
        speedBase: creationSummary?.speedBase,
        agility: actor.system.attributes.agility.base,
        brawn: actor.system.attributes.brawn.base,
        items: equipmentItems,
      }),
      coinSpent = (development?.creation?.shopping ?? []).reduce(
        (total, entry) => {
          const definition = inventory.equipment.find(
            (candidate) => candidate.id === entry.id,
          );
          if (!definition)
            throw new Error(`Unknown shopping entry ${entry.id}`);
          return total + definition.price * entry.quantity;
        },
        0,
      );
    return {
      id: actor.id,
      name: actor.name,
      ownership: { ...actor.ownership },
      health: {
        value: actor.system.health.value,
        baseMax: actor.system.health.baseMax,
        max: actor.system.health.max,
      },
      grit: {
        granted: actor.system.grit.granted,
        spent: actor.system.grit.spent,
        available: actor.system.grit.available,
      },
      attributes: Object.fromEntries(
        ["brawn", "fortitude", "agility", "guile", "knowledge", "reason"].map(
          (key) => [key, actor.system.attributes[key].base],
        ),
      ),
      movement,
      stability: creationSummary?.stability,
      creationSummary,
      ledger: development?.ledger ?? [],
      languages: (creationSummary?.languages ?? []).map(
        ({ id, name, permissions }) => ({ id, name, permissions }),
      ),
      coins: {
        starting: creationSummary?.startingCoins,
        spent: coinSpent,
        remaining: development?.coins,
      },
      development,
      draft,
      receipt,
      operation: receipt?.requestId
        ? actor.getFlag(ID, "operationReceipts")?.[receipt.requestId]
        : null,
      request: requestMessage
        ? {
            id: requestMessage.id,
            authorId: requestMessage.author?.id,
            authorName: requestMessage.author?.name,
            content: requestMessage.content,
            actorUuid: request?.actorUuid,
            revision: request?.revision,
          }
        : null,
      abilityItems,
      equipmentItems,
    };
  });
}

const browser = await chromium.launch();
const errors = [];
let gm, owner, fixtureState;

async function join(name, { canvas = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  await context.addInitScript((enabled) => {
    localStorage.setItem("core.noCanvas", String(!enabled));
    localStorage.setItem("core.maxFPS", "10");
    localStorage.setItem("core.performanceMode", "0");
  }, canvas);
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
  const fixtureId = randomUUID();
  fixtureState = await gm.evaluate(() => {
    if (!String(game.version).startsWith("14.369"))
      throw new Error(
        `Reference hero test requires Foundry 14.369, found ${game.version}`,
      );
    if (!game.user.isGM || !game.users.activeGM?.isSelf)
      throw new Error("The selected coordinator must be the active GM");
    const client = game.settings.get(
      "heroes-of-legend",
      "creationAuthorityClient",
    );
    if (client)
      throw new Error("Reference hero test requires an unbound coordinator");
    return {
      gmUserId: game.user.id,
      foundryVersion: game.version,
      priorLanguages: foundry.utils.deepClone(
        game.settings.get("heroes-of-legend", "campaignLanguages"),
      ),
    };
  });
  fixtureState.fixtureId = fixtureId;

  Object.assign(
    fixtureState,
    await gm.evaluate(
      async ({ fixtureId, expectedCommit, characters, campaignLanguages }) => {
        const ID = "heroes-of-legend";
        const { bindCreationAuthority, isCreationAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await bindCreationAuthority();
        if (!isCreationAuthority())
          throw new Error("The selected GM did not become the coordinator");
        const { createDefaultLanguageConfiguration } = await import(
          "/systems/heroes-of-legend/rules/languages.mjs"
        );
        const { writeCampaignLanguages } = await import(
          "/systems/heroes-of-legend/services/languages.mjs"
        );
        const configuration = createDefaultLanguageConfiguration();
        configuration.definitions.push(...structuredClone(campaignLanguages));
        const configured = await writeCampaignLanguages(configuration);
        const { loadCatalogs } = await import(
          "/systems/heroes-of-legend/services/catalog.mjs"
        );
        const { choices, commit } = await loadCatalogs();
        if (commit !== expectedCommit)
          throw new Error(
            `Catalog commit ${commit} does not match fixture ${expectedCommit}`,
          );
        const universalAbilityIds = choices
          .filter((choice) => choice.kind === "ability" && choice.universal)
          .map((choice) => choice.id);
        const account = await User.create({
          name: `Reference Hero Owner ${foundry.utils.randomID(4)}`,
          role: CONST.USER_ROLES.PLAYER,
          flags: { [ID]: { referenceHeroFixture: fixtureId } },
        });
        const actors = [];
        for (const character of characters) {
          const draft = structuredClone(character.draft),
            actor = await Actor.create({
              name: `Draft: ${character.name}`,
              type: "character",
              ownership: { [account.id]: 3 },
              flags: {
                [ID]: {
                  referenceHeroFixture: fixtureId,
                  referenceHeroId: character.id,
                  creationDraft: {
                    schemaVersion: 1,
                    sourceCommit: commit,
                    languageBasis: configured.basis,
                    revision: 1,
                    step: 7,
                    data: draft,
                  },
                },
              },
            });
          actors.push({
            id: actor.id,
            heroId: character.id,
            name: character.name,
          });
        }
        return {
          accountId: account.id,
          accountName: account.name,
          commit,
          languageBasis: configured.basis,
          universalAbilityIds,
          actors,
        };
      },
      {
        fixtureId,
        expectedCommit: fixture.provenance.commit,
        characters: fixture.characters.map(({ id, name, draft }) => ({
          id,
          name,
          draft,
        })),
        campaignLanguages: fixture.campaignLanguages,
      },
    ),
  );
  assert.equal(fixtureState.commit, fixture.provenance.commit);
  assert(fixtureState.languageBasis);

  owner = await join(fixtureState.accountName, { canvas: true });
  const actorIds = fixtureState.actors.map((actor) => actor.id);
  const snapshots = [];

  for (const hero of fixture.characters) {
    const record = fixtureState.actors.find(
      (actor) => actor.heroId === hero.id,
    );
    assert(record, `${hero.name} draft Actor was not created`);
    assert(
      await owner.evaluate(
        ({ actorId, ownerId }) => {
          const actor = game.actors.get(actorId);
          return (
            game.user.id === ownerId &&
            actor?.testUserPermission(game.user, "OWNER")
          );
        },
        { actorId: record.id, ownerId: fixtureState.accountId },
      ),
      `${hero.name} must be committed by its player owner`,
    );

    await owner.evaluate(async (actorId) => {
      const { CreationWizard } = await import(
        "/systems/heroes-of-legend/applications/creation.mjs"
      );
      await globalThis.holReferenceWizard?.close().catch(() => {});
      globalThis.holReferenceWizard = new CreationWizard(
        game.actors.get(actorId),
      );
      await globalThis.holReferenceWizard.render({ force: true });
    }, record.id);
    const wizard = owner.locator(".hol-creation");
    await wizard.waitFor();
    await wizard
      .getByText("All creation choices are valid.", { exact: true })
      .waitFor();
    const commit = wizard.getByRole("button", {
      name: "Create this character",
      exact: true,
    });
    assert(
      await commit.isEnabled(),
      `${hero.name} Review commit control is disabled`,
    );
    await commit.click();

    await gm.waitForFunction((actorId) => {
      const actor = game.actors.get(actorId),
        receipt = actor?.getFlag("heroes-of-legend", "creationReceipt"),
        request = game.messages.find(
          (message) =>
            message.getFlag("heroes-of-legend", "creationRequest")
              ?.actorUuid === `Actor.${actorId}`,
        );
      return (
        (receipt?.status === "complete" &&
          request?.content.includes("Character creation completed")) ||
        request?.content.includes("needs attention")
      );
    }, record.id);
    const outcome = await gm.evaluate((actorId) => {
      const actor = game.actors.get(actorId),
        receipt = actor?.getFlag("heroes-of-legend", "creationReceipt"),
        failure = game.messages.find(
          (message) =>
            message.getFlag("heroes-of-legend", "creationRequest")
              ?.actorUuid === `Actor.${actorId}` &&
            message.content.includes("needs attention"),
        );
      return { status: receipt?.status, failure: failure?.content };
    }, record.id);
    if (outcome.status !== "complete")
      throw new Error(
        `${hero.name} native commitment did not complete: ${outcome.failure ?? "no receipt"}`,
      );

    const [snapshot] = await gm.evaluate(readPersistedActors, [record.id]);
    check(hero, "name", snapshot.name, hero.name);
    check(hero, "HP current/base maximum/derived maximum", snapshot.health, {
      value: hero.expected.stats.hp,
      baseMax: hero.expected.stats.hp,
      max: hero.expected.stats.hp,
    });
    check(hero, "Grit granted/spent/available", snapshot.grit, {
      granted: hero.expected.stats.gritGranted,
      spent: hero.expected.stats.gritSpent,
      available:
        hero.expected.stats.gritGranted - hero.expected.stats.gritSpent,
    });
    check(
      hero,
      "creation summary HP/Grit/Stability/Speed/capacity",
      {
        maximumHp: snapshot.creationSummary.maximumHp,
        gritGranted: snapshot.creationSummary.gritGranted,
        gritSpent: snapshot.creationSummary.gritSpent,
        stability: snapshot.creationSummary.stability,
        speed: snapshot.creationSummary.unencumberedSpeed,
        capacity: snapshot.creationSummary.capacity,
      },
      {
        maximumHp: hero.expected.stats.hp,
        gritGranted: hero.expected.stats.gritGranted,
        gritSpent: hero.expected.stats.gritSpent,
        stability: hero.expected.stats.stability,
        speed: hero.expected.stats.speed,
        capacity: hero.expected.stats.capacity,
      },
    );
    check(
      hero,
      "attributes",
      snapshot.attributes,
      hero.expected.identity.attributes,
    );

    const creation = snapshot.development.creation;
    check(
      hero,
      "identity",
      {
        attributes: snapshot.attributes,
        ancestryId: creation.ancestryId,
        traitIds: creation.traitIds,
        classId: creation.classId,
        classDisciplines: creation.classDisciplines,
        signatureId: creation.signatureId,
      },
      hero.expected.identity,
    );
    for (const [kind, id, pairIndex, disciplineId, abilityId] of hero.expected
      .origins) {
      check(
        hero,
        `${kind} selection`,
        [creation[kind].id, creation[kind].pair],
        [id, pairIndex],
      );
      assert.equal(
        snapshot.development.ranks[disciplineId],
        1,
        `${hero.name} persisted ${disciplineId} rank`,
      );
      assert(
        snapshot.development.abilities.includes(abilityId),
        `${hero.name} persisted ${abilityId}`,
      );
    }

    check(
      hero,
      "stage pools/compensation/spending/expiry",
      stageFacts(snapshot.ledger),
      hero.expected.stages,
    );
    check(hero, "Stability", snapshot.stability, hero.expected.stats.stability);
    check(
      hero,
      "current Speed/capacity/Bulk",
      {
        speed: snapshot.movement.speed,
        capacity: snapshot.movement.capacity,
        bulk: snapshot.movement.bulk,
      },
      {
        speed: hero.expected.stats.speed,
        capacity: hero.expected.stats.capacity,
        bulk: hero.expected.stats.bulk,
      },
    );
    check(
      hero,
      "known abilities flag",
      sorted(snapshot.development.abilities),
      sorted(hero.expected.abilities),
    );
    const heroAbilityItems = snapshot.abilityItems.filter(
      (item) => !fixtureState.universalAbilityIds.includes(item.catalogId),
    );
    check(
      hero,
      "known ability Items",
      sorted(heroAbilityItems.map((item) => item.catalogId)),
      sorted(hero.expected.abilities),
    );
    assert.equal(
      new Set(snapshot.abilityItems.map((item) => item.catalogId)).size,
      snapshot.abilityItems.length,
      `${hero.name} has duplicate ability Items`,
    );
    assert(
      snapshot.abilityItems.every(
        (item) => item.creationGrant === true && item.grantKind === "creation",
      ),
      `${hero.name} ability Items lack creation grants`,
    );
    check(
      hero,
      "discipline ranks",
      snapshot.development.ranks,
      hero.expected.ranks,
    );
    check(
      hero,
      "recipes",
      sorted(snapshot.development.recipes),
      sorted(hero.expected.recipes),
    );
    check(
      hero,
      "languages and permissions",
      snapshot.languages,
      hero.expected.languages.map(([id, name, profile]) => ({
        id,
        name,
        permissions: permissionProfiles[profile],
      })),
    );
    check(
      hero,
      "coins [starting, spent, remaining]",
      [snapshot.coins.starting, snapshot.coins.spent, snapshot.coins.remaining],
      hero.expected.stats.coins,
    );
    check(
      hero,
      "equipment Items and hands",
      snapshot.equipmentItems
        .map((item) => [item.catalogId, item.hands])
        .sort(([a], [b]) => a.localeCompare(b)),
      hero.expected.items,
    );

    const requestId = snapshot.receipt?.requestId;
    assert.equal(typeof requestId, "string");
    assert.equal(snapshot.receipt.status, "complete");
    assert.equal(snapshot.receipt.revision, 1);
    assert.equal(snapshot.receipt.sourceCommit, fixtureState.commit);
    assert.equal(snapshot.receipt.languageBasis, fixtureState.languageBasis);
    assert.equal(snapshot.draft.sourceCommit, fixtureState.commit);
    assert.equal(snapshot.draft.languageBasis, fixtureState.languageBasis);
    assert.equal(snapshot.ownership[fixtureState.accountId], 3);
    assert.equal(snapshot.request.id, requestId);
    assert.equal(snapshot.request.authorId, fixtureState.accountId);
    assert.equal(snapshot.request.actorUuid, `Actor.${record.id}`);
    assert.equal(snapshot.request.revision, 1);
    assert.match(snapshot.request.content, /Character creation completed/);
    assert.equal(snapshot.operation?.applied, true);
    const itemIds = new Set(
      [...snapshot.abilityItems, ...snapshot.equipmentItems].map(
        (item) => item.id,
      ),
    );
    assert.equal(snapshot.receipt.createdIds.length, itemIds.size);
    assert(
      snapshot.receipt.createdIds.every((id) => itemIds.has(id)),
      `${hero.name} receipt references a missing committed Item`,
    );
    assert.deepEqual(snapshot.receipt.reusedIds, []);
    snapshots.push(snapshot);
  }

  const requestIds = snapshots.map((snapshot) => ({
    actorId: snapshot.id,
    requestId: snapshot.receipt.requestId,
  }));
  const beforeReload = snapshots.map(durableProjection);
  await gm.reload();
  await gm.waitForFunction(() => game.ready);
  await gm.evaluate(async () => {
    const { bindCreationAuthority } = await import(
      "/systems/heroes-of-legend/services/authority.mjs"
    );
    await bindCreationAuthority();
  });
  const afterReload = (await gm.evaluate(readPersistedActors, actorIds)).map(
    durableProjection,
  );
  assert.deepEqual(
    afterReload,
    beforeReload,
    "Persisted reference heroes changed across reload",
  );

  for (const { actorId, requestId } of requestIds) {
    const replay = await gm.evaluate(async (id) => {
      const { resolveCreationRequest } = await import(
        "/systems/heroes-of-legend/services/creation.mjs"
      );
      return resolveCreationRequest(id);
    }, requestId);
    assert.equal(replay.status, "complete");
    assert.equal(replay.replay, true);
    assert.equal(
      (await gm.evaluate(readPersistedActors, [actorId]))[0].receipt.requestId,
      requestId,
    );
  }
  const afterReplay = (await gm.evaluate(readPersistedActors, actorIds)).map(
    durableProjection,
  );
  assert.deepEqual(
    afterReplay,
    beforeReload,
    "Creation replay repeated or changed grants",
  );
  assert.deepEqual(errors, []);
  console.info(
    "PASS Foundry 14.369 reference heroes: six owner Review commitments, independently transcribed persisted statistics, development ledgers, abilities, ranks, recipes, languages, coins and equipment; reload and receipt replay preserved every grant.",
  );
} finally {
  await owner
    ?.context()
    .close()
    .catch(() => {});
  if (gm && fixtureState)
    await gm
      .evaluate(async (data) => {
        const ID = "heroes-of-legend";
        const { releaseAuthority } = await import(
          "/systems/heroes-of-legend/services/authority.mjs"
        );
        await releaseAuthority();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const fixtureActors =
          game.actors?.filter(
            (actor) =>
              actor.getFlag(ID, "referenceHeroFixture") === data.fixtureId,
          ) ?? [];
        for (const message of game.messages.filter((entry) =>
          fixtureActors.some(
            (actor) =>
              entry.getFlag(ID, "creationRequest")?.actorUuid === actor.uuid,
          ),
        ))
          await message.delete();
        for (const actor of fixtureActors) await actor.delete();
        const account =
          game.users.get(data.accountId) ??
          game.users.find(
            (user) =>
              user.getFlag(ID, "referenceHeroFixture") === data.fixtureId,
          );
        await account?.delete();
        await game.settings.set(ID, "campaignLanguages", data.priorLanguages);
      }, fixtureState)
      .catch((error) => {
        console.error("Reference hero cleanup failed:", error.message);
        process.exitCode = 1;
      });
  await browser.close();
}
