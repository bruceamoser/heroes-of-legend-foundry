import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { declareAction, startTurn } from "../src/rules/actions.mjs";
import { enterLastWords, survivalState } from "../src/rules/survival.mjs";
import {
  HEALING_POTION_IDS,
  healingPotionAdapter,
  planHealingPotion,
  resolveHealingPotionInventory,
} from "../src/rules/potions.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../static/data/inventory.json", import.meta.url)),
);
const preparationTemplate = await readFile(
    new URL(
      "../static/templates/potion-preparation.hbs",
      import.meta.url,
    ),
    "utf8",
  ),
  preparationApplication = await readFile(
    new URL("../src/applications/potions.mjs", import.meta.url),
    "utf8",
  );

const turn = ({ reaction = true, maneuver = 1 } = {}) =>
  startTurn({
    turnId: `turn_${reaction}_${maneuver}`,
    speed: 6,
    independentReaction: reaction,
    ...(maneuver ? {} : { retained: ["main", "reaction"] }),
  });
const alive = (hp = 5, maxHp = 12) => survivalState({ hp, maxHp });
const dying = () =>
  survivalState({
    hp: 0,
    maxHp: 12,
    status: "dying",
    marks: 1,
  });
const freeHand = [{ id: "sword", hands: 1, held: true }];
const base = (overrides = {}) => ({
  operationId: "potion-use",
  potionId: "item-lesser-healing-bottle",
  catalog,
  inventoryDie: 4,
  giver: {
    actorId: "actor-giver",
    ownTurn: true,
    turn: turn(),
    items: freeHand,
    survival: alive(),
  },
  recipient: {
    actorId: "actor-giver",
    turn: turn(),
    conditions: {},
    survival: alive(),
  },
  relation: "self",
  capable: true,
  ...overrides,
});

test("the potion ApplicationV2 part has one root and never assigns rendered", () => {
  assert.match(
    preparationTemplate,
    /^\s*<section\b[\s\S]*<\/section>\s*$/,
  );
  assert.deepEqual(
    preparationTemplate
      .split("\n")
      .filter((line) => /^<[A-Za-z]/.test(line))
      .map((line) => line.match(/^<([A-Za-z]+)/)?.[1]),
    ["section"],
  );
  assert.doesNotMatch(preparationApplication, /\bthis\.rendered\s*=/);
  assert.doesNotMatch(preparationTemplate, /<select[^>]*name="recipientParticipantId"/);
  assert.match(preparationTemplate, /<details data-panel="da-exceptions">/);
});

test("source adapters pin the three fixed healing bottles and universal action", () => {
  assert.deepEqual(HEALING_POTION_IDS, [
    "item-lesser-healing-bottle",
    "item-greater-healing-bottle",
    "item-superior-healing-bottle",
  ]);
  const expected = [
    ["item-lesser-healing-bottle", 6, "lesser"],
    ["item-greater-healing-bottle", 10, "greater"],
    ["item-superior-healing-bottle", 16, "superior"],
  ];
  for (const [id, healing, name] of expected) {
    const adapter = healingPotionAdapter(id, catalog);
    assert.equal(adapter.healing, healing);
    assert.equal(adapter.supplyDie, 4);
    assert.equal(
      adapter.source.path,
      `design/equipment/${name}-healing-bottle.md`,
    );
    assert.equal(adapter.action.id, "use-a-healing-potion");
    assert.equal(
      adapter.action.source.path,
      "design/cards/use-a-healing-potion.md",
    );
    const bottleDrift = structuredClone(catalog);
    bottleDrift.equipment.find((record) => record.id === id).source.sha256 =
      "0".repeat(64);
    assert.throws(
      () => healingPotionAdapter(id, bottleDrift),
      /potion source drifted/i,
    );
  }

  const actionDrift = structuredClone(catalog);
  actionDrift.acquisitions.find(
    (record) => record.id === "ability-use-a-healing-potion",
  ).source.path = "design/cards/other.md";
  assert.throws(
    () => healingPotionAdapter("item-lesser-healing-bottle", actionDrift),
    /action source drifted/,
  );
});

