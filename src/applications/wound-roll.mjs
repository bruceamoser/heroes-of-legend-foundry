import { DAMAGE_TYPES } from "../rules/damage.mjs";
import { rollCharacterWound } from "../services/wound-roll.mjs";
const title=value=>value[0].toUpperCase()+value.slice(1);
export async function openWoundRoll(actor,{eventId=null}={}){
  if(!actor.isOwner)throw new Error("Choose a character you own.");
  const pending=eventId?actor.getFlag("heroes-of-legend","pendingWounds")?.[eventId]:null;
  const types=pending?.types??DAMAGE_TYPES;
  const prior=pending?.priorWounds??actor.getFlag("heroes-of-legend","survival")?.wounds??Object.keys(actor.getFlag("heroes-of-legend","wounds")??{}).length;
  const operationId=foundry.utils.randomID();
  let busy=false;
  const dialog=new foundry.applications.api.DialogV2({classes:["heroes-of-legend","hol-roll-dialog","hol-wound-roll"],position:{width:420},window:{title:"Roll wound"},form:{closeOnSubmit:false},
    content:`<label>Damage type<select name="damageType">${types.map(type=>`<option value="${type}">${title(type)}</option>`).join("")}</select></label><p>${prior} prior wounds · ${Math.min(5,3+prior)}d6, keep highest three.</p><label>Cause of injury <small>(used if the result causes fear)</small><input name="fearSource" placeholder="Creature, hazard or other source"></label><p class="hol-tool-help">Roll the wound table, apply the result and post it to chat. Undo is available on the result card.</p>`,
    buttons:[{action:"roll",label:"Roll wound",icon:"fa-solid fa-dice",callback:async(event,button,app)=>{
      if(busy)return;busy=true;button.disabled=true;
      try{const result=await rollCharacterWound(actor,app.element.querySelector('[name="damageType"]').value,{eventId,operationId,fearSource:app.element.querySelector('[name="fearSource"]').value});await app.close();return result;}
      catch(error){ui.notifications.error(error.message);busy=false;button.disabled=false;}
    }}]});
  await dialog.render({force:true});return dialog;
}
