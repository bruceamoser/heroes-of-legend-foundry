import { EQUIPMENT_TRAINING } from "../rules/equipment-eligibility.mjs";
/** Presentation-only catalog metadata. Current document resources stay authoritative. */
export function itemCardContext(item, catalogs) {
  const source = item.getFlag("heroes-of-legend", "source");
  const record = item.type === "equipment"
    ? catalogs.inventory.equipment.find(record => record.id === item.system.catalogId || record.source.path === source?.path)
    : catalogs.choices.find(record => record.kind === "ability" && (record.foundryId === item.id || record.id === item.getFlag("heroes-of-legend", "catalogId") || record.source.path === source?.path));
  const requirements = (record?.requirements ?? []).map(requirement => ({
    name: catalogs.choices.find(choice => choice.id === requirement.id)?.name ?? requirement.id ?? requirement.kind,
    value: requirement.rank ?? requirement.value ?? "",
  }));
  const training = EQUIPMENT_TRAINING[record?.id];
  const properties = [];
  if (record?.handChoices?.length) properties.push({name:"Hands",value:record.handChoices.join(" / ")});
  else if (item.type === "equipment" && item.system.hands) properties.push({name:"Hands",value:item.system.hands});
  if (record?.specialOrder) properties.push({name:"Acquisition",value:"Special order"});
  if (training) properties.push({name:"Training",value:catalogs.choices.find(choice => choice.id === training)?.name ?? training});
  return {
    cardRecord:record, cardSourcePath:source?.path ?? record?.source.path,
    cardPrice:record?.price ?? "—", cardLevel:record?.minimumLevel ?? "—",cardCost:record?.cost ?? "—",
    cardRequirements:requirements,cardProperties:properties,
    itemNotes:item.getFlag("heroes-of-legend","itemNotes") ?? "",
    cardHasSupply:item.type === "equipment" && (record?.inventoryDie != null || item.system.inventoryDie > 0),
  };
}
/** Shape the existing complete document reference into the approved compact card.
 * Move authoring/provenance metadata to its disclosure; never change document data.
 */
export function formatItemCard(root) {
  const rules = root.querySelector("[data-item-rules]");
  if (!rules) return;
  const source = root.querySelector("[data-item-provenance]");
  for (const element of rules.querySelectorAll(".hol-automation-label,.hol-reference-source")) source?.append(element);
  for (const heading of rules.querySelectorAll("h1,h2")) {
    if ((heading.tagName === "H1" && heading.closest(".hol-journal-page")) || heading.textContent.trim() === "Rules") heading.remove();
  }
  for(const details of rules.querySelectorAll("dl.hol-reference-details"))for(const row of [...details.children])if(row.tagName==="DIV")row.replaceWith(...row.childNodes);
  for (const list of rules.querySelectorAll("dl.hol-reference-outcomes")) {
    const table = document.createElement("table");table.className="hol-item-outcome-table";
    const body = document.createElement("tbody");
    for (const label of list.querySelectorAll("dt")) {
      const value = label.nextElementSibling;
      const row = document.createElement("tr"), th = document.createElement("th"), td = document.createElement("td");
      th.scope="row";th.textContent=label.textContent;td.innerHTML=value?.innerHTML ?? "";
      row.append(th,td);body.append(row);
    }
    table.append(body);list.replaceWith(table);
  }
  // Equipment source Markdown includes catalog bookkeeping already in the header.
  for (const row of rules.querySelectorAll("li")) if (/^(ID|Bulk):/.test(row.textContent.trim())) row.remove();
  for (const paragraph of rules.querySelectorAll("p")) {
    if (/^Market price:/.test(paragraph.textContent.trim()) || paragraph.textContent.trim()==="Equipment index") paragraph.remove();
    if (paragraph.children.length === 1 && paragraph.firstElementChild?.tagName === "EM") paragraph.classList.add("hol-item-flavor");
  }
  for(const list of rules.querySelectorAll("ul")){
    const rows=[...list.children];
    if(!rows.length||!rows.every(row=>row.firstElementChild?.tagName==="STRONG"))continue;
    const metadata=document.createElement("dl");metadata.className="hol-item-metadata";
    for(const row of rows){const label=row.firstElementChild;const term=document.createElement("dt"),value=document.createElement("dd");term.textContent=label.textContent.replace(/:$/,"");label.remove();value.innerHTML=row.innerHTML.trim();metadata.append(term,value);}
    list.replaceWith(metadata);
  }
  for(const link of rules.querySelectorAll("a"))if(link.textContent.trim()==="Equipment index")link.closest("p")?.remove();
  for(const heading of rules.querySelectorAll("h3"))if(heading.textContent.trim()==="Additional rulings")heading.remove();
  for(const strong of rules.querySelectorAll(".hol-reference-rules~p>strong:first-child"))if(strong.textContent.startsWith("Offensive healing"))strong.remove();
  const emptyLists = rules.querySelectorAll("ul");
  for (const list of emptyLists) if (!list.children.length) list.remove();
}