test("self use spends the Maneuver, heals before the check and accepts a last-use 1", () => {
  const input = base();
  const snapshot = structuredClone(input);
  const plan = planHealingPotion(input);
  assert.equal(plan.status, "ready");
  assert.deepEqual(snapshot, input);
  assert.deepEqual(plan.costs, {
    giver: { maneuver: 1, hp: 0, items: [] },
    recipient: { reaction: 0 },
  });
  assert.deepEqual(
    plan.order.map(({ kind, status }) => [kind, status]),
    [
      ["declare-giver-maneuver", "declared"],
      ["continue-after-interruption", "ready"],
      ["declare-recipient-reaction", "not-required"],
      ["heal", "planned"],
      ["inventory-check", "pending"],
    ],
  );
  assert.equal(plan.giverTurn.remaining.maneuver, 0);
  assert.deepEqual(plan.recipientTurn, plan.giverTurn);
  assert.equal(plan.recipientTurn.remaining.maneuver, 0);
  assert.equal(plan.healing.restored, 6);
  assert.equal(plan.recipientSurvival.hp, 11);
  assert.equal(plan.inventory.retained, null);

  const resolved = resolveHealingPotionInventory(plan, { retained: 1 });
  assert.equal(resolved.healing.restored, 6);
  assert.deepEqual(resolved.inventory, {
    before: 4,
    retained: 1,
    after: 0,
    exhausted: true,
  });
  assert.deepEqual(input, snapshot);
});

test("full HP still uses the potion and checks its supply", () => {
  const plan = planHealingPotion(
    base({
      giver: {
        actorId: "actor-giver",
        ownTurn: true,
        turn: turn(),
        items: freeHand,
        survival: alive(12),
      },
      recipient: {
        actorId: "actor-giver",
        survival: alive(12),
        conditions: {},
      },
    }),
  );
  assert.equal(plan.healing.restored, 0);
  const resolved = resolveHealingPotionInventory(plan, { retained: 2 });
  assert.equal(resolved.recipientSurvival.hp, 12);
  assert.equal(resolved.inventory.after, 4);
  assert.equal(resolved.inventory.exhausted, false);
});

test("the three reviewed bottles retain their fixed 6, 10 and 16 healing values", () => {
  for (const [potionId, restored] of [
    ["item-lesser-healing-bottle", 6],
    ["item-greater-healing-bottle", 10],
    ["item-superior-healing-bottle", 16],
  ]) {
    const plan = planHealingPotion(
      base({
        potionId,
        giver: {
          actorId: "actor-giver",
          ownTurn: true,
          turn: turn(),
          items: freeHand,
          survival: alive(1, 30),
        },
        recipient: {
          actorId: "actor-giver",
          survival: alive(1, 30),
          conditions: {},
        },
      }),
    );
    assert.equal(plan.healing.restored, restored);
    assert.equal(plan.recipientSurvival.hp, restored + 1);
  }
});

test("Life resistance and missing-HP cap use the shared healing arithmetic", () => {
  const plan = planHealingPotion(
    base({
      giver: {
        actorId: "actor-giver",
        ownTurn: true,
        turn: turn(),
        items: freeHand,
        survival: alive(1, 20),
      },
      recipient: {
        actorId: "actor-giver",
        survival: alive(1, 20),
        lifeResistances: [9],
        conditions: {},
      },
    }),
  );
  assert.deepEqual(plan.healing, {
    allowed: true,
    missing: 19,
    resistance: 3,
    restored: 3,
    after: 4,
  });
});

