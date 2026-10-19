import {
  equipmentEligibility,
  isUniversalAbility,
} from "./rules/equipment-eligibility.mjs";
import { abilityHeaderBadges } from "./rules/workshop-card-view.mjs";
import {
  rolledWorkshopWound,
  workshopSupplyUse,
  workshopSpendGrit,
  workshopWoundDetails,
  workshopTreatWound,
  workshopResupply,
  workshopConditionDamage,
  workshopFavorites,
} from "./rules/workshop-resources.mjs";
import { DAMAGE_TYPES } from "./rules/damage.mjs";
import { HEALING_POTION_IDS } from "./rules/potions.mjs";
import {
  workshopVitals,
  workshopDeathResult,
} from "./rules/workshop-vitals.mjs";
import { itemArrangement } from "./rules/workshop-play.mjs";
import { CONDITION_KINDS, conditionRollSources } from "./rules/conditions.mjs";
import {
  workshopCharacter,
  emptyLevelDraft,
  mainActions,
  actionTiming,
  craftingActions,
} from "./rules/workshop-character.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { newCreationDraft } from "./rules/creation.mjs";
import { ATTRIBUTES } from "./rules/character.mjs";
import {
  DEFAULT_LANGUAGES,
  campaignLanguageOptions,
  additionalLanguageOptions,
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
  "Main",
  "Abilities",
  "Inventory",
  "Recipes",
  "Character",
  "Development",
];
const sheetTabs = () =>
  tabs.filter((t) => t !== "Recipes" || preview.state.recipes.length > 0);
