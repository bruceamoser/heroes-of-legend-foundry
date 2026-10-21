import {reconcileTurnRoster} from "../rules/encounter.mjs";
import {openEncounterPanel,encounterGroups,endEncounter} from "./encounter.mjs";
import {finishCombatParticipant} from "../dialogs/turn-end.mjs";
import {chooseCombatParticipant} from "../dialogs/turn-choice.mjs";
const ID="heroes-of-legend";
/** Group the native rows without replacing their controls or changing turn rules. */
export function renderHOLCombatTracker(app,element){
 const combat=app.viewed;element.querySelector(".hol-encounter")?.remove();element.querySelector(".hol-encounter-end")?.remove();if(!combat)return;
 const section=document.createElement("section");section.className="hol-encounter";
 const button=(parent,label,action)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",async()=>{b.disabled=true;try{await action();}catch(error){ui.notifications.error(error.message);}finally{if(b.isConnected)b.disabled=false;}});parent.append(b);};
 button(section,"Open encounter",()=>openEncounterPanel(combat));
 const saved=combat.getFlag(ID,"encounter"),state=saved?reconcileTurnRoster(saved,combat.combatants.map(c=>({id:c.id,side:c.getFlag(ID,"side")??(c.actor?.hasPlayerOwner?"players":"opposition")}))):null,current=combat.combatants.get(state?.current);
 const round=document.createElement("small");round.textContent=`Round ${state?.round??1}`;section.append(round);
 const participants=combat.combatants.filter(c=>!(c.hidden&&!game.user.isGM)).map(c=>({id:c.id,group:c.actor?.type==="character"?"players":"creatures",combatant:c}));
 const groups=encounterGroups(participants);
 if(current){const label=document.createElement("strong");label.textContent=current.hidden&&!game.user.isGM?"Turn in progress":`${current.name}’s turn`;section.append(label);if(game.user.isGM||current.actor?.isOwner)button(section,"Finish turn",()=>finishCombatParticipant(combat));}
 else for(const group of groups){
  const choices=group.participants.filter(({combatant:c})=>!(state?.acted??[]).includes(c.id)&&(game.user.isGM||c.actor?.isOwner));if(!choices.length)continue;
  const box=document.createElement("div");box.className="hol-combat-choices";const label=document.createElement("strong");label.textContent=group.label;box.append(label);section.append(box);
  for(const {combatant:c}of choices)button(box,`Choose ${c.name}`,()=>chooseCombatParticipant(combat,c.id));
 }
 const rows=new Map([...element.querySelectorAll(".combatant[data-combatant-id]")].map(row=>[row.dataset.combatantId,row]));
 for(const row of rows.values()){row.querySelector(".hol-turn-status")?.remove();row.classList.remove("hol-side-start");delete row.dataset.holSide;if(row.dataset.combatantId===state?.current||(state?.acted??[]).includes(row.dataset.combatantId)){const status=document.createElement("span");status.className="hol-turn-status";status.textContent=row.dataset.combatantId===state?.current?"Active":"✓ Acted";(row.querySelector(".combatant-name")??row).append(status);}}
 for(const group of groups){let first=true;for(const participant of group.participants){const row=rows.get(participant.id);if(!row)continue;row.parentElement.append(row);if(first){row.classList.add("hol-side-start");row.dataset.holSide=group.label;first=false;}}}
 element.prepend(section);
 if(game.user.isGM){const footer=document.createElement("div");footer.className="hol-encounter-end";button(footer,"End combat",()=>endEncounter(combat));element.append(footer);}
}
