const ATTRIBUTES = ['brawn','fortitude','agility','guile','knowledge','reason'];
const plain = value => String(value ?? '').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|mdash|ndash);/g,' ').replace(/\s+/g,' ').trim();
/** Extract authored reaction timing; the target line includes the trigger for legacy cards. */
export function reactionTrigger(record) {
  const rules=record?.reference?.rules;
  if(!rules?.details?.some(detail=>detail.label==='Action'&&/\bReaction\b/i.test(detail.value)))return '';
  return rules.details.find(detail=>detail.label==='Trigger')?.value
    ?? rules.notes?.find(note=>note.label==='Trigger')?.text
    ?? rules.details.find(detail=>detail.label==='Target / range / shape')?.value ?? '';
}
/** A contextual reference may be relevant without declaring that its fiction applies.
 * Rolled actions belong only to their own roll; references never grant their outcomes. */
export function rollReferenceApplies(item,{mode='attribute',attributeKey,initiatingItemId=null}={}) {
  if(item.id===initiatingItemId)return true;
  if(!attributeKey)return true; // Non-roll callers retain the ordinary visible-item inventory.
  if(mode==='death')return false;
  if(item.system?.activity?.rollMode==='attribute')return false;
  const html=String(item.system?.description??'');
  const body=plain(/class=["']hol-reference-rules["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1]??html);
  // Require a printed benefit, not boilerplate about rolling with net Boons/Banes.
  const clauses=body.split(/[.!?]/).filter(clause=>/\b(?:gain|gains|grant|grants|give|gives|add|adds|take|takes|suffer|suffers|receive|receives|impose|imposes|ignore|ignores)\b[^.]*\b(?:\d+|one|two|three|an?)\s+(?:additional\s+)?(?:Boon|Bane)s?\b/i.test(clause));
  if(!clauses.length)return false;
  return clauses.some(clause=>{
    const named=ATTRIBUTES.filter(key=>new RegExp(`\\b${key}\\b`,'i').test(clause));
    if(named.length&&!named.includes(attributeKey))return false;
    const defense=/\bdefen[cs]e\b/i.test(clause),attack=/\battack\b/i.test(clause);
    if(defense&&!attack&&mode!=='defense')return false;
    if(attack&&!defense&&mode!=='attack')return false;
    if(mode==='defense'&&!defense&&named.length)return false;
    return true;
  });
}
