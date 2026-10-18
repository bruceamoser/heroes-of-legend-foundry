import { newCreationDraft, creationPreview } from "./rules/creation.mjs";
import { ATTRIBUTES } from "./rules/character.mjs";
import {
  DEFAULT_LANGUAGES,
  campaignLanguageOptions,
} from "./rules/languages.mjs";
import {
  eligibleFirst,
  purchaseEligibility,
  classEligibility,
  recipeStudyChoices,
} from "./rules/development.mjs";
import {
  readPortableCharacter,
  writePortableCharacter,
  MAX_CHARACTER_BYTES,
} from "./rules/portable-character.mjs";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const signed = (value) => (value > 0 ? `+${value}` : String(value ?? "—"));
const title = (value) => value[0].toUpperCase() + value.slice(1);
const join = (values) => values.filter(Boolean).join(" · ");
const steps = [
  "Identity",
  "Ancestry",
  "Origins",
  "Early learning",
  "Class",
  "Heroic learning",
  "Equipment",
  "Review",
];
const tabs = [
  "Encounter",
  "Abilities",
  "Belongings",
  "Character",
  "Development",
];
const storageKey = "hol.workshop.v1";
let catalogs,
  references,
  example,
  draft,
  preview,
  mode = "sheet",
  tab = "Encounter",
  step = 0,
  edit = false,
  isExample = true;
let query = "",
  filter = "all",
  recipeSelections = {},
  noticeTimer;
let visibleChoices = { true: 6, false: 4 };
let pointerDown = false,
  pendingRender = false;
let storageAvailable = true;
const app = $("#app");
function notice(text) {
  $("#notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").textContent = ""), 7000);
}
function get(id) {
  return (
    catalogs.choices.find((r) => r.id === id) ??
    catalogs.inventory.equipment.find((r) => r.id === id) ??
    catalogs.inventory.recipes.find((r) => r.id === id)
  );
}
function name(id) {
  return get(id)?.name ?? id ?? "Not chosen";
}
function button(text, action, extra = "", style = "") {
  return `<button type="button" data-action="${action}" ${extra} class="${style}">${text}</button>`;
}
const navIcons = {
  Encounter:
    '<path d="m4 3 13 13m-2 3 4-4M3 4l1 5 4-1M20 3 7 16m-2-1 4 4m12-15-1 5-4-1"/>',
  Abilities:
    '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  Belongings:
    '<path d="M8 6V4a4 4 0 0 1 8 0v2M7 6h10l3 5v10H4V11zM4 13h16M9 13v3h6v-3"/>',
  Character:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  Development: '<path d="M5 21v-7h5V9h5V4h6M16 4h5v5"/>',
  Ancestry: '<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM8 11l3 3 5-6"/>',
  Origins: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  Class: '<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM12 6v11M8 10h8"/>',
  Heroic: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  Review: '<path d="M8 3H4v18h16V3h-4M8 2h8v4H8zM7 13l3 3 7-7"/>',
};
function navIcon(key, label) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${navIcons[key]}</svg><span class="nav-tooltip" aria-hidden="true">${esc(label)}</span>`;
}
function field(label, key, value, type = "text", extra = "") {
  return `<label>${esc(label)}<input type="${type}" data-field="${key}" value="${esc(value)}" ${extra}></label>`;
}
function option(id, label, selected, disabled = false) {
  return `<option value="${esc(id)}" ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}>${esc(label)}</option>`;
}
function select(label, key, options) {
  return `<label>${esc(label)}<select aria-label="${esc(label)}" data-field="${key}">${options}</select></label>`;
}
function row(label, value) {
  return `<div class="stat-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}
