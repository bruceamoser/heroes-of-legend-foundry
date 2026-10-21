import test from 'node:test';
import assert from 'node:assert/strict';
import {actionUses,spendOwnedAction,resetOwnedActions} from '../src/services/action-uses.mjs';
test('legacy action helpers never record counters or alter effects',async()=>{
 const actor={getFlag(){throw new Error('Do not inspect legacy counters');},update(){throw new Error('Action tracking must not mutate Actors');},toObject(){throw new Error('Do not reset defense effects');}};
 assert.deepEqual(actionUses(actor),{main:0,maneuver:0,reaction:0});
 assert.deepEqual(await spendOwnedAction(actor,'main'),{spent:false,tracking:false});
 assert.deepEqual(await resetOwnedActions(actor),{reset:false,tracking:false});
});
