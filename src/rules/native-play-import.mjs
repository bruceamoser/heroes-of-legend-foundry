import { validateContributions } from './conditions.mjs';
import { workshopWoundEffects, workshopWoundDetails } from './workshop-resources.mjs';

const ID = 'heroes-of-legend';
const icons = { burning:'fire', freezing:'frozen', bleeding:'blood', poisoned:'poison', frightened:'terror', slowed:'downgrade', dazed:'daze', grappled:'net', blinded:'blind', deafened:'deaf', asleep:'sleep', paralyzed:'paralysis', unconscious:'unconscious', petrified:'statue', prone:'falling', hidden:'mystery-man', invisible:'invisible' };
/** Convert saved play state without rerolling wounds or reinstating removed conditions. */
export function nativePlayEffects(draft, catalogs, { randomID, woundsCatalog = catalogs.wounds } = {}) {
  if (typeof randomID !== 'function') throw new Error('Native import needs a document identity allocator.');
  const play = draft.play ?? {}, conditions = structuredClone(play.conditions ?? []);
  validateContributions(conditions);
  const effects = [], wounds = {}, sourceIds = new Map(), woundIds = new Map();
  const fresh = () => { const id = randomID(); if (typeof id !== 'string' || !/^[A-Za-z0-9]{16}$/.test(id) || sourceIds.has(id)) throw new Error('Invalid or duplicate native import identity.'); sourceIds.set(id,true); return id; };
  for (const wound of play.wounds ?? []) {
    if (wound.catalogId && !woundsCatalog) throw new Error('The wound reference catalog is required to import this character.');
    const detail = workshopWoundDetails(wound, woundsCatalog), eventId = fresh();
    woundIds.set(wound.id,eventId);
    wounds[eventId] = { ...(detail.record ?? {id:wound.id, injury:wound.name, remedy:wound.notes, recoveryValue:null, capability:null}),
      eventId, originalKey:wound.roll?.key ?? null, damageType:wound.damageType ?? null, skipped:[], scar:true,
      recoveryProgress:wound.progress ?? 0, effectIds:[], displacements:[],
      importSource:{kind:'web-character',id:wound.id,name:wound.name,notes:wound.notes,roll:structuredClone(wound.roll ?? null)} };
  }
  // A condition's current saved rating/persistence is authoritative, including
  // wound conditions that have already been reduced or removed during play.
  for (const contribution of conditions) {
    const id = fresh(), parent = (play.wounds ?? []).find(w => contribution.id.startsWith(`${w.id}-`)), eventId = parent && woundIds.get(parent.id);
    const condition = {...contribution,id,order:contribution.order ?? 0};
    effects.push({_id:id,name:`${condition.key[0].toUpperCase()+condition.key.slice(1)} ${condition.rating}${condition.persistence==='starred'?'*':''}`,
      img:`icons/svg/${icons[condition.key] ?? 'aura'}.svg`,statuses:[`hol.${condition.key}`],
      flags:{[ID]:{condition,...(eventId?{woundEvent:eventId}:{}),importSource:{kind:'web-character',id:contribution.id}}}});
    if(eventId) wounds[eventId].effectIds.push(id);
  }
  for (const wound of play.wounds ?? []) {
    const eventId=woundIds.get(wound.id);
    for (const consequence of workshopWoundEffects([wound],woundsCatalog)) {
      // Conditions are already saved separately; immediate movement/Last Words
      // happened before export and must never be executed a second time.
      if(['condition','forcedMovement','lastWords'].includes(consequence.kind)) continue;
      const id=fresh(), {id:sourceId, ...modifier}=consequence;
      effects.push({_id:id,name:`${wound.name} · ${consequence.kind}`,img:'icons/svg/blood.svg',
        flags:{[ID]:{woundEvent:eventId,woundModifier:{...modifier,woundId:wound.catalogId,source:structuredClone(wounds[eventId].source),sourceCommit:woundsCatalog.sourceCommit},importSource:{kind:'web-character',id:sourceId}}}});
      wounds[eventId].effectIds.push(id);
    }
  }
  return {effects,wounds};
}
