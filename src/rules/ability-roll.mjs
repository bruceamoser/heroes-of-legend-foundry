import {DAMAGE_TYPES} from "./damage.mjs";
import {printedDamageChoices} from "./attack-outcomes.mjs";
import {reactionTrigger} from "./ability-roll-relevance.mjs";
/** Printed roll metadata is independent of whether an effect has an automation adapter. */
const ATTRIBUTES = new Set(['brawn', 'fortitude', 'agility', 'guile', 'knowledge', 'reason']);
/** Resolve imported identity without guessing from a mutable display name. */
export function abilityCatalogRecord(item, records) {
  const flaggedId = item?.getFlag?.("heroes-of-legend", "catalogId");
  const ability = (record) => record.kind === "ability";
  if (flaggedId !== undefined && flaggedId !== null)
    return records.find((record) => ability(record) && record.id === flaggedId);
  const systemId = item?.system?.catalogId;
  const systemRecord = records.find(
    (record) => ability(record) && record.id === systemId,
  );
  if (systemRecord) return systemRecord;
  const source = item?.getFlag?.("heroes-of-legend", "source");
  if (typeof source?.path !== "string" || !source.path) return undefined;
  const matches = records.filter(
    (record) =>
      ability(record) &&
      record.source?.path === source.path &&
      (source.sha256 === undefined ||
        source.sha256 === null ||
        record.source.sha256 === source.sha256),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
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
  const equipment=rules?.details?.find(detail=>detail.label === "Equipment / acquisition")?.value ?? "";
  const weaponKind=attack ? ranged ? "ranged" : /melee weapon/i.test(equipment) ? "melee" : record?.id === "ability-basic-throw" ? "thrown" : null : null;
  return {damageTypes:printedDamageChoices(record),itemUuid:item.uuid, name:item.name, attribute, attack, ranged, weaponKind, trigger:reactionTrigger(record),
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
  const match = new RegExp(`^\\s*(?:Deal\\s+)?(\\d+)\\s+(${DAMAGE_TYPES.join("|")})\\s+damage[.!]?\\s*$`, "i").exec(text ?? "");
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isSafeInteger(amount) ? [{type: match[2].toLowerCase(), amount}] : null;
}
