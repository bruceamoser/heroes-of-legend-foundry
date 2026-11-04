import test from "node:test";
import assert from "node:assert/strict";
import { ancestryTokenFootprint } from "../src/rules/ancestry-token.mjs";

test("CHG-HAL-002 uses half-square Halfling tokens at initial creation", () => {
  assert.deepEqual(ancestryTokenFootprint("ancestry-halfling"), {width: 0.5, height: 0.5});
  assert.deepEqual(ancestryTokenFootprint("ancestry-halfling", {width: 1, height: 1}), {width: 0.5, height: 0.5});
});
test("configured token footprints are preserved and no other ancestry inherits the directive", () => {
  for (const prototype of [{width: 2, height: 2}, {width: 0.5, height: 0.5}, {width: 1, height: 2}]) {
    const before = structuredClone(prototype);
    assert.deepEqual(ancestryTokenFootprint("ancestry-halfling", prototype), {});
    assert.deepEqual(prototype, before);
  }
  for (const id of ["ancestry-gnome", "ancestry-goblin", "ancestry-human", "", undefined])
    assert.deepEqual(ancestryTokenFootprint(id), {});
});
