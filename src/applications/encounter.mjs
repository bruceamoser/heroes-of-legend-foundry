import {reconcileTurnRoster} from "../rules/encounter.mjs";
import { chooseCombatParticipant } from "../dialogs/turn-choice.mjs";
import { finishCombatParticipant } from "../dialogs/turn-end.mjs";
const ID="heroes-of-legend";
export class EncounterPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
 constructor(combat){super();this.combat=combat;this.hooks=[];for(const name of ["updateCombat","createCombatant","updateCombatant","deleteCombatant"]){this.hooks.push([name,Hooks.on(name,()=>{if(this.rendered)void this.render();})]);}this.hooks.push(["deleteCombat",Hooks.on("deleteCombat",document=>{if(document.id===combat.id)void this.close();})]);}
 static DEFAULT_OPTIONS={classes:[ID,"hol-encounter-panel"],window:{title:"Encounter",resizable:true},position:{width:372,height:"auto"},actions:{choose:EncounterPanel.choose,finish:EncounterPanel.finish,actor:EncounterPanel.actor,end:EncounterPanel.end}};
 static PARTS={main:{template:`systems/${ID}/templates/encounter.hbs`,scrollable:[".hol-tool-content"]}};
 async _onClose(options){for(const [name,id]of this.hooks)Hooks.off(name,id);return super._onClose(options);}
 async _prepareContext(){
  const saved=this.combat.getFlag(ID,"encounter"),state=saved?reconcileTurnRoster(saved,this.combat.combatants.filter(()=>true).map(c=>({id:c.id,side:c.getFlag?.(ID,"side")??(c.actor?.hasPlayerOwner?"players":"opposition")}))):null,current=this.combat.combatants.get(state?.current);
  const participants=this.combat.combatants.filter(c=>!(c.hidden&&!game.user.isGM)).map(c=>({id:c.id,name:c.name,img:c.img??c.actor?.img,group:c.actor?.type==="character"?"players":"creatures",active:state?.current===c.id,acted:(state?.acted??[]).includes(c.id),canChoose:!current&&!(state?.acted??[]).includes(c.id)&&(game.user.isGM||c.actor?.isOwner)}));
  return {groups:encounterGroups(participants),canEnd:game.user.isGM,round:state?.round??1,currentName:current?(current.hidden&&!game.user.isGM?"Turn in progress":`${current.name}’s turn`):"Choose a turn",canFinish:Boolean(current&&(game.user.isGM||current.actor?.isOwner)),participants};
 }
 async run(action){try{await action();}catch(error){ui.notifications.error(error.message);}}
 static async choose(event,target){await this.run(()=>chooseCombatParticipant(this.combat,target.dataset.id));}
 static async finish(){await this.run(()=>finishCombatParticipant(this.combat));}
 static async end(){await this.run(()=>endEncounter(this.combat));}
 static async actor(event,target){const actor=this.combat.combatants.get(target.dataset.id)?.actor;if(actor?.testUserPermission(game.user,"LIMITED"))await actor.sheet.render({force:true});}
}
export async function openEncounterPanel(combat){const existing=[...foundry.applications.instances.values()].find(app=>app instanceof EncounterPanel&&app.combat.id===combat.id);return (existing??new EncounterPanel(combat)).render({force:true});}

export function encounterGroups(participants){return [{id:"players",label:"Players"},{id:"creatures",label:"Creatures"}].map(group=>({...group,participants:participants.filter(p=>p.group===group.id)})).filter(group=>group.participants.length);}
export async function endEncounter(combat){if(!game.user.isGM)throw new Error("Only the DA can end combat.");return combat.endCombat();}
