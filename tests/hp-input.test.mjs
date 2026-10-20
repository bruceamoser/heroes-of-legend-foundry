import test from "node:test";
import assert from "node:assert/strict";
import { hpInputValue } from "../src/sheets/hp-input.mjs";

test("inline HP accepts explicit zero and restoration but rejects unfinished or invalid edits", () => {
  assert.equal(hpInputValue("0", 15), 0);
  assert.equal(hpInputValue("12", 15), 12);
  for (const value of ["", " ", "-1", "1.5", "16", "not a number"])
    assert.throws(() => hpInputValue(value, 15), /whole number of HP/);
});
