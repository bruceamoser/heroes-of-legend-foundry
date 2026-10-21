import { WOUND_KEYS } from "../../src/rules/wounds.mjs";
import { stableFoundryId } from "./item-packs.mjs";
const ID = "heroes-of-legend";
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function woundTableDocuments(catalog) {
  return ["physical", "elemental", "mental", "radiant", "life"].map(table => {
    let next = 1;
    const results = WOUND_KEYS.map(key => {
      const record = catalog.records.find(record => record.table === table && record.key === key);
      if (!record) throw new Error(`Missing wound entry ${table}/${key}`);
      const distinct = new Set(key).size, weight = distinct === 1 ? 1 : distinct === 2 ? 3 : 6;
      const range = [next, next + weight - 1]; next += weight;
      return {_id:stableFoundryId(record.id,"wound-result"),type:"text",name:`${key} · ${record.injury}`,
        description:`<p><strong>${escape(record.injury)}</strong></p><p>${escape(record.effects.map(e=>e.kind==='condition'?`${e.key} ${e.rating}${e.persistence==='starred'?'*':''}`:e.kind==='lastWords'?'Last Words':e.kind==='movementPenalty'?`Movement −${e.amount}`:e.kind==='rollModifier'?`${e.amount} ${e.polarity}: ${e.context}`:e.kind==='forcedMovement'?`${e.direction} ${e.distance} squares`:e.kind).join('; ')||'Lasting scar; no mechanical penalty.')}</p><p>Remedy: ${escape(record.remedy)}${record.recoveryValue?` · Recovery ${record.recoveryValue}`:''}</p>`,
        img:"icons/svg/blood.svg",weight,range,drawn:false,flags:{[ID]:{woundKey:key,woundTable:table,catalogId:record.id,sourceCommit:catalog.sourceCommit}}};
    });
    if(next!==217)throw new Error('Wound distribution must cover all 216 three-die outcomes.');
    return {_id:stableFoundryId(table,"wound-table"),name:`${table[0].toUpperCase()+table.slice(1)} wounds`,img:"icons/svg/blood.svg",
      description:"<p>Canonical sorted 3d6 wound results. The native 1d216 table weights reproduce all 216 equally likely three-die combinations. For accumulated wounds, use the character’s Roll wound action: roll up to 5d6, keep the highest three and read them in ascending order. That action selects this table’s matching result and applies it.</p>",formula:"1d216",replacement:true,displayRoll:true,
      ownership:{default:2},flags:{[ID]:{woundTable:table,sourceCommit:catalog.sourceCommit}},results};
  });
}
