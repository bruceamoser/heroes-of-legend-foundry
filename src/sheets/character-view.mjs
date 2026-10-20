/** Read-only projection of native documents for the compact character surface. */
export function characterSheetView({ development = {}, equipment = [], abilities = [], choices = [], inventory = {}, sheetState = {}, survival = {}, wounds = [] }) {
  const records = new Map(choices.map((r) => [r.id, r]));
  const creation = development.creation ?? {};
  const name = (id) => records.get(id)?.name ?? id ?? "";
  const favorites = new Set(Array.isArray(sheetState.favorites) ? sheetState.favorites : []);
  const hasEquipment = id => equipment.some(item => item.system.catalogId === id && item.system.quantity > 0);
  const abilityRows = abilities.map((item) => {
    const catalogId = item.getFlag?.("heroes-of-legend", "catalogId") ?? item.catalogId;
    const record = records.get(catalogId);
    const available = ["ability-basic-melee", "ability-opportunity-attack"].includes(catalogId) ? hasEquipment("item-ordinary-melee-weapon") : catalogId === "ability-basic-ranged" ? hasEquipment("item-ordinary-ranged-weapon") : catalogId === "ability-shield-block" ? hasEquipment("item-ordinary-shield") : true;
    return {
    id: item.id, name: item.name, system: item.system, catalogId: item.getFlag?.("heroes-of-legend", "catalogId") ?? item.catalogId,
    favorite: favorites.has(item.id),
    basic: Boolean(record?.universal),
    shown: sheetState.basicActions?.[catalogId] ?? available,
    requirements: (record?.requirements ?? []).filter(requirement => requirement.kind === "discipline").map(requirement => ({ name: name(requirement.id), rank: requirement.rank, ranked: requirement.rank > 1, mark: `systems/heroes-of-legend/assets/marks/${requirement.id.replace(/^discipline-/, "")}.webp` })),
    timing: { main: "A", maneuver: "M", reaction: "R", passive: "P" }[item.system.activity?.action] ?? "—",
  }; });
  const equipmentRows = equipment.map((item) => {
    const definition = inventory.equipment?.find((r) => r.id === item.system.catalogId);
    return { id: item.id, name: item.name, system: item.system, favorite: favorites.has(item.id),
      hasSupply: Boolean(definition?.inventoryDie || item.system.inventoryDie),
      supplyLabel: item.system.inventoryDie ? `d${item.system.inventoryDie}` : "Empty",
      bulk: item.system.quantity * item.system.bulk,
      arrangement: [item.system.held && "Held", item.system.worn && "Worn"].filter(Boolean).join(" · ") || "Carried" };
  });
  const tab = ["main", "character", "abilities", "inventory", "development", "crafting"].includes(sheetState.tab) ? sheetState.tab : "main";
  const recipes = (development.recipes ?? []).map((id) => inventory.recipes?.find((r) => r.id === id)).filter(Boolean);
  const tabs = [["main", "Main", "fa-dice-d6"], ["character", "Character", "fa-user"], ["abilities", "Abilities", "fa-wand-magic-sparkles"], ["inventory", "Inventory", "fa-suitcase"], ["development", "Development", "fa-seedling"], ...(recipes.length ? [["crafting", "Crafting", "fa-hammer"]] : [])].map(([id, label, icon]) => ({id, label, icon, active: id === tab}));
  if (!tabs.some((t) => t.active)) tabs[0].active = true;
  const active = tabs.find((t) => t.active).id;
  return {
    tabs, activeTab: active, mainTab: active === "main", characterTab: active === "character", abilitiesTab: active === "abilities", inventoryTab: active === "inventory", developmentTab: active === "development", craftingTab: active === "crafting",
    editMode: Boolean(sheetState.edit),
    identity: [name(creation.ancestryId), name(creation.culture?.id), name(creation.background?.id), name(development.classId ?? creation.classId)].filter(Boolean).join(" · "),
    level: development.level ?? 0, dp: development.dp ?? 0,
    abilityRows, equipmentRows, recipes,
    favorites: [...abilityRows.map((r) => ({...r, ability: true})), ...equipmentRows].filter((r) => r.favorite),
    actionGroups: [["main", "Main Actions"], ["maneuver", "Maneuvers"], ["reaction", "Reactions"], ["passive", "Passive"]].map(([key, label]) => ({ key, label, entries: abilityRows.filter((r) => r.system.activity?.action === key && (sheetState.edit || !r.basic || r.shown)) })),
    ranks: Object.entries(development.ranks ?? {}).map(([id, rank]) => ({name: name(id), rank})),
    signatures: abilityRows.filter((r) => records.get(r.catalogId)?.classId).map((r) => ({name:r.name})),
    ledger: (development.ledger ?? []).map((entry) => ({...entry, label: entry.kind?.replaceAll("-", " ") ?? "Entry", sourceName: name(entry.sourceId), delta: entry.delta ?? 0, balance: entry.balance ?? 0})),
    purchases: (development.purchases ?? []).map((entry) => ({...entry, name:name(entry.id)})),
    bulk: equipmentRows.reduce((sum, item) => sum + item.bulk, 0),
    wounds,
    marks: [1, 2, 3].map((value) => ({value, filled: (survival.marks ?? 0) >= value})),
    survivalStatus: survival.status ?? "active",
    storyOpen: sheetState.closed?.story !== true,
  };
}
