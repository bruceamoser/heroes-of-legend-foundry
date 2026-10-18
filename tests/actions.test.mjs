import test from "node:test";
import assert from "node:assert/strict";
import {
  startTurn,
  movementRemaining,
  convertAction,
  spendMovement,
  declareAction,
  continueAction,
  attackPerspective,
  outcomeTier,
  basicMeleeOutcome,
} from "../src/rules/actions.mjs";
const turn = (extra = {}) =>
  startTurn({ turnId: "turn_1", speed: 6, ...extra });
test("downward conversion gives three movement allowances, with replay and terrain costs", () => {
  const initial = turn();
  let state = convertAction(initial, {
    operationId: "a",
    from: "main",
    to: "maneuver",
  });
  assert.deepEqual(state.remaining, { main: 0, maneuver: 2, reaction: 1 });
  for (const operationId of ["b", "c"])
    state = convertAction(state, {
      operationId,
      from: "maneuver",
      to: "movement",
    });
  assert.equal(movementRemaining(state), 18);
  assert.equal(movementRemaining(state, { slowed: 1 }), 15);
  const spent = spendMovement(state, { operationId: "move", amount: 7 });
  assert.equal(movementRemaining(spent), 11);
  assert.deepEqual(
    spendMovement(spent, { operationId: "move", amount: 7 }),
    spent,
  );
  assert.throws(
    () => spendMovement(spent, { operationId: "move", amount: 8 }),
    /different choices/,
  );
  assert.throws(
    () =>
      convertAction(state, { operationId: "up", from: "maneuver", to: "main" }),
    /only Main/,
  );
  const emptyConversion = convertAction(state, {
    operationId: "extra", from: "maneuver", to: "movement",
  });
  assert.equal(emptyConversion.movementAllowances, state.movementAllowances);
  assert.equal(emptyConversion.operations.extra.trackedCost.spent, 0);
  assert.match(emptyConversion.operations.extra.audit.exceptions.join(" "), /No maneuver/);
  assert.equal(movementRemaining(initial), 6);
});
test("Dazed and Grappled freeze category selection but live grapple and helpless states still restrict movement", () => {
  const state = turn({
    conditions: { dazed: 2, grappled: 1 },
    retained: ["main"],
  });
  assert.deepEqual(state.remaining, { main: 1, maneuver: 0, reaction: 0 });
  assert.equal(movementRemaining(state, { grappled: 1 }), 0);
  assert.equal(movementRemaining(state), 6);
  const laterDazed = declareAction(state, {
    operationId: "strike",
    sourceId: "basic-melee",
    category: "main",
    conditions: { dazed: 3 },
  });
  assert.equal(laterDazed.remaining.main, 0);
  const conditionGuidance = declareAction(state, {
    operationId: "strike", sourceId: "basic-melee", category: "main",
    conditions: { paralyzed: 1 },
  });
  assert.match(conditionGuidance.operations.strike.audit.exceptions.join(" "), /prevents actions/);
  assert.equal(conditionGuidance.remaining.main, 0);
  assert.throws(
    () => turn({ conditions: { dazed: 2 }, retained: ["main", "reaction"] }),
    /exactly 1/,
  );
  const advisedConversion = convertAction(state, {
    operationId: "convert", from: "main", to: "maneuver",
  });
  assert.match(advisedConversion.operations.convert.audit.exceptions.join(" "), /not retained/);
  const overridden = convertAction(state, {
    operationId: "convert",
    from: "main",
    to: "maneuver",
    override: {
      userId: "da",
    },
  });
  assert.equal(overridden.operations.convert.audit.userId, "da");
  assert.equal(overridden.operations.convert.audit.choice, "action-guidance");
  assert.equal(overridden.remaining.maneuver, 1);
  assert.equal(turn({ independentReaction: false }).remaining.reaction, 0);
});
test("defense never spends a Reaction, while declared reactions spend once and may occur off-turn", () => {
  const state = declareAction(turn(), {
    operationId: "block",
    sourceId: "shield-block",
    category: "reaction",
    ownTurn: false,
  });
  assert.equal(state.remaining.reaction, 0);
  assert.deepEqual(
    declareAction(state, {
      operationId: "block",
      sourceId: "shield-block",
      category: "reaction",
      ownTurn: false,
    }),
    state,
  );
  const defense = declareAction(state, {
    operationId: "defense",
    sourceId: "incoming-attack",
    category: "defense",
    conditions: { unconscious: true },
    ownTurn: false,
  });
  assert.equal(defense.remaining.reaction, 0);
  const extraBlock = declareAction(state, {
    operationId: "block2", sourceId: "shield-block", category: "reaction",
  });
  assert.equal(extraBlock.remaining.reaction, 0);
  assert.equal(extraBlock.operations.block2.trackedCost.spent, 0);
  assert.match(extraBlock.operations.block2.audit.exceptions.join(" "), /No reaction/);
  assert.deepEqual(declareAction(extraBlock, { operationId: "block2", sourceId: "shield-block", category: "reaction" }), extraBlock);
  const offTurn = declareAction(state, {
    operationId: "attack", sourceId: "basic-melee", category: "main", ownTurn: false,
  });
  assert.equal(offTurn.remaining.main, 0);
  assert.match(offTurn.operations.attack.audit.exceptions.join(" "), /requires your turn/);
  assert.throws(
    () =>
      declareAction(state, {
        operationId: "chain",
        sourceId: "basic-melee",
        category: "free",
        freeAttack: true,
        triggeredByFreeAttack: true,
      }),
    /cannot trigger/,
  );
});
test("interruption preserves the committed action and leaves additional costs unspent permanently", () => {
  const state = declareAction(turn(), {
    operationId: "heal",
    sourceId: "healing",
    category: "main",
  });
  const resources = { hp: 4, items: { potion: 1 } },
    costs = { hp: 2, items: [{ id: "potion", quantity: 1 }] };
  const interrupted = continueAction(state, resources, {
    operationId: "heal",
    capable: false,
    costs,
  });
  assert.equal(interrupted.proceed, false);
  assert.equal(interrupted.state.remaining.main, 0);
  assert.deepEqual(interrupted.resources, resources);
  const retry = continueAction(interrupted.state, resources, {
    operationId: "heal",
    capable: true,
    costs,
  });
  assert(retry.replay);
  assert.equal(retry.proceed, false);
  assert.deepEqual(retry.resources, resources);
});
test("continuation pays HP and item costs once, keeps the payer alive, and refuses changed replay costs", () => {
  const state = declareAction(turn(), {
    operationId: "heal",
    sourceId: "healing",
    category: "main",
  });
  const resources = { hp: 4, items: { potion: 2 } },
    costs = {
      hp: 2,
      items: [
        { id: "potion", quantity: 1 },
        { id: "potion", quantity: 1 },
      ],
    };
  const paid = continueAction(state, resources, {
    operationId: "heal",
    capable: true,
    costs,
  });
  assert.deepEqual(paid.resources, { hp: 2, items: { potion: 0 } });
  const replay = continueAction(
    paid.state,
    { hp: 1, items: { potion: 0 } },
    { operationId: "heal", capable: true, costs },
  );
  assert.deepEqual(replay.resources, { hp: 1, items: { potion: 0 } });
  assert.throws(
    () =>
      continueAction(paid.state, resources, {
        operationId: "heal",
        capable: true,
        costs: { hp: 1 },
      }),
    /costs changed/,
  );
  assert.throws(
    () =>
      continueAction(state, resources, {
        operationId: "heal",
        capable: true,
        costs: { hp: 4 },
      }),
    /above zero/,
  );
  assert.throws(
    () =>
      continueAction(state, resources, {
        operationId: "heal",
        capable: true,
        costs: { hp: 2, items: [{ id: "potion", quantity: 3 }] },
      }),
    /Insufficient/,
  );
  assert.deepEqual(resources, { hp: 4, items: { potion: 2 } });
});
test("control perspective determines the single roll and preserves authored table orientation", () => {
  assert.equal(attackPerspective("player"), "attacker");
  assert.equal(attackPerspective("npc"), "defender");
  for (const [i, tier] of ["weak", "standard", "strong"].entries()) {
    assert.equal(
      basicMeleeOutcome({ tier, control: "player" }).components[0].amount,
      [2, 3, 5][i],
    );
    assert.equal(
      basicMeleeOutcome({ tier, control: "npc" }).components[0].amount,
      [5, 3, 2][i],
    );
    assert.equal(outcomeTier(tier, "defender", "defender"), tier);
  }
  assert.throws(() => attackPerspective("creature"), /control/);
});
test("malformed states and overflow cannot manufacture actions or inventory", () => {
  assert.throws(() => turn({ speed: NaN }), /integer/);
  assert.throws(() => turn({ conditions: { paralyzed: -1 } }), /integer/);
  assert.throws(
    () => turn({ conditions: { unconscious: "false" } }),
    /boolean/,
  );
  assert.throws(
    () => turn({ retained: ["main", "main", "reaction"] }),
    /distinct/,
  );
  assert.throws(
    () =>
      declareAction(turn(), {
        operationId: "__proto__",
        sourceId: "basic-melee",
        category: "main",
      }),
    /identity/,
  );
  const malformed = turn();
  malformed.remaining.main = -1;
  assert.throws(
    () =>
      declareAction(malformed, {
        operationId: "a",
        sourceId: "basic-melee",
        category: "main",
      }),
    /integer/,
  );
  const huge = turn({ speed: Number.MAX_SAFE_INTEGER });
  huge.movementAllowances = 2;
  assert.throws(() => movementRemaining(huge), /integer/);
});
