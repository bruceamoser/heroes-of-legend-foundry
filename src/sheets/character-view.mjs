import {signatureTierState} from "../rules/signatures.mjs";
import {equipmentSurface, attackFirst} from "./equipment-surface.mjs";
import { workshopFavorites } from "../rules/workshop-resources.mjs";
import { actionTiming } from "../rules/workshop-character.mjs";
import { workshopNavIcon } from "./workshop-icons.mjs";
/** Read-only projection of native documents for the compact character surface. */
export function characterSheetView({ development = {}, equipment = [], abilities = [], choices = [], inventory = {}, sheetState = {}, survival = {}, wounds = [], craftingState = {} }) {
  const records = new Map(choices.map((r) => [r.id, r]));
  const creation = development.creation ?? {};
  const name = (id) => records.get(id)?.name ?? id ?? "";
  const favorites = new Set(Array.isArray(sheetState.favorites) ? sheetState.favorites : []);
  const hasEquipment = id => equipment.some(item => item.system.catalogId === id && item.system.quantity > 0 && item.system.carried !== false);
  const abilityRows = abilities.map((item) => {
    const catalogId = item.getFlag?.("heroes-of-legend", "catalogId") ?? item.catalogId;
    const record = records.get(catalogId);
    const available = ["ability-basic-melee", "ability-opportunity-attack"].includes(catalogId) ? hasEquipment("item-ordinary-melee-weapon") : catalogId === "ability-basic-ranged" ? hasEquipment("item-ordinary-ranged-weapon") : catalogId === "ability-shield-block" ? hasEquipment("item-ordinary-shield") : true;
    const body = record?.reference?.rules.body ?? [];
    const outcomes = body.find(block => block.outcomes)?.outcomes;
    const brief = outcomes ? outcomes.map(outcome => `${outcome.label}: ${outcome.text}`).join(" · ") : body.find(block => block.text)?.text ?? record?.reference?.flavor?.[0] ?? "";
    const timings = record?.reference ? actionTiming(record) : [{main:"Main Action",maneuver:"Maneuver",reaction:"Reaction",passive:"Passive"}[item.system.activity?.action] ?? "Other"];
    const printedAttribute = record?.reference?.rules.details.find(detail => detail.label === "Attribute")?.value ?? "—";
    return {
    attack: Boolean(record?.reference?.rules?.details?.some(detail => detail.label === "Type" && detail.value.split(/\s*\/\s*/).includes("Attack")) || record?.reference?.rules?.notes?.some(note=>note.label === "Tags" && note.text.split(/\s*\/\s*/).includes("Attack"))),
    brief, attribute: (() => { const text=catalogId === "ability-opportunity-attack" ? records.get("ability-basic-melee")?.reference?.rules.details.find(detail=>detail.label === "Attribute")?.value ?? "" : printedAttribute; const key=["brawn","fortitude","agility","guile","knowledge","reason"].find(key=>text.toLowerCase().startsWith(key)); return key ? key[0].toUpperCase()+key.slice(1) : "—"; })(), timings,
    disciplineIds: (record?.requirements ?? []).filter(requirement => requirement.kind === "discipline").map(requirement => requirement.id).join(" "),
    id: item.id, name: item.name, system: item.system, catalogId: item.getFlag?.("heroes-of-legend", "catalogId") ?? item.catalogId,
    favorite: favorites.has(item.id),
    basic: Boolean(record?.universal),
    shown: sheetState.basicActions?.[catalogId] ?? available,
    requirements: (record?.requirements ?? []).filter(requirement => requirement.kind === "discipline").map(requirement => ({ name: name(requirement.id), rank: requirement.rank, ranked: requirement.rank > 1, mark: `systems/heroes-of-legend/assets/marks/${requirement.id.replace(/^discipline-/, "")}.webp` })),
    timing: timings.map(timing => ({"Main Action":"A",Maneuver:"M",Reaction:"R",Passive:"P",Movement:"Move",Other:"—"}[timing])).join(" / "),
  }; });
  const equipmentRows = equipment.map((item) => {
    const definition = inventory.equipment?.find((r) => r.id === item.system.catalogId);
    const instance=item.getFlag?.("heroes-of-legend","acquisitionInstance");
    const source=(development.items ?? []).find(record=>record.instanceId===instance)?.source ?? (instance === "creation-outfit" ? "creation" : instance?.startsWith("grant:") ? instance.split(":")[1] : instance?.startsWith("shop-") || instance?.startsWith("purchase:") ? "coins" : "play");
    return { ...equipmentSurface(item,definition), id: item.id, name: item.name, system: item.system, favorite: favorites.has(item.id),sourceLabel:({creation:"Starting outfit",coins:"Purchased",play:"Added"})[source] ?? name(source),
      ammunitionOptions: equipment.filter(ammo=>ammo.system.catalogId === "item-ammunition-bundle" && ammo.system.quantity > 0 && ammo.system.inventoryDie > 0).map(ammo=>({id:ammo.id,name:ammo.name,selected:ammo.id===item.getFlag?.("heroes-of-legend","ammunitionItemId")})),
      hasSupply: Boolean(definition?.inventoryDie || item.system.inventoryDie),
      supplyLabel: item.system.inventoryDie ? `d${item.system.inventoryDie}` : "Empty",
      bulk: item.system.quantity * item.system.bulk,
      carried: item.system.carried !== false,
      needsGrip: item.system.held && !item.system.hands,
      arrangement: [item.system.held && "Held", item.system.worn && "Worn"].filter(Boolean).join(" · ") || (item.system.carried === false ? "Stored" : "Carried") };
  });
  const favoriteRows = workshopFavorites(
    {state:{abilities:abilityRows.map(row=>row.catalogId)},inventory:{items:equipmentRows.map(row=>({...row.system,instanceId:row.id,inventoryDie:row.hasSupply?row.system.inventoryDie:null}))}},
    {play:{favorites:{abilities:abilityRows.filter(row=>row.favorite).map(row=>row.catalogId),items:equipmentRows.filter(row=>row.favorite).map(row=>row.id)}}},
    {choices}
  ).map(entry=>{
    const row=abilityRows.find(row=>row.catalogId===entry.record.id);
    return row && {...row,sourceNames:entry.sourceItems.map(item=>equipmentRows.find(row=>row.id===item.instanceId)?.name).join(" · "),useItemId:entry.inventoryInstance?.instanceId,supplyUse:Boolean(entry.inventoryInstance),canUse:!entry.inventoryInstance || (entry.inventoryInstance.quantity>0 && entry.inventoryInstance.inventoryDie>0)};
  }).filter(Boolean);
  favoriteRows.unshift(...abilityRows.filter(row=>row.favorite && !records.has(row.catalogId)).map(row=>({...row,canUse:true})));
  const tab = ["main", "character", "abilities", "inventory", "development", "crafting"].includes(sheetState.tab) ? sheetState.tab : "main";
  const recipes = (development.recipes ?? []).map((id) => inventory.recipes?.find((r) => r.id === id)).filter(Boolean);
  const tabs = [["main", "Main", "fa-dice-d6"], ["abilities", "Abilities", "fa-wand-magic-sparkles"], ["inventory", "Inventory", "fa-suitcase"], ...(recipes.length ? [["crafting", "Crafting", "fa-hammer"]] : []), ["character", "Character", "fa-user"], ["development", "Development", "fa-seedling"]].map(([id, label, icon]) => ({id, label, icon, navIcon: workshopNavIcon(label), active: id === tab}));
  if (!tabs.some((t) => t.active)) tabs[0].active = true;
  const active = tabs.find((t) => t.active).id;
  const creationLedger = (development.ledger ?? []).filter(entry => entry.stage !== undefined);
  const advancement = development.purchases ?? [];
  const spent = advancement.reduce((sum,entry) => sum + (entry.cost ?? 0),0);
  const total = creationLedger.reduce((sum,entry) => sum + Math.max(0,entry.delta ?? 0),0) + Array.from({length:Math.max(0,(development.level ?? 1)-1)},(_,index)=>10+index).reduce((sum,value)=>sum+value,0);
  const ranks=Object.entries(development.ranks ?? {}).map(([id,rank])=>({name:name(id),rank})).sort((a,b)=>a.name.localeCompare(b.name));
  return {
    tabs, activeTab: active, mainTab: active === "main", characterTab: active === "character", abilitiesTab: active === "abilities", inventoryTab: active === "inventory", developmentTab: active === "development", craftingTab: active === "crafting",
    editMode: Boolean(sheetState.edit),
    identity: [name(creation.ancestryId), name(creation.culture?.id), name(creation.background?.id), name(development.classId ?? creation.classId)].filter(Boolean).join(" · "),
    canRemoveLevel:(development.level??1)>1, overspent:(development.dp??0)<0, level: development.level ?? 0, dp: development.dp ?? 0, dpSpent: spent, dpTotal:total,
    signatureTiers: [1,3,7].map(tier => {const slot=signatureTierState({...development,classId:development.classId??creation.classId},tier,choices);const row=abilityRows.find(row=>row.catalogId===slot.selectedId);return {tier,id:row?.id,catalogId:slot.selectedId,name:row?.name??(slot.selectedId?name(slot.selectedId):null),available:slot.earned,missing:slot.pending,ambiguous:slot.ambiguous};}),
    abilityRows, equipmentRows, recipes: recipes.map(recipe => ({...recipe, project:craftingState[recipe.id], abilities:(recipe.permissions ?? []).map(id => abilityRows.find(row => row.catalogId === id)).filter(Boolean)})),
    passives: abilityRows.filter(row => row.timings.includes("Passive") && (sheetState.edit || !row.basic || row.shown)),
    basicAbilities: abilityRows.filter(row => row.basic),
    learnedGroups: [["main", "Main Action"], ["maneuver", "Maneuver"], ["reaction", "Reaction"], ["passive", "Passive"], ["movement","Movement"], ["other","Other"]].map(([key,label]) => ({key,label,entries:attackFirst(abilityRows.filter(row => !row.basic && row.timings.includes(label)))})),
    disciplineFilters: choices.filter(record => record.kind === "discipline"),
    origins: [["Ancestry", creation.ancestryId], ["Culture", creation.culture?.id], ["Background", creation.background?.id]].map(([label,id]) => ({label,name:name(id)})),
    traits: (creation.traitIds ?? []).map(id => ({id,name:name(id),brief:records.get(id)?.reference?.flavor?.[0] ?? ""})),
    favorites: favoriteRows,
    actionGroups: [["main", "Main Action"], ["maneuver", "Maneuver"], ["reaction", "Reaction"], ["movement","Movement"], ["other","Other"]].map(([key, label]) => ({ key, disclosureKey:key === "main" ? "main-action" : key, label, entries: attackFirst(abilityRows.filter((r) => r.timings.includes(label) && (sheetState.edit || !r.basic || r.shown))) })),
    ranks, rankPairs:Array.from({length:Math.ceil(ranks.length/2)},(_,index)=>({left:ranks[index*2],right:ranks[index*2+1]})),
    languages:(development.languages ?? []).map(language=>({...language,formLabel:language.form === "signed" ? "Signed" : language.permissions?.read && language.permissions?.write ? "Spoken & written" : "Spoken"})),
    signatures: abilityRows.filter((r) => records.get(r.catalogId)?.classId).map((r) => ({name:r.name})),
    ledger: creationLedger.map((entry) => ({...entry, label: entry.kind?.replaceAll("-", " ") ?? "Entry", sourceName: name(entry.sourceId), delta: entry.delta ?? 0, balance: entry.balance ?? 0})),
    purchases: (development.ledger ?? []).filter(entry=>entry.level>1 || ["add-level","remove-level","refund"].includes(entry.kind)).map(entry=>({...entry,name:({award:"Level award","add-level":"Add level","remove-level":"Remove level","refund-ability":"Ability removed",refund:`Removed ${name(entry.id)}`})[entry.kind] ?? name(entry.id),cost:entry.delta > 0 ? `+${entry.delta}` : entry.delta ?? 0})),
    bulk: equipmentRows.filter(item => item.carried).reduce((sum, item) => sum + item.bulk, 0),
    wounds,
    marks: [1, 2, 3].map((value) => ({value, filled: (survival.marks ?? 0) >= value})),
    deathMarks: survival.marks ?? 0,
    survivalStatus: survival.status ?? "active",
    storyOpen: sheetState.closed?.story !== true,
  };
}
