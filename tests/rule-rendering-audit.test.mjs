import test from "node:test";
import assert from "node:assert/strict";
import {visibleRules,missingAuthoredRules} from "../scripts/audit-rule-rendering.mjs";

test("independent authored extraction includes prefaces, numeric profiles, common procedures and option lists",()=>{
 const source='# Triage\n\nNarrative.\n\n## Rules\n\n**Action:** Main Action · **Attribute:** Reason\n\nPay 2 HP. One ally: restore 6 HP on Weak, 11 HP on Standard, 16 HP on Strong. Reduce restoration by Life resistance.\n\n- Snap Back\n- Manifest\n\n**Duration:** Immediate.\n\n---\n\n**ID:** triage';
 const expected=visibleRules(source,"ability");
 assert.equal(expected.length,2);
 assert.equal(missingAuthoredRules(expected,'Pay 2 HP. One ally: restore 6 HP on Weak, 11 HP on Standard, 16 HP on Strong. Reduce restoration by Life resistance. Snap Back Manifest').length,0);
 for(const removed of ['Pay 2 HP.','6 HP on Weak,','Reduce restoration by Life resistance.','Manifest']) {
  const damaged='Pay 2 HP. One ally: restore 6 HP on Weak, 11 HP on Standard, 16 HP on Strong. Reduce restoration by Life resistance. Snap Back Manifest'.replace(removed,'');
  assert(missingAuthoredRules(expected,damaged).length,removed);
 }
});
test("entry-local vision rules cannot pass using a different rating or only narrative",()=>{
 const source='# Starlight Eyes\n\nTwilight comes.\n\n## Rules\n\n[Low-Light Vision 1](vision.md).\n\n**Ancestry:** High Elf · **Action:** Passive\n\n**Duration:** Permanent.\n\n**ID:** trait-test';
 const expected=visibleRules(source,"trait");
 assert.deepEqual(expected,['[Low-Light Vision 1](vision.md).']);
 assert.equal(missingAuthoredRules(expected,'Twilight comes. Low-Light Vision 2.').length,1);
 assert.equal(missingAuthoredRules(expected,'Twilight comes. Low-Light Vision 1.').length,0);
});
