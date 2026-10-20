import { updateOwnedDocument } from "./documents.mjs";
const ID="heroes-of-legend";
/** Only nonmechanical scar metadata qualifies; printed wounds/effect sources never do. */
function manualRecord(actor,id,record){
 const imported=record.importSource?.kind==="web-character"&&record.id===record.importSource.id&&!record.importSource.roll;
 return Boolean((record.manualMetadata===true||imported)&&!record.catalogId&&!record.key&&!record.originalKey&&!record.damageType&&!record.recoveryValue&&!(record.effectIds?.length)&&!(record.effects?.length)&&![...(actor.effects??[])].some(effect=>effect.getFlag?.(ID,"woundEvent")===id||effect.flags?.[ID]?.woundEvent===id));
}
export function manualScarRecords(actor){return Object.entries(actor.getFlag(ID,"wounds")??{}).filter(([id,record])=>manualRecord(actor,id,record)).map(([id,record])=>({id,name:record.injury,notes:record.remedy??"",manual:true}));}
function text(value,label,maximum,{required=false}={}){if(typeof value!=="string")throw Error(`${label} must be text.`);const clean=value.trim();if((required&&!clean)||clean.length>maximum)throw Error(`${label} must contain ${required?"1":"0"}–${maximum} characters.`);return clean;}
/** Owner metadata edit only: never changes survival counts, effects or printed wound records. */
export async function requestManualScar(actor,request){
 if(!actor?.id||actor.type!=="character"||!actor.testUserPermission(game.user,"OWNER"))throw Error("Only this character’s owner can edit manual scar notes.");
 const records=actor.getFlag(ID,"wounds")??{};
 if(request?.kind==="add"){
  if(manualScarRecords(actor).length>=100)throw Error("The character supports 100 manual scar notes.");
  const name=text(request.name,"Scar name",200,{required:true}),notes=text(request.notes??"","Scar notes",2000),id=foundry.utils.randomID();
  if(!/^[A-Za-z0-9]{16}$/.test(id)||Object.hasOwn(records,id))throw Error("Could not allocate a new scar identity.");
  await updateOwnedDocument(actor,{[`flags.${ID}.wounds.${id}`]:{eventId:id,injury:name,remedy:notes,scar:true,manualMetadata:true,recoveryValue:null,capability:null,recoveryProgress:0,effectIds:[],effects:[],displacements:[]}});return {id,name,notes,manual:true};
 }
 if(request?.kind==="remove"){
  const id=request.id;if(typeof id!=="string"||!/^[A-Za-z0-9]{16}$/.test(id)||(!Object.hasOwn(records,id)||!manualRecord(actor,id,records[id])))throw Error("This manual scar note is no longer recorded.");
  await updateOwnedDocument(actor,{[`flags.${ID}.wounds.-=${id}`]:null});return {id,removed:true};
 }
 throw Error("Choose add or remove for manual scar notes.");
}
