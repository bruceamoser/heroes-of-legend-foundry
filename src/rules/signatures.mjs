/** Signature slots are earned by level; historical pending markers are only hints. */
export const SIGNATURE_LEVELS = Object.freeze([1,3,7]);
const idOf = entry => entry.id ?? entry.sourceId;
function paidAbilityIds(state) {
  const refunded=new Set((state.ledger??[]).filter(entry=>entry.kind==='refund').map(entry=>entry.refundOf));
  return new Set([...(state.purchases??[]).map(entry=>entry.id),...(state.ledger??[]).flatMap((entry,index)=>entry.kind==='purchase'&&entry.delta<0&&!refunded.has(index)?[idOf(entry)]:[])]);
}
function recordedChoice(state,level,optionIds) {
  const explicit=state.signatureChoices?.[level] ?? (level===1?state.creation?.signatureId:null);
  if(optionIds.includes(explicit))return explicit;
  const latest=(state.ledger??[]).findLast(entry=>['signature-grant','signature-switch'].includes(entry.kind)&&entry.level===level&&optionIds.includes(idOf(entry)));
  if(latest)return idOf(latest);
  if(level===1){const creation=(state.ledger??[]).findLast(entry=>entry.kind==='ability-grant'&&entry.sourceId===state.classId&&optionIds.includes(entry.id));if(creation)return creation.id;}
  return null;
}
export function signatureTierState(state,level,choices) {
  const cls=choices.find(choice=>choice.kind==='class'&&choice.id===state.classId),optionIds=cls?.signatures?.[level]??[];
  const earned=SIGNATURE_LEVELS.includes(level)&&Number.isSafeInteger(state.level)&&level<=state.level&&optionIds.length>0;
  const ownedIds=optionIds.filter(id=>(state.abilities??[]).includes(id)),paid=paidAbilityIds(state),paidIds=ownedIds.filter(id=>paid.has(id));
  const recorded=recordedChoice(state,level,optionIds),legacy=ownedIds.filter(id=>!paid.has(id));
  const selectedId=recorded??(legacy.length===1?legacy[0]:null),ambiguous=!recorded&&legacy.length>1;
  return {level,earned,selectedId,ownedIds,paidIds,ambiguous,pending:earned&&!selectedId&&!ambiguous,optionIds};
}
export function earnedSignatureTiers(state,choices) {return SIGNATURE_LEVELS.filter(level=>signatureTierState(state,level,choices).earned);}
export function pendingSignatureTiers(state,choices) {return [3,7].filter(level=>signatureTierState(state,level,choices).pending);}

/** Only the currently selected slot protects an ability during a paid refund. */
export function activeAbilityGrant(state,entry,id) {
  if(idOf(entry)!==id)return false;
  if(['signature-grant','signature-switch'].includes(entry.kind)){
    const current=state.signatureChoices?.[entry.level]??(entry.level===1?state.creation?.signatureId:null)??idOf((state.ledger??[]).findLast(row=>['signature-grant','signature-switch'].includes(row.kind)&&row.level===entry.level)??{});
    return current===id;
  }
  if(entry.kind!=='ability-grant')return false;
  if(entry.sourceId===state.classId){const current=state.signatureChoices?.[1]??state.creation?.signatureId;if(current)return current===id;}
  return true;
}
/** An active free slot also survives a refund when legacy history lacks its grant. */
export function selectedSignatureAbility(state,id) {return Object.values(state.signatureChoices??{}).includes(id)||state.creation?.signatureId===id;}
