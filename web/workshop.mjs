import { renderForge } from "./forge-view.mjs";
import { forgeSpendSp } from "./rules/forge-vitals.mjs";
import { forgeEligibility } from "./rules/forge.mjs";
import { workshopCatalogs } from "./rules/workshop-forge-catalog.mjs";
import { forgeArmorRequirement } from "./rules/forge-character.mjs";
import { ruleBlockMarkup } from "./rules-view.mjs";
import {
  workshopCraft,
  noRollBrew,
  startWorkshopCraft,
} from "./rules/workshop-crafting.mjs";
import { rollSetup, netControl, bindRollSetup } from "./roll-ui.mjs";
import {
  isUniversalAbility,
} from "./rules/equipment-eligibility.mjs";
import {
  workshopSupplyUse,
  workshopResupply,
  workshopConditionDamage,
  workshopFavorites,
} from "./rules/workshop-resources.mjs";
import { HEALING_POTION_IDS } from "./rules/potions.mjs";
import {
  advanceForgeVitals, forgeBeginFirstAid, forgeCanSpendGrit, forgeDamage,
  forgeDeathRoll, forgeFinalizeDeath, forgeFinishFirstAid, forgeHeal,
  forgeInterruptFirstAid, forgeRecordScar, forgeRest, forgeSpellcraftRecovery,
  forgeSpendGrit, forgeStabilize, forgeVitals,
} from "./rules/forge-vitals.mjs";
import { itemArrangement } from "./rules/workshop-play.mjs";
import { normalizeRecovery, payDebt, nextDawn } from "./rules/recovery.mjs";
import { passiveAncestryDefenseSources } from "./rules/passive-defenses.mjs";
import { ancestrySelection } from "./rules/ancestry.mjs";
import { CONDITION_KINDS, conditionRollSources } from "./rules/conditions.mjs";
import {
  workshopCharacter,
  workshopAbility,
  emptyLevelDraft,
  mainActions,
  actionTiming,
  craftingActions,
} from "./rules/workshop-character.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { newCreationDraft } from "./rules/creation.mjs";
import { ATTRIBUTES } from "./rules/character.mjs";
import {
  campaignLanguageOptions,
  additionalLanguageOptions,
} from "./rules/languages.mjs";
import {
  eligibleFirst,
  classEligibility,
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
  "Spellbooks",
  "Inventory",
  "Crafting",
  "Character",
  "Development",
];
const sheetTabs = () =>
  tabs.filter((t) => (t !== "Crafting" || preview.state.recipes.length > 0) && (t !== "Spellbooks" || preview.state.learning.spells.length > 0));
const storageKey = "hol.workshop.v1";
const libraryKey = "hol.workshop.library.v1";
let saveId = null;
let signatureTier = 1;
let forgeView = "atlas", forgeDiscipline = "all", forgeSelected, forgeZoom = 1;
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
  noticeTimer;
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
    catalogs.forge.spells.find((r) => r.id === id) ??
    catalogs.inventory.equipment.find((r) => r.id === id) ??
    catalogs.inventory.recipes.find((r) => r.id === id)
  );
}
function name(id) {
  return get(id)?.name ?? catalogs.legacyChoices.find((r) => r.id === id)?.name ?? id ?? "Not chosen";
}
function button(text, action, extra = "", style = "") {
  return `<button type="button" data-action="${action}" ${extra} class="${style}">${text}</button>`;
}
const navIcons = {
  Main: '<path d="m4 3 13 13m-2 3 4-4M3 4l1 5 4-1M20 3 7 16m-2-1 4 4m12-15-1 5-4-1"/>',
  Abilities:
    '<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  Spellbooks: '<path d="M4 4h13l3 3v13H4zM8 9h8m-8 4h8m-8 4h5"/>',
  Inventory:
    '<path d="M8 6V4a4 4 0 0 1 8 0v2M7 6h10l3 5v10H4V11zM4 13h16M9 13v3h6v-3"/>',
  Crafting: '<path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"/>',
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
  const discipline = catalogs.forge.disciplines.find((entry) => entry.id === key);
  if (!discipline) return "";
  const svg = ["elements", "force", "wards", "divination", "invocation", "mentalism", "spellcraft"].includes(key);
  return `<img class="sigil" src="assets/${key}.${svg ? "svg" : "webp"}" alt="">`;
}
function equipmentEligibility(id) {
  const requiredAbilityId = forgeArmorRequirement(id) ?? (id === "item-smoke-supply" ? "craft:mixtures:1" : null);
  return { requiredAbilityId, eligible: !requiredAbilityId || preview.state.learned.includes(requiredAbilityId) };
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
  const recovery = normalizeRecovery(draft.play?.recovery);
  const limits = { ...(preview.limits ?? { maxHp: 0, maxSp: 0, gritGranted: 0 }), unavailableHp: recovery.unavailableHp };
  const play = forgeVitals(draft.play, limits);
  const maxSpeed = preview.summary?.unencumberedSpeed ?? 0;
  return {
    ...play, limits, recovery, maxSpeed,
    max: limits.maxHp,
    recoveryMax: limits.maxHp - limits.unavailableHp,
    speed: Math.max(0, (preview.summary?.speed ?? 0) - preview.play.conditionSummary.slowed.rating),
    grit: play.gritAvailable,
    failed: play.failedDeathRolls,
  };
}

