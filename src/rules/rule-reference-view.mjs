import { escapeItemHtml as esc } from "./item-construction.mjs";
/** Same reference presentation as the approved web rules viewer. */
export function abilityRuleReferenceHTML(record) {
  const reference=record.reference;
  const details=(reference?.rules?.details??[]).map(detail=>`<dt>${esc(detail.label)}</dt><dd>${esc(detail.value)}</dd>`).join("");
  const body=(reference?.rules?.body??[]).map(block=>block.outcomes?`<table>${block.outcomes.map(outcome=>`<tr><th>${esc(outcome.label)}</th><td>${esc(outcome.text)}</td></tr>`).join("")}</table>`:block.items?`<ul>${block.items.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:block.text?`<p>${esc(block.text)}</p>`:"").join("");
  const notes=(reference?.rules?.notes??[]).map(note=>`<p>${esc(typeof note==="string"?note:note.text)}</p>`).join("");
  return `<article class="hol-journal-page hol-structured-rule"><h2>${esc(record.name)}</h2>${(reference?.flavor??[]).map(text=>`<p class="hol-rule-flavor">${esc(text)}</p>`).join("")}<dl>${details}</dl>${body}${notes}</article>`;
}
