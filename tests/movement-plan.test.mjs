import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJumpReach,
  planFalling,
  planJump,
  planOrdinaryMovement,
  planStanding,
  validateHighJumpHeight,
} from "../src/rules/movement-plan.mjs";

const square = (x, y, changes = {}) => ({
  x,
  y,
  terrain: "normal",
  occupant: "none",
  access: "walk",
  footprintLegal: true,
  supported: true,
  routeLegal: true,
  ...changes,
});

test("ordinary movement accepts diagonal and orthogonal consecutive steps", () => {
  const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    squares = [square(0, 0), square(1, 1), square(2, 1)];
  assert.deepEqual(
    planOrdinaryMovement({ movement: 3, path, squares }),
    {
      kind: "ordinary",
      path,
      steps: [
        { to: { x: 1, y: 1 }, cost: 1 },
        { to: { x: 2, y: 1 }, cost: 1 },
      ],
      spent: 2,
      remaining: 1,
    },
  );
  assert.throws(
    () =>
      planOrdinaryMovement({
        movement: 3,
        path: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
        squares: [square(0, 0), square(2, 0)],
      }),
    /consecutive/,
  );
});

test("movement cost categories use 2 rather than stacking surcharges", () => {
  const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
      { x: 5, y: 3 },
    ],
    squares = [
      square(0, 0),
      square(1, 1, { terrain: "difficult" }),
      square(2, 1, { occupant: "prone" }),
      square(3, 1, { terrain: "difficult", occupant: "prone" }),
      square(4, 2, { access: "climb" }),
      square(5, 3, { access: "swim", terrain: "difficult" }),
    ],
    result = planOrdinaryMovement({ movement: 11, path, squares });
  assert.deepEqual(
    result.steps.map(({ cost }) => cost),
    [2, 2, 2, 2, 2],
  );
  assert.equal(result.spent, 10);
  assert.equal(result.remaining, 1);
});

test("standing occupants block passage and prone occupants cannot be endpoints", () => {
  assert.throws(
    () =>
      planOrdinaryMovement({
        movement: 2,
        path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        squares: [square(0, 0), square(1, 0, { occupant: "standing" })],
      }),
    /Standing occupied/,
  );
  assert.throws(
    () =>
      planOrdinaryMovement({
        movement: 2,
        path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        squares: [square(0, 0), square(1, 0, { occupant: "prone" })],
      }),
    /prone occupied square cannot be an endpoint/,
  );
});

test("explicit barriers, footprints, support and routes cannot be guessed", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    cases = [
      [
        [square(0, 0), square(1, 0)],
        [{ from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }],
        /wall or barrier/,
      ],
      [[square(0, 0), square(1, 0, { footprintLegal: false })], [], /footprint/],
      [[square(0, 0), square(1, 0, { supported: false })], [], /unsupported/],
      [
        [square(0, 0), square(1, 0, { access: "climb", routeLegal: false })],
        [],
        /route.*implausible/,
      ],
    ];
  for (const [squares, barriers, error] of cases)
    assert.throws(
      () =>
        planOrdinaryMovement({
          movement: 2,
          path,
          squares,
          barriers,
        }),
      error,
    );
});

test("exact budgets succeed while insufficient budgets and unsupported endpoints throw", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    squares = [square(0, 0), square(1, 0)];
  assert.equal(
    planOrdinaryMovement({ movement: 1, path, squares }).remaining,
    0,
  );
  assert.throws(
    () => planOrdinaryMovement({ movement: 0, path, squares }),
    /Insufficient movement/,
  );
  assert.throws(
    () =>
      planOrdinaryMovement({
        movement: 1,
        path,
        squares: [square(0, 0), square(1, 0, { supported: false })],
      }),
    /unsupported/,
  );
  assert.deepEqual(planStanding({ movement: 2 }), {
    kind: "stand",
    spent: 2,
    remaining: 0,
  });
  assert.throws(() => planStanding({ movement: 1 }), /Insufficient movement/);
});

