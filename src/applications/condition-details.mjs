import {CONDITION_KINDS} from "../rules/conditions.mjs";
import {localRulePage} from "../services/journals.mjs";
export async function showConditionDetails(key) {
  if(!Object.hasOwn(CONDITION_KINDS,key))throw new Error("Unknown condition.");
  const page=await localRulePage("design/rules/conditions.md");
  const html=await foundry.applications.ux.TextEditor.implementation.enrichHTML(page.text.content,{relativeTo:page,secrets:page.isOwner});
  const doc=new DOMParser().parseFromString(html,"text/html");
  const row=[...doc.querySelectorAll("tr")].find(row=>row.cells[0]?.textContent.trim().toLowerCase().startsWith(key));
  const name=key[0].toUpperCase()+key.slice(1);
  const content=row?`<section class="hol-condition-details"><p>${row.cells[1].innerHTML}</p><p><strong>Removal / persistence</strong> ${row.cells[2].innerHTML}</p></section>`:html;
  return foundry.applications.api.DialogV2.prompt({classes:["heroes-of-legend","hol-native-dialog"],window:{title:name},position:{width:470},content,ok:{label:"Close"}});
}
