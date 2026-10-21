import test from "node:test";
import assert from "node:assert/strict";
import { hpInputValue } from "../src/sheets/hp-input.mjs";

test("inline HP accepts explicit zero and restoration but rejects unfinished or invalid edits", () => {
  assert.equal(hpInputValue("0", 15), 0);
  assert.equal(hpInputValue("12", 15), 12);
  for (const value of ["", " ", "-1", "1.5", "16", "not a number"])
    assert.throws(() => hpInputValue(value, 15), /HP|whole|empty/);
});

test("signed header HP corrections use current HP and clamp to its valid range",()=>{
 assert.equal(hpInputValue("-3",15,10),7);assert.equal(hpInputValue("+4",15,10),14);assert.equal(hpInputValue("+9",15,10),15);assert.equal(hpInputValue("-99",15,10),0);assert.equal(hpInputValue("7",15,10),7);
});