test("jump reach handles negative Agility and the two-square approach boundary", () => {
  assert.deepEqual(calculateJumpReach({ agility: -2, running: true }), {
    broad: 1,
    high: 0,
  });
  assert.deepEqual(calculateJumpReach({ agility: -1, running: false }), {
    broad: 1,
    high: 0,
  });
  assert.deepEqual(calculateJumpReach({ agility: 1, running: true }), {
    broad: 3,
    high: 1,
  });
  assert.deepEqual(calculateJumpReach({ agility: 1, running: false }), {
    broad: 1,
    high: 1,
  });
});

test("running approach is consecutive and connected to takeoff", () => {
  const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
    squares = [
      square(-4, 0),
      square(-3, 0),
      square(-2, 0),
      square(-1, 0),
      square(0, 0),
      square(1, 0),
      square(2, 0),
      square(3, 0),
    ],
    input = (approach) => ({
      movement: 3,
      agility: 1,
      path,
      approach,
      squares,
      adjudication: "safe",
    }),
    validApproach = [
      { x: -2, y: 0 },
      { x: -1, y: 0 },
    ];
  assert.equal(planJump(input(validApproach)).maxDistance, 3);
  assert.throws(
    () =>
      planJump(
        input([
          { x: -4, y: 0 },
          { x: -3, y: 0 },
        ]),
      ),
    /end adjacent to takeoff/,
  );
  // The printed rule does not prescribe a straight approach or prohibit a turn.
  assert.equal(planJump(input([{x: 0, y: 0}, {x: -1, y: 0}])).maxDistance, 3);
  assert.throws(
    () => planJump(input([{x: -1, y: 0}, {x: -1, y: 0}])),
    /consecutive/,
  );
});

test("a safe broad jump spends its actual distance and grants no extra movement", () => {
  const approach = [
      { x: -2, y: 0 },
      { x: -1, y: 0 },
    ],
    path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
    squares = [
      square(-2, 0),
      square(-1, 0),
      square(0, 0),
      square(1, 0, { supported: false }),
      square(2, 0, { supported: false }),
      square(3, 0),
    ],
    result = planJump({
      movement: 3,
      agility: 1,
      kind: "broad",
      path,
      approach,
      squares,
      adjudication: "safe",
    });
  assert.equal(result.maxDistance, 3);
  assert.equal(result.distance, 3);
  assert.equal(result.spent, 3);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.resolution, { kind: "safe" });
  assert.throws(
    () =>
      planJump({
        movement: 2,
        agility: 1,
        kind: "broad",
        path,
        approach,
        squares,
        adjudication: "safe",
      }),
    /Insufficient movement/,
  );
});

test("standing broad jumps halve reach and high-jump height is validated separately", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    squares = [square(0, 0), square(1, 0)];
  assert.equal(
    planJump({
      movement: 1,
      agility: 1,
      kind: "broad",
      path,
      approach: [{ x: -1, y: 0 }],
      squares: [square(-1, 0), ...squares],
      adjudication: "safe",
    }).maxDistance,
    1,
  );
  assert.deepEqual(validateHighJumpHeight({ agility: 0, height: 1 }), {
    height: 1,
    maxHeight: 1,
  });
  assert.throws(
    () => validateHighJumpHeight({ agility: 0, height: 1.5 }),
    /approved maximum/,
  );
  assert.throws(
    () => validateHighJumpHeight({ agility: 0, height: -1 }),
    /nonnegative finite/,
  );
  assert.throws(
    () =>
      validateHighJumpHeight({
        agility: 0,
        height: Number.POSITIVE_INFINITY,
      }),
    /nonnegative finite/,
  );
  assert.throws(
    () =>
      planJump({
        movement: 1,
        agility: 0,
        kind: "high",
        path,
        squares,
        adjudication: "safe",
      }),
    /broad horizontal jumps only/,
  );
});

