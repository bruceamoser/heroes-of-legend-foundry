import { updateOwnedDocument } from "./documents.mjs";
const ID = "heroes-of-legend";
const categories = ["main", "maneuver", "reaction"];
const queues = new Map();
function serialized(actor, operation) {
  const previous = queues.get(actor.uuid) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(operation);
  queues.set(actor.uuid, result);
  result.finally(() => { if (queues.get(actor.uuid) === result) queues.delete(actor.uuid); }).catch(() => {});
  return result;
}
export function actionUses(actor) {
  const saved = actor.getFlag(ID, "actionUses") ?? {};
  return Object.fromEntries(categories.map(key => [key, Number.isSafeInteger(saved[key]) && saved[key] >= 0 ? saved[key] : 0]));
}
/** Track deliberate uses without preventing a roll or adjudicating exceptions. */
export function spendOwnedAction(actor, category, {operationId} = {}) {
  if (!categories.includes(category)) return Promise.resolve({spent:false});
  return serialized(actor, async () => {
    if (!actor.testUserPermission(game.user, "OWNER")) throw new Error("Only an owner can spend this actor’s action.");
    if (operationId && !/^[A-Za-z0-9_-]{1,100}$/.test(operationId)) throw new Error("Invalid action identity.");
    if (operationId && actor.getFlag(ID,"actionUseReceipts")?.[operationId]) return {spent:false,replay:true};
    const uses = actionUses(actor);
    uses[category] += 1;
    await updateOwnedDocument(actor, {
      [`flags.${ID}.actionUses`]: uses,
      ...(operationId ? {[`flags.${ID}.actionUseReceipts.${operationId}`]: {category}} : {}),
    });
    return {spent:true,uses};
  });
}
export function resetOwnedActions(actor) {
  return serialized(actor, async () => {
    const effects = actor.toObject().effects.map(effect => effect.flags?.[ID]?.benefit?.manual
      ? {...effect,disabled:true} : effect);
    return updateOwnedDocument(actor, {effects,[`flags.${ID}.actionUses`]:{main:0,maneuver:0,reaction:0}});
  });
}