function heading(kicker, label, text, action = "") {
  return `<div class="panel-heading"><div><p class="eyebrow">${esc(kicker)}</p><h2 tabindex="-1" id="panel-title">${esc(label)}</h2>${text ? `<p>${esc(text)}</p>` : ""}</div>${action}</div>`;
}
function symbol(id) {
  const key = id?.replace("discipline-", "");
  return key && catalogs.choices.some((r) => r.id === `discipline-${key}`)
    ? `<img class="sigil" src="assets/${key}.webp" alt="${esc(name(id))}">`
    : "";
}
function errors() {
  return preview.errors.map(
    (e) =>
      e.text ??
      `${name(e.id)}: ${(e.reasons ?? []).map((r) => r.text).join(" ")}`,
  );
}
function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        character: JSON.parse(writePortableCharacter(draft, catalogs)),
        mode,
        tab,
        step,
        isExample,
      }),
    );
  } catch {
    if (storageAvailable)
      notice(
        "This browser could not save your draft. Export JSON to keep your choices.",
      );
    storageAvailable = false;
  }
}
function header() {
  const s = preview.summary;
  return `<div class="workshop-header"><div class="toolbar"><div class="toolbar-group">${button(edit ? "✓ Finish editing" : "✎ Edit", "edit", `aria-pressed="${edit}"`, edit ? "selected" : "quiet")}</div><div class="toolbar-group">${button("New hero", "new", "", "quiet")}${button("Import JSON", "import", "", "quiet")}${button("Export JSON", "export", "", "small")}</div></div>
  <header class="hero-header"><div class="identity-line"><img class="hero-mark" src="assets/crest.webp" alt=""><div><p class="eyebrow">${mode === "builder" ? "A hero in the making" : "Your legend begins"}</p>${edit ? field("Character name", "name", draft.name, "text", 'maxlength="200"') : `<h1>${esc(draft.name || "Your new hero")}</h1>`}<p>${esc(join([get(draft.ancestryId)?.name, get(draft.classId)?.name, "Level 1"]))}</p></div></div><div class="vitals"><div class="vital"><small>HP maximum</small><strong>${s?.maximumHp ?? "—"}</strong></div><div class="vital"><small>Grit</small><strong>${s?.gritGranted ?? "—"}</strong></div><div class="vital"><small>Speed</small><strong>${s?.unencumberedSpeed ?? "—"}</strong></div></div></header>
  <div class="attributes">${ATTRIBUTES.map((key) => `<div class="attribute"><span>${title(key)}</span>${edit ? `<input aria-label="${title(key)}" type="number" min="-2" max="2" step="1" data-field="attributes.${key}" value="${draft.attributes[key]}">` : `<strong>${signed(draft.attributes[key])}</strong>`}</div>`).join("")}</div></div>`;
}
function abilityCard(
  r,
  { eligible = true, reasons = [], cost, rank, learning = false } = {},
) {
  const action = r.reference?.rules.details.find(
    (d) => d.label === "Action",
  )?.value;
  const requirements = (r.requirements ?? []).filter(
    (v) => v.kind === "discipline",
  );
  const summary =
    r.reference?.flavor?.[0] ??
    (r.kind === "discipline" ? `Develop your training in ${r.name}.` : "");
  return `<article class="choice-card ${eligible ? "" : "unavailable"}" data-choice="${r.id}" data-eligible="${eligible}" draggable="${learning && eligible}"><div class="card-top">${r.kind === "ability" && !r.universal ? `<span class="tier" title="Available from level ${r.minimumLevel}"><span>${r.minimumLevel}</span></span>` : ""}<h3>${esc(r.name)}</h3>${symbol(r.kind === "discipline" ? r.id : requirements[0]?.id)}</div><div class="card-meta">${action ? `<span>${esc(action)}</span>` : ""}${requirements.map((req) => `<span>${esc(name(req.id))} ${req.rank}</span>`).join("")}${rank ? `<span>Rank ${rank}</span>` : ""}</div>${summary ? `<p class="card-copy">${esc(summary)}</p>` : ""}${reasons.length ? `<p class="requirement">${reasons.map((r) => esc(r.text)).join(" ")}</p>` : ""}<div class="card-actions">${button("Read rules", "reference", `data-id="${r.id}"`, "quiet small")}${learning ? button(`${cost ?? "—"} DP · Learn`, "purchase", `data-id="${r.id}" ${eligible ? "" : "disabled"}`, "small") : ""}</div>${learning && r.purchasePolicy === "new-recipe" ? recipeSelects(r) : ""}</article>`;
}
function knownCards() {
  return [...new Set(preview.state.abilities)].map(get).filter(Boolean);
}
function searchRow(kind = "abilities") {
  return `<div class="search-row"><label>Search ${kind}<input id="search" type="search" value="${esc(query)}" placeholder="Name, discipline or keyword…" autocomplete="off"></label>${
    kind === "abilities"
      ? `<label>Discipline<select id="filter">${option("all", "All disciplines", filter === "all")}${catalogs.choices
          .filter((r) => r.kind === "discipline")
          .map((r) => option(r.id, r.name, filter === r.id))
          .join("")}</select></label>`
      : ""
  }</div>`;
}
function matches(r) {
  const text =
    `${r.name} ${r.reference?.flavor?.join(" ") ?? ""} ${(r.requirements ?? []).map((v) => name(v.id)).join(" ")}`.toLowerCase();
  return (
    text.includes(query.toLowerCase()) &&
    (filter === "all" ||
      r.id === filter ||
      r.requirements?.some((v) => v.id === filter))
  );
}
function sheet() {
  return `<div class="sheet-body"><nav class="edge-tabs" role="tablist" aria-label="Character sheet" aria-orientation="vertical">${tabs.map((t) => button(navIcon(t, t), "tab", `id="tab-${t}" aria-label="${t}" role="tab" aria-selected="${tab === t}" aria-controls="panel" tabindex="${tab === t ? 0 : -1}" data-tab="${t}"`)).join("")}</nav><section id="panel" class="panel" role="tabpanel" aria-labelledby="tab-${tab}">${sheetContent()}</section></div>`;
}
function sheetContent() {
  const s = preview.summary;
  if (tab === "Encounter")
    return `${heading("At the table", "Ready for the next encounter", "Your most-used actions and defenses, close at hand.", button("Open character builder", "builder", "", "primary"))}<div class="columns"><div class="stack"><div><h3 class="section-title">Actions & reactions</h3><div class="cards">${
      knownCards()
        .filter((r) =>
          r.reference?.rules.details.some(
            (d) => d.label === "Action" && !d.value.startsWith("Passive"),
          ),
        )
        .slice(0, 6)
        .map((r) => abilityCard(r))
        .join("") ||
      '<p class="empty">Learn abilities in the character builder.</p>'
    }</div></div></div><aside class="stack"><section class="box"><h3>Keep fighting</h3>${row("Maximum HP", s?.maximumHp ?? "Finish creation")}${row("Grit granted", s?.gritGranted ?? "—")}${row("Unencumbered speed", s ? `${s.unencumberedSpeed} squares` : "—")}${row("Base stability", s?.stability ?? "—")}${row("Bulk / capacity", `${preview.inventory.bulk} / ${s?.capacity ?? "—"}`)}</section><section class="callout"><h3>One roll. Three outcomes.</h3><p>3d6 + one attribute</p><p>Weak ≤ 8 · Standard 9–14 · Strong ≥ 15</p><p>Cancel Boons and Banes, then keep the best or worst three dice.</p></section><section class="box"><h3>Your training</h3>${
      Object.entries(preview.state.ranks)
        .map(([id, rank]) => row(name(id), `Rank ${rank}`))
        .join("") ||
      '<p class="empty">Your origins and class will grant starting disciplines.</p>'
    }</section></aside></div>`;
  if (tab === "Abilities")
    return `${heading("Your repertoire", "Training & abilities", "Read the full rules without leaving your character.")}${searchRow()}<div class="cards" id="results">${
      knownCards()
        .filter(matches)
        .map((r) => abilityCard(r))
        .join("") ||
      '<p class="empty">No learned abilities match. Browse learning in the character builder.</p>'
    }</div><details class="planned"><summary>Universal actions</summary><div class="cards">${catalogs.choices
      .filter((r) => r.universal)
      .map((r) => abilityCard(r))
      .join("")}</div></details>`;
  if (tab === "Belongings")
    return `${heading("What you carry", "Belongings", "Starting equipment, supplies and the recipes you know.")}<div class="columns"><section class="box"><h3>Inventory</h3>${inventoryTable()}</section><aside class="stack"><section class="box"><h3>Travel light</h3>${row("Coins remaining", preview.inventory.remainingCoins)}${row("Carried Bulk", preview.inventory.bulk)}${row("Capacity", s?.capacity ?? "—")}</section><section class="box"><h3>Recipes</h3>${preview.state.recipes.map((id) => `<div class="stat-row"><span>${esc(name(id))}</span>${button("Read", "reference", `data-id="${id}"`, "small")}</div>`).join("") || '<p class="empty">No recipes learned.</p>'}</section></aside></div>`;
  if (tab === "Character")
    return `${heading("Beyond the numbers", "Character & origins", "The people, places and experiences that shaped your hero.")}<div class="columns"><div class="stack"><section class="box"><h3>Identity</h3>${edit ? `<div class="field-grid">${field("Pronouns", "profile.pronouns", draft.profile?.pronouns)}${field("Player", "profile.player", draft.profile?.player)}</div>` : row("Pronouns", draft.profile?.pronouns || "—") + row("Player", draft.profile?.player || "—")}${row("Ancestry", name(draft.ancestryId))}${row("Culture", name(draft.culture?.id))}${row("Background", name(draft.background?.id))}</section><section class="box"><h3>Your story</h3>${edit ? `<label>Notes<textarea data-field="profile.story" maxlength="10000">${esc(draft.profile?.story)}</textarea></label>` : `<p>${esc(draft.profile?.story || "Use Edit to add a few words about your hero.")}</p>`}</section></div><aside class="stack"><section class="box"><h3>Ancestry traits</h3>${draft.traitIds.map((id) => `<div class="stat-row"><span>${esc(name(id))}</span>${button("Read", "reference", `data-id="${id}"`, "small")}</div>`).join("")}</section><section class="box"><h3>Languages</h3>${(s?.languages ?? []).map((l) => row(l.name, l.permissions.read ? "Spoken & written" : l.form === "signed" ? "Signed" : "Spoken")).join("") || '<p class="empty">Choose a home language in creation.</p>'}</section></aside></div>`;
  return `${heading("How your hero grows", "Development", "Your creation choices and DP history remain visible.", button("Review creation", "review", "", "primary"))}<div class="callout"><h3>Level 1 · Creation</h3><p>Level 0 and level 1 have separate DP pools. Unspent creation DP expires. At later levels, gain 8 + your new level in DP; unspent advancement DP can be saved.</p></div><details class="planned" open><summary>Creation ledger</summary>${ledgerTable()}</details>`;
}
function inventoryTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Source</th><th>Rules</th></tr></thead><tbody>${preview.inventory.items.map((item) => `<tr><td>${esc(name(item.catalogId))}</td><td>${item.quantity}</td><td>${item.source === "coins" ? "Purchased" : "Granted"}</td><td>${button("Read", "reference", `data-id="${item.catalogId}"`, "quiet small")}</td></tr>`).join("")}</tbody></table></div>`;
}
function ledgerTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Stage</th><th>Choice</th><th>DP</th><th>Remaining</th></tr></thead><tbody>${preview.ledger.map((e) => `<tr><td>Level ${e.stage}</td><td>${esc(e.kind === "pool" ? "Starting pool" : e.kind === "expired-pool" ? "Unspent DP expires at stage end" : name(e.sourceId))}</td><td>${signed(e.delta)}</td><td>${e.balance}</td></tr>`).join("")}</tbody></table></div>`;
}
function builder() {
  const icons = [
    "Character",
    "Ancestry",
    "Origins",
    "Abilities",
    "Class",
    "Heroic",
    "Belongings",
    "Review",
  ];
  return `<div class="wizard"><nav class="edge-tabs" aria-label="Creation steps">${steps.map((label, i) => button(navIcon(icons[i], `${i + 1}. ${label}`), "step", `aria-label="${i + 1} ${label}" ${step === i ? 'aria-current="step"' : ""} data-step="${i}"`)).join("")}</nav><div class="wizard-body"><section id="panel" class="panel" aria-labelledby="panel-title">${builderContent()}</section><footer class="wizard-footer">${button(step ? "← Back" : "View sheet", step ? "back" : "sheet")}<small>${storageAvailable ? "Draft saved in this browser" : "Export JSON to keep your draft"}</small>${step < 7 ? button("Continue →", "next", "", "primary") : button("View character sheet", "sheet", "", "primary")}</footer></div></div>`;
}
function builderContent() {
  if (step === 0)
    return `${heading("Step 1 of 8", "Who will you become?", "Start with a name and six attributes. You can revisit every choice.")}<div class="field-grid">${field("Character name", "name", draft.name, "text", 'maxlength="200"')}${field("Pronouns (optional)", "profile.pronouns", draft.profile?.pronouns)}</div><h3 class="section-title" style="margin-top:28px">Your attributes</h3><p class="inline-help">Assign −2 to +2 to each attribute, totaling +3. Each creation DP pool is 10 + Knowledge + Reason + Guile.</p><div class="field-grid" style="margin-top:16px">${ATTRIBUTES.map((key) => field(title(key), `attributes.${key}`, draft.attributes[key], "number", 'min="-2" max="2" step="1"')).join("")}</div><div class="callout" style="margin-top:20px">Assigned total: <strong>${signed(Object.values(draft.attributes).reduce((a, b) => a + b, 0))} / +3</strong></div>`;
  if (step === 1) {
    const ancestry = get(draft.ancestryId),
      options = campaignLanguageOptions(DEFAULT_LANGUAGES, draft.languages);
    return `${heading("Step 2 of 8", "Ancestry & languages", "Choose your ancestry, two traits and a home language. Common is already known.")}<div class="cards">${catalogs.choices
      .filter((r) => r.kind === "ancestry")
      .map(
        (r) =>
          `<article class="choice-card ${draft.ancestryId === r.id ? "chosen" : ""}"><h3>${r.name}</h3><p class="card-meta">+${r.hp} HP · Base speed ${r.speed} · +${r.coins} coins</p><div class="card-actions">${button("Read rules", "reference", `data-id="${r.id}"`, "quiet small")}${button(draft.ancestryId === r.id ? "Selected" : "Choose", "ancestry", `data-id="${r.id}"`, "small")}</div></article>`,
      )
      .join(
        "",
      )}</div><h3 class="section-title" style="margin-top:26px">Choose two traits</h3><div class="cards">${(ancestry?.traits ?? []).map((id) => choiceCheck(id, "traitIds", draft.traitIds)).join("") || '<p class="empty">Choose an ancestry to see its traits.</p>'}</div>${draft.traitIds.includes("trait-elf-age-of-memory") ? field("Remembered community", "rememberedCommunity", draft.rememberedCommunity) : ""}<div style="margin-top:22px">${select("Home language", "languages.home", option("", "Choose a home language", !draft.languages.home) + options.home.map((l) => option(l.id, `${l.name}${l.reason ? ` — ${l.reason}` : ""}`, l.selected, l.disabled)).join(""))}</div>${draft.traitIds.includes("trait-human-many-homes") ? `<h3 class="section-title" style="margin-top:24px">Two additional spoken languages</h3><div class="cards">${options.extraSpoken.map((l) => `<label class="check"><input type="checkbox" data-list="languages.extraSpoken" value="${l.id}" ${l.selected ? "checked" : ""} ${l.disabled ? "disabled" : ""}><span>${l.name}<small>${esc(l.reason || l.summary)}</small></span></label>`).join("")}</div>` : ""}${staleSelections("traitIds", ancestry?.traits ?? [])}`;
  }
  if (step === 2)
    return `${heading("Step 3 of 8", "Where you come from", "Each origin grants a complete pair: one discipline rank and one ability. Duplicate grants return 1 DP.")}<div class="stack">${[
      "culture",
      "background",
    ]
      .map(
        (kind) =>
          `<section class="box">${select(
            title(kind),
            `${kind}.id`,
            option("", `Choose a ${kind}`, !draft[kind]?.id) +
              catalogs.choices
                .filter((r) => r.originType === kind)
                .map((r) => option(r.id, r.name, draft[kind]?.id === r.id))
                .join(""),
          )}${draft[kind]?.id ? `<div class="card-actions">${button("Read origin", "reference", `data-id="${draft[kind].id}"`, "quiet small")}</div><div class="stack">${(get(draft[kind].id)?.pairs ?? []).map((p, i) => `<label class="check"><input type="radio" data-field="${kind}.pair" name="${kind}-pair" value="${i}" ${draft[kind]?.pair === i ? "checked" : ""}><span><strong>${esc(name(p.disciplineId))} 1</strong>${esc(name(p.abilityId))}</span>${button("Read ability", "reference", `data-id="${p.abilityId}"`, "quiet small")}</label>`).join("")}</div>` : ""}</section>`,
      )
      .join("")}</div>`;
  if ([3, 5].includes(step)) return learning();
  if (step === 4) {
    const cls = get(draft.classId);
    return `${heading("Step 5 of 8", "Choose your calling", "Classes you qualify for appear first. Then choose two starting disciplines and one signature.")}<div class="cards">${eligibleFirst(
      catalogs.choices.filter((r) => r.kind === "class"),
      (r) => classEligibility(r, draft.attributes),
    )
      .map(
        (e) =>
          `<article class="choice-card ${e.eligible ? "" : "unavailable"} ${draft.classId === e.choice.id ? "chosen" : ""}"><h3>${e.choice.name}</h3><p class="card-meta">+${e.choice.hp} HP · +${e.choice.coins} coins</p><p class="requirement">${e.reasons.map((r) => esc(r.text)).join(" ") || "You meet the requirements."}</p><div class="card-actions">${button("Read class", "reference", `data-id="${e.choice.id}"`, "quiet small")}${button(draft.classId === e.choice.id ? "Selected" : "Choose", "class", `data-id="${e.choice.id}" ${e.eligible ? "" : "disabled"}`, "small")}</div></article>`,
      )
      .join(
        "",
      )}</div>${cls ? `<h3 class="section-title" style="margin-top:26px">Two starting disciplines</h3><div class="cards">${cls.startingDisciplines.map((id) => choiceCheck(id, "classDisciplines", draft.classDisciplines)).join("")}</div><h3 class="section-title" style="margin-top:26px">Your first signature</h3><div class="cards">${cls.signatures[1].map((id) => `<article class="choice-card ${draft.signatureId === id ? "chosen" : ""}"><h3>${esc(name(id))}</h3><p class="card-copy">${esc(get(id)?.reference?.flavor?.[0])}</p><div class="card-actions">${button("Read signature", "reference", `data-id="${id}"`, "quiet small")}${button(draft.signatureId === id ? "Selected" : "Choose", "signature", `data-id="${id}"`, "small")}</div></article>`).join("")}</div>${staleSelections("classDisciplines", cls.startingDisciplines)}` : ""}`;
  }
  if (step === 6) return equipment();
  return `${heading("Step 8 of 8", "Meet your hero", preview.valid ? "Your character is ready. Export the file and import it through Create a Hero in Foundry." : "A few choices still need attention. Your draft is saved, and every step remains available.")}${
    preview.valid
      ? `<div class="callout"><h3>Ready for Foundry</h3><p>${esc(draft.name)} · ${esc(name(draft.ancestryId))} ${esc(name(draft.classId))}</p></div>`
      : `<ul class="error-list">${errors()
          .map((e) => `<li>${esc(e)}</li>`)
          .join("")}</ul>`
  }<div class="columns" style="margin-top:22px"><section class="box"><h3>Your character</h3>${row("Maximum HP", preview.summary?.maximumHp ?? "—")}${row("Grit", preview.summary?.gritGranted ?? "—")}${row("Speed", preview.summary?.unencumberedSpeed ?? "—")}${row("Learned abilities", preview.state.abilities.length)}${row("Coins", preview.inventory.remainingCoins)}</section><section class="box"><h3>Take your hero with you</h3>${button("Export character JSON", "ready-export", preview.valid ? "" : "disabled", "primary")}<p class="file-hint">In Foundry: open a new character → Create a Hero → Import character JSON. Review with your campaign’s language settings, then complete creation.</p>${button("Save draft JSON", "export", "", "quiet")}</section></div><details class="planned"><summary>Creation ledger</summary>${ledgerTable()}</details>`;
}
function choiceCheck(id, list, values) {
  return `<div class="check"><label style="display:flex;gap:10px;flex:1"><input type="checkbox" data-list="${list}" value="${id}" ${values.includes(id) ? "checked" : ""}><span>${esc(name(id))}</span></label>${button("Read", "reference", `data-id="${id}"`, "quiet small")}</div>`;
}
function staleSelections(list, valid) {
  const stale = draft[list].filter((id) => !valid.includes(id));
  return stale.length
    ? `<div class="callout" style="margin-top:18px"><p>These choices belong to your earlier selection. Remove them to finish this step.</p>${stale.map((id) => choiceCheck(id, list, draft[list])).join("")}</div>`
    : "";
}
function stage() {
  return step === 3 ? 0 : 1;
}
function recipeSelects(r) {
  const study = recipeStudyChoices(
    preview.stages[stage()],
    catalogs.inventory.recipes,
  );
  const selected = recipeSelections[r.id] ?? study.defaultRecipeIds;
  return [0, 1]
    .map(
      (i) =>
        `<label>${i ? "Second" : "First"} recipe<select data-recipe="${r.id}" data-slot="${i}">${option("", "Choose a recipe", !selected[i])}${study.options.map((o) => option(o.id, o.name, selected[i] === o.id, o.disabled || selected[1 - i] === o.id)).join("")}</select></label>`,
    )
    .join("");
}
function selectionFor(r) {
  return r.purchasePolicy === "new-recipe"
    ? {
        recipeIds:
          recipeSelections[r.id] ??
          recipeStudyChoices(
            preview.stages[stage()],
            catalogs.inventory.recipes,
          ).defaultRecipeIds,
      }
    : {};
}
function learning() {
  const state = preview.stages[stage()];
  const options = eligibleFirst(
    catalogs.choices.filter(
      (r) =>
        ["ability", "discipline"].includes(r.kind) &&
        !r.universal &&
        matches(r),
    ),
    (r) => purchaseEligibility(r, state, catalogs.choices, selectionFor(r)),
  );
  const groups = [true, false]
    .map((eligible) => {
      const records = options.filter((e) => e.eligible === eligible);
      if (!records.length) return "";
      const limit = visibleChoices[eligible];
      return (
        `<div class="group-label">${eligible ? "Available to learn" : "Not available yet"} · ${records.length}</div>` +
        records
          .slice(0, limit)
          .map((e) => abilityCard(e.choice, { ...e, learning: true }))
          .join("") +
        (records.length > limit
          ? `<div class="more">${button(`Show more ${eligible ? "available choices" : "future choices"}`, "more", `data-group="${eligible}"`, "quiet")}</div>`
          : "")
      );
    })
    .join("");
  return `${heading(`Step ${step + 1} of 8`, stage() ? "Become a hero" : "What you learned before", stage() ? "Build on your class training. Learn abilities or improve discipline ranks." : "Spend your level-0 DP on abilities using the disciplines your origins granted.")}<div class="budget"><strong>${state.dp} DP remaining</strong><small>Level ${stage()} pool · Unspent DP expires at the end of this creation stage.</small></div><details class="planned"><summary>Planned choices (${draft.purchases[stage()].length})</summary><ul>${draft.purchases[stage()].map((p, i) => `<li><span>${esc(name(p.id))}${p.recipeIds ? `<small> · ${p.recipeIds.map(name).map(esc).join(", ")}</small>` : ""}</span>${button("Remove", "remove-purchase", `data-index="${i}"`, "quiet small")}</li>`).join("")}</ul></details><div class="drop-zone" data-drop>Drop an available ability here to learn it.</div>${acquisitions()}${searchRow()}<div class="cards" id="results">${groups || '<p class="empty">No matching choices. Try another keyword or discipline.</p>'}</div>`;
}
function acquisitions() {
  return (
    [3, 5].includes(step)
      ? preview.stages[stage()].abilities
      : preview.state.abilities
  )
    .map((id) => catalogs.inventory.acquisitions.find((a) => a.id === id))
    .filter(
      (a) =>
        a &&
        (a.weaponChoice ||
          a.recipeChoices ||
          a.items.includes("item-ordinary-melee-weapon")),
    )
    .map((a) => {
      const d = draft.acquisitions[a.id] ?? {};
      return `<details class="planned" ${preview.errors.some((e) => e.code === "acquisition" && e.id === a.id) ? "open" : ""}><summary>${esc(name(a.id))} · Choose your grants</summary><div class="field-grid">${a.weaponChoice ? select("Weapon", `acquisitions.${a.id}.weapon`, option("", "Choose weapon", !d.weapon) + a.weaponChoice.map((id) => option(id, id === "melee" ? "Ordinary melee weapon" : name(id), d.weapon === id)).join("")) : ""}${a.items.includes("item-ordinary-melee-weapon") || a.weaponChoice?.includes("melee") ? select("Melee weapon hands", `acquisitions.${a.id}.meleeHands`, option("", "Choose hands", !d.meleeHands) + [1, 2].map((n) => option(n, `${n} handed`, d.meleeHands === n)).join("")) : ""}</div>${
        a.recipeChoices
          ? `<p class="inline-help">Choose ${a.recipeChoices} recipes</p><div class="cards">${catalogs.inventory.recipes
              .filter((r) => r.genericChoice && r.permissions.includes(a.id))
              .map((r) =>
                choiceCheck(
                  r.id,
                  `acquisitions.${a.id}.recipes`,
                  d.recipes ?? [],
                ),
              )
              .join("")}</div>`
          : ""
      }</details>`;
    })
    .join("");
}
function equipment() {
  return `${heading("Step 7 of 8", "Pack for the road", "A plain worn outfit is included. Spend your starting coins and finish any granted equipment choices.")}<div class="budget"><strong>${preview.inventory.remainingCoins} coins</strong><small>${preview.inventory.bulk} Bulk · ${preview.summary?.capacity ?? "—"} capacity</small></div>${acquisitions()}<details class="planned" open><summary>Shopping list (${draft.shopping.length})</summary><ul>${draft.shopping.map((p, i) => `<li><span>${p.quantity} × ${esc(name(p.id))}</span>${button("Remove", "remove-equipment", `data-index="${i}"`, "quiet small")}</li>`).join("")}</ul></details>${searchRow("equipment")}<div class="cards">${catalogs.inventory.equipment
    .filter(matches)
    .map(
      (r) =>
        `<article class="choice-card ${r.specialOrder ? "unavailable" : ""}"><h3>${esc(r.name)}</h3><p class="card-meta">${r.price} coins · ${r.bulk} Bulk${r.inventoryDie ? ` · d${r.inventoryDie} supply` : ""}</p>${r.specialOrder ? '<p class="requirement">Special order · arrange availability with your DA.</p>' : `<div class="field-grid"><label>Quantity<input type="number" id="quantity-${r.id}" min="1" max="10000" value="1" step="1"></label>${r.handChoices.length ? `<label>Hands<select id="hands-${r.id}">${r.handChoices.map((n) => option(n, n, false)).join("")}</select></label>` : ""}</div>`}<div class="card-actions">${button("Read rules", "reference", `data-id="${r.id}"`, "quiet small")}${button("Add to pack", "equipment", `data-id="${r.id}" ${r.specialOrder ? "disabled" : ""}`, "small")}</div></article>`,
    )
    .join("")}</div>`;
}

