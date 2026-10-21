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
  return {itemUuid:item.uuid, name:item.name, attribute,
    outcomes:Object.fromEntries(['weak','standard','strong'].map(tier => [tier,item.system?.outcomes?.[tier] || printed.outcomes[tier] || '']))};
}
export function assertAbilityConfiguration(current, opened) {
  if (opened && JSON.stringify(current) !== JSON.stringify(opened))
    throw new Error("The ability configuration changed. Reopen its roll dialog to use the current attribute and outcomes.");
}
