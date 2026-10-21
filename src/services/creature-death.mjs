const ID="heroes-of-legend",queues=new Map();
/** Reflect zero HP through Foundry's native defeated status; never alter HP. */
export function syncCreatureDeath(actor) {
  if(actor.type!=="creature" || actor.pack || !actor.testUserPermission(game.user,"OWNER"))return Promise.resolve();
  const task=(queues.get(actor.uuid)??Promise.resolve()).catch(()=>{}).then(async()=>{
    const managed=actor.effects.filter(effect=>effect.getFlag(ID,"hpDeath"));
    if(actor.system.health.value>0){if(managed.length)await actor.deleteEmbeddedDocuments("ActiveEffect",managed.map(effect=>effect.id));return;}
    const status=CONFIG.specialStatusEffects.DEFEATED;
    if(!actor.statuses.has(status))await actor.createEmbeddedDocuments("ActiveEffect",[{name:"Dead",img:"icons/svg/skull.svg",statuses:[status],showIcon:CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,flags:{[ID]:{hpDeath:true}}}]);
  });
  queues.set(actor.uuid,task);task.finally(()=>{if(queues.get(actor.uuid)===task)queues.delete(actor.uuid);}).catch(()=>{});return task;
}
