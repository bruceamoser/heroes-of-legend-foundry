import {currentHpInput} from "../rules/resource-input.mjs";
import {draftHp,draftGrit,draftWound,draftDeath} from "../rules/draft-play.mjs";
import {rolledWorkshopWound} from "../rules/workshop-resources.mjs";
import {rollPlan,classifyRoll} from "../rules/roll.mjs";
import {conditionRollSources} from "../rules/conditions.mjs";
import {rollSetup,bindRollSetup} from "../rules/roll-ui.mjs";
import {DAMAGE_TYPES} from "../rules/damage.mjs";
const ID="heroes-of-legend";
const escape=value=>foundry.utils.escapeHTML(String(value??""));
const title=value=>value[0].toUpperCase()+value.slice(1);
async function recovery(app,draft){
  const {requestRecovery}=await import("../services/recovery.mjs"),{damageBasis}=await import("../services/damage.mjs");
  const request=await requestRecovery(app.actor,damageBasis(app.actor),draft),start=Date.now();
  while(!app.actor.getFlag(ID,"operationReceipts")?.[request.id]?.applied){
    if(Date.now()-start>30000)throw new Error("Recovery has not completed. Review the GM automation coordinator before retrying.");
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
export function bindWizardHp(app){
  const input=app.element.querySelector("[data-wizard-hp]");if(!input||input.dataset.bound)return;input.dataset.bound="true";
  input.addEventListener("change",()=>app.act(async()=>{
    if(app.committedPlay)await recovery(app,{kind:"setHp",hp:currentHpInput(input.value,app.actor.system.health.max)});
    else app.draft.play=draftHp(app.draft,app.preview.summary.maximumHp,input.value);
  }));
}
export async function wizardGrit(){
  try{
    if(!this.actor.isOwner||this.committing)return;
    const available=this.committedPlay?this.actor.system.grit.available:Math.max(0,this.preview.summary.gritGranted-(this.draft.play?.gritSpent??0));
    const maximum=this.committedPlay?this.actor.system.health.max:this.preview.summary.maximumHp;
    const lastWords=this.committedPlay?this.actor.getFlag(ID,"survival")?.status==="lastWords":this.draft.play?.lastWords || (this.draft.play?.failedDeathRolls??0)>=3;
    const confirmed=await foundry.applications.api.DialogV2.confirm({classes:["heroes-of-legend","hol-roll-dialog","hol-draft-play"],position:{width:660},window:{title:"Use Grit"},content:`<p>Spend 1 Grit to restore HP to ${maximum} and clear death marks? Wounds remain.</p><p>${available} Grit remaining.${lastWords?" Ordinary Grit cannot reverse Last Words.":""}</p>`,yes:{label:"Spend 1 Grit",disabled:available<1||lastWords},no:{label:"Cancel"}});
    if(!confirmed)return;
    await this.act(async()=>{if(this.committedPlay)await recovery(this,{kind:"grit"});else this.draft.play=draftGrit(this.draft,this.preview);});
  }catch(error){ui.notifications.error(error.message);}
}
function effectLabel(effect){
  if(effect.kind==="condition")return `${title(effect.key)} ${effect.rating}${effect.persistence==="starred"?" ★":""}`;
  if(effect.kind==="movementPenalty")return `Speed −${effect.amount}`;
  if(effect.kind==="rollModifier")return `${effect.amount} ${effect.polarity}${effect.amount>1?"s":""}: ${effect.printedContext??effect.context}`;
  if(effect.kind==="forcedMovement")return `${title(effect.direction)} ${effect.distance} squares; choose direction and legal placement at the table`;
  return "Last Words";
}
async function faces(count){const roll=await new foundry.dice.Roll(`${count}d6`).evaluate();return roll.dice[0].results.map(result=>result.result);}
export async function wizardWounds(){
  try{
    if(!this.actor.isOwner||this.committing)return;
    if(this.committedPlay){const {WoundPanel}=await import("./wounds.mjs");return new WoundPanel(this.actor).render({force:true});}
    const app=this,prior=this.draft.play?.wounds?.length??0;
    const dialog=new foundry.applications.api.DialogV2({classes:["heroes-of-legend","hol-roll-dialog","hol-draft-play"],position:{width:660},window:{title:"New wound"},form:{closeOnSubmit:false},content:`<label>Damage type<select name="damageType" aria-label="Wound damage type">${DAMAGE_TYPES.map(type=>`<option value="${type}" ${type==="physical"?"selected":""}>${title(type)}</option>`).join("")}</select></label><p data-wound-prior>${prior} prior wounds · roll ${Math.min(5,3+prior)}d6, keep the highest three.</p><div data-play-result class="hol-roll-result" role="status" aria-live="polite"></div>`,buttons:[{action:"roll",label:"Roll wound",callback:async(event,button,dialog)=>{
      let result,rolled;await app.act(async()=>{const {woundCatalog}=await import("../services/wounds.mjs"),catalog=await woundCatalog(),prior=app.draft.play?.wounds?.length??0;rolled=await faces(Math.min(5,3+prior));result=rolledWorkshopWound({catalog,damageType:dialog.element.querySelector('[name="damageType"]').value,priorWounds:prior,faces:rolled,id:`wound-${crypto.randomUUID()}`});app.draft.play=draftWound(app.draft,result);});
      if(result){dialog.element.querySelector("[data-play-result]").innerHTML=`<p>${rolled.join(" · ")} → <strong>${escape(result.wound.roll.key)}</strong></p><strong>${escape(result.wound.name)}</strong><p>${result.effects.map(effect=>escape(effectLabel(effect))).join("; ")||"Scar recorded; no mechanical penalty."}</p><p>${escape(result.wound.notes)}</p>`;const prior=app.draft.play.wounds.length;dialog.element.querySelector("[data-wound-prior]").textContent=`${prior} prior wounds · roll ${Math.min(5,3+prior)}d6, keep the highest three.`;}
    }}]});await dialog.render({force:true});
  }catch(error){ui.notifications.error(error.message);}
}
const skull='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 19H6v-4C0 10 5 2 12 2s12 8 6 13v4h-2v3H8zM12 18v4M9 18v4M15 18v4"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><path d="m12 13-1 3h2z"/></svg>';
function deathMarks(failed){return `<div class="death-marks" role="group" aria-label="Death marks">${[1,2,3].map(value=>`<button type="button" data-death-mark="${value}" class="death-mark ${value<=failed?"filled":""}" aria-label="Set ${value} death mark${value===1?"":"s"}" aria-pressed="${value<=failed}">${skull}</button>`).join("")}</div><p class="death-count">Failed death rolls: <strong>${failed} / 3</strong></p>`;}

export async function wizardDeath(){
  try{
    if(!this.actor.isOwner||this.committing)return;
    if(this.committedPlay){const {SharedRollDialog}=await import("../dialogs/attribute-roll.mjs");return new SharedRollDialog(this.actor,"fortitude",{mode:"death"}).render({force:true});}
    const app=this,attribute=this.draft.attributes.fortitude;
    const automatic=conditionRollSources(this.preview.play.conditions,{mode:"death",perceivedSources:[]}),net=Math.max(-3,Math.min(3,automatic.reduce((sum,source)=>sum+(source.kind==="boon"?source.amount:-source.amount),0)));
    const dialog=new foundry.applications.api.DialogV2({classes:["heroes-of-legend","hol-roll-dialog","hol-draft-play"],position:{width:470},window:{title:"Death roll"},form:{closeOnSubmit:false},content:`<section class="death-panel"><div data-death-marks>${deathMarks(this.draft.play?.failedDeathRolls??0)}</div><div class="death-outcomes"><span><b>Weak</b> +1 mark</span><span><b>Standard</b> No change</span><span><b>Strong</b> Stabilize</span></div><p class="inline-help">Fortitude · Natural 111: two marks · Natural 666: regain 1 HP · Three marks: Last Words</p></section>${rollSetup({attributes:{fortitude:attribute},selected:"fortitude",attributeId:"draft-death-attribute",value:attribute,netId:"draft-death-net",labelId:"draft-death-net-label"})}<div data-play-result class="hol-roll-result" role="status" aria-live="polite"></div>`,buttons:[{action:"roll",label:"Roll",callback:async(event,button,dialog)=>{
      let result,rolled,retained,outcome;await app.act(async()=>{const net=Number(dialog.element.querySelector('#draft-death-net').value),plan=rollPlan({attribute,boons:Math.max(0,net),banes:Math.max(0,-net)});rolled=await faces(plan.count);retained=[...rolled].sort((a,b)=>net<0?a-b:b-a).slice(0,3);result=classifyRoll(retained,attribute);const applied=draftDeath(app.draft,app.preview,retained);app.draft.play=applied.play;outcome=applied.outcome;});
      if(result){dialog.element.querySelector("[data-play-result]").innerHTML=`<strong>${title(result.tier)} · ${result.total}</strong><p>${rolled.join(" · ")} → keep ${retained.join(" + ")}</p><p>${escape(outcome)}</p>`;dialog.element.querySelector("[data-death-marks]").innerHTML=deathMarks(app.draft.play.failedDeathRolls??0);}
    }}]});await dialog.render({force:true});bindRollSetup(dialog.element,{getAttributeValue:()=>attribute});const netInput=dialog.element.querySelector('#draft-death-net');netInput.value=String(net);netInput.dispatchEvent(new Event("input",{bubbles:true}));dialog.element.addEventListener("click",event=>{const button=event.target.closest("[data-death-mark]");if(!button)return;void app.act(async()=>{const current=app.draft.play?.failedDeathRolls??0,requested=Number(button.dataset.deathMark),value=current===requested?requested-1:requested;app.draft.play={...app.draft.play,failedDeathRolls:value,lastWords:value===3 || (app.draft.play?.wounds??[]).some(wound=>wound.catalogId?.endsWith("-666"))};}).then(()=>{dialog.element.querySelector("[data-death-marks]").innerHTML=deathMarks(app.draft.play.failedDeathRolls);});});
  }catch(error){ui.notifications.error(error.message);}
}
