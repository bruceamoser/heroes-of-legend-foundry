import { rollSetup, bindRollSetup } from "./roll-ui.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { ATTRIBUTES } from "./rules/character.mjs";
import { workshopCharacter } from "./rules/workshop-character.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const [draft, choices, inventory, creatures] = await Promise.all(
  ["example", "choices", "inventory", "creatures"].map(async (name) => {
    const response = await fetch(`data/${name}.json`);
    if (!response.ok) throw new Error(`Cannot load ${name}`);
    return response.json();
  }),
);
const character = workshopCharacter(draft, {
  choices: choices.records,
  inventory,
  sourceCommit: choices.sourceCommit,
});
const cards = character.state.abilities
  .map((id) => choices.records.find((c) => c.id === id))
  .filter(Boolean);
const incoming = creatures.creatures
  .find((r) => r.id === "creature-goblin-scrapper")
  .actions.main.actions.find((a) => a.name === "Scrap knife");
const dialog = document.querySelector("#reference");
let mode = "ability";
function open(next) {
  mode = next;
  const attribute = mode === "defense" ? incoming.defense.attribute : "brawn";
  const selected = mode === "ability" ? "ability-hook-and-drive" : null;
  dialog.innerHTML = `<header><div><small class="hol-roll-context">Borin Bridgekeeper${mode === "defense" ? " · Defense" : ""}</small><h2 id="reference-title">${mode === "ability" ? "Hook and Drive" : mode === "defense" ? `Defend · ${esc(incoming.name)}` : "Attribute check"}</h2></div><button type="button" data-close class="quiet">Close</button></header><div class="reference-body">${rollSetup({ attributes: Object.fromEntries(ATTRIBUTES.map((a) => [a, draft.attributes[a]])), selected: attribute, attributeId: "preview-attribute", value: draft.attributes[attribute], netId: "preview-net", labelId: "preview-net-label" })}<details class="hol-roll-abilities" open><summary>Abilities</summary><div class="roll-abilities">${[
    ...cards,
  ]
    .sort((a, b) => Number(b.id === selected) - Number(a.id === selected))
    .map(
      (r) =>
        `<label class="inline-toggle"><input type="checkbox" data-preview-ability="${esc(r.id)}" ${r.id === selected ? "checked" : ""}>${esc(r.name)}</label>`,
    )
    .join(
      "",
    )}</div><small>Choose applicable abilities; use the slider for the net Boons or Banes.</small></details><div id="preview-result" class="hol-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions"><button type="button" class="primary" data-preview-roll>Roll</button></div><details class="hol-preview-rules"><summary>Selected ability rules</summary><div data-selected-rules></div></details></div>`;
  bindRollSetup(dialog.querySelector(".reference-body"), {
    getAttributeValue: () =>
      draft.attributes[document.querySelector("#preview-attribute").value],
  });
  updateRules();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function updateRules() {
  const selected = [
    ...dialog.querySelectorAll("[data-preview-ability]:checked"),
  ].map((e) => cards.find((r) => r.id === e.dataset.previewAbility));
  dialog.querySelector("[data-selected-rules]").innerHTML =
    selected
      .map(
        (r) =>
          `<section><h3>${esc(r.name)}</h3>${r.reference?.rules?.details?.map((d) => `<p><b>${esc(d.label)}:</b> ${esc(d.value)}</p>`).join("") ?? ""}${r.reference?.rules?.body?.map((b) => (b.outcomes ? `<table>${b.outcomes.map((o) => `<tr><th>${esc(o.label)}</th><td>${esc(o.text)}</td></tr>`).join("")}</table>` : b.text ? `<p>${esc(b.text)}</p>` : "")).join("") ?? ""}${r.reference?.rules?.notes?.map((n) => `<p>${esc(typeof n === "string" ? n : n.text)}</p>`).join("") ?? ""}</section>`,
      )
      .join("") || "<p>No abilities selected.</p>";
}
function die() {
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= 4294967292);
  return (a[0] % 6) + 1;
}
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open]");
  if (opener) open(opener.dataset.open);
  if (e.target.closest("[data-close]")) dialog.close();
  if (e.target.closest("[data-preview-roll]")) {
    const attribute =
        draft.attributes[document.querySelector("#preview-attribute").value],
      net = Number(document.querySelector("#preview-net").value);
    const plan = rollPlan({
      attribute,
      boons: Math.max(0, net),
      banes: Math.max(0, -net),
    });
    const faces = Array.from({ length: plan.count }, () => die());
    const retained = [...faces]
      .sort((a, b) => (net < 0 ? a - b : b - a))
      .slice(0, 3);
    const result = classifyRoll(retained, attribute);
    const selected = [
      ...dialog.querySelectorAll("[data-preview-ability]:checked"),
    ].map((e) => cards.find((r) => r.id === e.dataset.previewAbility).name);
    document.querySelector("#preview-result").innerHTML =
      `<strong>${result.tier[0].toUpperCase() + result.tier.slice(1)}${mode === "defense" ? " defense" : ""} · ${result.total}</strong><p>${faces.join(" · ")} → keep ${retained.join(" + ")} ${attribute >= 0 ? "+" : ""}${attribute}</p>${result.natural !== "none" ? `<p>${result.natural === "critical" ? "Natural 666 · additional benefit" : "Natural 111 · complication"}</p>` : ""}${mode === "defense" ? `<p>${esc(incoming.outcomes[result.tier])} · ${esc(incoming.name)}</p>` : ""}${selected.length ? `<p>${selected.map(esc).join(" · ")}</p>` : ""}`;
  }
});
dialog.addEventListener("change", (e) => {
  if (e.target.matches("[data-preview-ability]")) updateRules();
});
open("ability");
