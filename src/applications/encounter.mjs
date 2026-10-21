import { actionUses, spendOwnedAction, resetOwnedActions } from "../services/action-uses.mjs";
import { availableParticipants } from "../rules/encounter.mjs";
import { requestCombat, combatSide } from "../services/combat.mjs";
import { chooseCombatParticipant } from "../dialogs/turn-choice.mjs";
import { finishCombatParticipant } from "../dialogs/turn-end.mjs";
import { localizeRuleLinks } from "../services/journals.mjs";
const ID="heroes-of-legend";
/** A readable version of the native tracker, backed by the same Combat document. */
export class EncounterPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
 constructor(combat){super();this.combat=combat;this.hooks=[];for(const name of ["updateCombat","createCombatant","updateCombatant","deleteCombatant","updateActor"]){this.hooks.push([name,Hooks.on(name,()=>{if(this.rendered)void this.render();})]);}this.hooks.push(["deleteCombat",Hooks.on("deleteCombat",document=>{if(document.id===combat.id)void this.close();})]);}
 static DEFAULT_OPTIONS={classes:[ID,"hol-encounter-panel"],window:{title:"Encounter",resizable:true},position:{width:372,height:"auto"},actions:{choose:EncounterPanel.choose,spend:EncounterPanel.spend,reset:EncounterPanel.reset,finish:EncounterPanel.finish,start:EncounterPanel.start,actor:EncounterPanel.actor,hide:EncounterPanel.hide,opening:EncounterPanel.opening}};
 static PARTS={main:{template:`systems/${ID}/templates/encounter.hbs`,scrollable:[".hol-tool-content"]}};
 async _onClose(options){for(const [name,id]of this.hooks)Hooks.off(name,id);return super._onClose(options);}
 async _prepareContext(){
  const state=this.combat.getFlag(ID,"encounter"),current=this.combat.combatants.get(state?.current),eligible=new Set(state?availableParticipants(state).map(p=>p.id):[]),owned=Boolean(game.user.isGM||current?.actor?.isOwner);
  const sides=["players","opposition"].map(side=>{const participants=this.combat.combatants.filter(c=>!(c.hidden&&!game.user.isGM)&&(state?.roster.find(p=>p.id===c.id)?.side??combatSide(c))===side).map(c=>{const member=state?.roster.find(p=>p.id===c.id),active=state?.current===c.id,acted=state?.acted.includes(c.id),status=!state?"Ready":!member?"Not admitted":member.withdrawn?"Withdrawn":active?"◆ Active":acted?"✓ Acted":member.eligibleRound>state.round?"Next round":"Ready";return {id:c.id,name:c.name,img:c.img??c.actor?.img,active,acted,status,hidden:c.hidden,hp:game.user.isGM||c.actor?.testUserPermission(game.user,"OBSERVER")?c.actor?.system.health?.value:null,canChoose:!state?.current&&eligible.has(c.id)&&(game.user.isGM||c.actor?.isOwner),canHide:game.user.isGM&&side==="opposition",side};});return {name:side==="players"?"Players":"Opposition",participants,ready:participants.filter(p=>p.status==="Ready").length};});
  const budget=owned&&current?.actor?actionUses(current.actor):null;
  return {state,gm:game.user.isGM,canStart:game.user.isGM||this.combat.combatants.filter(participant=>participant.actor?.isOwner).length > 0,sides,heading:state?`Round ${state.round}`:"Encounter",subtitle:current?(current.hidden&&!game.user.isGM?"Hidden participant · turn in progress":`${current.name} · turn in progress`):state?`${state.nextSide==="players"?"Players":state.nextSide==="opposition"?"Opposition":"No active participants"} choose next`:this.combat.name,startingSide:state?.startingSide==="players"?"Players":"Opposition",budget,budgets:budget?Object.entries(budget).map(([category,value])=>({category,label:category[0].toUpperCase()+category.slice(1),value})):[]};
 }
 async _onRender(context,options){await super._onRender(context,options);const root=this.element;if(!root)return;await localizeRuleLinks(root);for(const select of root.querySelectorAll("[data-side-id]"))select.addEventListener("change",()=>this.run(()=>this.combat.combatants.get(select.dataset.sideId).setFlag(ID,"side",select.value)));}
 async run(action){try{await action();}catch(error){ui.notifications.error(error.message);}}
 static async choose(event,target){await this.run(()=>chooseCombatParticipant(this.combat,target.dataset.id));}
 static async spend(event,target){const actor=this.combat.combatants.get(this.combat.getFlag(ID,"encounter").current)?.actor;await this.run(()=>spendOwnedAction(actor,target.dataset.category));}
 static async reset(){const actor=this.combat.combatants.get(this.combat.getFlag(ID,"encounter").current)?.actor;await this.run(()=>resetOwnedActions(actor));}
 static async finish(){await this.run(()=>finishCombatParticipant(this.combat));}
 static async start(){await this.run(()=>this.combat.startCombat());}
 static async actor(event,target){const actor=this.combat.combatants.get(target.dataset.id)?.actor;if(actor?.testUserPermission(game.user,"LIMITED"))await actor.sheet.render({force:true});}
 static async hide(event,target){if(game.user.isGM){const combatant=this.combat.combatants.get(target.dataset.id);await this.run(()=>combatant.update({hidden:!combatant.hidden}));}}
 static async opening(){const state=this.combat.getFlag(ID,"encounter");if(state)ui.notifications.info(`Opening ${state.opening.total}: ${state.opening.faces?.join(" + ")??"recorded opening roll"}. ${state.startingSide==="players"?"Players":"Opposition"} start each round.`);}
}
export async function openEncounterPanel(combat){const existing=[...foundry.applications.instances.values()].find(app=>app instanceof EncounterPanel&&app.combat.id===combat.id);return (existing??new EncounterPanel(combat)).render({force:true});}
