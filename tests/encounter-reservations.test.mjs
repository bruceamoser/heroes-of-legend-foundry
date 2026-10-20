import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

async function loadService(name, context, onWrite) {
  const url = new URL(`../src/services/${name}.mjs`, import.meta.url);
  const module = new SourceTextModule(await readFile(url, "utf8"), {
    context, identifier: url.href,
  });
  await module.link(async (specifier) => {
    const exports = specifier === "./authority.mjs" ? {
      ensureAuthorityReady: async () => {},
      enqueueCharacterOperation: async (run) => run(),
      isCreationAuthority: () => true,
      writeAuthorityDocument: onWrite,
    } : await import(new URL(specifier, url));
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

test("reserved potion refuses interleaved attacks, abilities and encounter transitions before any payment", async () => {
  const flags = {
    pendingPotion: "reservedPotion",
    encounter: { revision: 7, budgets: { giver: { remaining: { main: 1, maneuver: 1, reaction: 1 } } } },
  };
  const combat = { documentName: "Combat", uuid: "Combat.reservation", getFlag: (_namespace, key) => flags[key] };
  const messages = new Map();
  const context = createContext({
    structuredClone,
    game: { combats: [combat], messages },
    fromUuid: async (uuid) => uuid === combat.uuid ? combat : null,
  });
  let writes = 0;
  const onWrite = () => { writes++; throw new Error("Admission attempted a write"); };
  const attack = await loadService("player-attacks", context, onWrite);
  const ability = await loadService("abilities", context, onWrite);
  const npc = await loadService("npc-attacks", context, onWrite);
  const turns = await loadService("combat", context, onWrite);
  const author = { id: "owner", isGM: true };
  const setRequest = (kind, request) => messages.set("interleaved", {
    author, getFlag: (_namespace, key) => key === kind ? request : null,
  });
  const before = JSON.stringify(flags);
  setRequest("playerAttackRequest", {
    handler: "player-basic-melee-v1", source: { path: "design/cards/basic-melee.md" },
    itemUuid: "Actor.giver.Item.melee", actorUuid: "Actor.giver", combatUuid: combat.uuid,
    participantId: "giver", basis: {}, draft: {},
  });
  await assert.rejects(attack.resolvePlayerBasicMeleeRequest("interleaved"), /pending encounter action/);
  setRequest("npcAttackRequest", { combatUuid: combat.uuid });
  await assert.rejects(npc.resolveNpcAttack("interleaved"), /pending encounter action/);
  setRequest("abilityRequest", { combatUuid: combat.uuid });
  await assert.rejects(ability.resolveAbilityRequest("interleaved"), /pending encounter action/);
  for (const kind of ["start", "choose", "finish", "roster", "convert"]) {
    setRequest("combatRequest", { combatUuid: combat.uuid, kind, revision: 7 });
    await assert.rejects(turns.resolveCombatRequest("interleaved"), /pending healing potion/);
  }
  assert.equal(writes, 0);
  assert.equal(JSON.stringify(flags), before);
});

test("potion admission refuses an existing attack/action or turn-phase reservation without mutation", async () => {
  const flags = { encounter: { revision: 7 } };
  const combat = { documentName: "Combat", uuid: "Combat.reservation", getFlag: (_namespace, key) => flags[key] };
  const request = {
    sourceItemUuid: "Actor.giver.Item.action", bottleItemUuid: "Actor.giver.Item.bottle",
    giverActorUuid: "Actor.giver", giverParticipantId: "giver",
    recipientActorUuid: "Actor.recipient", recipientParticipantId: "recipient",
    combatUuid: combat.uuid, revision: 7, relation: "other",
    continuesAfterInterruption: true, geometry: { mode: "native" }, expected: {},
  };
  const messages = new Map([["potion", {
    author: { id: "owner" }, getFlag: (_namespace, key) => key === "potionRequest" ? request : null,
  }]]);
  const context = createContext({
    structuredClone, game: { combats: [combat], messages },
    fromUuid: async (uuid) => uuid === combat.uuid ? combat : null,
  });
  let writes = 0;
  const potions = await loadService("potions", context, () => { writes++; });
  for (const key of ["pendingAbility", "pendingTurnPhase"]) {
    flags[key] = "reservedOtherOperation";
    const before = JSON.stringify(flags);
    await assert.rejects(potions.resolvePotionRequest("potion"), /pending encounter operation/);
    assert.equal(JSON.stringify(flags), before);
    delete flags[key];
  }
  assert.equal(writes, 0);
});