const storageKey = "hol.workshop.v1";
const libraryKey = "hol.workshop.library.v1";
let saveId = null;
let signatureTier = 1;
let catalogs,
  references,
  example,
  draft,
  preview,
  mode = "sheet",
  tab = "Main",
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
  const dialog = $("#reference");
  if (dialog?.open) {
    let message = dialog.querySelector(".dialog-notice");
    if (!message) {
      message = document.createElement("p");
      message.className = "dialog-notice";
      message.setAttribute("role", "status");
      dialog.querySelector(".reference-body").append(message);
    }
    message.textContent = text;
  }
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
  Main: '<path d="m4 3 13 13m-2 3 4-4M3 4l1 5 4-1M20 3 7 16m-2-1 4 4m12-15-1 5-4-1"/>',
  Abilities:
    '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  Inventory:
    '<path d="M8 6V4a4 4 0 0 1 8 0v2M7 6h10l3 5v10H4V11zM4 13h16M9 13v3h6v-3"/>',
  Recipes: '<path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"/>',
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
  return `<div class="panel-heading"><h2 tabindex="-1" id="panel-title">${esc(label)}</h2>${action}</div>`;
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
        saveId,
        signatureTier,
        editingLevel,
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
const diceIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
const skullIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 19H6v-4C0 10 5 2 12 2s12 8 6 13v4h-2v3H8zM12 18v4M9 18v4M15 18v4"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><path d="m12 13-1 3h2z"/></svg>';
function rollButton(label, extra) {
  return button(
    diceIcon,
    "open-roll",
    `aria-label="Roll ${esc(label)}" title="Roll ${esc(label)}" ${extra}`,
    "icon-button roll-button",
  );
}
function liveVitals() {
  return workshopVitals(preview, draft, catalogs.wounds);
}
function header() {
  const stats = preview.summary,
    vitals = liveVitals();
  return `<div class="workshop-header"><div class="toolbar"><div class="toolbar-group">${button(edit ? "✓ Done" : "✎ Edit", "edit", `aria-pressed="${edit}"`, edit ? "selected" : "quiet")}</div><div class="toolbar-group">${button("New", "new", 'aria-label="New hero"', "quiet")}${button("Save", "save", 'aria-label="Save character"', "quiet")}${button("Load", "library", 'aria-label="Load character"', "quiet")}${button("Import", "import", 'aria-label="Import JSON"', "quiet")}${button("Export", "export", 'aria-label="Export JSON"', "quiet")}</div></div>
  <header class="hero-header"><div class="identity-line"><img class="hero-mark" src="assets/crest.webp" alt=""><div><div class="name-line">${edit && mode === "sheet" ? field("Character name", "name", draft.name, "text", 'maxlength="200"') : `<h1>${esc(draft.name || "New hero")}</h1>`}${button(skullIcon + (vitals.failed ? `<span>${vitals.failed}</span>` : ""), "death-roll", `aria-label="Death roll; ${vitals.failed} failed" title="Death roll · ${vitals.failed} failed"`, "icon-button death-button")}</div><p>${esc(join([get(draft.ancestryId)?.name, get(draft.culture?.id)?.name, get(draft.background?.id)?.name, get(draft.classId)?.name, `Level ${preview.development.level}(${preview.development.current})`]))}</p></div></div><div class="vitals"><div class="vital"><small>HP</small><strong class="hp-value"><input aria-label="Current HP" data-field="play.hp" type="number" min="0" max="${vitals.max}" step="1" value="${vitals.hp}"><span>/ ${vitals.max || "—"}</span></strong></div><div class="vital"><small>${button("Grit", "use-grit", 'aria-label="Use Grit"', "vital-link")}</small><strong>${vitals.grit}</strong></div><div class="vital"><small>Speed</small><strong data-speed>${vitals.speed}${vitals.speed < vitals.maxSpeed ? ` / ${vitals.maxSpeed}` : ""}</strong></div><div class="vital"><small>${button("Wounds", "roll-wound-dialog", 'aria-label="Roll a new wound"', "vital-link")}</small><strong data-wound-count>${vitals.wounds.length}</strong></div><div class="vital"><small>Armor DR</small><strong>${preview.resistances.physical ?? 0}</strong></div></div></header>
  <div class="attributes">${ATTRIBUTES.map((key) => `<div class="attribute"><span>${title(key)}</span>${rollButton(title(key), `data-attribute-key="${key}"`)}<strong data-attribute="${key}">${signed(draft.attributes[key])}</strong></div>`).join("")}</div></div>`;
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
  const badges = abilityHeaderBadges(r);
  const summary =
    r.reference?.flavor?.[0] ??
    (r.kind === "discipline" ? `Develop your training in ${r.name}.` : "");
  return `<article class="choice-card ${eligible ? "" : "unavailable"}" data-choice="${r.id}" data-eligible="${eligible}" draggable="${learning && eligible}"><div class="card-top">${r.kind === "ability" && !r.universal ? `<span class="tier" title="Available from level ${r.minimumLevel}"><span>${r.minimumLevel}</span></span>` : ""}<h3>${esc(r.name)}</h3><div class="card-badges">${r.kind === "ability" && badges.codes.length ? `<span class="action-code" aria-label="${esc(badges.action)}" title="${esc(badges.action)}">${badges.codes.join("/")}</span>` : ""}${r.kind === "discipline" ? symbol(r.id) : badges.disciplines.map((req) => `<span class="discipline-badge" data-requirement="${esc(req.id)}" title="${esc(name(req.id))} ${req.rank}">${symbol(req.id)}${req.rank > 1 ? `<span class="discipline-rank" aria-label="Requires rank ${req.rank}">${req.rank}</span>` : ""}</span>`).join("")}</div></div><div class="card-meta">${action ? `<span>${esc(action)}</span>` : ""}${requirements.map((req) => `<span>${esc(name(req.id))} ${req.rank}</span>`).join("")}${rank ? `<span>Rank ${rank}</span>` : ""}</div>${summary ? `<p class="card-copy">${esc(summary)}</p>` : ""}${reasons.length ? `<p class="requirement">${reasons.map((r) => esc(r.text)).join(" ")}</p>` : ""}<div class="card-actions">${button("Read rules", "reference", `data-id="${r.id}"`, "quiet small")}${learning ? button(`${cost ?? "—"} DP · Learn`, "purchase", `data-id="${r.id}" ${eligible ? "" : "disabled"}`, "small") : ""}</div>${learning && r.purchasePolicy === "new-recipe" ? recipeSelects(r) : ""}</article>`;
}
function knownCards() {
  return [...new Set(preview.state.abilities)].map(get).filter(Boolean);
}
function searchRow(kind = "abilities") {
  return `<div class="search-row"><label>Search ${kind}<input id="search" type="search" value="${esc(query)}" placeholder="Name, discipline or keyword…" autocomplete="off"></label>${
    kind === "abilities"
      ? `<label>Discipline<select id="filter">${option("all", "All", filter === "all")}${option("universal", "Universal", filter === "universal")}${catalogs.choices
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
      (filter === "universal" && isUniversalAbility(r)) ||
      r.id === filter ||
      r.requirements?.some((v) => v.id === filter))
  );
}
function sheet() {
  const visibleTabs = sheetTabs();
  if (!visibleTabs.includes(tab)) tab = "Main";
  return `<div class="sheet-body"><nav class="edge-tabs" role="tablist" aria-label="Character sheet" aria-orientation="vertical">${visibleTabs.map((t) => button(navIcon(t, t), "tab", `id="tab-${t}" aria-label="${t}" role="tab" aria-selected="${tab === t}" aria-controls="panel" tabindex="${tab === t ? 0 : -1}" data-tab="${t}"`)).join("")}</nav><section id="panel" class="panel sheet-panel sheet-${tab.toLowerCase()}" role="tabpanel" aria-labelledby="tab-${tab}">${sheetContent()}</section></div>`;
}
function disciplineTable() {
  const known = Object.entries(preview.state.ranks)
    .filter(([, rank]) => rank > 0)
    .sort(([a], [b]) => name(a).localeCompare(name(b)));
  const cells = ([id, rank]) =>
    `<td>${button(esc(name(id)), "reference", `data-id="${esc(id)}"`, "table-link")}</td><td>${rank}</td>`;
  const rows = [];
  for (let i = 0; i < known.length; i += 2)
    rows.push(
      `<tr>${cells(known[i])}${known[i + 1] ? cells(known[i + 1]) : "<td></td><td></td>"}</tr>`,
    );
  return `<section class="known-disciplines"><h3>Known disciplines</h3><table class="discipline-table" aria-label="Known disciplines"><thead><tr><th scope="col">Discipline</th><th scope="col">Rank</th><th scope="col">Discipline</th><th scope="col">Rank</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="4">None</td></tr>'}</tbody></table></section>`;
}
function sheetContent() {
  if (tab === "Main") return mainPanel();
  if (tab === "Abilities")
    return `${disciplineTable()}${searchRow()}<div id="results">${[
      "Main Action",
      "Maneuver",
      "Reaction",
      "Passive",
      "Other",
    ]
      .map((group) => {
        const entries = knownCards()
          .filter(matches)
          .filter((record) => {
            const timing = actionTiming(record);
            return group === "Other"
              ? timing.includes("Other") || timing.includes("Movement")
              : timing.includes(group);
          })
          .map((record) => ({ record, basic: false, visible: true }));
        return `<section class="action-group" data-ability-group="${group}"><h3>${group}</h3>${entries.length ? actionTable(entries, false) : "<small>None</small>"}</section>`;
      })
      .join(
        "",
      )}</div><details class="planned"><summary>Basic actions</summary>${actionTable(
      catalogs.choices
        .filter((r) => r.universal)
        .map((record) => ({ record, basic: true, visible: true })),
      false,
    )}</details>`;
  if (tab === "Inventory")
    return `${heading("", "Inventory", "", button("Add item", "add-item", "", "small"))}${inventoryStats()}${inventoryTable(true)}`;
  if (tab === "Recipes") return `${heading("", "Recipes", "")}${recipeRows()}`;
  if (tab === "Character")
    return `${heading("", "Character", "")}<div class="columns"><section class="box"><h3>Origins</h3>${row("Ancestry", name(draft.ancestryId))}${row("Culture", name(draft.culture?.id))}${row("Background", name(draft.background?.id))}</section><section class="box"><h3 class="section-controls">Languages ${button("Add", "add-language", 'aria-label="Add language"', "small")}</h3>${languageTable()}</section></div>${collapsible("story", "Story", `<label class="story-editor"><textarea aria-label="Story" data-field="profile.story" maxlength="10000" placeholder="Write your character’s story…">${esc(draft.profile?.story ?? "")}</textarea></label>`)}${woundTable()}`;
  const dev = preview.development;
  return `${heading("", "Development", "")}<section class="box development-training"><h3 class="section-controls">Training ${button("Edit creation", "review", "", "small quiet")}</h3><div class="development-summary"><div class="level-control"><span>Level</span>${button("−", "level-down", 'aria-label="Decrease level"')}<strong>${dev.level}</strong>${button("+", "level-up", 'aria-label="Increase level"')}</div><div><small>Current DP</small><strong data-dp="current">${dev.current}</strong></div><div><small>DP spent</small><strong data-dp="spent">${dev.spent}</strong></div><div><small>Total DP</small><strong data-dp="total">${dev.total}</strong></div></div><div class="training-footer"><small>Each new level grants 8 + level DP. Unspent advancement DP carries forward.</small>${button("Spend DP", "advance", dev.current > 0 || draft.progression?.levels?.[dev.level]?.purchases?.length ? "" : "disabled", "primary small")}</div></section>${collapsible("signatures", "Class signatures", signatureProgress())}${
    preview.errors.filter((e) => e.level && e.code !== "signature").length
      ? `<section class="box"><h3>Choices to finish</h3><ul class="error-list">${preview.errors
          .filter((e) => e.level && e.code !== "signature")
          .map(
            (e) =>
              `<li>Level ${e.level}: ${esc(e.text ?? (e.reasons ?? []).map((r) => r.text).join(" "))}</li>`,
          )
          .join("")}</ul></section>`
      : ""
  }${collapsible("advancement-history", "Advancement history", advancementTable())}${collapsible("creation-ledger", "Creation ledger", ledgerTable() + (dev.expired ? `<small>${dev.expired} unspent creation DP expired.</small>` : ""), "", "box", false)}`;
}
function signatureProgress() {
  const cls = get(draft.classId),
    missing = missingSignatures();
  if (cls?.kind !== "class")
    return '<p class="empty">Choose a class to see its signatures.</p>';
  return `<div class="table-wrap"><table class="signature-progress"><thead><tr><th>Level</th><th>Signature</th><th></th></tr></thead><tbody>${[
    1, 3, 7,
  ]
    .map((tier) => {
      const id = cls.signatures[tier].find((id) =>
        preview.state.abilities.includes(id),
      );
      return `<tr><td>${tier}</td><td>${id ? button(esc(name(id)), "reference", `data-id="${id}"`, "table-link") : tier > preview.development.level ? "Available at level " + tier : "Choose a signature"}</td><td>${missing.includes(tier) ? button(`Choose level ${tier} signature`, "choose-signature", `data-tier="${tier}"`, "small") : id ? '<span class="signature-complete">✓</span>' : "—"}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function brief(record) {
  const body = record.reference?.rules.body ?? [];
  const outcome = body.find((b) => b.outcomes)?.outcomes;
  if (outcome) return outcome.map((o) => `${o.label}: ${o.text}`).join(" · ");
  return body.find((b) => b.text)?.text ?? record.reference?.flavor?.[0] ?? "";
}
function attributeFor(record) {
  // The universal opportunity is one Basic Melee, using that action's printed roll.
  if (record?.id === "ability-opportunity-attack")
    return attributeFor(get("ability-basic-melee"));
  const text =
    record.reference?.rules.details.find((d) => d.label === "Attribute")
      ?.value ?? "";
  return ATTRIBUTES.find((key) => text.toLowerCase().startsWith(key)) ?? null;
}
function favorite(kind, id) {
  const active = draft.play?.favorites?.[kind]?.includes(id) ?? false;
  return button(
    active ? "★" : "☆",
    "favorite",
    `data-kind="${kind}" data-id="${esc(id)}" aria-label="${active ? "Unfavorite" : "Favorite"} ${esc(kind === "abilities" ? name(id) : name(preview.inventory.items.find((i) => i.instanceId === id)?.catalogId))}" aria-pressed="${active}"`,
    "star-button",
  );
}
function collapsible(
  key,
  label,
  body,
  extra = "",
  style = "box",
  initiallyOpen = true,
) {
  return `<details class="${style} play-section" data-collapse="${key}" ${(draft.play?.collapsed?.[key] ?? !initiallyOpen) ? "" : "open"}><summary><h3>${esc(label)}</h3>${extra}</summary>${body}</details>`;
}
function itemUseButton(item) {
  return button(
    diceIcon,
    "use-supply-dialog",
    `data-instance="${esc(item.instanceId)}" aria-label="Use ${esc(name(item.catalogId))}" title="Use ${esc(name(item.catalogId))}"`,
    "icon-button",
  );
}
function resupplyButton(item) {
  return button(
    "↥",
    "resupply-dialog",
    `data-instance="${esc(item.instanceId)}" aria-label="Resupply ${esc(name(item.catalogId))}" title="Resupply"`,
    "icon-button",
  );
}
function supplyRows() {
  return (
    preview.inventory.items
      .filter(
        (i) =>
          i.carried && i.inventoryDie !== null && i.inventoryDie !== undefined,
      )
      .map(
        (i) =>
          `<div class="stat-row"><span>${esc(name(i.catalogId))}</span><strong>${i.inventoryDie ? `d${i.inventoryDie}` : "Empty"}${i.inventoryDie && i.quantity ? itemUseButton(i) : ""}${resupplyButton(i)}</strong></div>`,
      )
      .join("") || "<small>No supplies carried.</small>"
  );
}
function actionTable(entries, customize = edit) {
  return `<div class="table-wrap"><table class="action-table"><thead><tr><th>Action</th><th>Attribute</th><th>Effect</th>${customize ? "<th>Show</th>" : ""}</tr></thead><tbody>${entries
    .filter((e) => e.visible || customize)
    .map(
      (e) =>
        `<tr class="${e.visible ? "" : "hidden-action"}"><td><div class="action-name">${tab === "Abilities" ? favorite("abilities", e.record.id) : ""}${button(esc(e.record.name), "reference", `data-id="${e.record.id}"`, "table-link")}${e.inventoryInstance ? (e.inventoryInstance.quantity > 0 && e.inventoryInstance.inventoryDie > 0 ? itemUseButton(e.inventoryInstance) : "") : e.record.id === "ability-use-a-healing-potion" ? button(diceIcon, "potion-dialog", 'aria-label="Use a healing potion" title="Use a healing potion"', "icon-button") : attributeFor(e.record) ? rollButton(e.record.name, `data-id="${e.record.id}"`) : ""}</div>${e.favoriteRow ? `<small class="item-source">${esc(actionTiming(e.record).join(" / "))}${e.sourceItems.length ? ` · ${e.sourceItems.map((i) => esc(name(i.catalogId))).join(", ")}` : ""}</small>` : e.basic ? '<small class="basic-tag">Basic</small>' : ""}</td><td>${esc(attributeFor(e.record) ? title(attributeFor(e.record)) : "—")}</td><td><span class="brief" title="${esc(brief(e.record))}">${esc(brief(e.record))}</span></td>${customize ? `<td>${e.basic ? `<input type="checkbox" data-basic="${e.record.id}" aria-label="Show ${esc(e.record.name)}" ${e.visible ? "checked" : ""}>` : ""}</td>` : ""}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function passiveTable(entries) {
  return `<table class="passive-table"><tbody>${
    entries
      .filter((e) => e.visible || edit)
      .map(
        (e) =>
          `<tr><td><div class="section-controls">${button(esc(e.record.name), "reference", `data-id="${esc(e.record.id)}"`, "table-link")}${edit && e.basic ? `<input type="checkbox" data-basic="${e.record.id}" aria-label="Show ${esc(e.record.name)}" ${e.visible ? "checked" : ""}>` : ""}</div><span class="brief" title="${esc(brief(e.record))}">${esc(brief(e.record))}</span></td></tr>`,
      )
      .join("") || "<tr><td><small>None</small></td></tr>"
  }</tbody></table>`;
}
function mainPanel() {
  const actions = mainActions(preview, draft, catalogs);
  const groups = ["Main Action", "Maneuver", "Reaction", "Movement", "Other"];
  const groupKeys = [
    "main-action",
    "maneuver",
    "reaction",
    "movement",
    "other",
  ];
  const favorites = workshopFavorites(preview, draft, catalogs);
  const left =
    collapsible(
      "favorites",
      "Favorites",
      favorites.length
        ? actionTable(favorites, false)
        : "<small>Star abilities or inventory items to keep their actions here.</small>",
      "",
      "action-group favorite-actions",
    ) +
    groups
      .map((group, index) => {
        const entries = actions.filter((e) =>
          actionTiming(e.record).includes(group),
        );
        if (!entries.some((e) => e.visible || edit)) return "";
        const toggle =
          edit && entries.some((e) => e.basic)
            ? `<label class="inline-toggle"><input type="checkbox" data-basic-group="${group}" ${entries.filter((e) => e.basic).every((e) => e.visible) ? "checked" : ""}> Basic actions</label>`
            : "";
        return collapsible(
          `actions-${groupKeys[index]}`,
          group,
          actionTable(entries),
          toggle,
          "action-group",
        );
      })
      .join("");
  const traits = `<table class="trait-table"><tbody>${draft.traitIds.map((id) => `<tr><td>${button(esc(name(id)), "reference", `data-id="${esc(id)}"`, "table-link")}<span class="brief">${esc(traitBrief(id))}</span></td></tr>`).join("")}</tbody></table>`;
  const defenses =
    row("Armor / physical DR", preview.resistances.physical ?? 0) +
    Object.entries(preview.resistances)
      .filter(([k]) => k !== "physical")
      .map(([k, v]) => row(`${title(k)} resistance`, v))
      .join("") +
    preview.passiveSources
      .map((p) => `<small>${esc(p.label)}</small>`)
      .join("");
  const v = liveVitals();
  const carrying =
    row(
      "Speed",
      `${v.speed}${v.speed < v.maxSpeed ? ` / ${v.maxSpeed}` : ""} squares`,
    ) +
    row(
      "Bulk / capacity",
      `${preview.inventory.bulk} / ${preview.inventory.capacity}`,
    ) +
    row("Encumbrance", preview.inventory.encumbrance) +
    row("Base stability", preview.summary?.stability ?? 0);
  return `<div class="main-layout"><div class="action-groups">${left}</div><aside class="play-summary">${collapsible("passives", "Passives", passiveTable(actions.filter((e) => actionTiming(e.record).includes("Passive"))))}${collapsible("ancestry-traits", "Ancestry traits", traits)}${collapsible("defenses", "Defenses", defenses, button("Evade", "evade", 'aria-label="Evade"', "small"))}${conditionBar()}${collapsible("movement-carrying", "Movement & carrying", carrying)}${collapsible("supplies", "Supplies", supplyRows())}</aside></div>`;
}
function traitBrief(id) {
  return (
    references.records[id]?.markdown
      .split("## Rules")[1]
      ?.split(/\n\s*\n/)
      .find((p) => p.trim() && !p.startsWith("**")) ?? ""
  )
    .replace(/\*|\[|\]\([^)]*\)/g, "")
    .trim();
}
function recipeRows() {
  const actions = craftingActions(preview, catalogs);
  const rows = [...new Set(preview.state.recipes)].flatMap((id) => {
    const recipe = get(id);
    if (!recipe) return [];
    const usable = actions.filter((action) => action.recipe.id === id);
    return usable.length ? usable : [{ recipe }];
  });
  return rows.length
    ? `<div class="table-wrap"><table class="recipe-table"><thead><tr><th>Recipe</th><th>Crafting ability</th><th>Attempt</th><th>Roll</th></tr></thead><tbody>${rows.map(({ recipe, ability, attribute }) => `<tr><td>${button(esc(recipe.name), "reference", `data-id="${recipe.id}"`, "table-link")}</td><td>${ability ? button(esc(ability.name), "reference", `data-id="${ability.id}"`, "table-link") : recipe.permissions.map((id) => button(esc(name(id)), "reference", `data-id="${esc(id)}"`, "table-link")).join(", ") + '<small class="item-source">Not learned</small>'}</td><td>${recipe.attemptMinutes} min</td><td>${ability && attributeFor(ability) ? button(esc(attribute), "recipe-roll", `data-id="${ability.id}" data-recipe-id="${recipe.id}"`, "small") : "—"}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty">No recipes learned.</p>';
}
function inventoryStats(starting = false) {
  if (starting)
    return `<div class="inventory-stats"><span><strong>${preview.creation.inventory.remainingCoins}</strong> coins</span><span><strong>${preview.creation.inventory.bulk} / ${preview.inventory.capacity}</strong> Bulk</span><span>Encumbrance <strong>${Math.max(0, preview.creation.inventory.bulk - preview.inventory.capacity)}</strong></span></div>`;
  return `<div class="inventory-stats"><span><strong>${preview.inventory.remainingCoins}</strong> coins</span><span><strong>${preview.inventory.bulk} / ${preview.inventory.capacity}</strong> Bulk</span><span>Encumbrance <strong>${preview.inventory.encumbrance}</strong></span><span>Speed <strong>${liveVitals().speed}</strong></span><span>Armor DR <strong>${preview.resistances.physical ?? 0}</strong></span></div>`;
}
function inventoryTable(controls = false) {
  const items = controls
    ? preview.inventory.items
    : preview.creation.inventory.items.map((item) => ({
        ...item,
        carried: true,
        bulk: get(item.catalogId).bulk * item.quantity,
        inventoryDie: item.inventoryDie ?? get(item.catalogId).inventoryDie,
      }));
  const purchaseRemoval = (item) =>
    item.source === "coins" &&
    draft.shopping.some((p) => p.instanceId === item.instanceId)
      ? button(
          "×",
          "remove-equipment",
          `data-instance="${esc(item.instanceId)}" aria-label="Remove purchased ${esc(name(item.catalogId))}"`,
          "quiet small",
        )
      : "";
  const source = (item) =>
    item.source === "coins"
      ? "Purchased"
      : item.source === "creation"
        ? "Starting outfit"
        : item.source === "play"
          ? "Added"
          : name(item.source);
  return `<div class="table-wrap"><table class="inventory-table"><thead><tr><th>Item</th><th>Qty</th><th>Bulk</th><th>Supply</th>${controls ? "<th>Held</th><th>Worn</th><th>Carried</th><th></th>" : '<th>Source</th><th aria-label="Remove purchase"></th>'}</tr></thead><tbody>${items.map((item) => `<tr data-instance="${esc(item.instanceId)}" class="${item.carried ? "" : "stored-item"}"><td>${controls ? favorite("items", item.instanceId) : ""}${button(esc(name(item.catalogId)), "reference", `data-id="${esc(item.catalogId)}"`, "table-link")}${controls ? `<small class="item-source">${esc(source(item))}</small>` : ""}</td><td>${controls ? `<input type="number" class="quantity-input" data-quantity="${esc(item.instanceId)}" aria-label="Quantity ${esc(name(item.catalogId))}" min="0" max="10000" step="1" value="${item.quantity}">` : item.quantity}</td><td>${item.bulk}</td><td>${item.inventoryDie ? `d${item.inventoryDie}` : item.inventoryDie === 0 ? "Empty" : "—"}${controls && item.inventoryDie && item.quantity ? itemUseButton(item) : ""}${controls && item.inventoryDie !== null && item.inventoryDie !== undefined ? button("↥", "resupply-dialog", `data-instance="${esc(item.instanceId)}" aria-label="Resupply ${esc(name(item.catalogId))}" title="Resupply"`, "icon-button") : ""}</td>${controls ? ["held", "worn", "carried"].map((prop) => `<td><input type="checkbox" data-loadout="${esc(item.instanceId)}" data-prop="${prop}" aria-label="${prop === "held" ? "Hold" : prop === "worn" ? "Wear" : "Carry"} ${esc(name(item.catalogId))}" ${item[prop] ? "checked" : ""}></td>`).join("") + `<td>${button("×", "delete-item", `data-instance="${esc(item.instanceId)}" aria-label="Delete ${esc(name(item.catalogId))}"`, "quiet small")}</td>` : `<td>${esc(source(item))}</td><td>${purchaseRemoval(item)}</td>`}</tr>`).join("")}</tbody></table></div>`;
}
function advancementTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Level</th><th>Entry</th><th>DP</th></tr></thead><tbody>${preview.advancementLedger.map((e) => `<tr><td>${e.level}</td><td>${esc(e.kind === "award" ? "Level award" : name(e.id))}</td><td>${signed(e.delta)}</td></tr>`).join("")}</tbody></table></div>`;
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
    "Inventory",
    "Review",
  ];
  return `<div class="wizard"><nav class="edge-tabs" aria-label="Creation steps">${steps.map((label, i) => button(navIcon(icons[i], `${i + 1}. ${label}`), "step", `aria-label="${i + 1} ${label}" ${step === i ? 'aria-current="step"' : ""} data-step="${i}"`)).join("")}</nav><div class="wizard-body">${requiredChoicesBanner()}${contextStrip()}<section id="panel" class="panel" aria-labelledby="panel-title">${builderContent()}</section><footer class="wizard-footer">${button(step ? "← Back" : "View sheet", step ? "back" : "sheet")}<small>${storageAvailable ? "Draft saved in this browser" : "Export JSON to keep your draft"}</small>${step < 7 ? button("Continue →", "next", "", "primary") : button("View character sheet", "sheet", "", "primary")}</footer></div></div>`;
}
function builderContent() {
  if (step === 0)
    return `${heading("Step 1 of 8", "Identity & attributes", "Start with a name and six attributes. You can revisit every choice.")}<div class="field-grid">${field("Character name", "name", draft.name, "text", 'maxlength="200"')}</div><h3 class="section-title" style="margin-top:14px">Your attributes</h3><p class="inline-help">Assign −2 to +2 to each attribute, totaling +3. Each creation DP pool is 10 + Knowledge + Reason + Guile.</p><div class="field-grid" style="margin-top:10px">${ATTRIBUTES.map((key) => field(title(key), `attributes.${key}`, draft.attributes[key], "number", 'min="-2" max="2" step="1"')).join("")}</div><div class="callout" style="margin-top:10px">Assigned total: <strong>${signed(Object.values(draft.attributes).reduce((a, b) => a + b, 0))} / +3</strong></div>`;
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
      )}</div><h3 class="section-title" style="margin-top:14px">Choose two traits</h3><div class="cards">${(ancestry?.traits ?? []).map((id) => choiceCheck(id, "traitIds", draft.traitIds)).join("") || '<p class="empty">Choose an ancestry to see its traits.</p>'}</div>${draft.traitIds.includes("trait-elf-age-of-memory") ? field("Remembered community", "rememberedCommunity", draft.rememberedCommunity) : ""}<div style="margin-top:12px">${select("Home language", "languages.home", option("", "Choose a home language", !draft.languages.home) + options.home.map((l) => option(l.id, `${l.name}${l.reason ? ` — ${l.reason}` : ""}`, l.selected, l.disabled)).join(""))}</div>${draft.traitIds.includes("trait-human-many-homes") ? `<h3 class="section-title" style="margin-top:12px">Two additional spoken languages</h3><div class="cards">${options.extraSpoken.map((l) => `<label class="check"><input type="checkbox" data-list="languages.extraSpoken" value="${l.id}" ${l.selected ? "checked" : ""} ${l.disabled ? "disabled" : ""}><span>${l.name}<small>${esc(l.reason || l.summary)}</small></span></label>`).join("")}</div>` : ""}${staleSelections("traitIds", ancestry?.traits ?? [])}`;
  }
  if (step === 2)
    return `${heading("", "Culture & background", "")}<div class="origin-grid">${[
      "culture",
      "background",
    ]
      .map(
        (kind) =>
          `<section class="box"><label>${title(kind)}<select aria-label="${title(kind)}" data-origin="${kind}">${option("", `Choose ${kind} and grants`, !draft[kind]?.id)}${catalogs.choices
            .filter((r) => r.originType === kind)
            .flatMap((r) =>
              r.pairs.map((pair, index) =>
                option(
                  `${r.id}|${index}`,
                  `${r.name} — ${name(pair.disciplineId)} 1 + ${name(pair.abilityId)}`,
                  draft[kind]?.id === r.id && draft[kind]?.pair === index,
                ),
              ),
            )
            .join("")}</select></label>${
            draft[kind]?.id
              ? (() => {
                  const pair = get(draft[kind].id)?.pairs?.[draft[kind].pair];
                  return `<div class="origin-grants">${button(esc(name(draft[kind].id)), "reference", `data-id="${esc(draft[kind].id)}"`, "table-link")}${pair ? `<div>${symbol(pair.disciplineId)}${esc(name(pair.disciplineId))} 1</div>${button(esc(name(pair.abilityId)), "reference", `data-id="${pair.abilityId}"`, "table-link")}` : ""}</div>`;
                })()
              : ""
          }</section>`,
      )
      .join(
        "",
      )}</div><p class="inline-help">Each selection grants the named discipline rank and ability. A duplicate grant adds 1 DP.</p>`;
  if ([3, 5].includes(step)) return learning();
  if (step === 4) {
    const cls = catalogs.choices.find(
      (r) => r.kind === "class" && r.id === draft.classId,
    );
    return `${heading("Step 5 of 8", "Class", "Classes you qualify for appear first. Then choose two starting disciplines and one signature.")}<div class="cards">${eligibleFirst(
      catalogs.choices.filter((r) => r.kind === "class"),
      (r) => classEligibility(r, draft.attributes),
    )
      .map(
        (e) =>
          `<article class="choice-card ${e.eligible ? "" : "unavailable"} ${draft.classId === e.choice.id ? "chosen" : ""}"><h3>${e.choice.name}</h3><p class="card-meta">+${e.choice.hp} HP · +${e.choice.coins} coins</p><p class="requirement">${e.reasons.map((r) => esc(r.text)).join(" ") || "You meet the requirements."}</p><div class="card-actions">${button("Read class", "reference", `data-id="${e.choice.id}"`, "quiet small")}${button(draft.classId === e.choice.id ? "Selected" : "Choose", "class", `data-id="${e.choice.id}" ${e.eligible ? "" : "disabled"}`, "small")}</div></article>`,
      )
      .join(
        "",
      )}</div>${cls ? `<h3 class="section-title" style="margin-top:14px">Two starting disciplines</h3><div class="cards">${cls.startingDisciplines.map((id) => choiceCheck(id, "classDisciplines", draft.classDisciplines, (preview.stages[0].ranks[id] ?? 0) > 0)).join("")}</div><h3 class="section-title" style="margin-top:14px">Your first signature</h3><div class="cards">${cls.signatures[1].map((id) => `<article class="choice-card ${draft.signatureId === id ? "chosen" : ""}"><h3>${esc(name(id))}</h3><p class="card-copy">${esc(get(id)?.reference?.flavor?.[0])}</p><div class="card-actions">${button("Read signature", "reference", `data-id="${esc(id)}"`, "quiet small")}${button(draft.signatureId === id ? "Selected" : "Choose", "signature", `data-id="${esc(id)}"`, "small")}</div></article>`).join("")}</div>${staleSelections("classDisciplines", cls.startingDisciplines)}` : ""}`;
  }
  if (step === 6) return equipment();
  return `${heading("Step 8 of 8", "Review", preview.valid ? "Your character is ready. Export the file and import it through Create a Hero in Foundry." : "A few choices still need attention. Your draft is saved, and every step remains available.")}${
    preview.valid
      ? `<div class="callout"><h3>${preview.development.level > 1 ? "Character plan ready" : "Creation complete"}</h3><p>${esc(draft.name)} · ${esc(name(draft.ancestryId))} ${esc(name(draft.classId))}</p></div>`
      : `<ul class="error-list">${errors()
          .map((e) => `<li>${esc(e)}</li>`)
          .join("")}</ul>`
  }<div class="columns" style="margin-top:12px"><section class="box"><h3>Your character</h3>${row("Maximum HP", preview.summary?.maximumHp ?? "—")}${row("Grit", preview.summary?.gritGranted ?? "—")}${row("Speed", preview.summary?.speed ?? "—")}${row("Learned abilities", preview.state.abilities.length)}${row("Coins", preview.inventory.remainingCoins)}</section><section class="box"><h3>Take your hero with you</h3>${button("Export character JSON", "ready-export", preview.valid ? "" : "disabled", "primary")}<p class="file-hint">${preview.development.level > 1 ? "Save or export this plan to continue here. Foundry import currently supports level-1 creation." : "In Foundry: open a new character → Create a Hero → Import character JSON. Review with your campaign’s language settings, then complete creation."}</p>${button("Save draft JSON", "export", "", "quiet")}</section></div><details class="planned"><summary>Creation ledger</summary>${ledgerTable()}</details>`;
}
function choiceCheck(id, list, values, owned = false) {
  return `<div class="check ${owned ? "already-owned" : ""}"><label style="display:flex;gap:10px;flex:1"><input type="checkbox" data-list="${list}" value="${esc(id)}" ${values.includes(id) ? "checked" : ""} ${owned && !values.includes(id) ? "disabled" : ""}><span>${esc(name(id))}${owned ? "<small>Already known</small>" : ""}</span></label>${button("Read", "reference", `data-id="${esc(id)}"`, "quiet small")}</div>`;
}
function staleSelections(list, valid) {
  const stale = draft[list].filter((id) => !valid.includes(id));
  return stale.length
    ? `<div class="callout" style="margin-top:10px"><p>These choices belong to your earlier selection. Remove them to finish this step.</p>${stale.map((id) => choiceCheck(id, list, draft[list])).join("")}</div>`
    : "";
}
function stage() {
  return step === 3 ? 0 : 1;
}
function recipeSelects(r) {
  const study = recipeStudyChoices(learningState(), catalogs.inventory.recipes);
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
          recipeStudyChoices(learningState(), catalogs.inventory.recipes)
            .defaultRecipeIds,
      }
    : {};
}
function learningMarket() {
  const state = learningState();
  const options = eligibleFirst(
    catalogs.choices.filter(
      (r) => r.kind === "ability" && !r.universal && matches(r),
    ),
    (r) => purchaseEligibility(r, state, catalogs.choices, selectionFor(r)),
  );
  const disciplineOptions = eligibleFirst(
    catalogs.choices.filter((r) => r.kind === "discipline"),
    (r) => purchaseEligibility(r, state, catalogs.choices, selectionFor(r)),
  );
  const disciplineCards = [true, false]
    .map((eligible) => {
      const entries = disciplineOptions.filter((e) => e.eligible === eligible);
      return entries.length
        ? `<div class="group-label">${eligible ? "Available to learn" : "Not available yet"} · ${entries.length}</div>${entries.map((e) => abilityCard(e.choice, { ...e, learning: true })).join("")}`
        : "";
    })
    .join("");
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
  return pickerKind === "discipline"
    ? `<section data-learning-list="discipline"><div class="cards">${disciplineCards}</div></section>`
    : `${searchRow()}<section data-learning-list="ability"><div class="cards" id="results">${groups || '<p class="empty">No matching abilities.</p>'}</div></section>`;
}
let pickerKind = null;
let editingLevel = null;
const activeLearningLevel = () => editingLevel ?? preview.development.level;
function learning() {
  const controls = `<div class="build-controls">${button("Learn abilities", "open-picker", 'data-kind="ability"', "primary small")}${mode === "advancement" || stage() ? button("Learn discipline", "open-picker", 'data-kind="discipline"', "small") : ""}</div>`;
  return `<div class="learning-heading">${heading("", mode === "advancement" ? `Level ${activeLearningLevel()} learning` : stage() ? "Heroic learning" : "Early learning", "", controls)}</div>${currentBuild()}`;
}

