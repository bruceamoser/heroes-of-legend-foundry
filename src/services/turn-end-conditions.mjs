import {actorContributions} from "./conditions.mjs";
import {conditionEndPlan,conditionSummary} from "../rules/conditions.mjs";
import {damageBasis,damagePreview} from "./damage.mjs";
import {writeAuthorityDocument} from "./authority.mjs";
const ID="heroes-of-legend";
/** One actor write settles a turn's HP, condition decay and durable receipt together.
 * Combat may be retried independently without repeating any actor consequence. */
export async function settleTurnConditions(actor,turnId,{author=game.user,write=writeAuthorityDocument}={}) {
 if(!actor || actor.pack || !actor.testUserPermission(author,"OWNER"))throw new Error("Only an owner or the DA can finish this actor's turn.");
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(turnId))throw new Error("Invalid turn identity.");
 const previous=actor.getFlag(ID,"turnEndConditions")?.[turnId];
 if(previous)return {...previous,replay:true};
 const contributions=actorContributions(actor),beforeSummary=conditionSummary(contributions),basis=damageBasis(actor);
 // Numbered instances add. Each duration-only condition also decays once as a
 // combined rating, while starred and maintained contributions retain their rating.
 const plan=conditionEndPlan(contributions,{turnId,durationPolicies:{blinded:"combined",deafened:"combined",asleep:"combined",paralyzed:"combined"}});
 let hp=basis.hp;
 const events=plan.events.map(event=>{
  const type=event.condition==="burning"?"fire":event.condition==="freezing"?"cold":"physical";
  const result=damagePreview(actor,{...basis,hp},{components:[{type,amount:event.rating}]},{bypassResistance:event.condition==="bleeding"});
  const output={condition:event.condition,rating:event.rating,type,before:hp,after:result.after,total:result.event.total,event:result.event,bypassResistance:event.condition==="bleeding"};hp=result.after;return output;
 });
 const remaining=new Map(plan.contributions.map(condition=>[condition.id,condition]));
 // Damage ends Asleep in the canonical rules, including a starred sleep source.
 if(events.some(event=>event.total>0))for(const [id,condition]of remaining)if(condition.key==="asleep")remaining.delete(id);
 const activeIds=new Set(contributions.map(condition=>condition.id));
 const effects=actor.toObject().effects.map(effect=>{
  if(!activeIds.has(effect._id))return effect;
  const condition=remaining.get(effect._id);
  if(!condition)return {...effect,disabled:true,statuses:[],showIcon:CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,flags:{...effect.flags,[ID]:{...effect.flags?.[ID],retired:{reason:"Turn-end condition ended",turnId}}}};
  return {...effect,name:`${condition.key[0].toUpperCase()+condition.key.slice(1)} ${condition.rating}${condition.persistence==="starred"?"*":""}`,flags:{...effect.flags,[ID]:{...effect.flags?.[ID],condition}}};
 });
 const afterSummary=conditionSummary([...remaining.values()]);
 const changes=Object.keys(beforeSummary).filter(key=>beforeSummary[key].rating!==afterSummary[key].rating).map(key=>({key,before:beforeSummary[key].rating,after:afterSummary[key].rating}));
 const receipt={turnId,actorUuid:actor.uuid,name:actor.name,before:basis.hp,after:hp,events,changes};
 await write(actor,{"system.health.value":hp,effects,[`flags.${ID}.conditionRevision`]:(actor.getFlag(ID,"conditionRevision")??0)+1,[`flags.${ID}.damageRevision`]:(actor.getFlag(ID,"damageRevision")??0)+1,[`flags.${ID}.turnEndConditions.${turnId}`]:receipt});
 return receipt;
}
export function turnEndContent(result) {
 const esc=value=>foundry.utils.escapeHTML(String(value)),name=key=>key[0].toUpperCase()+key.slice(1);
 const ticks=result.events.map(event=>`<span>${esc(name(event.condition))} ${event.rating}: <strong>${event.total} damage</strong>${event.bypassResistance?" · bypasses resistance":event.event.breakdown?.some(component=>component.resistance>0)?` · resistance applied ${event.event.breakdown.filter(component=>component.resistance>0).map(component=>`${esc(component.type)} ${component.resistance}`).join(", ")}`:""}</span>`).join("<br>");
 const decay=result.changes.map(change=>`${esc(name(change.key))} ${change.before} → ${change.after || "ended"}`).join(" · ");
 return `<section class="hol-chat-card"><p class="hol-chat-effect"><strong>${esc(result.name)}</strong> · Turn finished${result.before!==result.after?` · HP ${result.before} → ${result.after}`:""}</p>${ticks?`<p class="hol-chat-effect">${ticks}</p>`:""}${decay?`<p class="hol-chat-effect">${decay}</p>`:""}</section>`;
}
