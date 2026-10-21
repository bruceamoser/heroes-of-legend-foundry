import {reactionTrigger} from "./ability-roll-relevance.mjs";
/** Printed roll metadata is independent of whether an effect has an automation adapter. */
const ATTRIBUTES = new Set(['brawn', 'fortitude', 'agility', 'guile', 'knowledge', 'reason']);
export function printedAbilityRoll(record) {
  const rules = record?.reference?.rules;
  const value = rules?.details?.find(detail => detail.label === 'Attribute')?.value?.trim().toLowerCase();
  const attribute = ATTRIBUTES.has(value) ? value : null;
  const outcomes = Object.fromEntries((rules?.body ?? []).flatMap(block => block.outcomes ?? [])
    .filter(outcome => ['weak','standard','strong'].includes(outcome.label.toLowerCase()))
    .map(outcome => [outcome.label.toLowerCase(),outcome.text]));
  return {attribute, outcomes};
}
export function abilityRollConfiguration(item, record) {
  const printed = printedAbilityRoll(record);
  const configured = item.system?.activity;
  const attribute = configured?.rollMode === 'attribute' && ATTRIBUTES.has(configured.attribute)
    ? configured.attribute : printed.attribute;
  const rules=record?.reference?.rules;
  const tags=[...(rules?.details ?? []).filter(detail=>detail.label === "Type").map(detail=>detail.value),
    ...(rules?.notes ?? []).filter(note=>note.label === "Tags").map(note=>note.text)];
  const attack=tags.some(value=>String(value).split("/").some(tag=>tag.trim() === "Attack"));
  const ranged = attack && (/ranged weapon/i.test(JSON.stringify(record?.reference?.rules ?? {})) || record?.id === "ability-basic-ranged");
  return {itemUuid:item.uuid, name:item.name, attribute, attack, ranged, trigger:reactionTrigger(record),
    effect:(record?.reference?.rules?.body ?? []).flatMap(block=>block.text ? [block.text] : block.items ?? []).join(" ") || String(item.system?.description ?? "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(),
    outcomes:Object.fromEntries(['weak','standard','strong'].map(tier => [tier,item.system?.outcomes?.[tier] || printed.outcomes[tier] || '']))};
}
export function assertAbilityConfiguration(current, opened) {
  if (opened && JSON.stringify(current) !== JSON.stringify(opened))
    throw new Error("The ability configuration changed. Reopen its roll dialog to use the current attribute and outcomes.");
}

/** Only a complete, unconditional numeric damage sentence is a button payload.
 * Conditional, variable and split effects remain printed for table adjudication. */
export function outcomeDamage(text) {
  const match = /^\s*(?:Deal\s+)?(\d+)\s+(physical|fire|cold|lightning|mental|radiant|life)\s+damage[.!]?\s*$/i.exec(text ?? "");
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isSafeInteger(amount) ? [{type: match[2].toLowerCase(), amount}] : null;
}