function currentBuild() {
  const advancement = mode === "advancement",
    heroic = advancement || stage() === 1;
  const state = learningState();
  const early = new Set(preview.stages[0].abilities);
  const entries = [];
  for (const id of state.abilities) {
    const currentIndex = learningPurchases().findIndex((p) => p.id === id);
    const locked = advancement
      ? preview.levels[activeLearningLevel()].before.abilities.includes(id)
      : heroic && early.has(id);
    let source = locked
      ? advancement
        ? "Earlier levels"
        : "Early learning"
      : currentIndex >= 0
        ? "Learned"
        : "Granted";
    for (const kind of ["culture", "background"]) {
      const origin = get(draft[kind]?.id);
      if (origin?.pairs?.[draft[kind]?.pair]?.abilityId === id)
        source = name(origin.id);
    }
    if (id === draft.signatureId) source = name(draft.classId);
    entries.push({ id, currentIndex, locked, source });
  }
  for (const [index, p] of learningPurchases().entries())
    if (get(p.id)?.kind === "discipline")
      entries.push({
        id: p.id,
        currentIndex: index,
        locked: false,
        source: `Rank ${state.ranks[p.id] ?? ""}`,
      });
  return `<section class="box current-build"><h3>Current Build</h3><ul>${entries.map((e) => `<li class="build-entry ${e.locked ? "build-locked" : ""}" data-build-id="${esc(e.id)}"><div class="build-row"><div>${button(esc(name(e.id)), "reference", `data-id="${esc(e.id)}"`, "table-link")}<small>${esc(e.source)}${e.locked ? " · Locked" : ""}</small></div>${!e.locked && e.currentIndex >= 0 ? button("Remove", "remove-purchase", `data-index="${e.currentIndex}"`, "small quiet") : ""}</div>${!e.locked ? acquisitions(true, e.id) : ""}</li>`).join("") || '<li class="empty">Learn an ability to begin.</li>'}</ul></section>`;
}
function openPicker(kind) {
  if (kind === "discipline" && mode !== "advancement" && !stage()) return;
  pickerKind = kind;
  query = "";
  filter = "all";
  visibleChoices = { true: 6, false: 4 };
  renderPicker();
  $("#picker").showModal();
}
function pickerReferences() {
  if (pickerKind === "equipment") return "";
  const state = learningState();
  const ranks = Object.entries(state.ranks).filter(([, rank]) => rank > 0);
  const purchases = [
    ...draft.purchases[0],
    ...(mode === "advancement" || stage() ? draft.purchases[1] : []),
    ...(mode === "advancement"
      ? Object.entries(draft.progression?.levels ?? {})
          .filter(([level]) => Number(level) <= activeLearningLevel())
          .flatMap(([, d]) => d.purchases ?? [])
      : []),
  ];
  const ids = [...new Set(purchases.map((p) => p.id))].filter(
    (id) => get(id)?.kind === "ability" && state.abilities.includes(id),
  );
  return `<div class="picker-reference"><div class="picker-disciplines" aria-label="Known disciplines">${ranks.map(([id, rank]) => `<span class="chip">${symbol(id)}${esc(name(id))} ${rank}</span>`).join("") || "No disciplines yet"}</div>${pickerKind === "ability" ? `<div class="purchased-abilities"><strong>Purchased abilities</strong><div>${ids.map((id) => button(esc(name(id)), "reference", `data-id="${esc(id)}"`, "reference-chip")).join("") || "<small>None yet</small>"}</div></div>` : ""}</div>`;
}
function renderPicker() {
  if (!pickerKind) return;
  const dialog = $("#picker"),
    scroll = dialog.querySelector(".picker-body")?.scrollTop ?? 0;
  const active = document.activeElement,
    id = active?.id,
    pos = active?.selectionStart;
  dialog.innerHTML = `<header><h2 id="picker-title">${pickerKind === "equipment" ? "Buy inventory items" : pickerKind === "discipline" ? "Learn disciplines" : "Learn abilities"}</h2>${button("Close", "close-picker", 'aria-label="Close selection"', "small")}</header><div class="picker-balance">${pickerKind === "equipment" ? `${preview.inventory.remainingCoins} coins remaining${preview.inventory.overBudget ? ` · ${preview.inventory.overBudget} over budget` : ""}` : `${learningState().dp} DP remaining`}</div>${pickerReferences()}<div class="picker-body">${pickerKind === "equipment" ? equipmentMarket() : learningMarket()}</div>`;
  dialog.querySelector(".picker-body").scrollTop = scroll;
  if (id && dialog.querySelector(`#${id}`)) {
    const replacement = dialog.querySelector(`#${id}`);
    replacement.focus({ preventScroll: true });
    if (typeof pos === "number" && replacement.setSelectionRange)
      replacement.setSelectionRange(pos, pos);
  }
}
$("#picker").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  pickerKind = null;
  $("#picker").close();
});
$("#picker").addEventListener("close", () => {
  if (!$("#picker").open) pickerKind = null;
});