function applyWorkshopDamage(amount) {
  const { limits } = liveVitals();
  const current = playDraft();
  if (current.immediateDeathRoll) throw new Error("Resolve the immediate death roll first.");
  const outcome = forgeDamage(current, limits, amount);
  Object.assign(current, outcome.play, { immediateDeathRoll: outcome.deathRollRequired });
  if (outcome.gritTrigger === "fall" && !preview.play.conditions.some(({ key }) => key === "prone") && current.conditions.length < 100) {
    current.conditions.push({
      id: "prone-" + crypto.randomUUID(), key: "prone", rating: 1,
      persistence: "binary", source: "Fell to 0 HP",
    });
  }
  return outcome;
}
const effectiveTraits = () => ancestrySelection(draft, catalogs.choices).traitIds;
function header() {
  const stats = preview.summary,
    vitals = liveVitals();
  return `<div class="workshop-header"><div class="toolbar"><div class="toolbar-group">${button(edit ? "✓ Done" : "✎ Edit", "edit", `aria-pressed="${edit}"`, edit ? "selected" : "quiet")}</div><div class="toolbar-group">${button("New", "new", 'aria-label="New hero"', "quiet")}${button("Save", "save", 'aria-label="Save character"', "quiet")}${button("Load", "library", 'aria-label="Load character"', "quiet")}${button("Import", "import", 'aria-label="Import JSON"', "quiet")}${button("Export", "export", 'aria-label="Export JSON"', "quiet")}</div></div>
  <header class="hero-header"><div class="identity-line"><img class="hero-mark" src="assets/crest.webp" alt=""><div><div class="name-line">${edit && mode === "sheet" ? field("Character name", "name", draft.name, "text", 'maxlength="200"') : `<h1>${esc(draft.name || "New hero")}</h1>`}${button(skullIcon + (vitals.dying ? `<span>${vitals.failed} / ${vitals.successfulDeathRolls}</span>` : ""), "death-roll", `aria-label="Death roll" title="Fortitude death roll · ${vitals.failed} failures · ${vitals.successfulDeathRolls} successes" ${vitals.dying && vitals.failed < 3 ? "" : "disabled"}`, "icon-button death-button")}</div><p>${esc(join([get(draft.ancestryId)?.name, get(draft.culture?.id)?.name, get(draft.background?.id)?.name, get(draft.classId)?.name, `Level ${preview.development.level}(${preview.development.current})`]))}</p></div></div><div class="vitals"><div class="vital"><small>HP</small><strong class="hp-value"><input aria-label="Current HP" data-field="play.hp" type="number" min="0" max="${Math.max(vitals.hp, vitals.recoveryMax)}" step="1" value="${vitals.hp}"><span>/ ${vitals.max || "—"}</span></strong></div><div class="vital"><small>SP</small><strong class="hp-value"><input aria-label="Current SP" data-field="play.sp" type="number" min="0" max="${vitals.limits.maxSp}" step="1" value="${vitals.sp}"><span>/ ${vitals.limits.maxSp || "—"}</span></strong></div><div class="vital"><small>${button("Grit", "use-grit", 'aria-label="Use Grit"', "vital-link")}</small><strong>${vitals.grit}</strong></div><div class="vital"><small>Speed</small><strong data-speed>${vitals.speed}${vitals.speed < vitals.maxSpeed ? ` / ${vitals.maxSpeed}` : ""}</strong></div><div class="vital"><small>${button("Recovery", "hero-recovery", 'aria-label="Recovery"', "vital-link")}</small><strong>${vitals.dead ? "Dead" : vitals.dying ? "Dying" : vitals.hp === 0 && vitals.max ? "Stable" : ""}</strong></div><div class="vital"><small>Armor DR</small><strong>${preview.resistances.physical ?? 0}</strong></div></div></header>
  <div class="attributes">${ATTRIBUTES.map((key) => `<div class="attribute"><span>${title(key)}</span>${rollButton(title(key), `data-attribute-key="${key}"`)}<strong data-attribute="${key}">${signed(preview.attributes[key])}</strong></div>`).join("")}</div></div>`;
}
function knownCards() {
  return [...new Set(preview.state.abilities)].map((id) => workshopAbility(preview, get(id))).filter(Boolean);
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
    `${r.name} ${r.reference?.flavor?.join(" ") ?? ""} ${(r.disciplineIds ?? []).map(name).join(" ")}`.toLowerCase();
  return (
    text.includes(query.toLowerCase()) &&
    (filter === "all" ||
      (filter === "universal" && isUniversalAbility(r)) ||
      r.id === filter ||
      r.disciplineIds?.includes(filter))
  );
}
function sheet() {
  const visibleTabs = sheetTabs();
  if (!visibleTabs.includes(tab)) tab = "Main";
  return `<div class="sheet-body"><nav class="edge-tabs" role="tablist" aria-label="Character sheet" aria-orientation="vertical">${visibleTabs.map((t) => button(navIcon(t, t), "tab", `id="tab-${t}" aria-label="${t}" role="tab" aria-selected="${tab === t}" aria-controls="panel" tabindex="${tab === t ? 0 : -1}" data-tab="${t}"`)).join("")}</nav><section id="panel" class="panel sheet-panel sheet-${tab.toLowerCase()}" role="tabpanel" aria-labelledby="tab-${tab}">${sheetContent()}</section></div>`;
}
function disciplineTable() {
  return `<section class="known-disciplines"><h3>Known disciplines</h3><div class="discipline-strip">${preview.state.learning.disciplines.map(({id, name}) =>
    `<span class="chip">${symbol(id)}${esc(name)}</span>`).join("") || "<small>None learned yet</small>"}</div></section>`;
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
  if (tab === "Spellbooks") return spellbooks();
  if (tab === "Inventory")
    return `${heading("", "Inventory", "", button("Add item", "add-item", "", "small"))}${inventoryStats()}${inventoryTable(true)}`;
  if (tab === "Crafting")
    return `${heading("", "Crafting", "")}${recipeRows()}`;
  if (tab === "Character")
    return `${heading("", "Character", "")}<div class="columns"><section class="box"><h3>Origins</h3>${row("Ancestry", name(draft.ancestryId))}${row("Culture", name(draft.culture?.id))}${row("Background", name(draft.background?.id))}</section><section class="box"><h3 class="section-controls">Languages ${button("Add", "add-language", 'aria-label="Add language"', "small")}</h3>${languageTable()}</section></div>${collapsible("story", "Story", `<label class="story-editor"><textarea aria-label="Story" data-field="profile.story" maxlength="10000" placeholder="Write your character’s story…">${esc(draft.profile?.story ?? "")}</textarea></label>`)}${scarSection()}`;
  const dev = preview.development;
  return `${heading("", "Development", "")}<section class="box development-training"><h3 class="section-controls">Training ${button("Edit creation", "review", "", "small quiet")}</h3><div class="development-summary"><div class="level-control"><span>Level</span>${button("−", "level-down", 'aria-label="Decrease level"')}<strong>${dev.level}</strong>${button("+", "level-up", 'aria-label="Increase level"')}</div><div><small>Current DP</small><strong data-dp="current">${dev.current}</strong></div><div><small>DP spent</small><strong data-dp="spent">${dev.spent}</strong></div><div><small>Total DP</small><strong data-dp="total">${dev.total}</strong></div></div><div class="training-footer"><small>Each new level grants 8 + level DP. Unspent advancement DP carries forward.</small>${button("Spend DP", "advance", dev.current > 0 || draft.progression?.levels?.[dev.level]?.purchases?.length ? "" : "disabled", "primary small")}</div></section>${collapsible("signatures", "Class signatures", signatureProgress())}${
    preview.errors.filter((e) => e.level && e.code !== "signature").length
      ? `<section class="box"><h3>Choices to finish</h3><ul class="error-list">${preview.errors
          .filter((e) => e.level && e.code !== "signature")
          .map(
            (e) =>
              `<li>${button(`Level ${e.level} · ${esc(e.id ? name(e.id) : "Learning")}`, "edit-learning-level", `data-level="${e.level}"`, "table-link")} ${esc(e.text ?? (e.reasons ?? []).map((r) => r.text).join(" "))}</li>`,
          )
          .join("")}</ul></section>`
      : ""
  }${collapsible("advancement-history", "Advancement history", advancementTable())}${collapsible("creation-ledger", "Creation ledger", ledgerTable() + (dev.expired ? `<small>${dev.expired} unspent creation DP expired.</small>` : ""), "", "box", false)}`;
}
function spellbooks() {
  const learned = new Set(preview.state.learning.spells.map(({ id }) => id));
  const books = catalogs.forge.books.map((book) => ({
    ...book,
    pages: book.spellIds.filter((id) => learned.has(id)).map(get),
  })).filter((book) => book.pages.length);
  return `${heading("", "Spellbooks", "")}${books.map((book) =>
    `<section class="box spellbook-sheet"><h3>${symbol(book.disciplineId)}${esc(book.name)}</h3>
    <div class="table-wrap"><table><thead><tr><th>Page</th><th>Spell</th><th>Casting</th><th>SP</th></tr></thead><tbody>
    ${book.pages.map((spell) => `<tr><td>${esc(spell.page)}</td><td>${button(esc(spell.name), "reference", `data-id="${esc(spell.id)}"`, "table-link")}</td><td>${esc(spell.actionText ?? spell.action)}</td><td>${spell.sp}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}`;
}

function spellProfile(record) {
  return `<dl>${Object.entries({
    Page: record.page, Casting: record.actionText ?? record.action,
    SP: record.sp, Attribute: record.attribute, "Target / range": record.target,
    Duration: record.duration, Trigger: record.trigger,
  }).filter(([, value]) => value !== undefined).map(([label, value]) =>
    `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>${markdown(record.effect)}`;
}

function learnedImprovements(id) {
  return (preview.state.learning.improvements.get(id) ?? [])
    .map((entry) => `<section class="technique-improvement"><h3>${esc(entry.name)}</h3>${markdown(entry.effect)}</section>`).join("");
}

function castCost(record) {
  return record?.page ? record.sp : record?.classId || record?.id.startsWith("combined:")
    ? Number(record.effect?.match(/\b(?:pay )?(\d+) SP\b/i)?.[1] ?? NaN)
    : NaN;
}

function isRitual(record) {
  return record.action === "Ritual" || record.effect?.startsWith("Ritual");
}

function castFromSheet(id) {
  const record = get(id);
  const cost = castCost(record);
  const learned = record?.page
    ? preview.state.learning.spells.some((spell) => spell.id === id)
    : preview.state.abilities.includes(id);
  if (!learned || !Number.isInteger(cost)) throw new Error("Learn this working before casting it.");
  if (!preview.limits) throw new Error("Finish creating this hero to track SP.");
  const vitals = liveVitals();
  if (vitals.hp <= 0 || vitals.dead) throw new Error("Regain HP before casting.");
  if (cost > vitals.sp) throw new Error("You need more SP.");
  const attribute = attributeFor(record);
  const automatic = !attribute || /(?:^|[.!] )No (?:casting )?roll\./i.test(record.effect);
  $("#reference").close();
  if (isRitual(record)) {
    draft.play = forgeSpendSp(playDraft(), vitals.limits, cost);
    persist();
    render();
    popup(record.name, `${record.page ? spellProfile(record) : markdown(record.effect)}<p>${cost} SP spent. Finish the printed casting time before resolving the effect.</p>${automatic ? "" : `<div class="dialog-actions">${button("Roll when the Ritual ends", "finish-ritual", `data-id="${esc(id)}"`, "primary")}</div>`}`);
    return;
  }
  if (!automatic) {
    openSheetRoll({ key: attribute, id, cast: true });
    return;
  }
  draft.play = forgeSpendSp(playDraft(), vitals.limits, cost);
  persist();
  render();
  notice(`Casting recorded: ${record.name}${cost ? ` · ${cost} SP spent` : ""}.`);
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
  if (record?.page) return ATTRIBUTES.find((key) => record.attribute?.toLowerCase().startsWith(key));
  // The universal opportunity is one Basic Melee, using that action's printed roll.
  if (record?.id === "ability-opportunity-attack")
    return attributeFor(get("ability-basic-melee"));
  const text =
    record?.reference?.rules.details.find((d) => d.label === "Attribute")
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
  const traits = `<table class="trait-table"><tbody>${effectiveTraits().map((id) => `<tr><td>${button(esc(name(id)), "reference", `data-id="${esc(id)}"`, "table-link")}<span class="brief">${esc(traitBrief(id))}</span></td></tr>`).join("")}</tbody></table>`;
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
  return `<div class="main-layout"><div class="action-groups">${left}</div><aside class="play-summary">${collapsible("passives", "Passives", passiveTable(actions.filter((e) => actionTiming(e.record).includes("Passive"))))}${collapsible("ancestry-traits", "Ancestry traits", traits, effectiveTraits().includes("trait-oath-bound-the-debt-comes-due") || v.recovery.debtUsed ? button("Recovery", "debt-recovery", "", "small") : "")}${collapsible("defenses", "Defenses", defenses, button("Evade", "evade", 'aria-label="Evade"', "small"))}${conditionBar()}${collapsible("movement-carrying", "Movement & carrying", carrying)}${collapsible("supplies", "Supplies", supplyRows())}</aside></div>`;
}
function traitBrief(id) {
  const current = get(id)?.reference?.rules?.body?.map(paragraph => paragraph.text).join("\n\n");
  return (current || (
    references.records[id]?.markdown
      .split("## Rules")[1]
      ?.split(/\n\s*\n/)
      .find((p) => p.trim() && !p.startsWith("**")) ?? ""
  ))
    .replace(/\*|\[|\]\([^)]*\)/g, "")
    .trim();
}
function craftingStatus(recipe) {
  const state = draft.play?.crafting?.[recipe.id];
  const supplies = preview.inventory.items
    .filter(
      (i) =>
        i.catalogId === recipe.product &&
        i.quantity > 0 &&
        (!state?.active || i.instanceId === state.supplyId),
    )
    .map((i) => (i.inventoryDie ? `d${i.inventoryDie}` : "Empty"));
  return recipe.maximumDie
    ? `${supplies.join(", ") || "Empty"} · cap d${recipe.maximumDie}${state ? `<small class="item-source">${state.attempts} attempts</small>` : ""}`
    : `${state?.progress ?? 0} / ${recipe.target}<small class="item-source">${state?.completed ?? 0} completed</small>`;
}
function recipeRows() {
  const actions = craftingActions(preview, catalogs);
  const recipes = [...new Set(preview.state.recipes)].map(get).filter(Boolean);
  const project = (recipe) => draft.play?.crafting?.[recipe.id];
  const abilityChoices = (recipe) =>
    actions.filter((a) => a.recipe.id === recipe.id);
  const table = `<div class="table-wrap"><table class="recipe-table"><thead><tr><th>Recipe</th><th>Crafting ability</th><th>Attempt</th><th></th></tr></thead><tbody>${recipes
    .map((recipe) => {
      const abilities = abilityChoices(recipe);
      return `<tr><td>${button(esc(recipe.name), "reference", `data-id="${recipe.id}"`, "table-link")}</td><td>${abilities.length ? abilities.map((a) => button(esc(a.ability.name), "reference", `data-id="${a.ability.id}"`, "table-link")).join(" / ") : "Not learned"}</td><td>${recipe.attemptMinutes} min</td><td>${abilities.length ? (project(recipe)?.active ? "In progress" : button("Start", "start-craft", `data-recipe-id="${recipe.id}" aria-label="Start ${esc(recipe.name)}"`, "small")) : "—"}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
  const projects = recipes.filter((r) => project(r)?.active);
  return `${table}<h3>Crafting projects</h3>${
    projects.length
      ? `<div class="table-wrap"><table class="crafting-projects"><thead><tr><th>Project</th><th>Progress</th><th>Roll</th></tr></thead><tbody>${projects
          .map(
            (recipe) =>
              `<tr data-project="${recipe.id}"><td>${button(esc(recipe.name), "reference", `data-id="${recipe.id}"`, "table-link")}<small class="item-source">${recipe.attemptMinutes} min / attempt</small></td><td>${craftingStatus(recipe)}${recipe.target ? `<progress value="${project(recipe).progress}" max="${recipe.target}" aria-label="${esc(recipe.name)} progress"></progress>` : ""}</td><td>${abilityChoices(
                recipe,
              )
                .map(({ ability, attribute }) =>
                  button(
                    `${diceIcon} ${esc(attribute ? title(attribute) : "Roll")}`,
                    "recipe-roll",
                    `data-id="${ability.id}" data-recipe-id="${recipe.id}" aria-label="Roll ${esc(recipe.name)} with ${esc(ability.name)}"`,
                    "small",
                  ),
                )
                .join("")}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<p class="empty">Start a recipe to begin a project.</p>'
  }${
    recipes.some((r) => project(r)?.completed)
      ? `<p class="item-source">Completed: ${recipes
          .filter((r) => project(r)?.completed)
          .map((r) => `${esc(r.name)} ×${project(r).completed}`)
          .join(" · ")}</p>`
      : ""
  }`;
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
      options = campaignLanguageOptions(catalogs.languages, draft.languages);
    return `${heading("Step 2 of 8", "Ancestry & languages", "Choose your ancestry, two traits and a home language. Common is already known.")}<div class="cards">${catalogs.choices
      .filter((r) => r.kind === "ancestry")
      .map(
        (r) =>
          `<article class="choice-card ${draft.ancestryId === r.id ? "chosen" : ""}"><h3>${r.name}</h3><p class="card-meta">+${r.hp} HP per level · +${r.spContribution} SP · Base speed ${r.speed} · +${r.coins} coins</p><div class="card-actions">${button("Read rules", "reference", `data-id="${r.id}"`, "quiet small")}${button(draft.ancestryId === r.id ? "Selected" : "Choose", "ancestry", `data-id="${r.id}"`, "small")}</div></article>`,
      )
      .join(
        "",
      )}</div><h3 class="section-title" style="margin-top:14px">Choose two traits</h3><div class="cards">${(ancestry?.traits ?? []).map((id) => choiceCheck(id, "traitIds", draft.traitIds)).join("") || '<p class="empty">Choose an ancestry to see its traits.</p>'}</div><div style="margin-top:12px">${select("Home language", "languages.home", option("", "Choose a home language", !draft.languages.home) + options.home.map((l) => option(l.id, `${l.name}${l.reason ? ` — ${l.reason}` : ""}`, l.selected, l.disabled)).join(""))}</div>${draft.traitIds.includes("trait-human-many-homes") ? `<h3 class="section-title" style="margin-top:12px">A Foot in Two Worlds</h3><div class="field-grid">${select("Other ancestry", "borrowedAncestryId", option("", "Choose another ancestry", !draft.borrowedAncestryId) + catalogs.choices.filter(r => r.kind === "ancestry" && r.id !== "ancestry-human").map(r => option(r.id, r.name, r.id === draft.borrowedAncestryId)).join(""))}${select("Borrowed trait", "borrowedTraitId", option("", "Choose one trait", !draft.borrowedTraitId) + (get(draft.borrowedAncestryId)?.traits ?? []).map(id => option(id, name(id), id === draft.borrowedTraitId)).join(""))}${select("Ancestry language", "languages.ancestry", option("", "Choose a DA-approved native language", !draft.languages.ancestry) + catalogs.languages.filter(l => l.ordinary).map(l => option(l.id, l.name, l.id === draft.languages.ancestry)).join(""))}</div>${draft.borrowedTraitId ? button("Read borrowed trait", "reference", `data-id="${esc(draft.borrowedTraitId)}"`, "quiet small") : ""}<p class="inline-help">Choose a language native to the other ancestry with your DA.</p>` : ""}${staleSelections("traitIds", ancestry?.traits ?? [])}`;
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
                  `${r.name} — ${name(pair.disciplineId)} + ${name(pair.abilityId)}`,
                  draft[kind]?.id === r.id && draft[kind]?.pair === index,
                ),
              ),
            )
            .join("")}</select></label>${
            draft[kind]?.id
              ? (() => {
                  const pair = get(draft[kind].id)?.pairs?.[draft[kind].pair];
                  return `<div class="origin-grants">${button(esc(name(draft[kind].id)), "reference", `data-id="${esc(draft[kind].id)}"`, "table-link")}${pair ? `<div>${symbol(pair.disciplineId)}${esc(name(pair.disciplineId))}</div>${button(esc(name(pair.abilityId)), "reference", `data-id="${pair.abilityId}"`, "table-link")}` : ""}</div>`;
                })()
              : ""
          }</section>`,
      )
      .join(
        "",
      )}</div><p class="inline-help">Each choice starts a discipline and teaches its first entry. Each duplicate grants 1 DP.</p>`;
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
          `<article class="choice-card ${e.eligible ? "" : "unavailable"} ${draft.classId === e.choice.id ? "chosen" : ""}"><h3>${e.choice.name}</h3><p class="card-meta">+${e.choice.hp} HP per level · +${e.choice.spContribution} SP · +${e.choice.coins} coins</p><p class="requirement">${e.reasons.map((r) => esc(r.text)).join(" ") || "You meet the requirements."}</p><div class="card-actions">${button("Read class", "reference", `data-id="${e.choice.id}"`, "quiet small")}${button(draft.classId === e.choice.id ? "Selected" : "Choose", "class", `data-id="${e.choice.id}" ${e.eligible ? "" : "disabled"}`, "small")}</div></article>`,
      )
      .join(
        "",
      )}</div>${cls ? `<h3 class="section-title" style="margin-top:14px">Two starting disciplines</h3><div class="cards">${cls.startingDisciplines.map((id) => choiceCheck(id, "classDisciplines", draft.classDisciplines, preview.stages[0].learned.includes(id))).join("")}</div><h3 class="section-title" style="margin-top:14px">Your first signature</h3><div class="cards">${cls.signatures[1].map((id) => `<article class="choice-card ${draft.signatureId === id ? "chosen" : ""}"><h3>${esc(name(id))}</h3><p class="card-copy">${esc(get(id)?.reference?.flavor?.[0])}</p><div class="card-actions">${button("Read signature", "reference", `data-id="${esc(id)}"`, "quiet small")}${button(draft.signatureId === id ? "Selected" : "Choose", "signature", `data-id="${esc(id)}"`, "small")}</div></article>`).join("")}</div>${staleSelections("classDisciplines", cls.startingDisciplines)}` : ""}`;
  }
  if (step === 6) return equipment();
  return `${heading("Step 8 of 8", "Review", preview.valid ? "Your character is ready to play. Save a copy or export your build." : "A few choices still need attention. Your draft is saved, and every step remains available.")}${
    preview.valid
      ? `<div class="callout"><h3>${preview.development.level > 1 ? "Character plan ready" : "Creation complete"}</h3><p>${esc(draft.name)} · ${esc(name(draft.ancestryId))} ${esc(name(draft.classId))}</p></div>`
      : `<ul class="error-list">${errors()
          .map((e) => `<li>${esc(e)}</li>`)
          .join("")}</ul>`
  }${preview.errors.some((entry) => entry.code === "purchase" && !entry.level) ? `<div class="dialog-actions">${button("Review level 0 learning", "step", 'data-step="3"')}${button("Review level 1 learning", "step", 'data-step="5"')}</div>` : ""}<div class="columns" style="margin-top:12px"><section class="box"><h3>Your character</h3>${row("Maximum HP", preview.summary?.maximumHp ?? "—")}${row("Maximum SP", preview.summary?.maximumSp ?? "—")}${row("Grit", preview.summary?.gritGranted ?? "—")}${row("Speed", preview.summary?.speed ?? "—")}${row("Learned abilities", preview.state.abilities.length)}${row("Coins", preview.inventory.remainingCoins)}</section><section class="box"><h3>Take your hero with you</h3>${button("Export character JSON", "ready-export", preview.valid ? "" : "disabled", "primary")}<p class="file-hint">Import this file into Character Workshop to open your hero on another browser.</p>${button("Save draft JSON", "export", "", "quiet")}</section></div><details class="planned"><summary>Creation ledger</summary>${ledgerTable()}</details>`;
}
function choiceCheck(id, list, values, owned = false) {
  const record = get(id);
  const description = record?.kind === "trait" ? record.reference?.flavor?.[0] : "";
  return `<div class="check ${owned ? "already-owned" : ""}"><label style="display:flex;gap:10px;flex:1"><input type="checkbox" data-list="${list}" value="${esc(id)}" ${values.includes(id) ? "checked" : ""}><span>${esc(name(id))}${owned ? "<small>Already known</small>" : ""}${description ? `<small class="card-copy">${esc(description)}</small>` : ""}</span></label>${button("Read", "reference", `data-id="${esc(id)}"`, "quiet small")}</div>`;
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
let pickerKind = null;
let editingLevel = null;
const activeLearningLevel = () => editingLevel ?? preview.development.level;
function learning() {
  const current = learningState();
  const content = renderForge(catalogs.forge, current, {
    view: forgeView, discipline: forgeDiscipline, selected: forgeSelected, zoom: forgeZoom,
    eligibility: (id) => forgeEligibility(catalogs.forge, current, id),
    canRefund: (id) => learningPurchases().some((entry) => entry.id === id),
  });
  const choices = learningPurchases().map((entry, index) => {
    const failed = preview.errors.find((error) => error.code === "purchase" && error.id === entry.id && (
      mode === "advancement" ? error.level === activeLearningLevel() : error.stage === stage()
    ));
    return `<li class="build-entry" data-build-id="${esc(entry.id)}"><div class="build-row"><div>${esc(name(entry.id))}${failed ? `<small>${esc(failed.reasons.map((reason) => reason.text).join(" "))}</small>` : ""}</div>${button("Remove", "remove-purchase", `data-index="${index}" aria-label="Remove ${esc(name(entry.id))}"`, "small quiet")}</div></li>`;
  }).join("");
  return `${heading("", mode === "advancement" ? `Level ${activeLearningLevel()} learning` : stage() ? "Heroic learning" : "Early learning", "")}${content}${acquisitions(true)}${choices ? `<details class="planned"><summary>Learning at this level</summary><ul>${choices}</ul></details>` : ""}`;
}

function openPicker(kind) {
  if (kind !== "equipment") return;
  pickerKind = kind;
  query = "";
  filter = "all";
  renderPicker();
  $("#picker").showModal();
}
function renderPicker() {
  if (!pickerKind) return;
  const dialog = $("#picker"),
    scroll = dialog.querySelector(".picker-body")?.scrollTop ?? 0;
  const active = document.activeElement,
    id = active?.id,
    pos = active?.selectionStart;
  dialog.innerHTML = `<header><h2 id="picker-title">Buy inventory items</h2>${button("Close", "close-picker", 'aria-label="Close selection"', "small")}</header><div class="picker-balance">${preview.inventory.remainingCoins} coins remaining${preview.inventory.overBudget ? ` · ${preview.inventory.overBudget} over budget` : ""}</div><div class="picker-body">${equipmentMarket()}</div>`;
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
      : [...new Set([...state.abilities, ...state.learned])]
  )
    .filter(
      (id) =>
        mode !== "advancement" ||
        (!classSignatures.includes(id) &&
          !preview.levels[activeLearningLevel()].before.abilities.includes(id) && !preview.levels[activeLearningLevel()].before.learned.includes(id)),
    )
    .map((id) => catalogs.inventory.acquisitions.find((a) => a.id === id))
    .filter(
      (a) =>
        a &&
        (a.weaponChoice ||
          a.recipeChoices ||
          a.languageChoice ||
          a.instrumentChoice ||
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
                  catalogs.languages,
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
      }${a.instrumentChoice ? field("Chosen ordinary instrument", `${path}.instrument`, d.instrument, "text", 'maxlength="120" placeholder="e.g. lute or flute"') : ""}${a.weaponChoice ? select("Weapon", `${path}.weapon`, option("", "Choose weapon", !d.weapon) + a.weaponChoice.map((id) => option(id, id === "melee" ? "Ordinary melee weapon" : id === "ranged" ? "Ranged weapon + d8 ammunition" : name(id), d.weapon === id)).join("")) : ""}${a.items.includes("item-ordinary-melee-weapon") || (a.weaponChoice?.includes("melee") && d.weapon === "melee") ? select("Melee weapon hands", `${path}.meleeHands`, option("", "Choose hands", !d.meleeHands) + [1, 2].map((n) => option(n, `${n} handed`, d.meleeHands === n)).join("")) : ""}</div>${
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
    .filter(r => !r.grantOnly)
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
      state.learning.disciplines
        .map(({ id, name }) => `<span class="chip">${symbol(id)}${esc(name)}</span>`)
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
function scarSection() {
  const { scars, dying, dead } = liveVitals();
  return `<section class="box"><h3 class="section-controls">Scars ${button("Record scar", "add-scar", dying || dead ? "disabled" : "", "small")}</h3>${scars.length ? `<ul>${scars.map((scar) => `<li>${esc(scar)}</li>`).join("")}</ul>` : "<p>No scars recorded.</p>"}</section>`;
}

function scarDialog() {
  popup(
    "Record scar",
    `<p>Choose one lasting reminder with the DA after surviving an incident that brought you to 0 HP.</p><label>Scar description<textarea id="scar-description" maxlength="500" rows="3"></textarea></label><div class="dialog-actions">${button("Save scar", "save-scar", "", "primary")}</div>`,
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
    `<label>Language<select id="play-language" aria-label="Language">${option("", "Custom language", true)}${catalogs.languages.filter(
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
function gritDialog() {
  const v = liveVitals();
  const trigger = v.gritTrigger ?? "turn-start";
  const ready = !v.immediateDeathRoll && forgeCanSpendGrit(v, v.limits, trigger);
  popup(
    "Use Grit",
    `<p>Spend one lifetime Grit to return to ${Math.min(Math.ceil(v.max / 2), v.recoveryMax)} HP and clear both death tallies.</p><p>${v.grit} Grit remaining. Spend it when you fall, when your Dying turn starts, after a failure, or while stabilized at 0 HP.</p><div class="dialog-actions">${button("Spend 1 Grit", "confirm-grit", ready ? `data-trigger="${trigger}"` : "disabled", "primary")}</div>`,
  );
}

function recoveryDialog() {
  const v = liveVitals();
  const canAct = v.max > 0 && !v.dead && v.failed < 3 && !v.immediateDeathRoll;
  const restHour = (v.lastRestHour ?? -16) + 24;
  const spRecovery = preview.state.learning?.recoverySp ?? 0;
  const firstAid = v.firstAidPending
    ? button("Finish first aid", "finish-first-aid", canAct ? "" : "disabled") + button("Interrupt first aid", "interrupt-first-aid", canAct ? "" : "disabled")
    : button("Begin first aid", "begin-first-aid", canAct && !v.firstAidUsed ? "" : "disabled");
  popup("Recovery", `
    <p><strong>${v.hp} / ${v.max} HP</strong> · <strong>${v.sp} / ${v.limits.maxSp} SP</strong> · ${v.grit} Grit</p>
    ${v.immediateDeathRoll ? `<p>Resolve the death roll for damage at 0 HP before moving on.</p>${button("Roll Fortitude", "death-roll")}` : ""}
    ${v.dying ? `<p>Failures ${v.failed} / 3 · Successes ${v.successfulDeathRolls} / 3</p><div class="dialog-actions">${button("Stabilize", "stabilize-hero", canAct ? "" : "disabled")}${v.failed === 3 ? button("Last Words", "hero-last-words") : ""}</div>` : ""}
    <h3>First aid</h3><p>One treatment per recipient between safe overnight rests. The healer uses medical supplies when treatment begins. A Dying patient continues to roll Fortitude.</p>
    <p>${v.firstAidPending ? "Treatment in progress" : v.firstAidUsed ? "Treatment used" : "Treatment available"}</p><div class="dialog-actions">${firstAid}</div>
    <h3>Safe overnight rest</h3><p>After eight safe hours including at least six hours of sleep or equivalent rest, restore HP and SP and renew first aid. Count elapsed hours from the start of your record.</p>
    <label>Hour rest finished<input id="hero-rest-hour" type="number" min="${restHour}" max="1000000000" value="${restHour}"></label>
    <div class="dialog-actions">${button("Complete safe rest", "complete-hero-rest", canAct && !v.dying ? "" : "disabled")}</div>
    ${spRecovery ? `<h3>Spellcraft Recovery</h3><p>After one uninterrupted safe hour, restore ${spRecovery} SP. Use once between safe overnight rests.</p><div class="dialog-actions">${button("Complete one hour", "hero-sp-recovery", canAct && !v.dying && !v.spellcraftRecoveryUsed ? "" : "disabled")}</div>` : ""}
    <div class="dialog-actions">${button("Record scar", "add-scar", canAct && !v.dying ? "" : "disabled")}</div>`);
}

function firstAidDialog() {
  popup("Finish first aid", `
    <p>Choose the healer’s treatment and their Knowledge result after the required time.</p>
    <label>Treatment<select id="aid-treatment"><option value="0">First aid · 10 minutes · 2/4/6 HP</option><option value="1">Field Dressing I · 10 minutes · 3/5/7 HP</option><option value="2">Field Dressing II · 10 minutes · 4/6/8 HP</option><option value="2">Field Dressing III · 5 minutes · 4/6/8 HP</option><option value="2">Emergency Treatment · Main Action · 4/6/8 HP</option></select></label>
    <label>Knowledge result<select id="aid-outcome"><option value="weak">Weak</option><option value="standard">Standard</option><option value="strong">Strong</option></select></label>
    <div class="dialog-actions">${button("Record treatment", "record-first-aid", "", "primary")}</div>`);
}

function debtRecoveryDialog() {
  const v = liveVitals();
  popup("Recovery until dawn", `<p>${v.recovery.unavailableHp} HP unavailable until next dawn. Healing and safe overnight rest can restore HP to ${v.recoveryMax} / ${v.max}.</p><p>The Debt Comes Due: ${v.recovery.debtUsed ? "used today" : "available"}. Use it after a sheet attribute roll to pay 1 HP and replace that roll with a new result using the same modifiers.</p><p>Declare the next dawn when it occurs in play. This unlocks recovery and refreshes the daily use.</p><div class="dialog-actions">${button("Recovery", "hero-recovery")}${button("Next dawn", "debt-next-dawn", "", "primary")}</div>`);
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
  const vitals = liveVitals();
  if (HEALING_POTION_IDS.includes(item.catalogId) && (vitals.dead || vitals.failed === 3 || vitals.immediateDeathRoll))
    throw new Error("Resolve the death roll before healing.");
  const face = randomDie(item.inventoryDie);
  const result = workshopSupplyUse({
    item,
    face,
    hp: liveVitals().hp,
    maxHp: liveVitals().max,
    catalog: catalogs.inventory,
    lifeResistance: preview.resistances.life ?? 0,
    recovery: draft.play?.recovery,
  });
  const inv = playDraft().inventory;
  inv.overrides ??= {};
  inv.overrides[id] = { ...inv.overrides[id], inventoryDie: result.after };
  if (result.potion) {
    Object.assign(playDraft(), forgeHeal(playDraft(), vitals.limits, result.healed));
  }
  persist();
  render();
  $("#supply-roll-result").innerHTML =
    `<p>${esc(name(item.catalogId))}: d${result.before} → <strong>${face}</strong> · ${result.after ? `d${result.after}` : "Exhausted"}</p>${result.potion ? `<p>Restored ${result.healed} HP · ${result.hp} / ${liveVitals().max}. The final dose still heals.</p>` : "<p>Supply check recorded after use.</p>"}`;
  if (result.exhausted)
    $("#reference [data-action=confirm-supply]").disabled = true;
}
let activeRoll = null;
function deathMarks(v) {
  return `<p>Failure marks <strong>${v.failedDeathRolls} / 3</strong> · Success marks <strong>${v.successfulDeathRolls} / 3</strong></p>`;
}
function openSheetRoll({ key, id, death = false, defense = false, cast = false, finishRitual = false }) {
  const record = get(id),
    attribute = death ? "fortitude" : (key ?? attributeFor(record));
  if (!ATTRIBUTES.includes(attribute))
    throw new Error("Choose an attribute for this roll.");
  activeRoll = { death, id, defense, cast, finishRitual };
  const v = liveVitals();
  if (death && (!v.dying || v.failed === 3)) throw new Error("Death rolls are for a Dying hero.");
  popup(
    death
      ? "Death roll"
      : defense
        ? "Evade"
        : (record?.name ?? title(attribute)),
    `
    ${death ? `<section class="death-panel"><div id="death-mark-display">${deathMarks(v)}</div><div class="death-outcomes"><span><b>Weak</b> +1 failure</span><span><b>Standard</b> No change</span><span><b>Strong</b> +1 success</span></div><p class="inline-help">${v.immediateDeathRoll ? "Resolve the roll for the damage just taken." : "Roll at the start of your Dying turn."} Three successes stabilize you at 0 HP.</p>${!v.immediateDeathRoll && forgeCanSpendGrit(v, v.limits, "turn-start") ? button("Spend Grit instead", "confirm-grit", 'data-trigger="turn-start"') : ""}</section>` : ""}
    ${defense ? '<p class="inline-help">Choose the defense attribute named by the attack. Strong defense takes Weak attack effects; Weak defense takes Strong attack effects.</p>' : ""}
    ${rollSetup({ attributes: Object.fromEntries((death ? ["fortitude"] : ATTRIBUTES).map((k) => [k, preview.attributes[k]])), selected: attribute, attributeId: "sheet-roll-attribute", value: preview.attributes[attribute], netId: "recipe-net", labelId: "roll-net-value" })}
    ${
      death
        ? ""
        : `<details class="hol-roll-abilities" open><summary>Abilities</summary><div class="roll-abilities">${knownCards()
            .sort((a, b) => Number(b.id === id) - Number(a.id === id))
            .map(
              (r) =>
                `<label class="inline-toggle"><input type="checkbox" data-roll-ability="${esc(r.id)}" ${r.id === id ? "checked" : ""}>${esc(r.name)}</label>`,
            )
            .join(
              "",
            )}</div><small>Choose applicable abilities; adjust the attribute and net Boons/Banes above.</small></details>`
    }
    <div id="recipe-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button(cast ? `Cast and roll${castCost(record) ? ` · ${castCost(record)} SP` : ""}` : "Roll", "roll-sheet", "", "primary")}</div>${record ? `<details ${cast || finishRitual ? "open" : ""}><summary>Rules</summary>${record.page ? spellProfile(record) : markdown(record.effect ?? references.records[id]?.markdown ?? "")}${learnedImprovements(id)}</details>` : ""}`,
  );
  bindRollSetup($("#reference .reference-body"), {
    getAttributeValue: () => preview.attributes[$("#sheet-roll-attribute").value],
  });
  if (cast || finishRitual) $("#sheet-roll-attribute").disabled = true;
  const conditions = [...preview.play.conditions];
  if (defense && v.max > 0 && v.hp === 0 && !v.dead) {
    // Stable heroes at 0 HP retain the same defense Banes as unconscious heroes.
    conditions.push({ id: "hp-defense", key: "unconscious", rating: 1, persistence: "binary", source: "0 HP" });
  }
  const automatic = [...conditionRollSources(conditions, {
    mode: death ? "death" : defense ? "defense" : "attribute",
    perceivedSources: [],
  }), ...(defense ? passiveAncestryDefenseSources(effectiveTraits()) : [])];
  if (death && effectiveTraits().includes("trait-human-weathered")) {
    automatic.push({ kind: "boon", amount: 1 });
    $("#recipe-roll-result").innerHTML = "<p>Never Quite Finished gives 1 Boon to this Fortitude roll.</p>";
  }
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
  if ((activeRoll.cast || activeRoll.finishRitual) && liveVitals().hp <= 0)
    throw new Error("Regain HP before resolving this working.");
  if (activeRoll.cast) {
    const cost = castCost(get(activeRoll.id));
    draft.play = forgeSpendSp(playDraft(), liveVitals().limits, cost);
    persist();
    render();
  }
  const result = displayDice(preview.attributes[key], undefined, activeRoll.death);
  if (activeRoll.cast || activeRoll.finishRitual) $("#reference [data-action=roll-sheet]").disabled = true;
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
  if (!activeRoll.death) {
    activeRoll.last = {
      attribute: preview.attributes[key], net: Number($("#recipe-net").value),
      selected, defense: activeRoll.defense,
    };
    appendDebtReroll();
  }
  if (activeRoll.death) {
    const v = liveVitals();
    const resultState = forgeDeathRoll(playDraft(), v.limits, {
      retained: result.retained, fortitude: preview.attributes[key],
    });
    const current = resultState.play;
    Object.assign(playDraft(), current, { immediateDeathRoll: false });
    $("#death-mark-display").innerHTML = deathMarks(current);
    const outcome = $("#recipe-roll-result");
    if (current.failedDeathRolls === 3) {
      outcome.insertAdjacentHTML("beforeend", `<p>Third failure. Spend Grit or use an eligible ability now, or describe your Last Words.</p><div class="dialog-actions">${button("Spend Grit", "confirm-grit", forgeCanSpendGrit(current, v.limits, "failure") ? 'data-trigger="failure"' : "disabled")}${button("Last Words", "hero-last-words")}</div>`);
      $("#reference [data-action=roll-sheet]").disabled = true;
    } else if (!current.dying) {
      outcome.insertAdjacentHTML("beforeend", "<p>Stabilized at 0 HP. Both tallies cleared.</p>");
      $("#reference [data-action=roll-sheet]").disabled = true;
    } else if (forgeCanSpendGrit(current, v.limits, "failure")) {
      outcome.insertAdjacentHTML("beforeend", `<div class="dialog-actions">${button("Spend Grit", "confirm-grit", 'data-trigger="failure"')}</div>`);
    }
    $("#reference [data-action=roll-sheet]").disabled = true;
    $("#reference [data-trigger=turn-start]")?.remove();
    persist();
    render();
  }
}
function appendDebtReroll() {
  if (!effectiveTraits().includes("trait-oath-bound-the-debt-comes-due")) return;
  const v = liveVitals();
  $("#recipe-roll-result").insertAdjacentHTML("beforeend", `<div class="dialog-actions">${button("The Debt Comes Due · pay 1 HP & reroll", "debt-reroll", v.hp > 1 && !v.recovery.debtUsed ? "" : "disabled")}</div>`);
}
function debtReroll() {
  if (!activeRoll?.last || activeRoll.death)
    throw new Error("Complete a sheet attribute roll before using The Debt Comes Due.");
  const original = activeRoll.last;
  const payment = payDebt({ hp: liveVitals().hp, maxHp: liveVitals().max,
    recovery: draft.play?.recovery, traitIds: effectiveTraits() });
  Object.assign(playDraft(), payment);
  persist();
  render();
  const result = displayDice(original.attribute, original.net);
  $("#recipe-roll-result").insertAdjacentHTML("beforeend", `<p>The Debt Comes Due: paid 1 HP; use this new result. The paid HP remains unavailable until next dawn.</p>${original.selected.length ? `<p>${original.selected.map(esc).join(" · ")}</p>` : ""}${original.defense ? `<p>${title(result.tier)} defense · read the ${result.tier === "weak" ? "Strong" : result.tier === "strong" ? "Weak" : "Standard"} attack effects.</p>` : ""}`);
  appendDebtReroll();
}
function recipeRoll(id, recipeId) {
  const ability = get(id),
    recipe = get(recipeId),
    attribute = attributeFor(ability);
  if (
    !attribute ||
    !preview.state.abilities.includes(id) ||
    !preview.state.recipes.includes(recipeId) ||
    !recipe.permissions.includes(id) ||
    !draft.play?.crafting?.[recipeId]?.active
  )
    throw new Error("Choose a known recipe and its learned crafting ability.");
  const supplies = preview.inventory.items.filter(
    (i) => i.catalogId === recipe.product && i.quantity > 0,
  );
  popup(
    `Craft ${recipe.name}`,
    `<p><strong>${esc(ability.name)}</strong> · ${title(attribute)} ${signed(preview.attributes[attribute])} · ${recipe.attemptMinutes} min per attempt</p>${recipe.maximumDie ? `<label>Supply<select id="craft-supply">${supplies.map((i) => `<option value="${esc(i.instanceId)}">${esc(name(i.catalogId))} · ${i.inventoryDie ? "d" + i.inventoryDie : "Empty"}</option>`).join("")}<option value="">New supply</option></select></label>` : `<p id="craft-progress">${craftingStatus(recipe)}</p>`}<p>${noRollBrew(id, recipe) ? "Brew to d4 without a roll" : `Weak 1 · Standard ${preview.state.learned.includes("craft:supplies:3") ? "3 · Strong 4" : "2 · Strong 3"} ${recipe.maximumDie ? "supply steps" : "progress"}`}. Tools, materials and time follow the recipe.</p>${netControl({ id: "recipe-net", labelId: "roll-net-value" })}<div id="recipe-roll-result" role="status" aria-live="polite"></div><div class="dialog-actions">${button(noRollBrew(id, recipe) ? "Brew" : "Roll", "roll-recipe", `data-id="${esc(id)}" data-recipe-id="${esc(recipeId)}"`, "primary")}</div><details><summary>Recipe rules</summary>${markdown(references.records[recipeId]?.markdown ?? "")}</details>`,
  );
  if (recipe.maximumDie)
    $("#craft-supply").value = draft.play.crafting[recipeId].supplyId ?? "";
  bindRollSetup($("#reference .reference-body"), {
    getAttributeValue: () => preview.attributes[attributeFor(ability)],
  });
}
function rollRecipeDice(id, recipeId) {
  if (!draft.play?.crafting?.[recipeId]?.active) return;
  const rolled = noRollBrew(id, get(recipeId)) ? {} : displayDice(preview.attributes[attributeFor(get(id))]);
  const result = workshopCraft({
    play: playDraft(),
    recipe: get(recipeId),
    tier: rolled.tier,
    abilityId: id,
    improved: preview.state.learned.includes("craft:supplies:3"),
    items: preview.inventory.items,
    supplyId: $("#craft-supply")?.value,
    instanceId: `inventory-${crypto.randomUUID()}`,
  });
  draft.play = result.play;
  persist();
  render();
  $("#recipe-roll-result").insertAdjacentHTML(
    "beforeend",
    `<p>${esc(result.message)}</p>`,
  );
  if ($("#craft-progress"))
    $("#craft-progress").innerHTML = craftingStatus(get(recipeId));
  const state = draft.play.crafting[recipeId];
  if (!state.active) {
    $("[data-action=roll-recipe]").hidden = true;
    $("#recipe-roll-result").insertAdjacentHTML(
      "beforeend",
      "<p>Project complete. Start the recipe again to make another.</p>",
    );
  }
  const select = $("#craft-supply");
  if (select) {
    select.innerHTML =
      preview.inventory.items
        .filter((i) => i.catalogId === get(recipeId).product && i.quantity > 0)
        .map(
          (i) =>
            `<option value="${esc(i.instanceId)}">${esc(name(i.catalogId))} · ${i.inventoryDie ? "d" + i.inventoryDie : "Empty"}</option>`,
        )
        .join("") + '<option value="">New supply</option>';
    select.value = state.supplyId;
  }
}

function displayDice(attribute, originalNet, deathRoll = false) {
  const net = originalNet ?? Number($("#recipe-net").value);
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
    `<strong>${title(result.tier)} · ${result.total}</strong><p>${faces.join(" · ")} → keep ${retained.join(" + ")} ${signed(plan.attribute)}${!deathRoll && result.natural !== "none" ? ` · ${result.natural === "critical" ? "Natural 666: additional benefit" : "Natural 111: complication"}` : ""}</p>`;
  return { ...result, retained };
}
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
  const pan = $(".forge-map-scroll");
  const panOffset = pan ? [pan.scrollLeft, pan.scrollTop] : null;
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
  if (panOffset && !focusHeading) $(".forge-map-scroll")?.scrollTo(...panOffset);
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
    if (target.dataset.field === "play.hp") {
      const v = liveVitals();
      if (v.immediateDeathRoll || v.dead || v.failed === 3) {
        target.value = String(v.hp);
        return notice("Resolve the death outcome before changing HP.");
      }
      if (value < v.hp) applyWorkshopDamage(v.hp - value);
      else if (value > v.hp) Object.assign(playDraft(), forgeHeal(playDraft(), v.limits, value - v.hp));
    } else set(target.dataset.field, value);
    if (target.dataset.field === "borrowedAncestryId") draft.borrowedTraitId = "";
    // A chosen current ancestry language replaces the retired two-language grant.
    if (target.dataset.field === "languages.ancestry" && value)
      draft.languages.extraSpoken = [];
  } else if (target.dataset.list) {
    const values = [...(getValue(target.dataset.list) ?? [])];
    set(
      target.dataset.list,
      target.checked
        ? [...new Set([...values, target.value])]
        : values.filter((v) => v !== target.value),
    );
    // The same checkbox handles regular choices and explicitly removed stale traits.
    if (target.dataset.list === "traitIds" &&
        target.value === "trait-human-many-homes" && !target.checked)
      draft.languages.extraSpoken = [];
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
  const result = forgeEligibility(catalogs.forge, learningState(), id);
  if (!result.eligible) throw new Error(result.reasons.join(" "));
  learningPurchases().push({ id });
  notice(`Learned ${name(id)}.`);
}

function refundLearning(id) {
  const choices = learningPurchases();
  if (!choices.some((entry) => entry.id === id)) return;
  const removed = new Set([id]);
  for (const choice of choices) {
    const entry = catalogs.forge.nodes.find((node) => node.id === choice.id);
    if (entry?.requires.some((parent) => removed.has(parent))) removed.add(choice.id);
  }
  choices.splice(0, choices.length, ...choices.filter((entry) => !removed.has(entry.id)));
  notice(`${[...removed].map(name).join(", ")} removed from this stage.`);
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
  if (r.page) body = spellProfile(r);
  else if (r.reference) {
    const { flavor, rules } = r.reference;
    body =
      flavor.map((t) => `<p class="flavor">${esc(t)}</p>`).join("") +
      `<h3>Rules</h3><dl>${rules.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}</dl>` +
      rules.body
        .map(block => ruleBlockMarkup(block, { outcomeLayout: "stacked" }))
        .join("") +
      (rules.notes ?? [])
        .map((n) => `<p><strong>${esc(n.label)}</strong> ${esc(n.text)}</p>`)
        .join("");
  } else
    body = markdown(
      r.referenceMarkdown ?? references.records[id]?.markdown ??
        "This reference is unavailable in this build.",
    );
  body += learnedImprovements(id);
  if (r.spellIds?.length)
    body += `<h3>Pages in this section</h3>${r.spellIds.map((spellId) => `<details><summary>${esc(name(spellId))}</summary>${spellProfile(get(spellId))}</details>`).join("")}`;
  const cost = castCost(r);
  const known = r.page ? preview.state.learning.spells.some((entry) => entry.id === id) : preview.state.abilities.includes(id);
  if (Number.isInteger(cost) && known)
    body += `<div class="dialog-actions">${button(isRitual(r) ? "Begin Ritual" : "Cast", "cast-spell", `data-id="${esc(id)}" ${preview.limits && liveVitals().hp > 0 && liveVitals().sp >= cost ? "" : "disabled"}`, "primary")}</div>`;
  const instrument = preview.state.instruments?.find(
    (entry) => entry.abilityId === id,
  )?.instrument;
  if (instrument)
    body = `<p><strong>Your instrument:</strong> ${esc(instrument)}</p>` + body;
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
  if (a === "hero-recovery") return recoveryDialog();
  if (a === "add-scar") return scarDialog();
  if (a === "finish-first-aid") return firstAidDialog();
  if (["save-scar", "complete-hero-rest", "begin-first-aid", "record-first-aid", "interrupt-first-aid", "hero-sp-recovery", "stabilize-hero", "hero-last-words"].includes(a)) {
    const v = liveVitals();
    let next;
    if (a === "save-scar") next = forgeRecordScar(playDraft(), v.limits, $("#scar-description").value);
    if (a === "complete-hero-rest") next = forgeRest(playDraft(), v.limits, { hour: $("#hero-rest-hour").valueAsNumber });
    if (a === "begin-first-aid") next = forgeBeginFirstAid(playDraft(), v.limits);
    if (a === "record-first-aid") next = forgeFinishFirstAid(playDraft(), v.limits, $("#aid-outcome").value, { fieldDressing: Number($("#aid-treatment").value) });
    if (a === "interrupt-first-aid") next = forgeInterruptFirstAid(playDraft(), v.limits);
    if (a === "hero-sp-recovery") next = forgeSpellcraftRecovery(playDraft(), v.limits, preview.state.learning.recoverySp);
    if (a === "stabilize-hero") next = forgeStabilize(playDraft(), v.limits);
    if (a === "hero-last-words") next = forgeFinalizeDeath(playDraft(), v.limits);
    Object.assign(playDraft(), next);
    persist();
    render();
    if (a === "save-scar") return $("#reference").close();
    return recoveryDialog();
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
    const v = liveVitals();
    const result = workshopConditionDamage({
      condition,
      contributions: preview.play.conditions,
      hp: v.hp,
      maxHp: v.max,
      resistances: preview.resistances,
    });
    const outcome = applyWorkshopDamage(result.amount);
    persist();
    render();
    notice(`${title(condition.key)} dealt ${result.amount} damage.`);
    if (outcome.deathRollRequired) return openSheetRoll({ death: true });
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
      step = (preview.stages[0].abilities.includes(id) || preview.stages[0].learned.includes(id)) ? 3 : 5;
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
  if (a === "use-grit") return gritDialog();
  if (a === "debt-recovery") return debtRecoveryDialog();
  if (a === "debt-reroll") return debtReroll();
  if (a === "debt-next-dawn") {
    Object.assign(playDraft(), nextDawn({ hp: liveVitals().hp, recovery: draft.play?.recovery }));
    persist();
    render();
    return debtRecoveryDialog();
  }
  if (a === "confirm-grit") {
    const v = liveVitals();
    Object.assign(playDraft(), forgeSpendGrit(playDraft(), v.limits, target.dataset.trigger));
    $("#reference").close();
    persist();
    render();
    notice("Grit spent. HP restored.");
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
  if (a === "open-roll" && Number.isInteger(castCost(get(target.dataset.id)))) return showReference(target.dataset.id);
  if (a === "open-roll")
    return openSheetRoll({
      key: target.dataset.attributeKey,
      id: target.dataset.id,
    });
  if (a === "death-roll") return openSheetRoll({ death: true });
  if (a === "roll-sheet") return rollSheetDice();
  if (a === "cast-spell") return castFromSheet(target.dataset.id);
  if (a === "finish-ritual") {
    const record = get(target.dataset.id);
    $("#reference").close();
    return openSheetRoll({ id: record.id, key: attributeFor(record), finishRitual: true });
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
  if (a === "roll-recipe")
    return rollRecipeDice(target.dataset.id, target.dataset.recipeId);
  if (a === "start-craft") {
    const recipe = get(target.dataset.recipeId);
    if (
      !craftingActions(preview, catalogs).some((a) => a.recipe.id === recipe.id)
    )
      return;
    draft.play = startWorkshopCraft(playDraft(), recipe);
    persist();
    render();
    document
      .querySelector(`[data-project="${recipe.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
    return;
  }
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
    const before = liveVitals().limits;
    draft.progression.level = Math.max(
      1,
      Math.min(100, draft.progression.level + (a === "level-up" ? 1 : -1)),
    );
    const after = workshopCharacter(draft, catalogs).limits;
    if (after && before.maxHp > 0) Object.assign(playDraft(), advanceForgeVitals(playDraft(), before, after));
  }
  if (a === "advance" || a === "edit-learning-level") {
    editingLevel = a === "edit-learning-level" ? Number(target.dataset.level) : null;
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
  if (a === "edit") edit = !edit;
  if (a === "tab") {
    tab = target.dataset.tab;
    query = "";
    filter = "all";
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
  }
  if (a === "ancestry") draft.ancestryId = target.dataset.id;
  if (a === "class") {
    const r = get(target.dataset.id);
    if (!classEligibility(r, draft.attributes).eligible) return;
    draft.classId = r.id;
  }
  if (a === "signature") draft.signatureId = target.dataset.id;
  if (a === "forge-select") forgeSelected = target.dataset.id;
  if (a === "forge-filter") forgeDiscipline = target.dataset.id;
  if (a === "forge-view") {
    const value = target.dataset.id;
    if (value === "zoom-in" || value === "zoom-out")
      forgeZoom = Math.max(.75, Math.min(2, forgeZoom + (value === "zoom-in" ? .25 : -.25)));
    else forgeView = value;
  }
  if (a === "forge-learn") {
    const node = catalogs.forge.nodes.find((entry) => entry.id === target.dataset.id);
    const currentSp = liveVitals().sp;
    learn(target.dataset.id);
    if (mode === "advancement" && node?.spCapacity) playDraft().sp = currentSp;
  }
  if (a === "forge-refund") refundLearning(target.dataset.id);
  if (a === "remove-purchase")
    refundLearning(learningPurchases()[Number(target.dataset.index)]?.id);
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
      "edit-learning-level",
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
  if (a === "forge-learn" || a === "forge-select")
    $("#forge-selection")?.focus({ preventScroll: a === "forge-learn" || (!target.classList?.contains("forge-related-node") && !matchMedia("(max-width: 680px)").matches) });
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
  const [choices, inventory, refs, sample, wounds, forge, forgeRefs] = await Promise.all([
    load("choices"),
    load("inventory"),
    load("references"),
    load("example"),
    load("wounds"),
    load("forge"),
    load("forge-references"),
  ]);
  if (
    choices.sourceCommit !== inventory.sourceCommit ||
    wounds.sourceCommit !== choices.sourceCommit ||
    refs.sourceCommit !== choices.sourceCommit
  )
    throw new Error("The workshop catalogs do not use the same rules edition.");
  if (forgeRefs.sourceCommit !== forge.sourceCommit) throw new Error("Could not match the current Workshop rules.");
  catalogs = workshopCatalogs(choices, inventory, wounds, forge, forgeRefs);
  references = { records: { ...refs.records, ...forgeRefs.records } };
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
        : saved.tab === "Recipes"
          ? "Crafting"
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
    const lang = catalogs.languages.find((l) => l.id === event.target.value);
    $("#language-name").value = lang?.name ?? "";
    $("#language-form").value = lang?.form ?? "spoken";
    $("#language-written").checked = lang?.writing ?? true;
  }
});
