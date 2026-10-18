import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { nativeTokenAdjacency } from "../src/services/native-adjacency.mjs";
import { nearestAccessibleLine } from "../src/rules/native-adjacency.mjs";

const originals = {
  canvas: globalThis.canvas,
  CONFIG: globalThis.CONFIG,
  CONST: globalThis.CONST,
  game: globalThis.game,
  fromUuid: globalThis.fromUuid,
};

function token({
  id,
  offsets,
  level = "ground",
  elevation = 0,
  derivedLevel = level,
  derivedElevation = elevation,
  scene = "Scene.potions",
  gridType = 1,
  onOccupied = null,
}) {
  const source = {
    x: 0,
    y: 0,
    elevation,
    width: 1,
    height: 1,
    depth: 1,
    shape: 1,
    level,
  };
  return {
    documentName: "Token",
    uuid: `${scene}.Token.${id}`,
    parent: {
      documentName: "Scene",
      uuid: scene,
      grid: { type: gridType },
    },
    _source: source,
    level: derivedLevel,
    elevation: derivedElevation,
    getOccupiedGridSpaceOffsets(data) {
      onOccupied?.(data);
      if (offsets === null) return null;
      return structuredClone(offsets);
    },
  };
}

function installCanvas({
  square = true,
  blocked = () => false,
  measure = null,
} = {}) {
  const measureCalls = [];
  globalThis.CONST = { GRID_TYPES: { SQUARE: 1 } };
  globalThis.CONFIG = {
    Canvas: {
      polygonBackends: {
        move: {
          testCollision(origin, destination, options) {
            assert.deepEqual(options, { type: "move", mode: "any" });
            return blocked(origin, destination);
          },
        },
      },
    },
  };
  globalThis.canvas = {
    ready: true,
    scene: { uuid: "Scene.potions" },
    level: { id: "ground" },
    grid: {
      isSquare: square,
      getCenterPoint({ i, j }) {
        return { x: i * 100, y: j * 100 };
      },
      measurePath([origin, destination]) {
        measureCalls.push([origin, destination]);
        if (measure) return measure(origin, destination);
        const spaces = Math.max(
          Math.abs(origin.x - destination.x),
          Math.abs(origin.y - destination.y),
        ) / 100;
        return { spaces, distance: spaces * 5 };
      },
    },
  };
  return measureCalls;
}

beforeEach(() => {
  installCanvas();
});

afterEach(() => {
  if (originals.canvas === undefined) delete globalThis.canvas;
  else globalThis.canvas = originals.canvas;
  if (originals.CONFIG === undefined) delete globalThis.CONFIG;
  else globalThis.CONFIG = originals.CONFIG;
  if (originals.CONST === undefined) delete globalThis.CONST;
  else globalThis.CONST = originals.CONST;
  if (originals.game === undefined) delete globalThis.game;
  else globalThis.game = originals.game;
  if (originals.fromUuid === undefined) delete globalThis.fromUuid;
  else globalThis.fromUuid = originals.fromUuid;
});

test("native adjacency uses grid spaces on a 5-unit square grid", () => {
  const result = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({ id: "recipient", offsets: [{ i: 1, j: 0 }] }),
  );
  assert.equal(result.status, "adjacent");
  assert.equal(result.adjacent, true);
  assert.equal(result.spaces, 1);
  assert.equal(result.distance, 1);
  assert.notEqual(result.distance, 5);
});

test("large footprints use their nearest occupied square", () => {
  const result = nativeTokenAdjacency(
    token({
      id: "large-giver",
      offsets: [
        { i: 0, j: 0 },
        { i: 1, j: 0 },
        { i: 0, j: 1 },
        { i: 1, j: 1 },
      ],
    }),
    token({ id: "recipient", offsets: [{ i: 2, j: 0 }] }),
  );
  assert.equal(result.status, "adjacent");
  assert.equal(result.spaces, 1);
});

test("a clear tied occupied-square line wins over a blocked one", () => {
  const selected = nearestAccessibleLine(
    [
      {
        spaces: 1,
        origin: { id: "left" },
        destination: { id: "blocked" },
      },
      {
        spaces: 1,
        origin: { id: "right" },
        destination: { id: "clear" },
      },
      {
        spaces: 2,
        origin: { id: "far" },
        destination: { id: "ignored" },
      },
    ],
    (_origin, destination) =>
      destination.id === "clear"
        ? true
        : destination.id === "blocked"
          ? false
          : null,
  );
  assert.equal(selected.destination.id, "clear");
  assert.equal(selected.accessible, true);
});