test("jump endpoints must be supported, legal, free and barrier-free", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    input = (squares, barriers = []) => ({
      movement: 1,
      agility: 0,
      path,
      squares,
      barriers,
      adjudication: "safe",
    });
  assert.throws(
    () => planJump(input([square(0, 0), square(1, 0, { occupant: "prone" })])),
    /landing square must be free/,
  );
  assert.throws(
    () =>
      planJump(
        input([
          square(0, 0),
          square(1, 0, { footprintLegal: false }),
        ]),
      ),
    /illegal footprint/,
  );
  assert.throws(
    () => planJump(input([square(0, 0), square(1, 0, { supported: false })])),
    /landing square must be supported/,
  );
  assert.throws(
    () => planJump(input([square(0, 0, { supported: false }), square(1, 0)])),
    /takeoff square must be supported/,
  );
  assert.throws(
    () =>
      planJump(
        input(
          [square(0, 0), square(1, 0)],
          [{ from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }],
        ),
      ),
    /wall or barrier/,
  );
});

test("jump route evidence covers takeoff, flight and landing without inferring occupants", () => {
  const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
    approach = [
      { x: -2, y: 0 },
      { x: -1, y: 0 },
    ],
    baseSquares = [
      square(-2, 0),
      square(-1, 0),
      square(0, 0),
      square(1, 0, { occupant: "standing" }),
      square(2, 0, { supported: false }),
      square(3, 0),
    ],
    input = (squares) => ({
      movement: 3,
      agility: 1,
      path,
      approach,
      squares,
      adjudication: "safe",
    });
  assert.equal(planJump(input(baseSquares)).distance, 3);
  for (let index = 0; index < path.length; index++) {
    for (const [field, error] of [
      ["routeLegal", /Jump route.*implausible/],
      ["footprintLegal", /Jump path.*illegal footprint/],
    ]) {
      const squares = structuredClone(baseSquares),
        fact = squares.find(
          ({ x, y }) => x === path[index].x && y === path[index].y,
        );
      fact[field] = false;
      assert.throws(() => planJump(input(squares)), error);
    }
  }
});

test("safe and DA-declared uncertain jumps do not invent a roll", () => {
  const input = {
    movement: 1,
    agility: 0,
    path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    squares: [square(0, 0), square(1, 0)],
  };
  const uncertain = planJump({ ...input, adjudication: "uncertain" });
  assert.deepEqual(uncertain.resolution, {
    kind: "uncertain",
    requiresAdjudication: true,
  });
  assert.equal(Object.hasOwn(uncertain, "roll"), false);
});

test("falling uses complete pairs of squares and leaves resistance to damage planning", () => {
  for (const [squares, damage] of [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1.9, 0],
    [2, 3],
    [3, 3],
    [3.9, 3],
    [4, 6],
    [5, 6],
    [5.5, 6],
    [6, 9],
  ]) {
    const result = planFalling({ squares });
    assert.equal(result.damage, damage);
    assert.equal(result.squares, squares);
    assert.equal(result.damageType, "physical");
    assert.equal(Object.hasOwn(result, "resistance"), false);
  }
  assert.throws(() => planFalling({ squares: -1 }), /Falling distance/);
  assert.throws(
    () => planFalling({ squares: Number.NaN }),
    /nonnegative finite/,
  );
  assert.throws(
    () => planFalling({ squares: Number.POSITIVE_INFINITY }),
    /nonnegative finite/,
  );
  assert.throws(
    () => planFalling({ squares: Number.MAX_VALUE }),
    /arithmetic is unsafe/,
  );
});

test("plans preserve every caller input and return independent paths", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    approach = [{ x: -2, y: 0 }, { x: -1, y: 0 }],
    squares = [
      square(-2, 0),
      square(-1, 0),
      square(0, 0),
      square(1, 0),
    ],
    ordinaryInput = { movement: 1, path, squares },
    jumpInput = {
      movement: 1,
      agility: 0,
      kind: "broad",
      path,
      approach,
      squares,
      adjudication: "safe",
    },
    ordinarySnapshot = structuredClone(ordinaryInput),
    jumpSnapshot = structuredClone(jumpInput),
    ordinary = planOrdinaryMovement(ordinaryInput),
    jump = planJump(jumpInput);
  ordinary.path[0].x = 99;
  ordinary.steps[0].to.x = 99;
  jump.path[1].x = 99;
  jump.approach[0].x = 99;
  assert.deepEqual(ordinaryInput, ordinarySnapshot);
  assert.deepEqual(jumpInput, jumpSnapshot);
});