test("a living other recipient spends a Reaction; a zero-HP recipient does not", () => {
  const living = planHealingPotion(
    base({
      relation: "other",
      adjacent: true,
      willing: true,
      recipientOperationId: "potion-reaction",
      recipient: {
        actorId: "actor-recipient",
        turn: turn(),
        survival: alive(),
        conditions: {},
      },
    }),
  );
  assert.equal(living.costs.recipient.reaction, 1);
  assert.equal(living.recipientTurn.remaining.reaction, 0);
  assert.deepEqual(living.targeting, {
    relation: "other",
    adjacent: true,
    willing: true,
  });

  const zero = planHealingPotion(
    base({
      relation: "other",
      adjacent: true,
      willing: true,
      recipientOperationId: "unused-reaction",
      recipient: {
        actorId: "actor-recipient",
        turn: turn({ reaction: false }),
        survival: dying(),
        conditions: {},
      },
    }),
  );
  assert.equal(zero.costs.recipient.reaction, 0);
  assert.equal(zero.healing.restored, 6);
  assert.equal(zero.recipientSurvival.status, "active");
  assert.equal(zero.recipientSurvival.hp, 6);
  assert.equal(zero.recipientSurvival.marks, 0);
});

test("target, hand, Reaction and action restrictions reject before a ready plan", () => {
  const other = {
    actorId: "actor-recipient",
    turn: turn(),
    survival: alive(),
    conditions: {},
  };
  assert.throws(
    () =>
      planHealingPotion(
        base({
          relation: "other",
          adjacent: false,
          willing: true,
          recipient: other,
        }),
      ),
    /adjacent/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          relation: "other",
          adjacent: true,
          willing: false,
          recipient: other,
        }),
      ),
    /willing/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: [{ id: "bow", hands: 2, held: true }],
            survival: alive(),
          },
        }),
      ),
    /free hand/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          relation: "other",
          adjacent: true,
          willing: true,
          recipientOperationId: "potion-reaction",
          recipient: {
            actorId: "actor-recipient",
            turn: turn({ reaction: false }),
            survival: alive(),
            conditions: {},
          },
        }),
      ),
    /No reaction/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: alive(),
            conditions: { poisoned: true },
          },
        }),
      ),
    /Unknown action restriction/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: alive(),
            conditions: { paralyzed: 1 },
          },
        }),
      ),
    /condition prevents actions/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: startTurn({
              turnId: "dazed-potion-turn",
              speed: 6,
              conditions: { dazed: 1 },
              retained: ["main", "reaction"],
            }),
            items: freeHand,
            survival: alive(),
          },
        }),
      ),
    /No maneuver/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          relation: "other",
          adjacent: true,
          willing: true,
          recipientOperationId: "paralyzed-recipient-reaction",
          recipient: {
            actorId: "actor-recipient",
            turn: turn(),
            survival: alive(),
            conditions: { paralyzed: 1 },
          },
        }),
      ),
    /condition prevents actions/,
  );
});

test("exhausted bottles, terminal recipients and summons cannot be planned", () => {
  assert.throws(
    () => planHealingPotion(base({ inventoryDie: 0 })),
    /inventory d4/,
  );
  assert.throws(
    () => planHealingPotion(base({ inventoryDie: 6 })),
    /inventory d4/,
  );
  const lastWords = enterLastWords(dying());
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: lastWords,
          },
          recipient: {
            actorId: "actor-giver",
            survival: lastWords,
            conditions: {},
          },
        }),
      ),
    /lastWords|ordinary potion/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: { ...dying(), status: "dead" },
          },
          recipient: {
            actorId: "actor-giver",
            survival: { ...dying(), status: "dead" },
            conditions: {},
          },
        }),
      ),
    /dead|ordinary potion/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: alive(1),
          },
          recipient: {
            actorId: "actor-giver",
            kind: "summon",
            survival: alive(1),
            conditions: {},
          },
        }),
      ),
    /summon-cannot-be-healed/,
  );
});

