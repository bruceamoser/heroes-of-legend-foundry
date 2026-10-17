import test from "node:test";
import assert from "node:assert/strict";
import {
  incomingAttackContext,
  verifiedIncomingAttackContext,
} from "../src/services/roll-preparation.mjs";

const incoming = {
  actorUuid: "Actor.attacker",
  attackerName: "Historic attacker",
  attributeKey: "agility",
  threat: { boons: 0, banes: 0 },
  damage: { weak: 3, standard: 2, strong: 1 },
  suggestedDefenderTokenUuids: [],
  perspective: "defender",
  blockable: true,
  combatId: "removed-combat",
};

const attackMessage = {
  author: { isGM: true },
  isContentVisible: true,
  getFlag: () => structuredClone(incoming),
};

globalThis.game = {
  messages: {
    get: (id) => (id === "attack" ? attackMessage : null),
  },
  combats: { get: () => null },
};

test("historic ordinary defense is separate from verified ability context", () => {
  assert.deepEqual(incomingAttackContext("attack"), incoming);
  assert.throws(
    () => verifiedIncomingAttackContext("attack"),
    /DA judgment could not be verified/,
  );

  const combat = {
    getFlag: (_scope, key) =>
      key === "attacks"
        ? { attack: structuredClone(incoming) }
        : key === "operationReceipts"
          ? { attack: { applied: true, kind: "npc-attack" } }
          : null,
  };
  globalThis.game.combats.get = (id) => (id === "removed-combat" ? combat : null);
  assert.deepEqual(verifiedIncomingAttackContext("attack"), incoming);

  const original = attackMessage.getFlag;
  attackMessage.getFlag = () => ({
    ...structuredClone(incoming),
    blockable: false,
  });
  assert.throws(
    () => verifiedIncomingAttackContext("attack"),
    /DA judgment could not be verified/,
  );
  attackMessage.getFlag = original;
});
