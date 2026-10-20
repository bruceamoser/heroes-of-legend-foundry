import test from "node:test";
import assert from "node:assert/strict";
import {createLandingScene, landingSceneSource, LANDING_ID} from "../src/services/landing.mjs";

test("landing setup preserves existing edits and refuses a colliding unrelated scene", async () => {
  const edited = {id: LANDING_ID, name: "Our campaign", getFlag: () => ({version: 1})};
  globalThis.game = {user: {isGM: true}, scenes: {find: () => edited}};
  globalThis.Scene = {create: () => {throw Error("Must not create");}};
  assert.equal(await createLandingScene(), edited);
  game.scenes = {find: () => null, get: () => ({getFlag: () => null})};
  await assert.rejects(createLandingScene(), /preserved/);
  game.user.isGM = false;
  await assert.rejects(createLandingScene(), /Dungeon Architect/);
});

test("landing creation is shared across repeated clicks and never activates a campaign scene", async () => {
  let count = 0, release;
  globalThis.game = {user: {isGM: true}, scenes: {find: () => null, get: () => null}};
  const created = {id: LANDING_ID};
  globalThis.Scene = {async create(data, options) {
    count++; assert.equal(data.active, false); assert.equal(options.keepId, true);
    await new Promise(resolve => {release = resolve;}); return created;
  }};
  const first = createLandingScene(), second = createLandingScene();
  release();
  assert.deepEqual(await Promise.all([first, second]), [created, created]);
  assert.equal(count, 1);
  const source = landingSceneSource();
  assert.ok(source.tiles.every(tile => tile.levels[0] === source.initialLevel));
  assert.ok(source.drawings.every(drawing => drawing.levels[0] === source.initialLevel));
  assert.equal(source.ownership.default, 2);
});
