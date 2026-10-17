import { test } from "node:test";
import assert from "node:assert/strict";
import { rollPlan, classifyRoll } from "../src/rules/roll.mjs";
test("cancel before capping and keep the correct three dice", () => {
  assert.equal(rollPlan({attribute: 2, boons: 8, banes: 6}).formula, "5d6kh3 + (2)");
  assert.equal(rollPlan({attribute: -2, boons: 1, banes: 9}).formula, "6d6kl3 + (-2)");
  assert.equal(rollPlan({attribute: 0, boons: 5, banes: 5}).formula, "3d6 + (0)");
  assert.equal(rollPlan({attribute: 0, boons: 10}).count, 6);
});
test("tier boundaries and natural results use retained faces", () => {
  for (const [faces, attribute, tier] of [[[2,3,3],0,"weak"],[[3,3,3],0,"standard"],[[4,5,5],0,"standard"],[[5,5,5],0,"strong"],[[1,1,1],20,"weak"],[[6,6,6],-20,"strong"]]) {
    assert.equal(classifyRoll(faces, attribute).tier, tier);
  }
  assert.equal(classifyRoll([1,1,1],2).natural,"fumble");
  assert.equal(classifyRoll([6,6,6],-2).natural,"critical");
});
test("all 216 retained-face combinations classify correctly at -2 through +2", () => {
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)for(let mod=-2;mod<=2;mod++) {
    const result=classifyRoll([a,b,c],mod);
    assert.equal(result.total,a+b+c+mod);
    const expected = a===1&&b===1&&c===1 ? "weak" : a===6&&b===6&&c===6 ? "strong" : result.total<9 ? "weak" : result.total<15 ? "standard" : "strong";
    assert.equal(result.tier,expected);
  }
});
test("reject malformed dice and modifier inputs",()=>{
  for(const faces of [[1,2], [0,2,3], [1,2,7], [1,2,3.5]]) assert.throws(()=>classifyRoll(faces,0));
  for(const boons of [-1,0.5,NaN,Infinity]) assert.throws(()=>rollPlan({attribute:0,boons}));
});
