import { rollPlan } from "../rules/roll.mjs";
import { localRulePage, localizeRuleLinks } from "../services/journals.mjs";
import { bindNetChoices } from "../dialogs/net-control.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { nativeCraftingRecipes, requestCrafting } from "../services/crafting.mjs";
const ID = "heroes-of-legend";
export class CraftingPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor) {
    super();this.actor=actor;this.jobs=[];this.serial=0;this.startingRecipes=new Set();
    this.actorHook=Hooks.on("updateActor",changed=>{if(changed.uuid===actor.uuid&&this.rendered)void this.render();});
  }
  async _onClose(options){this.renderEvents?.abort();Hooks.off("updateActor",this.actorHook);return super._onClose(options);}
  static DEFAULT_OPTIONS={classes:[ID,"hol-crafting"],window:{title:"Crafting",resizable:true},position:{width:780,height:"auto"},actions:{selectRecipe:CraftingPanel.selectRecipe,start:CraftingPanel.start,resolve:CraftingPanel.resolve,attempt:CraftingPanel.attempt,refresh:CraftingPanel.refresh,editSupply:CraftingPanel.editSupply,resume:CraftingPanel.resume,recover:CraftingPanel.recover}};
  static PARTS={main:{template:`systems/${ID}/templates/crafting.hbs`,scrollable:[".hol-tool-content"]}};
  async _prepareContext(){
    if(!this.actor.testUserPermission(game.user,"OBSERVER"))throw Error("This character is not readable.");
    const catalogs=await loadCatalogs();
    const recipes=nativeCraftingRecipes(this.actor,catalogs);
    for(const recipe of recipes)if(recipe.project?.active)this.startingRecipes.delete(recipe.id);
    this.recipeId??=recipes[0]?.id;
    const selected=recipes.find(recipe=>recipe.id===this.recipeId)??recipes[0];
    const pending=this.actor.getFlag(ID,"pendingCrafting");
    for(const job of this.jobs){
      const receipt=job.requestId?this.actor.getFlag(ID,"operationReceipts")?.[job.requestId]:null;
      if(receipt?.applied&&!job.complete){job.complete=true;const result=receipt.result;this.notice=receipt.summary+(result?.dice?.length?` · ${result.dice.map(die=>die.face).join(" · ")} → keep ${(result.retained??[]).join(" + ")}`:"");}
    }
    let metadataHTML="";
    if(selected)try{const page=await localRulePage(selected.source.path);metadataHTML=await foundry.applications.ux.TextEditor.implementation.enrichHTML((page.text.content.match(/<li><strong>(?:Tools|Materials per attempt):<\/strong>[\s\S]*?<\/li>/g)??[]).join(""),{relativeTo:page});}catch(error){console.warn("heroes-of-legend | Recipe details",error.message);}
    const job=this.jobs.find(job=>job.id===this.jobId&&!job.complete);
    const selectedProject=selected?.project;
    const supplyItems=selected?this.actor.items.filter(item=>item.type==="equipment"&&item.system.catalogId===selected.product&&item.system.quantity>0):[];
    const supply=this.supplyId!==undefined?supplyItems.find(item=>item.id===this.supplyId):(supplyItems.find(item=>item.id===selectedProject?.supplyId)??supplyItems[0]);
    return {name:this.actor.name,productName:catalogs.inventory.equipment.find(item=>item.id===selected?.product)?.name??selected?.name,recipes:recipes.map(recipe=>({...recipe,selected:recipe.id===selected?.id})),selected,metadataHTML,job,
      jobs:this.jobs.map(job=>({...job,selected:job.id===this.jobId,canResolve:!job.complete&&!job.requestId})),
      abilities:(selected?.abilities??[]).map(ability=>({...ability,selected:ability.id===job?.abilityId})),available:Boolean(selected?.abilities.length),
      supplies:supplyItems.map(item=>({id:item.id,name:item.name,die:item.system.inventoryDie,selected:item.id===supply?.id})),currentDie:supply?.system.inventoryDie??0,currentSupplyId:supply?.id??"",
      progress:Math.min(selectedProject?.progress??0,selected?.target??0),completed:selectedProject?.completed??0,
      materials:this.actor.items.filter(item=>item.type==="equipment"&&item.system.catalogId==="item-material-bundle"&&item.system.carried!==false&&item.system.quantity>0&&item.system.inventoryDie>0).map(item=>({id:item.id,name:item.name,die:item.system.inventoryDie})),
      attributes:["brawn","fortitude","agility","guile","knowledge","reason"].map(key=>({key,name:game.i18n.localize(`HOL.Attributes.${key}`),selected:key===(selected?.abilities.find(ability=>ability.id===job?.abilityId)?.attribute??selected?.abilities[0]?.attribute??"knowledge")})),
      gm:game.user.isGM,owned:this.actor.isOwner,pending,canResume:pending?.status==="rolled"&&pending?.material?.phase!=="rolling",materialRecovery:pending?.material?.phase==="rolling",notice:this.notice};
  }
  async _onRender(context,options){await super._onRender(context,options);const root=this.element;if(!root)return;bindNetChoices(root);
    const refreshPool=()=>{const select=root.querySelector("[name=attribute]"),slider=root.querySelector("[name=adjustment]"),pool=root.querySelector("[data-craft-pool]");if(!pool||!select||!slider)return;const value=this.actor.system.attributes[select.value]?.effective??0,net=Number(slider.value),plan=rollPlan({attribute:value,boons:Math.max(0,net),banes:Math.max(0,-net)});root.querySelector("[data-craft-value]").textContent=`${value>=0?"+":""}${value}`;root.querySelector("[data-craft-net]").textContent=net?`${Math.abs(net)} ${net<0?"Bane":"Boon"}${Math.abs(net)===1?"":"s"}`:"Even";pool.querySelector("[data-count]").textContent=plan.count;pool.querySelector("[data-keep]").textContent=net?`Keep ${net>0?"highest":"lowest"} three`:"Keep all three";pool.querySelector("code").textContent=plan.formula;pool.querySelector("[data-dice]").innerHTML=Array.from({length:plan.count},(_,index)=>`<span class="${index>=3?"extra-die":""}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="7" cy="7" r="1.4"/><circle cx="17" cy="17" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg></span>`).join("");};
    this.renderEvents?.abort();this.renderEvents=new AbortController();root.addEventListener("input",refreshPool,{signal:this.renderEvents.signal});root.addEventListener("change",refreshPool,{signal:this.renderEvents.signal});refreshPool();await localizeRuleLinks(root);root.querySelector("[name=startingSupply]")?.addEventListener("change",async event=>{this.supplyId=event.target.value;await this.render();});}
  static async selectRecipe(event,target){this.recipeId=target.dataset.recipe;this.supplyId=undefined;this.jobId=null;this.notice="";await this.render();}
  static async refresh(){await this.render();}
  static async editSupply(event,target){const item=this.actor.items.get(target.dataset.itemId);if(item)await item.sheet.render({force:true});}
  static async start(){
    if(!this.actor.isOwner)return;
    try{const recipes=nativeCraftingRecipes(this.actor,await loadCatalogs());const recipe=recipes.find(recipe=>recipe.id===this.recipeId);if(!recipe?.abilities.length)throw Error("Learn the printed crafting ability first.");
      if(!recipe.project?.active&&!this.startingRecipes.has(recipe.id)){await requestCrafting(this.actor,{kind:"start",recipeId:recipe.id});this.startingRecipes.add(recipe.id);}
      this.jobs.push({id:String(++this.serial),recipeId:recipe.id,name:recipe.name,minutes:recipe.attemptMinutes,complete:false});this.notice="Attempt begun. Resolve it after its printed tools, materials and time.";await this.render();
    }catch(error){ui.notifications.error(error.message);}
  }
  static async resolve(event,target){this.jobId=target.dataset.jobId;this.recipeId=this.jobs.find(job=>job.id===this.jobId)?.recipeId;this.supplyId=undefined;await this.render();}
  static async attempt(event,target){
    const job=this.jobs.find(job=>job.id===this.jobId&&!job.complete&&!job.requestId);if(!job)return;
    target.disabled=true;
    try{const value=name=>this.element.querySelector(`[name=${name}]`)?.value;const message=await requestCrafting(this.actor,{kind:"attempt",recipeId:job.recipeId,abilityId:value("ability"),attribute:value("attribute"),adjustment:Number(value("adjustment")),supplyId:value("supply")??"",materialSupplyId:this.element.querySelector("[name=checkMaterials]")?.checked?value("materialSupply"):""});job.requestId=message.id;this.jobId=null;this.notice="Attempt requested; its recorded result will update this project and inventory.";await this.render();}catch(error){ui.notifications.error(error.message);}finally{if(target.isConnected)target.disabled=false;}
  }
  static async resume(){try{await requestCrafting(this.actor,{kind:"resume"});}catch(error){ui.notifications.error(error.message);}}
  static async recover(){try{if(this.actor.getFlag(ID,"pendingCrafting")?.material?.phase==="rolling")await requestCrafting(this.actor,{kind:"recoverMaterial",materialFace:Number(this.element.querySelector("[name=materialFace]").value)});else await requestCrafting(this.actor,{kind:"recover",faces:this.element.querySelector("[name=retainedCraftDice]").value.split(",").map(value=>Number(value.trim()))});}catch(error){ui.notifications.error(error.message);}}
}

/** Reuse the standalone recipe/time/material compose flow from the character sheet. */
export async function openCraftingAttempt(actor,recipeId,abilityId){
 if(!actor?.isOwner)throw Error("Only this character’s owner can begin a crafting attempt.");
 const recipes=nativeCraftingRecipes(actor,await loadCatalogs()),recipe=recipes.find(record=>record.id===recipeId);
 if(!recipe?.abilities.length||abilityId&&!recipe.abilities.some(ability=>ability.id===abilityId))throw Error("Learn the printed crafting ability first.");
 const app=new CraftingPanel(actor);app.recipeId=recipeId;await CraftingPanel.start.call(app);
 const job=app.jobs.at(-1);if(!job){Hooks.off("updateActor",app.actorHook);await app.close();throw Error("The crafting attempt could not begin.");}if(job){job.abilityId=abilityId??recipe.abilities[0].id;app.jobId=job.id;await app.render({force:true});}return app;
}