test("a wall blocks the nearest occupied-square line", () => {
  installCanvas({ blocked: () => true });
  const result = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({ id: "recipient", offsets: [{ i: 1, j: 0 }] }),
  );
  assert.equal(result.status, "unverified");
  assert.equal(result.adjacent, null);
  assert.match(result.reason, /collision backend/);
});

test("different altitude and levels require an explicit DA ruling", () => {
  const altitude = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({
      id: "recipient",
      offsets: [{ i: 1, j: 0 }],
      elevation: 5,
    }),
  );
  assert.equal(altitude.status, "unverified");
  assert.match(altitude.reason, /different elevations/);

  const level = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({
      id: "recipient",
      offsets: [{ i: 1, j: 0 }],
      level: "upper",
    }),
  );
  assert.equal(level.status, "unverified");
  assert.match(level.reason, /different scene levels/);
});

test("native adjacency uses stable source movement fields during animation", () => {
  const moving = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({
      id: "recipient",
      offsets: [{ i: 1, j: 0 }],
      elevation: 5,
      derivedElevation: 0,
    }),
  );
  assert.equal(moving.status, "unverified");
  assert.match(moving.reason, /different elevations/);
  assert.equal(moving.targetElevation, 5);

  let occupiedData = null;
  const stalePreparedValue = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }] }),
    token({
      id: "recipient",
      offsets: [{ i: 1, j: 0 }],
      elevation: 0,
      derivedElevation: 5,
      onOccupied(data) {
        occupiedData = data;
      },
    }),
  );
  assert.equal(stalePreparedValue.status, "adjacent");
  assert.equal(stalePreparedValue.targetElevation, 0);
  assert.deepEqual(occupiedData, {
    x: 0,
    y: 0,
    elevation: 0,
    width: 1,
    height: 1,
    depth: 1,
    shape: 1,
    level: "ground",
  });
});

test("non-square or unavailable native geometry never guesses", () => {
  installCanvas({ square: false });
  const nonSquare = nativeTokenAdjacency(
    token({ id: "giver", offsets: [{ i: 0, j: 0 }], gridType: 0 }),
    token({ id: "recipient", offsets: [{ i: 1, j: 0 }], gridType: 0 }),
  );
  assert.equal(nonSquare.status, "unverified");
  assert.match(nonSquare.reason, /square grid/);

  installCanvas();
  const unavailable = nativeTokenAdjacency(
    token({ id: "giver", offsets: null }),
    token({ id: "recipient", offsets: [{ i: 1, j: 0 }] }),
  );
  assert.equal(unavailable.status, "unverified");
  assert.match(unavailable.reason, /occupied squares are unavailable/);
});

test("potion adjacency resolves the documented full Combat UUID", async () => {
  const combat = {
      documentName: "Combat",
      uuid: "Combat.potion-exact",
      combatants: new Map([
        ["giver", { id: "giver" }],
        ["recipient", { id: "recipient" }],
      ]),
    },
    requested = [];
  globalThis.game = {
    combats: {
      get() {
        throw new Error("A full UUID must not be passed to a collection key");
      },
    },
  };
  globalThis.fromUuid = async (uuid) => {
    requested.push(uuid);
    return uuid === combat.uuid ? combat : null;
  };
  const { previewPotionAdjacency } = await import(
    "../src/services/potions.mjs"
  );
  const result = await previewPotionAdjacency(
    combat.uuid,
    "giver",
    "recipient",
    "self",
  );
  assert.deepEqual(requested, [combat.uuid]);
  assert.deepEqual(result, {
    known: true,
    distance: 0,
    adjacent: true,
  });
});

test("an explicitly empty source level never falls back to an animated prepared level", () => {
  const result = nativeTokenAdjacency(
    token({
      id: "giver", offsets: [{ i: 0, j: 0 }],
      level: null, derivedLevel: "old-level",
    }),
    token({ id: "recipient", offsets: [{ i: 1, j: 0 }], level: null }),
  );
  assert.equal(result.status, "adjacent");
  assert.equal(result.actorLevel, null);
  assert.equal(result.targetLevel, null);
});
