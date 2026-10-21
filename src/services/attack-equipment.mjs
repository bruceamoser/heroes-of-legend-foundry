/** Pick equipment by stable catalog identity; player-visible names may be edited. */
export function attackEquipmentOptions(actor, configuration, selectedId = null) {
  const kind=configuration?.weaponKind;
  if(!kind)return [];
  const items=actor.items.filter(item=>item.type==='equipment'&&item.system.quantity>0&&
    (kind==='thrown' ? item.system.carried : item.system.catalogId===`item-ordinary-${kind}-weapon`));
  return items.sort((a,b)=>Number(b.system.held)-Number(a.system.held)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
    .map((item,index)=>({id:item.id,name:item.name,selected:selectedId?item.id===selectedId:index===0}));
}
export function attackEquipmentSnapshot(actor, configuration, selectedId = null) {
  const options=attackEquipmentOptions(actor,configuration,selectedId),chosen=options.find(option=>option.selected);
  if(selectedId&&!chosen)throw new Error('The selected attack item is no longer available. Choose its replacement.');
  const item=chosen&&actor.items.get(chosen.id);
  return item?{itemUuid:item.uuid,name:item.name}:null;
}