function acquisitionPath(id) {
  return mode === "signature" && signatureTier > 1
    ? `progression.levels.${signatureTier}.acquisitions.${id}`
    : mode === "advancement"
      ? `progression.levels.${activeLearningLevel()}.acquisitions.${id}`
      : `acquisitions.${id}`;
}
function requiredChoicesBanner() {
  const pending = preview.errors.filter((e) => e.code === "acquisition");
  if (!pending.length) return "";
  return `<aside class="choice-alert" role="status" aria-label="Missing choices"><strong>Choices needed</strong><ul>${pending.map((e) => `<li>${button(`<b>${esc(name(e.id))}</b> · ${esc((e.reasons ?? []).map((r) => r.text).join(" "))}`, "locate-choice", `data-id="${esc(e.id)}" data-level="${e.level ?? 0}"`, "table-link")}</li>`).join("")}</ul></aside>`;
}
function acquisitions(onlyMissing = false, onlyId = null) {
  const classSignatures = Object.values(
    catalogs.choices.find((r) => r.kind === "class" && r.id === draft.classId)
      ?.signatures ?? {},
  ).flat();
  const state =
    mode === "advancement" || [3, 5].includes(step)
      ? learningState()
      : preview.creation.state;
  return (
    mode === "signature"
      ? [selectedSignature()].filter(Boolean)
      : state.abilities
  )
    .filter(
      (id) =>
        mode !== "advancement" ||
        (!classSignatures.includes(id) &&
          !preview.levels[activeLearningLevel()].before.abilities.includes(id)),
    )
    .map((id) => catalogs.inventory.acquisitions.find((a) => a.id === id))
    .filter(
      (a) =>
        a &&
        (a.weaponChoice ||
          a.recipeChoices ||
          a.languageChoice ||
          a.specialtyChoice ||
          a.items.includes("item-ordinary-melee-weapon")),
    )
    .map((a) => {
      if (onlyId && a.id !== onlyId) return "";
      const path = acquisitionPath(a.id),
        d = getValue(path) ?? {},
        missing = preview.errors.some(
          (e) =>
            e.code === "acquisition" &&
            e.id === a.id &&
            (e.level ?? null) ===
              (mode === "advancement"
                ? activeLearningLevel()
                : mode === "signature" && signatureTier > 1
                  ? signatureTier
                  : null),
        );
      if (onlyMissing && !missing) return "";
      return `<details class="planned acquisition-choice ${missing ? "choice-missing" : ""}" data-acquisition="${esc(a.id)}" ${missing ? "open" : ""}><summary>${esc(name(a.id))} · ${missing ? "Choice needed" : "Choices"}</summary>${
        missing
          ? `<p class="choice-instruction">${preview.errors
              .filter((e) => e.code === "acquisition" && e.id === a.id)
              .flatMap((e) => e.reasons ?? [])
              .map((r) => esc(r.text))
              .join(" ")}</p>`
          : ""
      }<div class="field-grid">${
        a.languageChoice
          ? select(
              "Language",
              `${path}.languageId`,
              option("", "Choose language", !d.languageId) +
                additionalLanguageOptions(
                  DEFAULT_LANGUAGES,
                  mode === "advancement"
                    ? preview.play.languages
                    : state.languages,
                  d.languageId,
                  a.id,
                )
                  .map((l) =>
                    option(
                      l.id,
                      `${l.name}${l.reason ? ` · ${l.reason}` : ""}`,
                      l.selected,
                      l.disabled,
                    ),
                  )
                  .join(""),
            )
          : ""
      }${a.specialtyChoice ? field("Performance specialty", `${path}.specialty`, d.specialty, "text", 'maxlength="120" placeholder="e.g. singing or juggling"') : ""}${a.weaponChoice ? select("Weapon", `${path}.weapon`, option("", "Choose weapon", !d.weapon) + a.weaponChoice.map((id) => option(id, id === "melee" ? "Ordinary melee weapon" : id === "ranged" ? "Ranged weapon + d8 ammunition" : name(id), d.weapon === id)).join("")) : ""}${a.items.includes("item-ordinary-melee-weapon") || (a.weaponChoice?.includes("melee") && d.weapon === "melee") ? select("Melee weapon hands", `${path}.meleeHands`, option("", "Choose hands", !d.meleeHands) + [1, 2].map((n) => option(n, `${n} handed`, d.meleeHands === n)).join("")) : ""}</div>${
        a.recipeChoices
          ? `<p class="inline-help">Choose ${a.recipeChoices} recipes</p><div class="cards">${catalogs.inventory.recipes
              .filter((r) => r.genericChoice && r.permissions.includes(a.id))
              .map((r) => choiceCheck(r.id, `${path}.recipes`, d.recipes ?? []))
              .join("")}</div>`
          : ""
      }</details>`;
    })
    .join("");
}
function equipment() {
  return `${heading("", "Equipment", "", button("Buy inventory items", "open-picker", 'data-kind="equipment"', "primary small"))}${inventoryTable()}`;
}
function equipmentMarket() {
  return `${searchRow("equipment")}<div class="table-wrap"><table class="market-table"><thead><tr><th>Item</th><th>Coins</th><th>Bulk</th><th>Supply</th><th>Qty</th><th>Hands</th><th></th></tr></thead><tbody>${catalogs.inventory.equipment
    .filter(matches)
    .map(
      (r) =>
        `<tr class="${equipmentEligibility(r.id, preview.state.abilities).eligible ? "" : "unavailable"}"><td>${button(esc(r.name), "reference", `data-id="${r.id}"`, "table-link")}${equipmentEligibility(r.id, preview.state.abilities).eligible ? "" : `<small class="item-source">Requires ${esc(name(equipmentEligibility(r.id, preview.state.abilities).requiredAbilityId))}</small>`}</td><td>${r.price}</td><td>${r.bulk}</td><td>${r.inventoryDie ? `d${r.inventoryDie}` : "—"}</td><td><input aria-label="Quantity ${esc(r.name)}" type="number" id="quantity-${r.id}" min="1" max="10000" value="1" step="1"></td><td>${r.handChoices.length ? `<select aria-label="Hands ${esc(r.name)}" id="hands-${r.id}">${r.handChoices.map((n) => option(n, n, false)).join("")}</select>` : "—"}</td><td>${r.specialOrder ? "<small>Special order</small>" : button("Buy", "equipment", `data-id="${r.id}" ${equipmentEligibility(r.id, preview.state.abilities).eligible ? "" : "disabled"}`, "small")}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function levelDraft(level = activeLearningLevel()) {
  draft.progression ??= { level: 1, levels: {} };
  return (draft.progression.levels[level] ??= emptyLevelDraft());
}
function learningState() {
  return mode === "advancement"
    ? preview.levels[activeLearningLevel()].state
    : preview.stages[stage()];
}
function learningPurchases() {
  return mode === "advancement"
    ? levelDraft().purchases
    : draft.purchases[stage()];
}
function contextStrip() {
  if (mode === "advancement" || [3, 5].includes(step)) {
    const state = learningState();
    return `<div class="context-strip"><strong data-dp-remaining>${state.dp} DP remaining</strong><span>Level ${mode === "advancement" ? activeLearningLevel() : stage()}</span><div class="discipline-strip" aria-label="Current disciplines">${
      Object.entries(state.ranks)
        .map(
          ([id, rank]) =>
            `<span class="chip">${symbol(id)}${esc(name(id))} ${rank}</span>`,
        )
        .join("") ||
      "<small>Choose origins to receive starting disciplines.</small>"
    }</div></div>`;
  }
  if (step === 6)
    return `<div class="context-strip">${inventoryStats(true)}</div>`;
  return "";
}
function missingSignatures() {
  const cls = catalogs.choices.find(
    (r) => r.kind === "class" && r.id === draft.classId,
  );
  return cls
    ? [1, 3, 7].filter(
        (tier) =>
          tier <= preview.development.level &&
          (!cls.signatures[tier].some((id) =>
            preview.state.abilities.includes(id),
          ) ||
            preview.errors.some(
              (e) =>
                e.code === "acquisition" && cls.signatures[tier].includes(e.id),
            )),
      )
    : [];
}
function learningFrame(content, label = "Spend DP") {
  return `<div class="wizard"><nav class="edge-tabs" aria-label="Development">${button(navIcon("Development", "Development"), "sheet-development", 'aria-label="Development"')}${button(navIcon(mode === "signature" ? "Heroic" : "Abilities", label), mode === "signature" ? "choose-signature" : "advance", `aria-label="${esc(label)}" data-tier="${signatureTier}" aria-current="step"`)}</nav><div class="wizard-body">${requiredChoicesBanner()}${mode === "signature" ? "" : contextStrip()}<section id="panel" class="panel">${content}</section><footer class="wizard-footer">${button("Back to development", "sheet-development")}<small>Choices saved automatically</small>${button("Done", "sheet-development", "", "primary")}</footer></div></div>`;
}
function advancementBuilder() {
  if (preview.development.level < 2) {
    mode = "sheet";
    tab = "Development";
    return sheet();
  }
  return learningFrame(
    learning() +
      (preview.errors.some(
        (e) => e.level === activeLearningLevel() && e.code !== "signature",
      )
        ? `<ul class="error-list">${preview.errors
            .filter(
              (e) =>
                e.level === activeLearningLevel() && e.code !== "signature",
            )
            .map(
              (e) =>
                `<li>${esc(e.text ?? (e.reasons ?? []).map((r) => r.text).join(" "))}</li>`,
            )
            .join("")}</ul>`
        : ""),
  );
}
function selectedSignature() {
  return signatureTier === 1
    ? draft.signatureId
    : levelDraft(signatureTier).signatures[signatureTier];
}
function signatureBuilder() {
  const cls = catalogs.choices.find(
    (r) => r.kind === "class" && r.id === draft.classId,
  );
  if (!cls || signatureTier > preview.development.level) {
    mode = "sheet";
    tab = "Development";
    return sheet();
  }
  const ids = cls.signatures[signatureTier],
    selected = selectedSignature();
  const content = `${heading("", `Choose level ${signatureTier} signature`, "")}<div class="cards">${ids.map((id) => `<article class="choice-card ${selected === id ? "chosen" : ""}"><h3>${esc(name(id))}</h3><p class="card-copy">${esc(get(id).reference.flavor[0])}</p><div class="card-actions">${button("Read", "reference", `data-id="${esc(id)}"`, "small quiet")}${button(selected === id ? "Selected" : "Choose", "advance-signature", `data-id="${esc(id)}" data-tier="${signatureTier}"`, "small")}</div></article>`).join("")}</div><section class="box current-build"><h3>Current Build</h3><ul><li>${selected ? esc(name(selected)) : "Choose a signature"}${acquisitions(true)}</li></ul></section>`;
  return learningFrame(content, `Level ${signatureTier} signature`);
}

function playDraft() {
  draft.play ??= {};
  draft.play.inventory ??= { added: [], removed: [] };
  draft.play.languages ??= { added: [], removed: [] };
  draft.play.conditions ??= [];
  return draft.play;
}
function woundScar(wound) {
  const text =
    workshopWoundDetails(wound, catalogs.wounds).record?.injury ?? wound.name;
  return text.includes(";") ? text.slice(text.indexOf(";") + 1).trim() : text;
}
function currentWoundEffects(wound) {
  return liveVitals()
    .woundEffects.filter((e) => e.id.startsWith(`${wound.id}-`))
    .filter(
      (e) =>
        e.kind !== "condition" ||
        preview.play.conditions.some((c) => c.id === e.id),
    );
}
function healingButton(wound) {
  const d = workshopWoundDetails(wound, catalogs.wounds);
  return d.required === null || d.healed
    ? ""
    : button(
        "Apply healing",
        "heal-wound-dialog",
        `data-id="${esc(wound.id)}" ${d.healed ? "disabled" : ""}`,
        "small",
      );
}
function woundTable() {
  return `<section class="box wound-box"><h3 class="section-controls">Wounds ${button("Add", "add-wound", 'aria-label="Add wound"', "small")}</h3><div class="table-wrap"><table><thead><tr><th>Wound / scar</th><th>Active effects</th><th>Treatment</th><th>Progress</th><th>Apply healing</th><th></th></tr></thead><tbody>${
    liveVitals()
      .wounds.map((w) => {
        const d = workshopWoundDetails(w, catalogs.wounds),
          effects = currentWoundEffects(w);
        return `<tr data-wound="${esc(w.id)}"><td>${button(esc(w.name), "wound-details", `data-id="${esc(w.id)}"`, "table-link")}<small class="item-source">Scar: ${esc(woundScar(w))}</small></td><td>${effects.map((e) => esc(woundEffectLabel(e))).join("; ") || (w.catalogId ? "None" : esc(w.notes))}</td><td>${esc(d.record?.capability ?? "—")}</td><td>${d.required !== null ? `<span>${d.progress} / ${d.required}${d.healed ? " · Healed" : ""}</span>` : `<small>${esc(d.record?.remedy ?? "Manual record")}</small>`}</td><td>${healingButton(w)}</td><td>${button("×", "delete-wound", `data-id="${esc(w.id)}" aria-label="Remove wound ${esc(w.name)}"`, "small quiet")}</td></tr>`;
      })
      .join("") || '<tr><td colspan="6">No wounds recorded.</td></tr>'
  }</tbody></table></div></section>`;
}
function woundDetailsDialog(id) {
  const w = liveVitals().wounds.find((w) => w.id === id);
  if (!w) throw new Error("This wound is no longer recorded.");
  const d = workshopWoundDetails(w, catalogs.wounds);
  popup(
    w.name,
    `<dl class="wound-details"><dt>Scar</dt><dd>${esc(woundScar(w))}</dd><dt>Active effects</dt><dd>${
      currentWoundEffects(w)
        .map((e) => esc(woundEffectLabel(e)))
        .join("; ") || esc(w.catalogId ? "None" : w.notes)
    }</dd><dt>Remedy</dt><dd>${esc(d.record?.remedy ?? w.notes)}</dd><dt>Recovery value</dt><dd>${d.required ?? "—"}</dd><dt>Healing progress</dt><dd>${d.progress}${d.healed ? " · Healed; scar retained" : ""}</dd>${w.roll ? `<dt>Wound roll</dt><dd>${esc(title(w.damageType))} · ${w.roll.faces.join(" · ")} → ${esc(w.roll.key)}</dd>` : ""}</dl><div class="dialog-actions">${healingButton(w)}</div>`,
  );
}
function healWoundDialog(id) {
  const w = liveVitals().wounds.find((w) => w.id === id);
  if (!w) throw new Error("This wound is no longer recorded.");
  const d = workshopWoundDetails(w, catalogs.wounds);
  popup(
    `Heal ${w.name}`,
    `<p>${d.progress} / ${d.required ?? "—"} progress. Reaching the recovery value clears treatable effects; the scar remains.</p><label>Healing progress<select id="healing-progress" aria-label="Healing progress">${[1, 2, 3].map((n) => option(n, `${n} progress`, n === 1)).join("")}</select></label><div class="dialog-actions">${button("Apply healing", "confirm-heal-wound", `data-id="${esc(id)}"`, "primary")}</div>`,
  );
}
function languageTable() {
  return `<table class="language-table"><tbody>${preview.play.languages.map((lang) => `<tr><td>${esc(lang.name)}</td><td>${lang.form === "signed" ? "Signed" : "Spoken"}${lang.permissions.read ? " & written" : ""}</td><td>${button("×", "delete-language", `data-id="${esc(lang.id)}" aria-label="Remove language ${esc(lang.name)}"`, "small quiet")}</td></tr>`).join("") || "<tr><td>No languages</td></tr>"}</tbody></table>`;
}
function conditionBar() {
  return collapsible(
    "conditions",
    "Conditions",
    `<div class="condition-list">${preview.play.conditions.map((c) => `<span class="condition-chip">${esc(title(c.key))}${CONDITION_KINDS[c.key] === "binary" ? "" : ` ${c.rating}${CONDITION_KINDS[c.key] === "duration" ? " turns" : ""}`}${c.persistence === "starred" ? " ★" : ""}${button("−", "adjust-condition", `data-id="${esc(c.id)}" data-delta="-1" aria-label="Decrease ${esc(title(c.key))}"`, "icon-button condition-control")}${CONDITION_KINDS[c.key] !== "binary" ? button("+", "adjust-condition", `data-id="${esc(c.id)}" data-delta="1" aria-label="Increase ${esc(title(c.key))}"`, "icon-button condition-control") : ""}${["burning", "freezing", "bleeding"].includes(c.key) && preview.play.conditions.find((v) => v.key === c.key).id === c.id ? button("Apply", "condition-damage", `data-id="${esc(c.id)}" aria-label="Apply ${esc(title(c.key))} damage" title="Apply combined ${esc(title(c.key))} damage from all sources"`, "small") : ""}${button("×", "delete-condition", `data-id="${esc(c.id)}" aria-label="Remove ${esc(title(c.key))}"`, "quiet small")}</span>`).join("") || "<small>None</small>"}</div>`,
    button("Add", "add-condition", 'aria-label="Add condition"', "small"),
    "box condition-bar",
  );
}
function addItemDialog() {
  popup(
    "Add item",
    `<label>Item<select id="play-item" aria-label="Item">${catalogs.inventory.equipment
      .map((r) => {
        const e = equipmentEligibility(r.id, preview.state.abilities);
        return option(
          r.id,
          `${r.name}${e.eligible ? "" : ` · Requires ${name(e.requiredAbilityId)}`}`,
          false,
          !e.eligible,
        );
      })
      .join(
        "",
      )}</select></label><label>Quantity<input id="play-quantity" type="number" min="1" max="10000" step="1" value="1"></label><div class="dialog-actions">${button("Add item", "confirm-item", "", "primary")}</div>`,
  );
}
function addLanguageDialog() {
  popup(
    "Add language",
    `<label>Language<select id="play-language" aria-label="Language">${option("", "Custom language", true)}${DEFAULT_LANGUAGES.filter(
      (l) => !preview.play.languages.some((k) => k.id === l.id),
    )
      .map((l) => option(l.id, l.name, false))
      .join(
        "",
      )}</select></label><label>Name<input id="language-name" maxlength="80"></label><div class="field-grid"><label>Form<select id="language-form" aria-label="Form">${option("spoken", "Spoken", true)}${option("signed", "Signed", false)}</select></label><label class="inline-toggle"><input id="language-written" type="checkbox" checked> Read & write</label></div><div class="dialog-actions">${button("Add language", "confirm-language", "", "primary")}</div>`,
  );
}
function addConditionDialog() {
  popup(
    "Add condition",
    `<label>Condition<select id="play-condition" aria-label="Condition">${Object.keys(
      CONDITION_KINDS,
    )
      .sort()
      .map((key) => option(key, title(key), false))
      .join(
        "",
      )}</select></label><label id="condition-rating-label">Rating / turns<input id="condition-rating" type="number" min="1" max="10000" step="1" value="1"></label><label id="condition-starred-label" class="inline-toggle"><input id="condition-starred" type="checkbox"> Starred</label><div class="dialog-actions">${button("Add condition", "confirm-condition", "", "primary")}</div>`,
  );
  conditionFields();
}
function conditionFields() {
  const kind = CONDITION_KINDS[$("#play-condition").value];
  $("#condition-rating-label").hidden = kind === "binary";
  $("#condition-starred-label").hidden = ["binary", "maintained"].includes(
    kind,
  );
}
function popup(titleText, body) {
  const dialog = $("#reference");
  dialog.innerHTML = `<header><h2 id="reference-title">${esc(titleText)}</h2>${button("Close", "close-reference", "", "quiet")}</header><div class="reference-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function library() {
  const saved = JSON.parse(localStorage.getItem(libraryKey) ?? "[]");
  if (
    !Array.isArray(saved) ||
    saved.some(
      (r) =>
        !r ||
        typeof r.id !== "string" ||
        typeof r.name !== "string" ||
        !r.character,
    )
  )
    throw new Error(
      "The character library could not be read. Its contents have been preserved.",
    );
  const current = saved.map((entry) => {
    if (
      entry.character.sourceCommit === catalogs.commit &&
      entry.character.draft?.culture?.retainedFrom === undefined &&
      entry.character.draft?.background?.retainedFrom === undefined &&
      !entry.name.endsWith(" (before rules update)")
    )
      return entry;
    try {
      const { draft } = readPortableCharacter(entry.character, catalogs);
      return {
        ...entry,
        name: entry.name.replace(/ \(before rules update\)$/, ""),
        character: JSON.parse(writePortableCharacter(draft, catalogs)),
      };
    } catch {
      return entry;
    }
  });
  if (JSON.stringify(current) !== JSON.stringify(saved))
    localStorage.setItem(libraryKey, JSON.stringify(current));
  return current;
}
function saveDialog() {
  const current = library().find((c) => c.id === saveId);
  popup(
    "Save character",
    `<label>Save name<input id="save-name" maxlength="200" value="${esc(current?.name ?? draft.name ?? "New hero")}"></label><div class="dialog-actions">${button("Save", "save-confirm", "", "primary")}${current ? button("Save a copy", "save-copy") : ""}</div>`,
  );
  $("#save-name").focus();
}
function saveCharacter(copy = false) {
  const label = $("#save-name").value.trim() || draft.name || "New hero";
  const records = library(),
    id = (!copy && saveId) || crypto.randomUUID();
  const entry = {
    id,
    name: label,
    updated: new Date().toISOString(),
    character: JSON.parse(writePortableCharacter(draft, catalogs)),
  };
  const index = records.findIndex((r) => r.id === id);
  if (index < 0) records.push(entry);
  else records[index] = entry;
  localStorage.setItem(libraryKey, JSON.stringify(records));
  saveId = id;
  persist();
  $("#reference").close();
  notice(`Saved ${label} in this browser.`);
}
function libraryDialog() {
  const records = library();
  popup(
    "Saved characters",
    records.length
      ? `<div class="saved-characters">${records.map((r) => `<article><div><strong>${esc(r.name)}</strong><small>${esc(r.character?.draft?.name ?? "")} · Level ${Number(r.character?.draft?.progression?.level ?? 1)}</small></div>${button("Load", "load-saved", `data-id="${esc(r.id)}"`, "small primary")}${button("Delete", "delete-saved", `data-id="${esc(r.id)}"`, "small quiet")}</article>`).join("")}</div>`
      : "<p>No saved characters yet. Use Save to keep a named character in this browser.</p>",
  );
}
function loadSaved(id) {
  const entry = library().find((r) => r.id === id);
  if (!entry) throw new Error("That save is no longer in this browser.");
  const loaded = readPortableCharacter(entry.character, catalogs);
  draft = loaded.draft;
  saveId = id;
  mode = "sheet";
  tab = "Main";
  edit = false;
  isExample = false;
  normalizeShoppingIds();
  persist();
  render({ focusHeading: true });
  $("#reference").close();
  notice(`Loaded ${entry.name}.`);
}
function deleteSaved(id) {
  const records = library(),
    entry = records.find((r) => r.id === id);
  if (!entry || !confirm(`Delete the saved copy of ${entry.name}?`)) return;
  localStorage.setItem(
    libraryKey,
    JSON.stringify(records.filter((r) => r.id !== id)),
  );
  if (saveId === id) {
    saveId = null;
    persist();
  }
  libraryDialog();
}
function normalizeShoppingIds() {
  draft.shopping.forEach((item, index) => {
    if (item.instanceId) return;
    item.instanceId = `shop-${crypto.randomUUID()}`;
    if (draft.loadout?.[`purchase:${index}`]) {
      draft.loadout[item.instanceId] = draft.loadout[`purchase:${index}`];
      delete draft.loadout[`purchase:${index}`];
    }
  });
}
function randomDie(sides) {
  const a = new Uint32Array(1),
    limit = Math.floor(4294967296 / sides) * sides;
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return 1 + (a[0] % sides);
}
function woundEffectLabel(e) {
  if (e.kind === "condition")
    return `${title(e.key)} ${e.rating}${e.persistence === "starred" ? " ★" : ""}`;
  if (e.kind === "movementPenalty") return `Speed −${e.amount}`;
  if (e.kind === "rollModifier")
    return `${e.amount} ${e.polarity}${e.amount > 1 ? "s" : ""}: ${e.printedContext ?? e.context}`;
  if (e.kind === "forcedMovement")
    return `${title(e.direction)} ${e.distance} squares; choose direction and legal placement at the table`;
  return "Last Words";
}
function woundDialog() {
  popup(
    "New wound",
    `<label>Damage type<select id="wound-type" aria-label="Wound damage type">${DAMAGE_TYPES.map((type) => option(type, title(type), type === "physical")).join("")}</select></label><p>${liveVitals().wounds.length} prior wounds · roll ${Math.min(5, 3 + liveVitals().wounds.length)}d6, keep the highest three.</p><div id="wound-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button("Roll wound", "confirm-roll-wound", "", "primary")}</div>`,
  );
}
function rollNewWound() {
  const wounds = (playDraft().wounds ??= []);
  if (wounds.length >= 100)
    throw new Error("The character supports 100 recorded wounds.");
  const prior = wounds.length,
    faces = Array.from({ length: Math.min(5, 3 + prior) }, () => randomDie(6));
  const result = rolledWorkshopWound({
    catalog: catalogs.wounds,
    damageType: $("#wound-type").value,
    priorWounds: prior,
    faces,
    id: `wound-${crypto.randomUUID()}`,
  });
  const conditions = result.effects.filter((e) => e.kind === "condition");
  if (playDraft().conditions.length + conditions.length > 100)
    throw new Error(
      "The character supports 100 conditions. Remove resolved conditions first.",
    );
  wounds.push(result.wound);
  result.effects.forEach((effect, index) => {
    if (effect.kind === "condition")
      playDraft().conditions.push({
        id: `${result.wound.id}-${index}`,
        key: effect.key,
        rating: effect.rating,
        persistence: effect.persistence,
        source: result.wound.name,
      });
    if (effect.kind === "lastWords")
      Object.assign(playDraft(), {
        hp: 0,
        failedDeathRolls: 3,
        lastWords: true,
      });
  });
  persist();
  render();
  $("#wound-roll-result").innerHTML =
    `<p>${faces.join(" · ")} → <strong>${result.wound.roll.key}</strong></p><strong>${esc(result.wound.name)}</strong><p>${result.effects.map((e) => esc(woundEffectLabel(e))).join("; ") || "Scar recorded; no mechanical penalty."}</p><p>${esc(result.wound.notes)}</p>`;
}
function gritDialog() {
  const available = liveVitals().grit;
  popup(
    "Use Grit",
    `<p>Spend 1 Grit to restore HP to ${liveVitals().max} and clear death marks? Wounds remain.</p><p>${available} Grit remaining.${draft.play?.lastWords ? " Ordinary Grit cannot reverse Last Words." : ""}</p><div class="dialog-actions">${button("Cancel", "close-reference")}${button("Spend 1 Grit", "confirm-grit", available > 0 && !draft.play?.lastWords ? "" : "disabled", "primary")}</div>`,
  );
}
function resupplyDialog(instance) {
  const item = preview.inventory.items.find((i) => i.instanceId === instance);
  if (!item) throw new Error("This supply is no longer in inventory.");
  popup(
    `Resupply ${name(item.catalogId)}`,
    `<p>Current supply: ${item.inventoryDie ? `d${item.inventoryDie}` : "Empty"}. Each step restores one die size, up to its original d${get(item.catalogId).inventoryDie}.</p><label>Resupply steps<select id="resupply-steps" aria-label="Resupply steps">${[1, 2, 3, 4, 5, 6].map((n) => option(n, `${n} step${n === 1 ? "" : "s"}`, n === 1)).join("")}</select></label><div class="dialog-actions">${button("Resupply", "confirm-resupply", `data-instance="${esc(instance)}"`, "primary")}</div>`,
  );
}
let supplyInstance = null;
function supplyDialog(instance) {
  const potions = preview.inventory.items.filter(
    (i) =>
      i.carried &&
      i.quantity > 0 &&
      i.inventoryDie > 0 &&
      HEALING_POTION_IDS.includes(i.catalogId),
  );
  const item = instance
    ? preview.inventory.items.find((i) => i.instanceId === instance)
    : null;
  if (instance && (!item || item.inventoryDie < 1 || item.quantity < 1))
    throw new Error("This supply is exhausted.");
  supplyInstance = instance ?? null;
  popup(
    item ? name(item.catalogId) : "Use a healing potion",
    `${item ? `<p>Use this supply, then check d${item.inventoryDie}. A 1 steps it down; the final use still works.</p>` : potions.length ? `<label>Potion<select id="potion-instance" aria-label="Healing potion">${potions.map((i) => option(i.instanceId, `${name(i.catalogId)} · d${i.inventoryDie}`, false)).join("")}</select></label><p>Healing is fixed by the bottle; roll its supply die after use.</p>` : "<p>No carried healing potion with supply remaining.</p>"}<div id="supply-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button("Use & roll supply", "confirm-supply", item || potions.length ? "" : "disabled", "primary")}</div>`,
  );
}
function useSupply() {
  const id = supplyInstance ?? $("#potion-instance")?.value;
  const item = preview.inventory.items.find((i) => i.instanceId === id);
  if (!item || !item.carried || !item.inventoryDie || !item.quantity)
    throw new Error("This supply is exhausted or no longer carried.");
  if (draft.play?.lastWords && HEALING_POTION_IDS.includes(item.catalogId))
    throw new Error("Ordinary healing cannot reverse Last Words.");
  const face = randomDie(item.inventoryDie);
  const result = workshopSupplyUse({
    item,
    face,
    hp: liveVitals().hp,
    maxHp: liveVitals().max,
    catalog: catalogs.inventory,
    lastWords: draft.play?.lastWords ?? false,
  });
  const inv = playDraft().inventory;
  inv.overrides ??= {};
  inv.overrides[id] = { ...inv.overrides[id], inventoryDie: result.after };
  if (result.potion) {
    playDraft().hp = result.hp;
    if (result.hp > 0) playDraft().failedDeathRolls = 0;
  }
  persist();
  render();
  $("#supply-roll-result").innerHTML =
    `<p>${esc(name(item.catalogId))}: d${result.before} → <strong>${face}</strong> · ${result.after ? `d${result.after}` : "Exhausted"}</p>${result.potion ? `<p>Restored ${result.healed} HP · ${result.hp} / ${liveVitals().max}. The final dose still heals.</p>` : "<p>Supply check recorded after use.</p>"}`;
  if (result.exhausted)
    $("#reference [data-action=confirm-supply]").disabled = true;
}
let activeRoll = null;
function deathMarks(value) {
  return `<div class="death-marks" role="group" aria-label="Death marks">${[1, 2, 3].map((n) => button(skullIcon, "death-mark", `data-marks="${n}" aria-label="Set ${n} death mark${n === 1 ? "" : "s"}" aria-pressed="${n <= value}"`, `death-mark ${n <= value ? "filled" : ""}`)).join("")}</div><p class="death-count">Failed death rolls: <strong>${value} / 3</strong></p>`;
}
function refreshDeathMarks(value) {
  $("#death-failures").value = String(value);
  $("#death-mark-display").innerHTML = deathMarks(value);
}
function openSheetRoll({ key, id, death = false, defense = false }) {
  const record = get(id),
    attribute = death ? "fortitude" : (key ?? attributeFor(record));
  if (!ATTRIBUTES.includes(attribute))
    throw new Error("Choose an attribute for this roll.");
  activeRoll = { death, id, defense };
  const failed = liveVitals().failed;
  popup(
    death
      ? "Death roll"
      : defense
        ? "Evade"
        : (record?.name ?? title(attribute)),
    `
    ${death ? `<section class="death-panel"><input id="death-failures" type="hidden" value="${failed}"><div id="death-mark-display">${deathMarks(failed)}</div><div class="death-outcomes"><span><b>Weak</b> +1 mark</span><span><b>Standard</b> No change</span><span><b>Strong</b> Stabilize</span></div><p class="inline-help">Fortitude · Natural 111: two marks · Natural 666: regain 1 HP · Three marks: Last Words</p></section>` : ""}
    ${defense ? '<p class="inline-help">Choose the defense attribute named by the attack. Strong defense takes Weak attack effects; Weak defense takes Strong attack effects.</p>' : ""}
    <label>Attribute<select id="sheet-roll-attribute" aria-label="Roll attribute">${(death ? ["fortitude"] : ATTRIBUTES).map((k) => option(k, `${title(k)} ${signed(draft.attributes[k])}`, k === attribute)).join("")}</select></label>
    <div class="roll-net"><label for="recipe-net" class="roll-net-labels"><span>Banes</span><output id="roll-net-value">Even</output><span>Boons</span></label><input id="recipe-net" aria-label="Banes / Boons" aria-valuetext="Even" type="range" min="-3" max="3" step="1" value="0"></div>
    ${
      death
        ? ""
        : `<details><summary>Abilities</summary><div class="roll-abilities">${knownCards()
            .filter((r) => attributeFor(r) || r.id === id)
            .map(
              (r) =>
                `<label class="inline-toggle"><input type="checkbox" data-roll-ability="${esc(r.id)}" ${r.id === id ? "checked" : ""}>${esc(r.name)}</label>`,
            )
            .join(
              "",
            )}</div><small>Choose applicable abilities; adjust the attribute and net Boons/Banes above.</small></details>`
    }
    ${
      !death && liveVitals().woundEffects.some((e) => e.kind === "rollModifier")
        ? `<details><summary>Wound effects</summary>${liveVitals()
            .woundEffects.filter((e) => e.kind === "rollModifier")
            .map(
              (e) =>
                `<label class="inline-toggle"><input type="checkbox" data-wound-net="${e.polarity === "boon" ? e.amount : -e.amount}">${esc(e.injury)} · ${esc(woundEffectLabel(e))}</label>`,
            )
            .join("")}</details>`
        : ""
    }
    <div id="recipe-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button("Roll", "roll-sheet", "", "primary")}</div>${record ? `<details><summary>Ability rules</summary>${markdown(references.records[id]?.markdown ?? "")}</details>` : ""}`,
  );
  const automatic = conditionRollSources(preview.play.conditions, {
    mode: death ? "death" : defense ? "defense" : "attribute",
    perceivedSources: [],
  });
  const net = Math.max(
    -3,
    Math.min(
      3,
      automatic.reduce(
        (n, s) => n + (s.kind === "boon" ? s.amount : -s.amount),
        0,
      ),
    ),
  );
  $("#recipe-net").value = String(net);
  $("#recipe-net").dispatchEvent(new Event("input", { bubbles: true }));
}
function rollSheetDice() {
  const key = $("#sheet-roll-attribute").value;
  const failed = activeRoll.death ? Number($("#death-failures").value) : 0;
  if (!Number.isInteger(failed) || failed < 0 || failed > 3)
    throw new Error("Use 0–3 failed death rolls.");
  const result = displayDice(draft.attributes[key]);
  if (activeRoll.defense)
    $("#recipe-roll-result").insertAdjacentHTML(
      "beforeend",
      `<p>${title(result.tier)} defense · read the ${result.tier === "weak" ? "Strong" : result.tier === "strong" ? "Weak" : "Standard"} attack effects.</p>`,
    );
  const selected = [
    ...document.querySelectorAll("[data-roll-ability]:checked"),
  ].map((e) => name(e.dataset.rollAbility));
  if (selected.length)
    $("#recipe-roll-result").insertAdjacentHTML(
      "beforeend",
      `<p>${selected.map(esc).join(" · ")}</p>`,
    );
  if (activeRoll.death && draft.play?.lastWords) {
    $("#recipe-roll-result").insertAdjacentHTML(
      "beforeend",
      "<p>Last Words remains; an ordinary death roll cannot reverse it.</p>",
    );
    return;
  }
  if (activeRoll.death) {
    const marks = Number($("#death-failures").value);
    if (!Number.isInteger(marks) || marks < 0 || marks > 3)
      throw new Error("Use 0–3 failed death rolls.");
    const play = playDraft();
    const death = workshopDeathResult({
      failed: marks,
      hp: liveVitals().hp,
      retained: result.retained,
      fortitude: draft.attributes[key],
    });
    play.failedDeathRolls = death.failed;
    play.hp = death.hp;
    const outcome = death.outcome;
    refreshDeathMarks(play.failedDeathRolls);
    $("#recipe-roll-result").insertAdjacentHTML(
      "beforeend",
      `<p>${outcome} Failed death rolls: ${play.failedDeathRolls}.</p>`,
    );
    persist();
    render();
  }
}
function recipeRoll(id, recipeId) {
  const ability = get(id),
    recipe = get(recipeId),
    attribute = attributeFor(ability);
  if (
    !attribute ||
    !preview.state.abilities.includes(id) ||
    !preview.state.recipes.includes(recipeId)
  )
    throw new Error("Choose a known recipe and its learned crafting ability.");
  popup(
    `Craft ${recipe.name}`,
    `<p><strong>${esc(ability.name)}</strong> · ${title(attribute)} ${signed(draft.attributes[attribute])} · ${recipe.attemptMinutes} min per attempt</p><div class="roll-net"><label for="recipe-net" class="roll-net-labels"><span>Banes</span><output id="roll-net-value">Even</output><span>Boons</span></label><input id="recipe-net" aria-label="Banes / Boons" aria-valuetext="Even" type="range" min="-3" max="3" step="1" value="0"></div><div id="recipe-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button("Roll", "roll-recipe", `data-id="${esc(id)}"`, "primary")}</div><details><summary>Recipe rules</summary>${markdown(references.records[recipeId]?.markdown ?? "")}</details>`,
  );
}
function rollRecipeDice(id) {
  displayDice(draft.attributes[attributeFor(get(id))]);
}
function displayDice(attribute) {
  const net = Number($("#recipe-net").value);
  const plan = rollPlan({
    attribute,
    boons: Math.max(0, net),
    banes: Math.max(0, -net),
  });
  const faces = Array.from({ length: plan.count }, () => randomDie(6));
  const retained = [...faces]
    .sort((a, b) => (net < 0 ? a - b : b - a))
    .slice(0, 3);
  const result = classifyRoll(retained, plan.attribute);
  $("#recipe-roll-result").innerHTML =
    `<strong>${title(result.tier)} · ${result.total}</strong><p>${faces.join(" · ")} → keep ${retained.join(" + ")} ${signed(plan.attribute)}${result.natural !== "none" ? ` · ${result.natural === "critical" ? "Natural 666: additional benefit" : "Natural 111: complication"}` : ""}</p>`;
  return { ...result, retained };
}
document.addEventListener("change", (event) => {
  if (event.target.dataset.woundNet) {
    const slider = $("#recipe-net");
    slider.value = String(
      Math.max(
        -3,
        Math.min(
          3,
          Number(slider.value) +
            Number(event.target.dataset.woundNet) *
              (event.target.checked ? 1 : -1),
        ),
      ),
    );
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (event.target.id === "death-failures") {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 0 || value > 3) {
      event.target.value = String(liveVitals().failed);
      return;
    }
    playDraft().failedDeathRolls = value;
    persist();
    render();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "recipe-net") {
    const value = Number(event.target.value);
    const label = value
      ? `${Math.abs(value)} ${value < 0 ? "Bane" : "Boon"}${Math.abs(value) === 1 ? "" : "s"}`
      : "Even";
    $("#roll-net-value").textContent = label;
    event.target.setAttribute("aria-valuetext", label);
  }
});

