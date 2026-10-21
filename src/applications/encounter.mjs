import { chooseCombatParticipant } from "../dialogs/turn-choice.mjs";
import { finishCombatParticipant } from "../dialogs/turn-end.mjs";
const ID="heroes-of-legend";
export class EncounterPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
 constructor(combat){super();this.combat=combat;this.hooks=[];for(const name of ["updateCombat","createCombatant","updateCombatant","deleteCombatant"]){this.hooks.push([name,Hooks.on(name,()=>{if(this.rendered)void this.render();})]);}this.hooks.push(["deleteCombat",Hooks.on("deleteCombat",document=>{if(document.id===combat.id)void this.close();})]);}
 static DEFAULT_OPTIONS={classes:[ID,"hol-encounter-panel"],window:{title:"Encounter",resizable:true},position:{width:372,height:"auto"},actions:{choose:EncounterPanel.choose,finish:EncounterPanel.finish,actor:EncounterPanel.actor}};
 static PARTS={main:{template:`systems/${ID}/templates/encounter.hbs`,scrollable:[".hol-tool-content"]}};
 async _onClose(options){for(const [name,id]of this.hooks)Hooks.off(name,id);return super._onClose(options);}
 async _prepareContext(){
  const state=this.combat.getFlag(ID,"encounter"),current=this.combat.combatants.get(state?.current);
  return {currentName:current?(current.hidden&&!game.user.isGM?"Turn in progress":`${current.name}’s turn`):"Choose a turn",canFinish:Boolean(current&&(game.user.isGM||current.actor?.isOwner)),participants:this.combat.combatants.filter(c=>!(c.hidden&&!game.user.isGM)).map(c=>({id:c.id,name:c.name,img:c.img??c.actor?.img,active:state?.current===c.id,canChoose:!state?.current&&(game.user.isGM||c.actor?.isOwner)}))};
 }
 async run(action){try{await action();}catch(error){ui.notifications.error(error.message);}}
 static async choose(event,target){await this.run(()=>chooseCombatParticipant(this.combat,target.dataset.id));}
 static async finish(){await this.run(()=>finishCombatParticipant(this.combat));}
 static async actor(event,target){const actor=this.combat.combatants.get(target.dataset.id)?.actor;if(actor?.testUserPermission(game.user,"LIMITED"))await actor.sheet.render({force:true});}
}
export async function openEncounterPanel(combat){const existing=[...foundry.applications.instances.values()].find(app=>app instanceof EncounterPanel&&app.combat.id===combat.id);return (existing??new EncounterPanel(combat)).render({force:true});}
