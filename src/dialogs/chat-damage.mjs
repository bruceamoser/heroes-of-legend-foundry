import {DAMAGE_TYPES} from '../rules/damage.mjs';
import {applySelectedDamage} from '../services/explicit-damage.mjs';
/** Explicit table interpretation for variable, conditional and mixed damage. */
export async function promptChatDamage(message, text = '') {
  if (!canvas.tokens?.controlled?.length) throw new Error('Select one or more tokens before applying damage.');
  const escape = foundry.utils.escapeHTML;
  const result = await foundry.applications.api.DialogV2.input({
    classes:['heroes-of-legend','hol-native-dialog'], window:{title:'Apply Damage'},
    content:`<p>${escape(text)}</p><p>Enter the applicable damage for this use. All selected tokens receive the entered components, with their own resistance.</p>${[0,1,2].map(index=>`<div class="form-group"><label>${index ? 'Additional component (optional)' : 'Damage'}<input name="amount${index}" type="number" min="0" step="1" value="0"></label><label>Type<select name="type${index}">${DAMAGE_TYPES.map(type=>`<option value="${type}">${type}</option>`).join('')}</select></label></div>`).join('')}`,
    ok:{label:'Apply Damage'},
  });
  if (!result) return;
  const components=[0,1,2].map(index=>({type:result[`type${index}`],amount:Number(result[`amount${index}`])}));
  if (components.some(component=>!Number.isSafeInteger(component.amount)||component.amount<0)) throw new Error('Enter nonnegative whole damage amounts.');
  const positive=components.filter(component=>component.amount>0);
  if (!positive.length) throw new Error('Enter at least one damage amount greater than zero.');
  return applySelectedDamage(positive,{sourceMessageId:message.id,label:'Chat damage'});
}
