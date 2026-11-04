const ID = "heroes-of-legend";
/** Only authored reference/configuration fields; acquisition and play state are excluded. */
export const ABILITY_RULE_PATHS = Object.freeze([
  "system.description",
  ...["action", "rollMode", "attribute", "defenseAttribute"].map(key => `system.activity.${key}`),
  ...["weak", "standard", "strong"].map(key => `system.outcomes.${key}`),
  ...["source.path", "source.sha256", "sourceCommit", "catalogAutomation", "automation", "automationLabel", "handler"].map(key => `flags.${ID}.${key}`),
]);
export const abilityRuleValue = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

/** Exact SHA-256 values: no HTML, whitespace or source-link normalization. */
export async function abilityRuleFingerprint(value) {
  const bytes = new TextEncoder().encode(value === undefined ? "<missing>" : JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2,"0")).join("");
}

/** Pure three-way comparison; an edited field stays local even if others can update. */
export async function planAbilityRuleUpdate({ item, current, baseline }) {
  const identity = item?.flags?.[ID]?.catalogId;
  if (item?.type !== "ability" || current?.type !== "ability" || !identity || identity !== current.flags?.[ID]?.catalogId)
    throw new Error("Ability rule update identity does not match.");
  const oldSource = item.flags[ID].source;
  const known = baseline?.source?.path === oldSource?.path && baseline.source.sha256 === oldSource?.sha256;
  const changes = {}, updated = [], preserved = [], comparisons = [];
  for (const path of ABILITY_RULE_PATHS) {
    const before = abilityRuleValue(item,path), after = abilityRuleValue(current,path);
    if (after === undefined || JSON.stringify(before) === JSON.stringify(after)) continue;
    const entry = {path, before:structuredClone(before), after:structuredClone(after)};
    const beforeFingerprint = await abilityRuleFingerprint(before);
    const publishedFingerprints = [baseline?.fields?.[path], baseline?.nativeFields?.[path]].filter(Boolean);
    if (known && publishedFingerprints.includes(beforeFingerprint)) {
      changes[path] = structuredClone(after);
      updated.push(path);
      comparisons.push(entry);
    } else preserved.push(entry);
  }
  return {changes, updated, preserved, comparisons, catalogId:identity};
}