function render({ focusHeading = false } = {}) {
  pendingRender = false;
  preview = creationPreview(draft, catalogs.choices, catalogs.inventory);
  const active = document.activeElement,
    key = active?.dataset.field,
    list = active?.dataset.list,
    value = active?.value,
    id = active?.id;
  const position =
    active && ["text", "search"].includes(active.type)
      ? active.selectionStart
      : null;
  const scroll = window.scrollY;
  app.innerHTML = header() + (mode === "builder" ? builder() : sheet());
  app.removeAttribute("aria-busy");
  const replacement = key
    ? [...app.querySelectorAll("[data-field]")].find(
        (e) => e.dataset.field === key,
      )
    : list
      ? [...app.querySelectorAll("[data-list]")].find(
          (e) => e.dataset.list === list && e.value === value,
        )
      : id
        ? document.getElementById(id)
        : null;
  if (focusHeading) $("#panel-title")?.focus({ preventScroll: true });
  else if (replacement) {
    replacement.focus({ preventScroll: true });
    if (position !== null && replacement.setSelectionRange)
      replacement.setSelectionRange(position, position);
  }
  window.scrollTo(0, scroll);
}
function set(path, value) {
  const keys = path.split(".");
  let target = draft;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)] = value;
}
function getValue(path) {
  return path.split(".").reduce((value, key) => value?.[key], draft);
}
function updateField(target) {
  if (target.dataset.field) {
    let value = target.value;
    if (
      target.type === "number" ||
      target.dataset.field.endsWith(".pair") ||
      target.dataset.field.endsWith(".meleeHands")
    )
      value = Number(value);
    if (
      target.type === "number" &&
      (!Number.isInteger(value) ||
        value < Number(target.min) ||
        value > Number(target.max))
    ) {
      notice("Choose a whole number within the displayed range.");
      render();
      return;
    }
    set(target.dataset.field, value);
  } else if (target.dataset.list) {
    const values = [...(getValue(target.dataset.list) ?? [])];
    set(
      target.dataset.list,
      target.checked
        ? [...new Set([...values, target.value])]
        : values.filter((v) => v !== target.value),
    );
  } else if (target.dataset.recipe) {
    const r = get(target.dataset.recipe),
      values = [...selectionFor(r).recipeIds];
    values[Number(target.dataset.slot)] = target.value;
    recipeSelections[r.id] = values;
  } else return;
  persist();
  // A field change can fire between pointer-down and click on Continue. Keep
  // that button in the DOM until its click runs, instead of swallowing the click.
  if (pointerDown) pendingRender = true;
  else render();
}
function exportFile(ready = false) {
  const content = writePortableCharacter(draft, catalogs, { ready });
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    draft.name
      .trim()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .slice(0, 80) || "new-hero"
  }.hol.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice(
    ready
      ? "Character exported. Import it through Create a Hero in Foundry."
      : "Character draft exported.",
  );
}
function learn(id) {
  const r = get(id),
    selection = selectionFor(r),
    result = purchaseEligibility(
      r,
      preview.stages[stage()],
      catalogs.choices,
      selection,
    );
  if (!result.eligible)
    throw new Error(result.reasons.map((r) => r.text).join(" "));
  draft.purchases[stage()].push({ id, ...selection });
  notice(`${r.name} added.`);
}
function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function markdown(text) {
  return text
    .replace(/^# .+\n/, "")
    .split(/\n\s*\n/)
    .filter((p) => !/^\*\*ID:\*\*/.test(p))
    .map((p) => {
      if (/^#{1,6} /.test(p))
        return `<h3>${inline(p.replace(/^#{1,6} /, ""))}</h3>`;
      if (/^[-*] /.test(p))
        return `<ul>${p
          .split("\n")
          .map((v) => `<li>${inline(v.replace(/^[-*] /, ""))}</li>`)
          .join("")}</ul>`;
      if (p.startsWith("|"))
        return `<div class="table-wrap"><table>${p
          .split("\n")
          .filter((v) => !/^\|[\s:|-]+$/.test(v))
          .map(
            (v) =>
              `<tr>${v
                .split("|")
                .slice(1, -1)
                .map((c) => `<td>${inline(c.trim())}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</table></div>`;
      return `<p>${inline(p).replace(/\n/g, " ")}</p>`;
    })
    .join("");
}
function showReference(id) {
  const r = get(id);
  if (!r) throw new Error("This reference is not in the current catalog.");
  let body;
  if (r.reference) {
    const { flavor, rules } = r.reference;
    body =
      flavor.map((t) => `<p class="flavor">${esc(t)}</p>`).join("") +
      `<h3>Rules</h3><dl>${rules.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}</dl>` +
      rules.body
        .map((b) =>
          b.outcomes
            ? b.outcomes
                .map(
                  (o) =>
                    `<div class="outcome"><strong>${esc(o.label)}</strong>${esc(o.text)}</div>`,
                )
                .join("")
            : b.items
              ? `<ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
              : `<p>${esc(b.text)}</p>`,
        )
        .join("") +
      (rules.notes ?? [])
        .map((n) => `<p><strong>${esc(n.label)}</strong> ${esc(n.text)}</p>`)
        .join("");
  } else
    body = markdown(
      references.records[id]?.markdown ??
        "This reference is unavailable in this build.",
    );
  $("#reference").innerHTML =
    `<header><h2 id="reference-title">${esc(r.name)}</h2>${button("Close", "close-reference", "", "quiet")}</header><div class="reference-body">${body}</div>`;
  $("#reference").showModal();
  $("#reference").scrollTop = 0;
}
async function action(target) {
  const a = target.dataset.action;
  if (a === "reference") return showReference(target.dataset.id);
  if (a === "close-reference") return $("#reference").close();
  if (a === "import") return $("#import-file").click();
  if (a === "export" || a === "ready-export")
    return exportFile(a === "ready-export");
  if (a === "new") {
    if (
      !isExample &&
      !confirm(
        "Start a new hero? Export your current draft first if you want to keep it.",
      )
    )
      return;
    draft = newCreationDraft();
    isExample = false;
    mode = "builder";
    step = 0;
    edit = false;
  }
  if (a === "more") visibleChoices[target.dataset.group] += 8;
  if (a === "edit") edit = !edit;
  if (a === "tab") {
    tab = target.dataset.tab;
    query = "";
    filter = "all";
    visibleChoices = { true: 6, false: 4 };
  }
  if (a === "builder") {
    mode = "builder";
    edit = false;
  }
  if (a === "sheet") {
    mode = "sheet";
    edit = false;
  }
  if (a === "review") {
    mode = "builder";
    step = 7;
  }
  if (a === "step") step = Number(target.dataset.step);
  if (a === "back") step = Math.max(0, step - 1);
  if (a === "next") step = Math.min(7, step + 1);
  if (["step", "back", "next"].includes(a)) {
    query = "";
    filter = "all";
    visibleChoices = { true: 6, false: 4 };
  }
  if (a === "ancestry") draft.ancestryId = target.dataset.id;
  if (a === "class") {
    const r = get(target.dataset.id);
    if (!classEligibility(r, draft.attributes).eligible) return;
    draft.classId = r.id;
  }
  if (a === "signature") draft.signatureId = target.dataset.id;
  if (a === "purchase") learn(target.dataset.id);
  if (a === "remove-purchase")
    draft.purchases[stage()].splice(Number(target.dataset.index), 1);
  if (a === "remove-equipment")
    draft.shopping.splice(Number(target.dataset.index), 1);
  if (a === "equipment") {
    const r = get(target.dataset.id),
      quantity = Number($(`#quantity-${r.id}`).value),
      hands = Number($(`#hands-${r.id}`)?.value ?? 0);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
      throw new Error("Choose a positive whole quantity, up to 10,000.");
    if (r.specialOrder || r.price * quantity > preview.inventory.remainingCoins)
      throw new Error("There are not enough starting coins for this purchase.");
    draft.shopping.push({ id: r.id, quantity, hands });
  }
  persist();
  render({
    focusHeading: [
      "tab",
      "step",
      "next",
      "back",
      "builder",
      "sheet",
      "review",
      "new",
    ].includes(a),
  });
  if (a === "tab")
    document.getElementById(`tab-${tab}`)?.focus({ preventScroll: true });
}
document.addEventListener("click", (event) => {
  const t = event.target.closest("[data-action]");
  if (t && !t.disabled) action(t).catch((e) => notice(e.message));
});
document.addEventListener("pointerdown", () => {
  pointerDown = true;
});
for (const name of ["pointerup", "pointercancel"])
  document.addEventListener(name, () => {
    pointerDown = false;
    setTimeout(() => {
      if (pendingRender) render();
    }, 0);
  });
app.addEventListener("change", (event) => {
  if (event.target.id === "filter") {
    filter = event.target.value;
    render();
  } else updateField(event.target);
});
app.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    query = event.target.value;
    visibleChoices = { true: 6, false: 4 };
    render();
  }
});
app.addEventListener("keydown", (event) => {
  if (
    event.target.getAttribute("role") !== "tab" ||
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(event.key)
  )
    return;
  event.preventDefault();
  const i = tabs.indexOf(tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (i +
            (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
            tabs.length) %
          tabs.length;
  action({ dataset: { action: "tab", tab: tabs[next] } });
});
app.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-choice]");
  if (card?.dataset.eligible === "true")
    event.dataTransfer.setData("application/x-hol-choice", card.dataset.choice);
});
app.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (zone) {
    event.preventDefault();
    zone.classList.add("drag-over");
  }
});
app.addEventListener("dragleave", (event) =>
  event.target.closest("[data-drop]")?.classList.remove("drag-over"),
);
app.addEventListener("drop", (event) => {
  if (!event.target.closest("[data-drop]")) return;
  event.preventDefault();
  try {
    learn(event.dataTransfer.getData("application/x-hol-choice"));
    persist();
    render();
  } catch (e) {
    notice(e.message);
  }
});
$("#import-file").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_CHARACTER_BYTES)
      throw new Error("Character file is too large.");
    const result = readPortableCharacter(await file.text(), catalogs);
    if (
      !isExample &&
      !confirm("Replace this browser draft with the imported character?")
    )
      return;
    draft = result.draft;
    mode = "builder";
    step = 7;
    isExample = false;
    edit = false;
    persist();
    render({ focusHeading: true });
    notice("Character imported. Review your choices.");
  } catch (e) {
    notice(e.message);
  } finally {
    event.target.value = "";
  }
});
try {
  const load = async (name) => {
    const r = await fetch(`data/${name}.json`);
    if (!r.ok) throw new Error(`Could not load ${name}.`);
    return r.json();
  };
  const [choices, inventory, refs, sample] = await Promise.all([
    load("choices"),
    load("inventory"),
    load("references"),
    load("example"),
  ]);
  if (
    choices.sourceCommit !== inventory.sourceCommit ||
    refs.sourceCommit !== choices.sourceCommit
  )
    throw new Error("The workshop catalogs do not use the same rules edition.");
  catalogs = {
    choices: choices.records,
    inventory,
    commit: choices.sourceCommit,
  };
  references = refs;
  example = sample;
  draft = structuredClone(example);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (saved) {
      draft = readPortableCharacter(saved.character, catalogs).draft;
      mode = saved.mode === "builder" ? "builder" : "sheet";
      tab = tabs.includes(saved.tab) ? saved.tab : "Encounter";
      step = Number.isInteger(saved.step)
        ? Math.max(0, Math.min(7, saved.step))
        : 0;
      isExample = Boolean(saved.isExample);
    }
  } catch {
    notice(
      "The saved draft could not be opened. It has not been overwritten; export a new draft only when you are ready.",
    );
  }
  render();
} catch (e) {
  app.removeAttribute("aria-busy");
  app.innerHTML = `<div class="loading"><h1>Could not open the workshop</h1><p>${esc(e.message)}</p><p>Reload the page to try again.</p></div>`;
}
