import test from "node:test";
import assert from "node:assert/strict";
import {
  blockableJudgment,
  defenseAbilityAvailability,
} from "../src/rules/defense-abilities.mjs";
import {
  defenseBenefitSources,
  upsertBenefitEffect,
} from "../src/rules/defense-benefits.mjs";
import { isShieldEquipment } from "../src/rules/equipment-identity.mjs";

test("reviewed defense abilities expose genuine context blockers", () => {
  assert.deepEqual(
    defenseAbilityAvailability("ability-defend", {
      capable: true,
      ownTurn: true,
      remaining: { maneuver: 1 },
    }),
    { available: true, reasons: [] },
  );
  assert.deepEqual(
    defenseAbilityAvailability("ability-shield-block", {
      capable: true,
      ownTurn: false,
      remaining: { reaction: 1 },
      attackMessageId: "attack",
      blockable: true,
      heldShieldUuids: ["Actor.a.Item.shield"],
    }),
    { available: true, reasons: [] },
  );
  const unavailable = defenseAbilityAvailability("ability-shield-block", {
    capable: true,
    ownTurn: true,
    remaining: { reaction: 0 },
    attackMessageId: "attack",
    blockable: false,
    heldShieldUuids: [],
  });
  assert.equal(unavailable.available, false);
  assert.match(unavailable.reasons.join(" "), /not blockable/);
  assert.match(unavailable.reasons.join(" "), /held shield/);
  assert.match(unavailable.reasons.join(" "), /No Reaction/);
});

test("blockable judgment distinguishes legacy cards, denial and approval", () => {
  assert.equal(blockableJudgment({}), null);
  assert.equal(blockableJudgment({ blockable: false }), false);
  assert.equal(blockableJudgment({ blockable: true }), true);
  assert.equal(blockableJudgment({ blockable: "yes" }), undefined);
  const legacy = defenseAbilityAvailability("ability-shield-block", {
    capable: true,
    remaining: { reaction: 1 },
    attackMessageId: "attack",
    blockable: blockableJudgment({}),
    heldShieldUuids: ["shield"],
  });
  assert.match(legacy.reasons.join(" "), /has not judged/);
});

test("prior completed or unknown defense dice do not gate a newly selected ability", () => {
  const base = {
    capable: true, remaining: { reaction: 1 }, attackMessageId: "attack",
    blockable: true, heldShieldUuids: ["Actor.defender.Item.shield"],
  };
  for (const context of [
    { priorDefenses: 1, unresolvedDefense: false },
    { priorDefenses: 2, unresolvedDefense: true },
  ]) assert.deepEqual(
    defenseAbilityAvailability("ability-shield-block", { ...base, ...context }),
    { available: true, reasons: [] },
  );
});

test("Defend and Shield Block stack while repeated or ineligible sources do not", () => {
  const entries = [
    {
      key: "defend",
      effectUuid: "Effect.defend",
      shieldItemUuid: null,
    },
    {
      key: "defend",
      effectUuid: "Effect.duplicate",
      shieldItemUuid: null,
    },
    {
      key: "shield-block",
      effectUuid: "Effect.shield",
      shieldItemUuid: "Actor.a.Item.shield",
    },
    {
      key: "shield-block",
      effectUuid: "Effect.duplicate-shield",
      shieldItemUuid: "Actor.a.Item.shield",
    },
  ];
  const sources = defenseBenefitSources(entries, {
    blockable: true,
    heldShieldUuids: ["Actor.a.Item.shield"],
  });
  assert.deepEqual(
    sources.map((source) => source.label),
    ["Defend maneuver", "Shield Block"],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      blockable: false,
      heldShieldUuids: ["Actor.a.Item.shield"],
    }).map((source) => source.label),
    ["Defend maneuver"],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      blockable: true,
      heldShieldUuids: [],
    }).map((source) => source.label),
    ["Defend maneuver"],
  );
});

test("a repeated Shield Block replaces the one retained benefit's paid shield", () => {
  const effects = [
    {
      _id: "effect-1",
      flags: {
        "heroes-of-legend": {
          benefit: {
            key: "shield-block",
            shieldItemUuid: "Actor.a.Item.old-shield",
          },
        },
      },
    },
    { _id: "unrelated", flags: {} },
  ];
  const next = upsertBenefitEffect(effects, {
    _id: "effect-1",
    flags: {
      "heroes-of-legend": {
        benefit: {
          key: "shield-block",
          shieldItemUuid: "Actor.a.Item.new-shield",
        },
      },
    },
  });
  assert.equal(next.length, 2);
  assert.equal(
    next[0].flags["heroes-of-legend"].benefit.shieldItemUuid,
    "Actor.a.Item.new-shield",
  );
  assert.equal(
    effects[0].flags["heroes-of-legend"].benefit.shieldItemUuid,
    "Actor.a.Item.old-shield",
  );
});

test("shield capability uses stable catalog identity rather than its name", () => {
  assert.equal(
    isShieldEquipment({
      name: "Shield",
      type: "equipment",
      system: { catalogId: "" },
    }),
    false,
  );
  assert.equal(
    isShieldEquipment({
      name: "Renamed shield",
      type: "equipment",
      system: { catalogId: "item-ordinary-shield" },
    }),
    true,
  );
});
