import {equipmentCopyOptions,copyEquipmentToActor} from "../services/item-import.mjs";
import {loadCatalogs} from "../services/catalog.mjs";
import {equipmentEligibility} from "../rules/equipment-eligibility.mjs";
import {updateOwnedDocument} from "../services/documents.mjs";
const ID="heroes-of-legend";
export class EquipmentMarket extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
  constructor(actor){super();this.actor=actor;}
  static DEFAULT_OPTIONS={classes:["heroes-of-legend","hol-equipment-market"],window:{title:"Add equipment",resizable:true},position:{width:780,height:650},actions:{buy:EquipmentMarket.buy,reference:EquipmentMarket.reference}};
  static PARTS={main:{template:"systems/heroes-of-legend/templates/equipment-market.hbs",scrollable:[".hol-market-list"]}};
  async _prepareContext(){
    if(!this.actor.testUserPermission(game.user,"OWNER"))throw new Error("Choose a character you own.");
    const catalogs=await loadCatalogs(),sources=await equipmentCopyOptions();
    const documents=await Promise.all(sources.map(async source=>({source,document:await fromUuid(source.uuid)})));
    this.sources=new Map(documents.filter(({document})=>document?.type==='equipment').map(({source,document})=>[source.uuid,document]));
    const abilities=this.actor.items.filter(item=>item.type==='ability').map(item=>item.getFlag(ID,'catalogId'));
    const coins=this.actor.getFlag(ID,'development')?.coins??0;
    return {coins,rows:[...this.sources].map(([uuid,item])=>{
      const definition=catalogs.inventory.equipment.find(record=>record.id===item.system.catalogId),eligibility=equipmentEligibility(item.system.catalogId,abilities),purchasable=Boolean(definition),special=Boolean(definition?.specialOrder);
      const price=definition?.price??null;
      const reason=!eligibility.eligible?`Requires ${catalogs.choices.find(record=>record.id===eligibility.requiredAbilityId)?.name??eligibility.requiredAbilityId}`:special?'Special order':purchasable&&price>coins?'Not enough coins':'';
      return {uuid,name:item.name,price,priced:purchasable,bulk:definition?.bulk??item.system.bulk,supply:definition?.inventoryDie?`d${definition.inventoryDie}`:'—',hands:definition?.handChoices??[],available:!reason,reason};
    }).sort((a,b)=>a.name.localeCompare(b.name))};
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    this.element.querySelector('[data-market-search]')?.addEventListener('input',event=>{const query=event.target.value.toLowerCase();for(const row of this.element.querySelectorAll('[data-market-row]'))row.hidden=!row.dataset.name.toLowerCase().includes(query);});
    for(const input of this.element.querySelectorAll('[data-market-quantity]'))input.addEventListener('input',()=>{
      const row=input.closest('[data-market-row]'),quantity=Number(input.value),coins=Number(this.element.querySelector('[data-coins]').dataset.coins);
      const unavailable=Boolean(row.dataset.baseReason)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||Number(row.dataset.price)*quantity>coins;
      row.classList.toggle('unavailable',unavailable);row.querySelector('[data-action=buy]').disabled=unavailable;
    });
  }
  static async reference(event,target){const item=this.sources.get(target.closest('[data-market-row]').dataset.uuid);if(item?.testUserPermission(game.user,'OBSERVER'))await item.sheet.render({force:true});}
  static async buy(event,target){
    if(this.busy)return;this.busy=true;target.disabled=true;let created;
    try{
      if(!this.actor.testUserPermission(game.user,'OWNER'))throw new Error('Choose a character you own.');
      const row=target.closest('[data-market-row]'),uuid=row.dataset.uuid,source=await fromUuid(uuid),catalogs=await loadCatalogs();
      const definition=catalogs.inventory.equipment.find(record=>record.id===source?.system.catalogId),quantity=Number(row.querySelector('[data-market-quantity]').value);
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw new Error('Choose a quantity from 1 to 10,000.');
      const abilities=this.actor.items.filter(item=>item.type==='ability').map(item=>item.getFlag(ID,'catalogId'));
      if(!equipmentEligibility(source?.system.catalogId,abilities).eligible)throw new Error('This character lacks the required equipment training.');
      if(definition?.specialOrder)throw new Error('This item requires a special order.');
      const coins=this.actor.getFlag(ID,'development')?.coins??0,total=(definition?.price??0)*quantity;
      if(total>coins)throw new Error('Not enough coins.');
      created=await copyEquipmentToActor(this.actor,uuid,{quantity});
      const hands=Number(row.querySelector('[data-market-hands]')?.value??0);
      if(hands)await updateOwnedDocument(created,{'system.hands':hands});
      if(total){
        if((this.actor.getFlag(ID,'development')?.coins??0)!==coins)throw new Error('The coin balance changed. Review it and buy again.');
        await updateOwnedDocument(this.actor,{[`flags.${ID}.development.coins`]:coins-total});
      }
      created=null;await this.render();
    }catch(error){
      if(created)try{await this.actor.deleteEmbeddedDocuments('Item',[created.id]);}catch(cleanup){ui.notifications.error(`The item was added but payment did not complete. Correct inventory and coins: ${cleanup.message}`);}
      ui.notifications.error(error.message);
    }finally{this.busy=false;if(target.isConnected)target.disabled=false;}
  }
}
