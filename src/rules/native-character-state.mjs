import { survivalState } from "./survival.mjs";
const ID = "heroes-of-legend";

/** Map portable identities to native Item IDs only after the grant plan exists. */
export function importedCharacterState(draft, preview, items, instanceIds = {}) {
  const play = draft.play ?? {};
  const byInstance = new Map(items.map(item => [item.flags?.[ID]?.acquisitionInstance, item._id]));
  for (const [instanceId, nativeId] of Object.entries(instanceIds)) byInstance.set(instanceId,nativeId);
  const byCatalog = new Map(items.filter(item => item.type === "ability").map(item => [item.flags?.[ID]?.catalogId, item._id]));
  const favorites = [
    ...(play.favorites?.abilities ?? []).map(id => byCatalog.get(id)),
    ...(play.favorites?.items ?? []).map(id => byInstance.get(id)),
  ].filter(Boolean);
  const hp = Math.min(preview.summary.maximumHp, play.hp ?? preview.summary.maximumHp);
  const marks = hp ? 0 : (play.failedDeathRolls ?? 0);
  const status = hp ? "active" : marks === 3 || play.lastWords ? "lastWords" : "dying";
  const survival = status === "lastWords"
    ? { ...survivalState({hp, maxHp: preview.summary.maximumHp, wounds: play.wounds?.length ?? 0, gritAvailable: Math.max(0, preview.summary.gritGranted - (play.gritSpent ?? 0)), marks: Math.min(2, marks)}), status, marks: 3, lastWordsAt: 0, lastWordsEnds: 2 }
    : survivalState({hp, maxHp: preview.summary.maximumHp, wounds: play.wounds?.length ?? 0, gritAvailable: Math.max(0, preview.summary.gritGranted - (play.gritSpent ?? 0)), marks});
  const crafting = structuredClone(play.crafting ?? {});
  for (const project of Object.values(crafting)) {
    if (project.supplyId) {
      const nativeId = byInstance.get(project.supplyId);
      if (!nativeId) throw new Error("A crafting project refers to a supply that is no longer present. Select its current supply in the workshop before importing.");
      project.supplyId = nativeId;
    }
  }
  return {
    [`flags.${ID}.characterSheet`]: {favorites, basicActions: draft.basicActions ?? {}, closed: play.collapsed ?? {}},
    [`flags.${ID}.craftingState`]: crafting,
    [`flags.${ID}.survival`]: survival,
    [`flags.${ID}.profile`]: structuredClone(draft.profile ?? {}),
  };
}
