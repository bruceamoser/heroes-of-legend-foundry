import { NUMERIC_CREATURE_ACTIONS, NUMERIC_CREATURE_COMMIT } from './numeric-creature-manifest.mjs';
const TIERS=['weak','standard','strong'];
/** Exact pinned imported contract; runtime prose and custom edits never grant automation. */
export function creatureActionSignature(action) {
  return JSON.stringify([action.id,action.category,action.name,action.abilityId,action.attributeKey,action.defenseSource,action.harmfulOnly,action.hasOutcomes,...TIERS.map(tier=>action.outcomes?.[tier]),action.effect,action.referenceMarkdown]);
}
export function numericCreatureAction(catalogId,sourceCommit,action) {
  const expected=NUMERIC_CREATURE_ACTIONS[`${catalogId}/${action.id}`];
  if(sourceCommit!==NUMERIC_CREATURE_COMMIT||!expected||creatureActionSignature(action)!==expected)return null;
  return {resolution:'numeric',damage:Object.fromEntries(TIERS.map(tier=>[tier,Number(action.outcomes[tier])])),damageType:'physical'};
}
