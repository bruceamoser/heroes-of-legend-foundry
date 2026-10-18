import assert from "node:assert/strict";
import test from "node:test";
import { selectPotionRecipient } from "../src/rules/potion-targets.mjs";

const giver = { id: "giver", actorUuid: "Actor.giver", name: "Giver" };
const recipient = {
  id: "recipient", actorUuid: "Scene.test.Token.recipient.Actor.synthetic",
  tokenUuid: "Scene.test.Token.recipient", name: "Recipient",
};
const participants = [giver, recipient];
const select = (targets) => selectPotionRecipient({ giver, participants, targets });

test("potion UI defaults to self when no other native token is targeted", () => {
  for (const targets of [[], [{ actorUuid: giver.actorUuid, tokenUuid: "Scene.test.Token.giver" }]]) {
    assert.deepEqual(select(targets), {
      participantId: giver.id, name: "Giver (self)", error: "",
    });
  }
});

test("one other native target resolves the exact synthetic encounter participant", () => {
  assert.deepEqual(select([recipient]), {
    participantId: recipient.id, name: recipient.name, error: "",
  });
  assert.equal(select([{ actorUuid: giver.actorUuid }, recipient]).participantId, recipient.id);
  // An Actor match alone must never charge another linked Token's budget.
  assert.match(select([{ ...recipient, tokenUuid: "Scene.other.Token.recipient" }]).error, /in this encounter/);
  assert.match(select([{ ...recipient, actorUuid: "Actor.base-recipient" }]).error, /in this encounter/);
});

test("multiple other targets refuse selection and clearing targets restores self", () => {
  assert.deepEqual(select([recipient, { ...recipient, tokenUuid: "Scene.test.Token.second" }]), {
    participantId: null, name: "Multiple targets", error: "Use one target.",
  });
  assert.equal(select([]).participantId, giver.id);
});
