import test from "node:test";
import assert from "node:assert/strict";
import {
  blockableJudgment,
  defenseAbilityAvailability,
} from "../src/rules/defense-abilities.mjs";
import {
  defenseBenefitSources,
  shieldBenefitReuse,
  upsertBenefitEffect,
} from "../src/rules/defense-benefits.mjs";
import { isShieldEquipment } from "../src/rules/equipment-identity.mjs";
import { benefitCurrent } from "../src/services/benefits.mjs";

test("reviewed defense abilities expose genuine context blockers", () => {
  assert.deepEqual(
    defenseAbilityAvailability("ability-defend", {
      capable: true,
      ownTurn: true,
      remaining: { maneuver: 1 },
    }),
    { available: true, reasons: [], warnings: [] },
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
    { available: true, reasons: [], warnings: [] },
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
  assert.doesNotMatch(unavailable.reasons.join(" "), /not blockable/);
  assert.match(unavailable.reasons.join(" "), /held shield/);
  assert.match(unavailable.warnings.join(" "), /No Reaction/);
});

test("blockable judgment distinguishes legacy cards, denial and approval", () => {
  assert.equal(blockableJudgment({}), null);
  assert.equal(blockableJudgment({ blockable: null }), null);
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
  assert.equal(legacy.available, true);
  assert.equal(
    defenseAbilityAvailability("ability-shield-block", {
      capable: true,
      remaining: { reaction: 1 },
      attackMessageId: "attack",
      blockable: false,
      heldShieldUuids: ["shield"],
    }).available,
    true,
  );
});

test("prior completed or unknown defense dice do not gate a newly selected ability", () => {
  const base = {
    capable: true,
    remaining: { reaction: 1 },
    attackMessageId: "attack",
    blockable: true,
    heldShieldUuids: ["Actor.defender.Item.shield"],
  };
  for (const context of [
    { priorDefenses: 1, unresolvedDefense: false },
    { priorDefenses: 2, unresolvedDefense: true },
  ])
    assert.deepEqual(
      defenseAbilityAvailability("ability-shield-block", {
        ...base,
        ...context,
      }),
      { available: true, reasons: [], warnings: [] },
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
    incomingAttack: true,
    heldShieldUuids: ["Actor.a.Item.shield"],
  });
  assert.deepEqual(
    sources.map((source) => source.label),
    ["Defend maneuver", "Shield Block"],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      incomingAttack: false,
      heldShieldUuids: ["Actor.a.Item.shield"],
    }).map((source) => source.label),
    ["Defend maneuver"],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      incomingAttack: true,
      heldShieldUuids: [],
    }).map((source) => source.label),
    ["Defend maneuver"],
  );
});

test("High Guard replaces Shield Block with two Boons and still stacks with Defend", () => {
  const entries = [
    {
      key: "shield-block",
      sourceId: "ability-shield-block",
      effectUuid: "old",
      shieldItemUuid: "shield",
    },
    { key: "defend", effectUuid: "defend" },
    {
      key: "shield-block",
      sourceId: "ability-high-guard",
      effectUuid: "high",
      shieldItemUuid: "shield",
    },
  ];
  const sources = defenseBenefitSources(entries, {
    incomingAttack: true,
    heldShieldUuids: ["shield"],
  });
  assert.deepEqual(
    sources.map(({ label, amount }) => [label, amount]),
    [
      ["Defend maneuver", 1],
      ["High Guard", 2],
    ],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      incomingAttack: true,
      heldShieldUuids: [],
    }).map(({ label }) => label),
    ["Defend maneuver"],
  );
  assert.deepEqual(
    defenseBenefitSources(entries, {
      incomingAttack: false,
      heldShieldUuids: ["shield"],
    }).map(({ label }) => label),
    ["Defend maneuver"],
  );
  assert.equal(
    defenseAbilityAvailability("ability-high-guard", {
      attackMessageId: "attack",
      heldShieldUuids: ["shield"],
      remaining: { reaction: 1 },
    }).available,
    true,
  );
});

test("High Guard follows the ordinary start-of-next-turn shield benefit expiry", (t) => {
  const previous = globalThis.game;
  t.after(() => {
    globalThis.game = previous;
  });
  let turnId = "defender-turn-1";
  globalThis.game = {
    combats: {
      get: () => ({
        getFlag: () => ({ budgets: { defender: { turnId } } }),
      }),
    },
  };
  const effect = {
    active: true,
    getFlag: () => ({
      key: "shield-block",
      sourceId: "ability-high-guard",
      anchor: {
        combatId: "combat",
        participantId: "defender",
        turnId: "defender-turn-1",
      },
    }),
  };
  assert.equal(benefitCurrent(effect), true);
  turnId = "defender-turn-2";
  assert.equal(benefitCurrent(effect), false);
});

test("High Guard pays one Reaction and subsequent Shield Block preserves its strength", () => {
  assert.deepEqual(shieldBenefitReuse("high-guard-v1", null), {
    free: false,
    preserve: false,
  });
  assert.deepEqual(
    shieldBenefitReuse("high-guard-v1", "ability-shield-block"),
    { free: false, preserve: false },
  );
  assert.deepEqual(shieldBenefitReuse("high-guard-v1", "ability-high-guard"), {
    free: false,
    preserve: false,
  });
  assert.deepEqual(
    shieldBenefitReuse("shield-block-v1", "ability-high-guard"),
    { free: true, preserve: true },
  );
  assert.deepEqual(
    shieldBenefitReuse("shield-block-v1", "ability-high-guard", false),
    { free: true, preserve: false },
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

test("empty tracked counters, off-turn status and condition advice do not disable deliberate abilities", () => {
  const defend = defenseAbilityAvailability("ability-defend", {
    capable: false,
    ownTurn: false,
    remaining: { maneuver: 0 },
  });
  assert.equal(defend.available, true);
  assert.equal(defend.reasons.length, 0);
  assert.equal(defend.warnings.length, 3);
  const block = defenseAbilityAvailability("ability-shield-block", {
    capable: false,
    remaining: { reaction: 0 },
    attackMessageId: "attack",
    heldShieldUuids: ["shield"],
  });
  assert.equal(block.available, true);
  assert.equal(block.warnings.length, 2);
  assert.equal(
    defenseAbilityAvailability("ability-shield-block", {
      capable: false,
      remaining: { reaction: 0 },
      attackMessageId: "attack",
      heldShieldUuids: ["shield"],
      pending: true,
    }).available,
    false,
  );
});
