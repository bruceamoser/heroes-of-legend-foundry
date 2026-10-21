import {woundCatalog} from '../services/wounds.mjs';
import {describeWoundEffect} from '../rules/wound-contributions.mjs';
/** Inspect the saved wound and its complete pinned table entry without another roll. */
export async function openWoundDetails(actor,eventId) {
  if(!actor?.testUserPermission(game.user,'OBSERVER'))throw Error('You cannot inspect this wound.');
  const wound=actor.getFlag('heroes-of-legend','wounds')?.[eventId];
  const pending=actor.getFlag('heroes-of-legend','pendingWounds')?.[eventId];
  const catalog=await woundCatalog();
  const resolved=pending?.result?.key ? (await import('../rules/wounds.mjs')).woundResult(catalog,pending.damageType,pending.result.key) : null;
  const record=catalog.records.find(record=>record.id===wound?.id) ?? resolved?.record;
  if(!wound&&!record)throw Error('This wound is unavailable.');
  const source=record??wound,escape=foundry.utils.escapeHTML;
  const effects=wound?.effects??resolved?.effects??source.effects??[];
  const content=`<section class="hol-wound-details"><p>${escape(source.table??pending?.damageType??'Wound')}${source.key?` · ${escape(source.key)}`:''}</p><p>${escape(source.effect??(effects.map(describeWoundEffect).join(' · ')||'Lasting scar; no mechanical penalty.'))}</p><p><strong>Remedy:</strong> ${escape(source.remedy??wound?.remedy??'—')}${source.recoveryValue?` · <strong>RV ${source.recoveryValue}</strong>`:''}</p></section>`;
  return foundry.applications.api.DialogV2.prompt({classes:['heroes-of-legend','hol-native-dialog'],window:{title:source.injury??wound.injury},content,ok:{label:'Close'}});
}
