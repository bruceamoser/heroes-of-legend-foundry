import {getCampaignLanguageConfiguration} from "../services/languages.mjs";
import {requestDevelopment, waitForDevelopmentOperation} from "../services/advancement.mjs";
const ID="heroes-of-legend";
export class CharacterLanguagePicker extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor){super();this.actor=actor;}
  static DEFAULT_OPTIONS={classes:["heroes-of-legend","hol-language-picker"],window:{title:"Add language",resizable:true},position:{width:430,height:520},actions:{choose:CharacterLanguagePicker.choose}};
  static PARTS={main:{template:"systems/heroes-of-legend/templates/language-picker.hbs",scrollable:[".hol-picker-list"]}};
  async _prepareContext(){
    if(!this.actor.testUserPermission(game.user,"OWNER"))throw new Error("Choose a character you own.");
    const known=this.actor.getFlag(ID,"development")?.languages??[];
    return {languages:getCampaignLanguageConfiguration().definitions.filter(language=>!known.some(entry=>entry.id===language.id)).sort((a,b)=>a.name.localeCompare(b.name))};
  }
  async _onRender(context,options){await super._onRender(context,options);this.element.querySelector('[data-language-search]')?.addEventListener('input',event=>{const query=event.target.value.toLowerCase();for(const row of this.element.querySelectorAll('[data-language-id]'))row.hidden=!row.textContent.toLowerCase().includes(query);});}
  static async choose(event,target){
    if(this.busy)return;this.busy=true;target.disabled=true;
    try{
      const definition=getCampaignLanguageConfiguration().definitions.find(language=>language.id===target.dataset.languageId);
      if(!definition)throw new Error("That language is unavailable.");
      const message=await requestDevelopment(this.actor,"editLanguage",{revision:this.actor.getFlag(ID,"development")?.revision??0,language:{id:definition.id,name:definition.name,form:definition.form,written:definition.writing}});
      await waitForDevelopmentOperation(this.actor,message.id);await this.close();
    }catch(error){ui.notifications.error(error.message);target.disabled=false;}finally{this.busy=false;}
  }
}
