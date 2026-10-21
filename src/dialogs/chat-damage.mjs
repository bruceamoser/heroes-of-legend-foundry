import {CONDITION_KINDS} from "../rules/conditions.mjs";
import {DAMAGE_TYPES} from '../rules/damage.mjs';
import {applySelectedDamage} from '../services/explicit-damage.mjs';
/** Explicit table interpretation for variable, conditional and mixed damage. */
export async function promptChatDamage(message, text = '') {
  if (!canvas.tokens?.controlled?.length) throw new Error('Select one or more tokens before applying damage.');
  const escape = foundry.utils.escapeHTML;
  const result = await foundry.applications.api.DialogV2.input({
    classes:['heroes-of-legend','hol-native-dialog'], window:{title:'Apply Damage'},
    content:`<p>${escape(text)}</p>${[0,1,2].map(index=>`<div class="form-group"><label>${index ? 'Additional component (optional)' : 'Damage'}<input name="amount${index}" type="number" min="0" step="1" value="0"></label><label>Type<select name="type${index}">${DAMAGE_TYPES.map(type=>`<option value="${type}">${type}</option>`).join('')}</select></label></div>`).join('')}<details><summary>Conditions</summary>${[0,1,2].map(index=>`<div class="form-group"><label>Condition<select name="condition${index}"><option value="">None</option>${Object.keys(CONDITION_KINDS).map(key=>`<option value="${key}">${key[0].toUpperCase()+key.slice(1)}</option>`).join('')}</select></label><label>Rating<input name="rating${index}" type="number" min="1" step="1" value="1"></label></div>`).join('')}</details>`,
    ok:{label:'Apply Damage'},
  });
  if (!result) return;
  const components=[0,1,2].map(index=>({type:result[`type${index}`],amount:Number(result[`amount${index}`])}));
  if (components.some(component=>!Number.isSafeInteger(component.amount)||component.amount<0)) throw new Error('Enter nonnegative whole damage amounts.');
  const positive=components.filter(component=>component.amount>0);
  const conditions=[0,1,2].map(index=>({key:result[`condition${index}`],rating:Number(result[`rating${index}`])})).filter(condition=>condition.key);
  if(conditions.some(condition=>!Object.hasOwn(CONDITION_KINDS,condition.key)||!Number.isSafeInteger(condition.rating)||condition.rating<1||CONDITION_KINDS[condition.key]==="binary"&&condition.rating!==1))throw new Error('Choose valid conditions and ratings.');
  if (!positive.length && !conditions.length) throw new Error('Enter damage or choose a condition.');
  return applySelectedDamage(positive,{sourceMessageId:message.id,label:'Chat damage',conditions});
}
