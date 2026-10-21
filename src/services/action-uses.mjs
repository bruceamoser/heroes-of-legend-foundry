/** Compatibility for older macros. Action use belongs to the players and DA;
 * no counters, resource payments or effect resets are recorded by these calls. */
export function actionUses(_actor) { return {main:0,maneuver:0,reaction:0}; }
export async function spendOwnedAction(_actor,_category,_options={}) { return {spent:false,tracking:false}; }
export async function resetOwnedActions(_actor) { return {reset:false,tracking:false}; }