function render({ focusHeading = false } = {}) {
  pendingRender = false;
  preview = workshopCharacter(draft, catalogs);
  const active = document.activeElement,
    identity = Object.entries(active?.dataset ?? {}),
    value = active?.value,
    id = active?.id;
  const position =
    active && ["text", "search"].includes(active.type)
      ? active.selectionStart
      : null;
  const scroll = $("#panel")?.scrollTop ?? 0;
  app.innerHTML =
    header() +
    (mode === "builder"
      ? builder()
      : mode === "advancement"
        ? advancementBuilder()
        : mode === "signature"
          ? signatureBuilder()
          : sheet());
  app.removeAttribute("aria-busy");
  if (pickerKind) renderPicker();
  // Preserve focus through live recalculation, including origin selects and
  // play controls whose identity is not a creation field path.
  const replacement = id
    ? document.getElementById(id)
    : identity.length
      ? [...app.querySelectorAll("button,input,select,textarea")].find(
          (e) =>
            identity.every(([key, value]) => e.dataset[key] === value) &&
            (!active.dataset.list || e.value === value),
        )
      : null;
  if (focusHeading)
    ($("#panel-title") ?? $('[role="tab"][aria-selected="true"]'))?.focus({
      preventScroll: true,
    });
  else if (replacement) {
    replacement.focus({ preventScroll: true });
    if (position !== null && replacement.setSelectionRange)
      replacement.setSelectionRange(position, position);
  }
  if ($("#panel")) $("#panel").scrollTop = focusHeading ? 0 : scroll;
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
  if (target.dataset.origin) {
    const [id, pair] = target.value.split("|");
    if (id)
      draft[target.dataset.origin] = {
        id,
        pair: Number(pair),
      };
    else delete draft[target.dataset.origin];
  } else if (target.dataset.field) {
    let value = target.type === "checkbox" ? target.checked : target.value;
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
    if (target.dataset.field === "play.hp" && value > 0) {
      playDraft().failedDeathRolls = 0;
      playDraft().lastWords = false;
    }
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
  notice(ready ? "Character exported." : "Character draft exported.");
}
function learn(id) {
  const r = get(id),
    selection = selectionFor(r),
    result = purchaseEligibility(
      r,
      learningState(),
      catalogs.choices,
      selection,
    );
  if (!result.eligible)
    throw new Error(result.reasons.map((r) => r.text).join(" "));
  learningPurchases().push({ id, ...selection });
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
  const specialty = preview.state.specialties?.find(
    (entry) => entry.abilityId === id,
  )?.specialty;
  if (specialty)
    body = `<p><strong>Your specialty:</strong> ${esc(specialty)}</p>` + body;
  if (id === "ability-message-by-heart" && preview.state.abilities.includes(id))
    body =
      `<label>Memorized message<textarea id="memorized-message" aria-label="Memorized message" maxlength="5000">${esc(draft.play?.memorizedMessage ?? "")}</textarea></label><p class="inline-help">Up to 50 words. Rehearse a replacement for one minute.</p><div class="dialog-actions">${button("Save message", "save-message", "", "primary")}</div>` +
      body;
  $("#reference").innerHTML =
    `<header><h2 id="reference-title">${esc(r.name)}</h2>${button("Close", "close-reference", "", "quiet")}</header><div class="reference-body">${body}</div>`;
  $("#reference").showModal();
  $("#reference").scrollTop = 0;
}
async function action(target) {
  const a = target.dataset.action;
  if (a === "wound-details") return woundDetailsDialog(target.dataset.id);
  if (a === "heal-wound-dialog") return healWoundDialog(target.dataset.id);
  if (a === "confirm-heal-wound") {
    const play = playDraft(),
      index = play.wounds.findIndex((w) => w.id === target.dataset.id);
    if (index < 0) throw new Error("This wound is no longer recorded.");
    const result = workshopTreatWound({
      wound: play.wounds[index],
      steps: Number($("#healing-progress").value),
      catalog: catalogs.wounds,
    });
    play.wounds[index] = result.wound;
    play.conditions = play.conditions.filter(
      (c) => !result.removedConditionIds.includes(c.id),
    );
    persist();
    render();
    woundDetailsDialog(result.wound.id);
    return;
  }
  if (a === "resupply-dialog") return resupplyDialog(target.dataset.instance);
  if (a === "confirm-resupply") {
    const item = preview.inventory.items.find(
      (i) => i.instanceId === target.dataset.instance,
    );
    const result = workshopResupply({
      item,
      steps: Number($("#resupply-steps").value),
      catalog: catalogs.inventory,
    });
    const inv = playDraft().inventory;
    inv.overrides ??= {};
    inv.overrides[item.instanceId] = {
      ...inv.overrides[item.instanceId],
      inventoryDie: result.after,
    };
    $("#reference").close();
    persist();
    render();
    notice(`Supply restored to d${result.after}.`);
    return;
  }
  if (a === "adjust-condition") {
    const play = playDraft(),
      c = play.conditions.find((c) => c.id === target.dataset.id);
    if (!c) return;
    c.rating = Math.min(10000, c.rating + Number(target.dataset.delta));
    if (c.rating <= 0)
      play.conditions = play.conditions.filter((v) => v.id !== c.id);
    persist();
    render();
    return;
  }
  if (a === "condition-damage") {
    const condition = preview.play.conditions.find(
      (c) => c.id === target.dataset.id,
    );
    if (!condition) throw new Error("This condition is no longer active.");
    const result = workshopConditionDamage({
      condition,
      contributions: preview.play.conditions,
      hp: liveVitals().hp,
      maxHp: liveVitals().max,
      failed: liveVitals().failed,
      lastWords: draft.play?.lastWords ?? false,
      resistances: preview.resistances,
    });
    Object.assign(playDraft(), {
      hp: result.hp,
      failedDeathRolls: result.failedDeathRolls,
      lastWords: result.lastWords,
    });
    persist();
    render();
    notice(
      `${title(condition.key)}: ${result.amount} damage.${result.woundRequired ? " At 0 HP: roll a wound using the header." : ""}`,
    );
    return;
  }
  if (a === "death-mark") {
    const current = Number($("#death-failures").value),
      requested = Number(target.dataset.marks),
      value = current === requested ? requested - 1 : requested;
    playDraft().failedDeathRolls = value;
    refreshDeathMarks(value);
    persist();
    render();
    return;
  }
  if (a === "open-picker") return openPicker(target.dataset.kind);
  if (a === "close-picker") {
    pickerKind = null;
    return $("#picker").close();
  }
  if (a === "locate-choice") {
    const id = target.dataset.id,
      level = Number(target.dataset.level);
    if (level) {
      editingLevel = level;
      const cls = get(draft.classId);
      const tier = [3, 7].find((t) => cls?.signatures?.[t]?.includes(id));
      mode = tier ? "signature" : "advancement";
      if (tier) signatureTier = tier;
    } else {
      mode = "builder";
      step = preview.stages[0].abilities.includes(id) ? 3 : 5;
    }
    persist();
    render({ focusHeading: true });
    const entry = [
      ...app.querySelectorAll("[data-build-id],[data-acquisition]"),
    ].find((e) => (e.dataset.buildId ?? e.dataset.acquisition) === id);
    entry?.scrollIntoView({ block: "center" });
    entry?.querySelector("select,input,button")?.focus({ preventScroll: true });
    return;
  }
  if (a === "evade") return openSheetRoll({ key: "agility", defense: true });
  if (a === "roll-wound-dialog") return woundDialog();
  if (a === "confirm-roll-wound") return rollNewWound();
  if (a === "use-grit") return gritDialog();
  if (a === "confirm-grit") {
    Object.assign(
      playDraft(),
      workshopSpendGrit({
        spent: draft.play?.gritSpent ?? 0,
        granted: preview.summary?.gritGranted ?? 0,
        maxHp: liveVitals().max,
        lastWords: draft.play?.lastWords ?? false,
      }),
    );
    $("#reference").close();
    persist();
    render();
    notice("Grit spent; HP restored.");
    return;
  }
  if (a === "potion-dialog") return supplyDialog();
  if (a === "use-supply-dialog") return supplyDialog(target.dataset.instance);
  if (a === "confirm-supply") return useSupply();
  if (a === "favorite") {
    const kind = target.dataset.kind,
      id = target.dataset.id;
    const play = playDraft();
    play.favorites ??= { abilities: [], items: [] };
    const list = play.favorites[kind] ?? [];
    play.favorites[kind] = list.includes(id)
      ? list.filter((v) => v !== id)
      : [...list, id];
    persist();
    render();
    return;
  }
  if (a === "open-roll")
    return openSheetRoll({
      key: target.dataset.attributeKey,
      id: target.dataset.id,
    });
  if (a === "death-roll") return openSheetRoll({ death: true });
  if (a === "roll-sheet") return rollSheetDice();
  if (a === "add-wound") return woundDialog();
  if (a === "delete-wound") {
    playDraft().wounds = (playDraft().wounds ?? []).filter(
      (w) => w.id !== target.dataset.id,
    );
    playDraft().conditions = playDraft().conditions.filter(
      (c) => !c.id.startsWith(`${target.dataset.id}-`),
    );
    if (!playDraft().wounds.some((w) => w.catalogId?.endsWith("-666")))
      playDraft().lastWords = false;
  }
  if (a === "reference") return showReference(target.dataset.id);
  if (a === "save-message") {
    const message = $("#memorized-message").value.trim();
    if (message.split(/\s+/).filter(Boolean).length > 50)
      throw new Error("Keep the memorized message to 50 words or fewer.");
    playDraft().memorizedMessage = message;
    persist();
    $("#reference").close();
    notice("Message saved.");
    return;
  }
  if (a === "add-item") return addItemDialog();
  if (a === "add-language") return addLanguageDialog();
  if (a === "add-condition") return addConditionDialog();
  if (a === "confirm-item") {
    const eligibility = equipmentEligibility(
      $("#play-item").value,
      preview.state.abilities,
    );
    if (!eligibility.eligible)
      throw new Error(`Requires ${name(eligibility.requiredAbilityId)}.`);
    const quantity = Number($("#play-quantity").value),
      id = $("#play-item").value;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
      throw new Error("Choose a whole quantity from 1 to 10,000.");
    if (playDraft().inventory.added.length >= 500)
      throw new Error(
        "The character file supports up to 500 added item stacks.",
      );
    playDraft().inventory.added.push({
      id,
      quantity,
      instanceId: `inventory-${crypto.randomUUID()}`,
    });
    $("#reference").close();
  }
  if (a === "delete-item") {
    const inv = playDraft().inventory,
      id = target.dataset.instance;
    const added = inv.added.some((i) => i.instanceId === id);
    if (!added && inv.removed.length >= 500)
      throw new Error(
        "The character file supports up to 500 removed grant entries.",
      );
    inv.added = inv.added.filter((i) => i.instanceId !== id);
    if (!added) inv.removed = [...new Set([...inv.removed, id])];
    if (draft.loadout) delete draft.loadout[id];
  }
  if (a === "confirm-language") {
    const name = $("#language-name").value.trim(),
      form = $("#language-form").value,
      written = $("#language-written").checked;
    if (!name) throw new Error("Name the language.");
    if (
      preview.play.languages.some(
        (l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      throw new Error("That language is already on the sheet.");
    const id = $("#play-language").value || `language-${crypto.randomUUID()}`,
      langs = playDraft().languages;
    if (langs.added.length >= 100 && !langs.added.some((l) => l.id === id))
      throw new Error("The character file supports up to 100 added languages.");
    langs.removed = langs.removed.filter((value) => value !== id);
    langs.added = langs.added.filter((l) => l.id !== id);
    langs.added.push({ id, name, form, written });
    $("#reference").close();
  }
  if (a === "delete-language") {
    const langs = playDraft().languages,
      id = target.dataset.id;
    const granted = preview.creation.summary?.languages.some(
      (l) => l.id === id,
    );
    if (granted && langs.removed.length >= 100)
      throw new Error(
        "The character file supports up to 100 removed languages.",
      );
    langs.added = langs.added.filter((l) => l.id !== id);
    if (granted) langs.removed = [...new Set([...langs.removed, id])];
  }
  if (a === "confirm-condition") {
    const key = $("#play-condition").value,
      kind = CONDITION_KINDS[key],
      rating = kind === "binary" ? 1 : Number($("#condition-rating").value);
    if (!Number.isSafeInteger(rating) || rating < 1 || rating > 10000)
      throw new Error("Choose a whole rating or duration from 1 to 10,000.");
    if (playDraft().conditions.length >= 100)
      throw new Error(
        "The character file supports up to 100 condition entries.",
      );
    playDraft().conditions.push({
      id: `condition-${crypto.randomUUID()}`,
      key,
      rating,
      source: "sheet",
      persistence:
        kind === "binary"
          ? "binary"
          : kind === "maintained"
            ? "maintained"
            : $("#condition-starred").checked
              ? "starred"
              : "temporary",
    });
    $("#reference").close();
  }
  if (a === "delete-condition")
    playDraft().conditions = playDraft().conditions.filter(
      (c) => c.id !== target.dataset.id,
    );
  if (a === "save") return saveDialog();
  if (a === "library") return libraryDialog();
  if (a === "save-confirm" || a === "save-copy")
    return saveCharacter(a === "save-copy");
  if (a === "load-saved") return loadSaved(target.dataset.id);
  if (a === "delete-saved") return deleteSaved(target.dataset.id);
  if (a === "recipe-roll")
    return recipeRoll(target.dataset.id, target.dataset.recipeId);
  if (a === "roll-recipe") return rollRecipeDice(target.dataset.id);
  if (a === "close-reference") return $("#reference").close();
  if (a === "import") return $("#import-file").click();
  if (a === "export" || a === "ready-export")
    return exportFile(a === "ready-export");
  if (a === "new") {
    if (
      !isExample &&
      !confirm(
        "Start a new hero? Save or export your current draft first if you want to keep it.",
      )
    )
      return;
    draft = newCreationDraft();
    saveId = null;
    isExample = false;
    mode = "builder";
    step = 0;
    edit = false;
  }
  if (a === "level-up" || a === "level-down") {
    draft.progression ??= { level: 1, levels: {} };
    draft.progression.level = Math.max(
      1,
      Math.min(100, draft.progression.level + (a === "level-up" ? 1 : -1)),
    );
  }
  if (a === "advance") {
    editingLevel = null;
    mode = "advancement";
    edit = false;
    query = "";
    filter = "all";
    levelDraft();
  }
  if (a === "sheet-development") {
    editingLevel = null;
    mode = "sheet";
    tab = "Development";
    edit = false;
  }
  if (a === "choose-signature") {
    signatureTier = Number(target.dataset.tier);
    mode = "signature";
    edit = false;
  }
  if (a === "advance-signature") {
    if (signatureTier === 1) draft.signatureId = target.dataset.id;
    else
      levelDraft(signatureTier).signatures[signatureTier] = target.dataset.id;
  }
  if (a === "more") visibleChoices[target.dataset.group] += 8;
  if (a === "edit") edit = !edit;
  if (a === "tab") {
    tab = target.dataset.tab;
    query = "";
    filter = "all";
    visibleChoices = { true: 6, false: 4 };
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
    learningPurchases().splice(Number(target.dataset.index), 1);
  if (a === "remove-equipment") {
    const id = target.dataset.instance;
    draft.shopping = draft.shopping.filter((item) => item.instanceId !== id);
    if (draft.loadout) delete draft.loadout[id];
    if (draft.play?.inventory)
      draft.play.inventory.removed = draft.play.inventory.removed.filter(
        (value) => value !== id,
      );
  }
  if (a === "equipment") {
    const eligibility = equipmentEligibility(
      target.dataset.id,
      preview.state.abilities,
    );
    if (!eligibility.eligible)
      throw new Error(`Requires ${name(eligibility.requiredAbilityId)}.`);
    const r = get(target.dataset.id),
      quantity = Number($(`#quantity-${r.id}`).value),
      hands = Number($(`#hands-${r.id}`)?.value ?? 0);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
      throw new Error("Choose a positive whole quantity, up to 10,000.");
    if (r.specialOrder)
      throw new Error("Special-order availability is arranged with your DA.");
    if (r.price * quantity > preview.inventory.remainingCoins) {
      if (
        !confirm(
          `This purchase exceeds your available coins by ${r.price * quantity - preview.inventory.remainingCoins}. Buy anyway?`,
        )
      )
        return;
      draft.coinOverride = true;
    }
    draft.shopping.push({
      id: r.id,
      quantity,
      hands,
      instanceId: `shop-${crypto.randomUUID()}`,
    });
  }
  persist();
  render({
    focusHeading: [
      "advance",
      "choose-signature",
      "sheet-development",
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
// Persist the impending native toggle synchronously, including keyboard clicks.
// The later toggle event also covers programmatic changes.
app.addEventListener(
  "click",
  (event) => {
    const summary = event.target.closest("summary"),
      section = summary?.parentElement;
    if (
      !section?.dataset.collapse ||
      event.target.closest("button,input,select,a,label")
    )
      return;
    const play = playDraft();
    play.collapsed ??= {};
    play.collapsed[section.dataset.collapse] = section.open;
    persist();
  },
  true,
);
app.addEventListener(
  "toggle",
  (event) => {
    const key = event.target.dataset.collapse;
    if (!key) return;
    const closed = !event.target.open;
    if ((draft.play?.collapsed?.[key] ?? false) === closed) return;
    const play = playDraft();
    play.collapsed ??= {};
    play.collapsed[key] = closed;
    persist();
  },
  true,
);
document.addEventListener("change", (event) => {
  const t = event.target;
  if (t.dataset.quantity) {
    const quantity = Number(t.value);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000) {
      notice("Use a whole quantity from 0 to 10,000.");
      render();
      return;
    }
    const inv = playDraft().inventory;
    inv.overrides ??= {};
    inv.overrides[t.dataset.quantity] = {
      ...inv.overrides[t.dataset.quantity],
      quantity,
    };
    persist();
    render();
    return;
  }
  if (t.dataset.loadout) {
    const item = preview.inventory.items.find(
      (i) => i.instanceId === t.dataset.loadout,
    );
    draft.loadout ??= {};
    draft.loadout[item.instanceId] = itemArrangement(
      item,
      t.dataset.prop,
      t.checked,
    );
    persist();
    render();
    return;
  }
  if (t.dataset.basic || t.dataset.basicGroup) {
    draft.basicActions ??= {};
    if (t.dataset.basic) draft.basicActions[t.dataset.basic] = t.checked;
    else
      for (const entry of mainActions(preview, draft, catalogs).filter(
        (e) => e.basic && actionTiming(e.record).includes(t.dataset.basicGroup),
      ))
        draft.basicActions[entry.record.id] = t.checked;
    persist();
    render();
    return;
  }
  if (event.target.id === "filter") {
    filter = event.target.value;
    render();
  } else updateField(event.target);
});
document.addEventListener("input", (event) => {
  const t = event.target;
  if (
    t.dataset.field?.startsWith("attributes.") &&
    t.value !== "" &&
    Number.isInteger(Number(t.value)) &&
    Number(t.value) >= -2 &&
    Number(t.value) <= 2
  ) {
    set(t.dataset.field, Number(t.value));
    persist();
    render();
    return;
  }
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
  const visibleTabs = sheetTabs();
  const i = visibleTabs.indexOf(tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? visibleTabs.length - 1
        : (i +
            (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
            visibleTabs.length) %
          visibleTabs.length;
  action({ dataset: { action: "tab", tab: visibleTabs[next] } });
});
document.addEventListener("dragstart", (event) => {
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
    normalizeShoppingIds();
    saveId = null;
    mode = "builder";
    step = 7;
    isExample = false;
    edit = false;
    if ((draft.progression?.level ?? 1) > 1) {
      mode = "sheet";
      tab = "Development";
    }
    persist();
    render({ focusHeading: true });
    notice("Character imported.");
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
  const [choices, inventory, refs, sample, wounds] = await Promise.all([
    load("choices"),
    load("inventory"),
    load("references"),
    load("example"),
    load("wounds"),
  ]);
  if (
    choices.sourceCommit !== inventory.sourceCommit ||
    wounds.sourceCommit !== choices.sourceCommit ||
    refs.sourceCommit !== choices.sourceCommit
  )
    throw new Error("The workshop catalogs do not use the same rules edition.");
  catalogs = {
    choices: choices.records,
    inventory,
    wounds,
    commit: choices.sourceCommit,
  };
  references = refs;
  example = sample;
  draft = structuredClone(example);
  try {
    library();
  } catch {
    /* Keep an unreadable library independent of the active draft. */
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (saved) {
      const loaded = readPortableCharacter(saved.character, catalogs);
      draft = loaded.draft;
      mode = ["builder", "advancement", "signature"].includes(saved.mode)
        ? saved.mode
        : "sheet";
      signatureTier = [1, 3, 7].includes(saved.signatureTier)
        ? saved.signatureTier
        : 1;
      editingLevel =
        Number.isInteger(saved.editingLevel) &&
        saved.editingLevel >= 2 &&
        saved.editingLevel <= (draft.progression?.level ?? 1)
          ? saved.editingLevel
          : null;
      saveId = typeof saved.saveId === "string" ? saved.saveId : null;
      tab = tabs.includes(saved.tab)
        ? saved.tab
        : saved.tab === "Belongings"
          ? "Inventory"
          : "Main";
      step = Number.isInteger(saved.step)
        ? Math.max(0, Math.min(7, saved.step))
        : 0;
      isExample = Boolean(saved.isExample);
      persist();
    }
  } catch {
    notice(
      "The saved draft could not be opened. It has not been overwritten; export a new draft only when you are ready.",
    );
  }
  normalizeShoppingIds();
  render();
} catch (e) {
  app.removeAttribute("aria-busy");
  if (pickerKind) renderPicker();
  app.innerHTML = `<div class="loading"><h1>Could not open the workshop</h1><p>${esc(e.message)}</p><p>Reload the page to try again.</p></div>`;
}

document.addEventListener("change", (event) => {
  if (event.target.id === "play-condition") conditionFields();
  if (event.target.id === "play-language") {
    const lang = DEFAULT_LANGUAGES.find((l) => l.id === event.target.value);
    $("#language-name").value = lang?.name ?? "";
    $("#language-form").value = lang?.form ?? "spoken";
    $("#language-written").checked = lang?.writing ?? true;
  }
});
