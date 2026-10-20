import {currentHpInput} from "./resource-input.mjs";
import {workshopSpendGrit} from "./workshop-resources.mjs";
import {workshopDeathResult} from "./workshop-vitals.mjs";
/** Planning-only play changes; native Actor mutations are coordinated separately. */
export function draftHp(draft,maximum,value){
  const hp=currentHpInput(value,maximum);
  return {...structuredClone(draft.play??{}),hp,...(hp>0?{failedDeathRolls:0,lastWords:false}:{})};
}
export function draftGrit(draft,preview){
  const play=structuredClone(draft.play??{});
  return {...play,...workshopSpendGrit({spent:play.gritSpent??0,granted:preview.summary.gritGranted,maxHp:preview.summary.maximumHp,lastWords:Boolean(play.lastWords||(play.failedDeathRolls??0)>=3)})};
}
export function draftWound(draft,result){
  const play=structuredClone(draft.play??{}),wounds=(play.wounds??=[]),conditions=(play.conditions??=[]);
  if(wounds.length>=100)throw new Error("The character supports 100 recorded wounds.");
  if(conditions.length+result.effects.filter(effect=>effect.kind==="condition").length>100)throw new Error("The character supports 100 conditions. Remove resolved conditions first.");
  wounds.push(structuredClone(result.wound));
  result.effects.forEach((effect,index)=>{
    if(effect.kind==="condition")conditions.push({id:`${result.wound.id}-${index}`,key:effect.key,rating:effect.rating,persistence:effect.persistence,source:result.wound.name});
    if(effect.kind==="lastWords")Object.assign(play,{hp:0,failedDeathRolls:3,lastWords:true});
  });
  return play;
}
export function draftDeath(draft,preview,retained){
  const play=structuredClone(draft.play??{});
  if(play.lastWords||(play.failedDeathRolls??0)>=3)return {play,outcome:"Last Words remains; an ordinary death roll cannot reverse it."};
  const result=workshopDeathResult({failed:play.failedDeathRolls??0,hp:Math.min(preview.summary.maximumHp,play.hp??preview.summary.maximumHp),retained,fortitude:draft.attributes.fortitude});
  Object.assign(play,{hp:result.hp,failedDeathRolls:result.failed,...(result.failed===3?{lastWords:true}:{})});
  return {play,outcome:result.outcome};
}
