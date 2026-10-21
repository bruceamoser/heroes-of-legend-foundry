import {openEncounterPanel} from "./encounter.mjs";
import {finishCombatParticipant} from "../dialogs/turn-end.mjs";
import {chooseCombatParticipant} from "../dialogs/turn-choice.mjs";
const ID="heroes-of-legend";
/** The table chooses a turn; the current participant releases it with Finish. */
export function renderHOLCombatTracker(app,element){
 const combat=app.viewed;element.querySelector(".hol-encounter")?.remove();if(!combat)return;
 const section=document.createElement("section");section.className="hol-encounter";
 const button=(label,action)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",async()=>{b.disabled=true;try{await action();}catch(error){ui.notifications.error(error.message);}finally{if(b.isConnected)b.disabled=false;}});section.append(b);};
 button("Open encounter",()=>openEncounterPanel(combat));
 const state=combat.getFlag(ID,"encounter"),current=combat.combatants.get(state?.current);
 if(current){const label=document.createElement("strong");label.textContent=current.hidden&&!game.user.isGM?"Turn in progress":`${current.name}’s turn`;section.append(label);if(game.user.isGM||current.actor?.isOwner)button("Finish turn",()=>finishCombatParticipant(combat));}
 else for(const c of combat.combatants){if(c.hidden&&!game.user.isGM)continue;if(game.user.isGM||c.actor?.isOwner)button(`Choose ${c.name}`,()=>chooseCombatParticipant(combat,c.id));}
 for(const row of element.querySelectorAll(".combatant[data-combatant-id]")){row.querySelector(".hol-turn-status")?.remove();row.classList.remove("hol-side-start");delete row.dataset.holSide;if(row.dataset.combatantId===state?.current){const status=document.createElement("span");status.className="hol-turn-status";status.textContent="Active";(row.querySelector(".combatant-name")??row).append(status);}}
 element.prepend(section);
}
