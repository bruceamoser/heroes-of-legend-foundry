const ID = "heroes-of-legend";
export function rangedWeaponOptions(actor, selectedId = null) {
  return actor.items.filter(item => item.type === "equipment" && item.system.catalogId === "item-ordinary-ranged-weapon" && item.system.quantity > 0)
    .sort((a,b) => Number(b.system.held)-Number(a.system.held) || a.name.localeCompare(b.name))
    .map((item,index) => ({id:item.id,name:item.name,selected:selectedId ? item.id === selectedId : index === 0}));
}
export function rangedAmmunition(actor, selectedId = null) {
  const options = rangedWeaponOptions(actor,selectedId);
  const weapon = actor.items.get(options.find(option=>option.selected)?.id);
  if (!weapon) throw new Error("Add a ranged weapon and assign its ammunition before rolling this attack.");
  const ammo = actor.items.get(weapon.getFlag(ID,"ammunitionItemId"));
  if (!ammo || ammo.type !== "equipment" || ammo.system.catalogId !== "item-ammunition-bundle" || ammo.system.quantity < 1 || !ammo.system.inventoryDie)
    throw new Error(`Assign ammunition to ${weapon.name} in Inventory before rolling this attack.`);
  return {weapon,ammo};
}
