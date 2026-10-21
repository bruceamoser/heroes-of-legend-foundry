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
      ensureAuthorityReady: async () => {}, createActionMessage: data => context.ChatMessage.create(data), shouldProcessRequest: () => true,
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

test("legacy multi-document attack resolvers do not resume through another unfinished potion", async () => {
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


test("explicit Finish turn ignores old reservations and never changes Actor HP or conditions", async () => {
  const {startEncounter, chooseParticipant} = await import("../src/rules/encounter.mjs");
  const flags={encounter:chooseParticipant(startEncounter([{id:"hero",side:"players"}],[4,4,4]),"hero"),pendingPotion:"old",pendingTurnPhase:{actorUuid:"Actor.hero"},pendingAbility:"old"};
  const actor={uuid:"Actor.hero",type:"character",system:{health:{value:0}},testUserPermission:()=>true,getFlag:()=>({hp:2})};
  const combat={documentName:"Combat",uuid:"Combat.test",combatants:new Map([["hero",{id:"hero",actor}]]),turns:[{id:"hero"}],getFlag:(_id,key)=>flags[key]};
  const request={kind:"finish",combatUuid:combat.uuid,revision:flags.encounter.revision};
  const message={id:"finish",author:{id:"owner"},getFlag:(_id,key)=>key==="combatRequest"?request:null,async update(){}};
  const context=createContext({structuredClone,game:{messages:new Map([["finish",message]])},fromUuid:async()=>combat});
  const writes=[];
  const service=await loadService("combat",context,async(document,changes)=>{writes.push(document);for(const[key,value]of Object.entries(changes)){if(key==="flags.heroes-of-legend.encounter")flags.encounter=value;}});
  await service.resolveCombatRequest("finish");
  assert.deepEqual(writes,[combat]);assert.equal(flags.encounter.current,null);assert.equal(actor.system.health.value,0);
});