test("interruption commits the Maneuver but skips Reaction, healing and supply", () => {
  const input = base({ capable: false, retained: 1 });
  const snapshot = structuredClone(input);
  const plan = planHealingPotion(input);
  assert.equal(plan.status, "interrupted");
  assert.equal(plan.giverTurn.remaining.maneuver, 0);
  assert.deepEqual(plan.recipientTurn, plan.giverTurn);
  assert.equal(plan.costs.recipient.reaction, 0);
  assert.equal(plan.healing, null);
  assert.equal(plan.inventory, null);
  assert.deepEqual(
    plan.order.map(({ status }) => status),
    ["declared", "interrupted", "not-required", "skipped", "skipped"],
  );
  assert.throws(
    () => resolveHealingPotionInventory(plan, { retained: 1 }),
    /not successfully/,
  );
  assert.deepEqual(input, snapshot);
});

test("interrupted other-recipient use snapshots the unchanged Reaction budget", () => {
  const recipient = {
    actorId: "actor-recipient",
    turn: turn(),
    survival: alive(),
    conditions: {},
  };
  const plan = planHealingPotion(
    base({
      relation: "other",
      adjacent: true,
      willing: true,
      recipientOperationId: "potion-reaction",
      recipient,
      capable: false,
    }),
  );
  assert.equal(plan.status, "interrupted");
  assert.deepEqual(plan.recipientTurn, recipient.turn);
  assert.equal(plan.recipientTurn.remaining.reaction, 1);
  assert.equal(plan.costs.recipient.reaction, 0);
});

test("prior declaration and an exhausted maneuver cannot be bypassed", () => {
  const spent = declareAction(turn(), {
    operationId: "other",
    sourceId: "basic-melee",
    category: "maneuver",
  });
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: spent,
            items: freeHand,
            survival: alive(),
          },
        }),
      ),
    /No maneuver/,
  );
});

test("self use rejects mismatched identities, health snapshots and zero-HP givers", () => {
  assert.throws(
    () =>
      planHealingPotion(
        base({
          recipient: {
            actorId: "actor-not-giver",
            survival: alive(),
            conditions: {},
          },
        }),
      ),
    /self recipient/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          recipient: {
            actorId: "actor-giver",
            survival: alive(4),
            conditions: {},
          },
        }),
      ),
    /coherent.*snapshot/,
  );
  const unconscious = dying();
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: true,
            turn: turn(),
            items: freeHand,
            survival: unconscious,
            conditions: {},
          },
          recipient: {
            actorId: "actor-giver",
            survival: unconscious,
            conditions: {},
          },
        }),
      ),
    /zero-HP giver is unconscious/,
  );
});

test("giver own-turn status is explicit and enforced by the action primitive", () => {
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            turn: turn(),
            items: freeHand,
            survival: alive(),
          },
        }),
      ),
    /own-turn status must be boolean/,
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          giver: {
            actorId: "actor-giver",
            ownTurn: false,
            turn: turn(),
            items: freeHand,
            survival: alive(),
          },
        }),
      ),
    /requires your turn/,
  );
});

test("an already-recorded operation requires an authoritative receipt", () => {
  const input = base();
  const first = planHealingPotion(input);
  assert.equal(first.status, "ready");
  const updated = base({
    giver: { ...input.giver, turn: first.giverTurn },
    recipient: { ...input.recipient, turn: first.recipientTurn },
  });
  assert.throws(
    () => planHealingPotion(updated),
    /authoritative receipt is required/,
  );

  const recipient = {
    actorId: "actor-recipient",
    turn: turn(),
    survival: alive(),
    conditions: {},
  };
  const other = planHealingPotion(
    base({
      relation: "other",
      adjacent: true,
      willing: true,
      recipientOperationId: "potion-reaction",
      recipient,
    }),
  );
  assert.throws(
    () =>
      planHealingPotion(
        base({
          relation: "other",
          adjacent: true,
          willing: true,
          recipientOperationId: "potion-reaction",
          recipient: { ...recipient, turn: other.recipientTurn },
        }),
      ),
    /Recipient reaction operation ID.*authoritative receipt/,
  );
});
