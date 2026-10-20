import { EQUIPMENT_TRAINING } from "./rules/equipment-eligibility.mjs";
import { ATTRIBUTES } from "./rules/character.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { inventoryCheck, refillInventory } from "./rules/inventory.mjs";
import { CONDITION_KINDS } from "./rules/conditions.mjs";
const kind = document.body.dataset.sheet,
  app = document.querySelector("#app"),
  dialog = document.querySelector("#reference");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const title = (v) =>
  String(v ?? "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
const btn = (text, action, extra = "", style = "small") =>
  `<button type="button" data-action="${action}" ${extra} class="${style}">${text}</button>`;
const icons = {
  die: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${icons[name] ?? icons.die}</svg>`;
let creatures,
  inventory,
  choices,
  refs,
  art,
  state,
  edit = false;
const key = `hol.sheet.${kind}.v1`,
  libraryKey = `${key}.library`;
const note = (v) => {
  document.querySelector("#notice").textContent = v;
  setTimeout(() => (document.querySelector("#notice").textContent = ""), 2500);
};
function persist() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    note("Browser storage is unavailable. Export JSON to keep a copy.");
  }
}
function record() {
  return kind === "item"
    ? (inventory.equipment.find((r) => r.id === state.id) ??
        choices.find((r) => r.id === state.id && r.kind === "ability") ??
        inventory.recipes.find((r) => r.id === state.id))
    : creatures.find((r) => r.id === state.id);
}
function defaults() {
  return kind === "npc"
    ? {
        name: "Edda Vale",
        role: "Watch officer",
        location: "West gate",
        id: "creature-shield-soldier",
        detail: "Rehearses orders under her breath.",
        want: "Keep the road safe without losing her patrol.",
        knowledge: "Which carts passed the gate before dawn.",
        boundary: "Will not abandon someone under her protection.",
        relationship: "Trusts the keeper of the roadside shrine.",
        notes: "",
        conditions: [],
        collapsed: {},
      }
    : {
        id:
          kind === "creature"
            ? "creature-goblin-scrapper"
            : "item-ordinary-light-armor",
        notes: "",
        conditions: [],
        collapsed: {},
        quantity: 1,
      };
}
function validate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose a sheet JSON object.");
  const d = structuredClone(value);
  if (d.id !== null && d.id !== undefined) {
    const valid =
      kind === "item"
        ? [
            ...inventory.equipment,
            ...inventory.recipes,
            ...choices.filter((r) => r.kind === "ability"),
          ].some((r) => r.id === d.id)
        : creatures.some((r) => r.id === d.id);
    if (!valid) throw new Error("This catalog entry is not available.");
  }
  if (kind !== "npc" && !d.id) throw new Error("Select a catalog entry.");
  for (const field of [
    "name",
    "role",
    "location",
    "detail",
    "want",
    "knowledge",
    "boundary",
    "relationship",
    "notes",
  ])
    if (
      d[field] !== undefined &&
      (typeof d[field] !== "string" || d[field].length > 10000)
    )
      throw new Error("Sheet text exceeds the supported length.");
  for (const field of ["hp", "maxHp", "quantity", "supply"])
    if (
      d[field] !== undefined &&
      (!Number.isSafeInteger(d[field]) || d[field] < 0 || d[field] > 100000)
    )
      throw new Error("Use nonnegative whole numbers.");
  if (d.maxHp === 0) throw new Error("Maximum HP must be positive.");
  if (d.supply !== undefined && ![0, 4, 6, 8, 10, 12, 20].includes(d.supply))
    throw new Error("Invalid supply die.");
  if (
    d.attrs !== undefined &&
    (!d.attrs ||
      ATTRIBUTES.some(
        (a) =>
          d.attrs[a] !== undefined &&
          (!Number.isInteger(d.attrs[a]) || d.attrs[a] < -2 || d.attrs[a] > 2),
      ))
  )
    throw new Error("Attributes must be −2 to +2.");
  if (
    !Array.isArray(d.conditions ?? []) ||
    (d.conditions ?? []).length > 50 ||
    (d.conditions ?? []).some(
      (c) =>
        !Object.hasOwn(CONDITION_KINDS, c.key) ||
        !Number.isInteger(c.rating) ||
        c.rating < 1 ||
        c.rating > 99,
    )
  )
    throw new Error("Invalid condition list.");
  if (
    d.collapsed !== undefined &&
    (!d.collapsed ||
      typeof d.collapsed !== "object" ||
      Array.isArray(d.collapsed) ||
      Object.values(d.collapsed).some((v) => typeof v !== "boolean"))
  )
    throw new Error("Invalid panel state.");
  d.conditions ??= [];
  d.collapsed ??= {};
  return d;
}
const field = (label, path, value, type = "text", extra = "") =>
  `<label>${esc(label)}<input aria-label="${esc(label)}" data-field="${path}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const row = (label, value) =>
  `<div class="stat-row"><span>${esc(label)}</span><strong>${esc(value ?? "—")}</strong></div>`;
function section(id, label, body, extra = "") {
  return `<details class="box sheet-section" data-collapse="${id}" ${(state.collapsed[id] ?? ["npc-details", "book-details", "notes"].includes(id)) ? "" : "open"}><summary><h3>${esc(label)}</h3>${extra}</summary>${body}</details>`;
}
function popup(name, body) {
  dialog.innerHTML = `<header><h2 id="reference-title">${esc(name)}</h2>${btn("Close", "close")}</header><div class="reference-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
}
function textMarkup(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function markdown(text) {
  return String(text ?? "")
    .replace(/^- \*\*ID:\*\*.*$/gm, "")
    .split(/\n\s*\n/)
    .filter((b) => !b.startsWith("**ID:**"))
    .map((b) => {
      if (b.startsWith("|")) {
        const rows = b.split("\n").filter((x) => !/^\|[- :|]+$/.test(x));
        return `<div class="table-wrap"><table>${rows
          .map(
            (r, i) =>
              `<tr>${r
                .split("|")
                .slice(1, -1)
                .map(
                  (c) =>
                    `<${i ? "td" : "th"}>${textMarkup(c.trim())}</${i ? "td" : "th"}>`,
                )
                .join("")}</tr>`,
          )
          .join("")}</table></div>`;
      }
      if (b.split("\n").every((line) => line.startsWith("- **"))) {
        return `<dl class="card-metadata">${b
          .split("\n")
          .map((line) => {
            const m = line.match(/^- \*\*([^*]+)\*\*\s*(.*)$/);
            return m
              ? `<dt>${esc(m[1].replace(/:$/, ""))}</dt><dd>${textMarkup(m[2])}</dd>`
              : "";
          })
          .join("")}</dl>`;
      }
      const h = b.match(/^(#{1,6}) (.*)$/);
      return h
        ? `<h3>${textMarkup(h[2])}</h3>`
        : `<p>${textMarkup(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}
function portrait(r) {
  return r && art[r.id]
    ? `<button class="portrait-button" data-action="portrait" aria-label="View ${esc(r.name)} portrait"><img src="${esc(art[r.id])}" alt="${esc(r.name)}" loading="lazy"></button>`
    : "";
}
function attributes(r) {
  return `<div class="attributes">${ATTRIBUTES.map((a) => `<div class="attribute"><span>${title(a)}</span>${edit ? `<input aria-label="${title(a)}" data-field="attrs.${a}" type="number" min="-2" max="2" value="${state.attrs?.[a] ?? r?.attributes[a] ?? 0}">` : `${btn(icon("die"), "roll", `data-attribute="${a}" aria-label="Roll ${title(a)}"`, "icon-button")}<strong>${signed(state.attrs?.[a] ?? r?.attributes[a] ?? 0)}</strong>`}</div>`).join("")}</div>`;
}
function itemVitals(r) {
  const vital = (label, value) =>
    `<div class="vital"><small>${label}</small><strong>${esc(value)}</strong></div>`;
  if (r.kind === "ability")
    return vital("Level", r.minimumLevel) + vital("DP", r.cost ?? "—");
  if (r.attemptMinutes !== undefined)
    return vital("Minutes / attempt", r.attemptMinutes);
  return (
    `<div class="vital"><small>Qty</small><input aria-label="Quantity" data-field="quantity" type="number" min="0" max="100000" value="${state.quantity ?? 1}"></div>` +
    vital("Bulk", r.bulk ?? "—") +
    vital("Coins", r.price ?? "—")
  );
}
function header(r) {
  const name = state.name ?? r?.name ?? "New NPC";
  const max = state.maxHp ?? r?.hp?.max ?? 0;
  return `<div class="workshop-header"><div class="toolbar"><div>${btn(edit ? "✓ Done" : "✎ Edit", "edit", "", "quiet")}${btn(kind === "npc" ? "New NPC" : `Choose ${kind}`, "choose", "", "quiet")}</div><div>${["Save", "Load", "Import", "Export"].map((a) => btn(a, a.toLowerCase(), "", "quiet")).join("")}</div></div><header class="hero-header prototype-header">${kind !== "item" ? portrait(r) : ""}<div class="card-identity">${kind === "item" ? `<img class="item-mark" src="assets/${esc(r.requirements?.find((q) => q.kind === "discipline")?.id.replace("discipline-", "") ?? (r.id.includes("armor") ? "armor" : "craft"))}.webp" alt="">` : ""}${edit ? field("Name", "name", name) : `<h1>${esc(name)}</h1>`}<p>${esc(kind === "npc" ? [state.role, state.location].filter(Boolean).join(" · ") : kind === "creature" ? `${r.family} · ${r.classification.role}` : title(r.kind ?? (r.price !== undefined ? "equipment" : "recipe")))}</p></div><div class="vitals">${kind === "item" ? itemVitals(r) : r ? `<div class="vital"><small>HP</small><div class="hp-value"><input aria-label="Current HP" data-field="hp" type="number" min="0" max="100000" value="${state.hp ?? max}"><span>/ ${max}</span></div></div><div class="vital"><small>Speed</small><strong>${r.speed.ordinary}</strong></div><div class="vital"><small>CV</small><strong>${r.cv}</strong></div>` : ""}</div></header>${kind !== "item" && r ? attributes(r) + defenses(r) : ""}</div>`;
}
function defenses(r) {
  return `<div class="combat-stats" aria-label="Combat statistics">${[
    ["Armor DR", r.armor.sourceText],
    ["Evasion", r.defenses.evasion.sourceText],
    ["Threat", r.defenses.threat.sourceText],
    ["Stability", r.defenses.stability],
    ["Resistance", r.resistances.sourceText],
    ["Weakness", r.weaknesses.sourceText],
    ["Immunity", r.immunities.length ? r.immunities.join(", ") : "None"],
  ]
    .map(
      ([label, value]) =>
        `<div><small>${label}</small><strong>${esc(value)}</strong></div>`,
    )
    .join("")}</div>`;
}
function conditions() {
  return section(
    "conditions",
    "Conditions",
    state.conditions
      .map(
        (c, i) =>
          `<div class="stat-row"><span>${title(c.key)} ${c.rating}</span>${btn("×", "remove-condition", `data-index="${i}" aria-label="Remove ${title(c.key)}"`, "quiet small")}</div>`,
      )
      .join(""),
    (state.conditions.length ? "" : "<small>No conditions.</small>") +
      btn("+", "add-condition", 'aria-label="Add condition"', "small"),
  );
}
const actionGroups = [
  ["main", "Main actions"],
  ["maneuvers", "Maneuvers"],
  ["reactions", "Reactions"],
];
function actionContext(r, a) {
  const d = r.reference.specialtyDetails.find(
    (d) => d.title.toLowerCase() === a.name.toLowerCase(),
  );
  return (
    d?.fields
      .filter((f) => ["Target", "Damage type", "Limit"].includes(f.label))
      .map((f) => `${f.label}: ${f.text}`)
      .join(" · ") ?? ""
  );
}
function actions(r) {
  return `<div class="action-groups">${actionGroups.map(([key, label]) => section(key, label, `<div class="table-wrap"><table class="action-table"><thead><tr><th>${key === "main" ? "Action" : "Name"}</th>${key === "main" ? "<th>Defense</th><th>Weak</th><th>Standard</th><th>Strong</th>" : "<th>Effect</th>"}</tr></thead><tbody>${r.actions[key].actions.map((a, i) => `<tr><td>${btn(esc(a.name), "action", `data-group="${key}" data-index="${i}"`, "table-link")}</td>${key === "main" ? `<td>${esc(a.defense.sourceText)}</td>${["weak", "standard", "strong"].map((t) => `<td><span title="${esc(a.outcomes[t])}">${esc(a.outcomes[t])}</span></td>`).join("")}` : `<td><span title="${esc(a.effect)}">${esc(a.effect)}</span></td>`}</tr>${key === "main" && actionContext(r, a) ? `<tr class="action-context-row"><td colspan="5">${esc(actionContext(r, a))}</td></tr>` : ""}`).join("")}</tbody></table></div>`)).join("")}</div>`;
}
function specialties(r) {
  const names = Object.values(r.actions)
    .flatMap((g) => g?.actions ?? [])
    .map((a) => a.name.toLowerCase());
  const extra = r.reference.specialtyDetails
    .map((d, i) => ({ ...d, i }))
    .filter((d) => !names.includes(d.title.toLowerCase()));
  return extra.length
    ? section(
        "combat-specialties",
        "Specialties",
        extra
          .map((d) =>
            btn(
              esc(d.title),
              "specialty",
              `data-index="${d.i}"`,
              "quiet small",
            ),
          )
          .join(""),
      )
    : "";
}
function combat(r) {
  if (!r)
    return `<section class="box"><h3>Combat profile</h3><p>Choose a creature profile when this person needs combat statistics.</p>${btn("Choose combat profile", "profile", "", "primary small")}</section>`;
  return `<div class="combat-label">Player defense outcomes · Weak / Standard / Strong <span>${esc(r.size.sourceText)} · Speed ${esc(r.speed.sourceText)}</span></div>${actions(r)}${specialties(r)}${conditions()}`;
}
function npcMain() {
  return `<div class="main-layout"><div>${section("portrayal", "At the table", ["detail", "want", "knowledge", "boundary"].map((k) => (edit ? `<label>${title(k)}<textarea data-field="${k}" aria-label="${title(k)}" maxlength="10000">${esc(state[k])}</textarea></label>` : `<div class="portrayal-line"><h4>${{ detail: "Recognizable detail", want: "Wants", knowledge: "Knows", boundary: "Boundary" }[k]}</h4><p>${esc(state[k] || "—")}</p></div>`)).join(""))}${section("relationship", "Relationship", edit ? `<textarea aria-label="Relationship" data-field="relationship" maxlength="10000">${esc(state.relationship)}</textarea>` : `<p>${esc(state.relationship || "—")}</p>`)}</div><aside class="play-summary">${section("identity", "Identity", edit ? field("Role", "role", state.role) + field("Location", "location", state.location) : row("Role", state.role) + row("Location", state.location))}${section("profile", "Combat profile", `<p>${esc(record()?.name ?? "None linked")}</p>${btn(record() ? "Change profile" : "Choose profile", "profile", "", "small")}${record() ? btn("Unlink", "unlink", "", "quiet small") : ""}`)}</aside></div>`;
}
function itemMain(r) {
  const ref = r.reference;
  const details = ref?.rules?.details ?? [];
  const die = state.supply ?? r.inventoryDie;
  const properties =
    (r.handChoices?.length ? row("Hands", r.handChoices.join(" / ")) : "") +
    (r.specialOrder ? row("Acquisition", "Special order") : "") +
    (EQUIPMENT_TRAINING[r.id]
      ? row(
          "Training",
          choices.find((c) => c.id === EQUIPMENT_TRAINING[r.id])?.name,
        )
      : "");
  const equipmentText = refs[r.id]?.markdown
    ?.replace(/^# .+\n/, "")
    .replace(/^## Rules\s*$/gm, "")
    .replace(/^- \*\*(ID|Bulk):\*\*.*$/gm, "")
    .replace(/^\[Equipment index\].*$/gm, "")
    .replace(/^\*\*Market price:\*\*.*$/gm, "");
  const body = ref?.rules?.body
    ? ref.rules.body
        .map((b) =>
          b.outcomes
            ? `<table class="outcome-table">${b.outcomes.map((o) => `<tr><th>${esc(o.label)}</th><td>${esc(o.text)}</td></tr>`).join("")}</table>`
            : b.text
              ? `<p>${esc(b.text)}</p>`
              : "",
        )
        .join("")
    : markdown(equipmentText);
  return `<div class="item-layout"><article class="rule-card"><div class="rule-card-body">
    ${ref?.flavor?.length ? `<p class="flavor">${esc(ref.flavor.join(" "))}</p>` : ""}
    ${details.length ? `<dl class="card-metadata">${details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}</dl>` : ""}
    ${body}${ref?.rules?.notes?.map((n) => `<p>${esc(typeof n === "string" ? n : n.text)}</p>`).join("") ?? ""}
    </div></article><aside>
    ${properties ? section("properties", "Properties", properties) : ""}
    ${die !== null && die !== undefined ? section("supply", "Supply", `<div class="supply-current">${die ? `d${die}` : "Empty"}</div>${die ? btn(icon("die") + " Use supply", "supply", "", "small") : ""}${btn("Resupply", "resupply", "", "small")}`) : ""}
    ${r.requirements?.length ? section("requirements", "Requirements", r.requirements.map((q) => row(choices.find((c) => c.id === q.id)?.name ?? title(q.kind), q.rank ?? q.value ?? "")).join("")) : ""}
    </aside></div>`;
}

function world(r) {
  return `${section("flavor", "In the world", markdown(r.reference.flavorMarkdown))}${section("world", "Details", `<dl class="world-fields">${r.reference.generalFields.map((f) => `<dt>${esc(f.label)}</dt><dd>${textMarkup(f.text)}</dd>`).join("")}</dl>`)}${section("specialties", "Specialties", r.reference.specialtyDetails.map((d, i) => `<div class="stat-row"><span>${esc(d.title)}</span>${btn("Read", "specialty", `data-index="${i}"`, "small quiet")}</div>`).join("") || "<small>No additional specialties.</small>")}`;
}
let pointerDown = false,
  pendingRender = false;
function render() {
  pendingRender = false;
  const active = document.activeElement,
    activeField = active?.dataset?.field;
  const position =
    active && ["text", "search"].includes(active.type)
      ? active.selectionStart
      : null;
  const r = record();
  const scroll = document.querySelector("#panel")?.scrollTop ?? 0;
  app.innerHTML =
    header(r) +
    `<div class="sheet-body"><section id="panel" class="panel sheet-panel prototype-panel" aria-label="${title(kind)} card">${kind === "item" ? itemMain(r) : combat(r)}${kind === "npc" ? section("npc-details", "Portrayal & profile", npcMain()) : kind === "creature" ? section("book-details", "World & specialties", world(r)) : ""}${section("notes", "Notes", `<textarea aria-label="Notes" data-field="notes" class="notes-editor" maxlength="10000" placeholder="Notes for this ${kind}…">${esc(state.notes)}</textarea>`)}</section></div>`;
  app.removeAttribute("aria-busy");
  document.querySelector("#panel").scrollTop = scroll;
  if (activeField) {
    const replacement = [...app.querySelectorAll("[data-field]")].find(
      (e) => e.dataset.field === activeField,
    );
    replacement?.focus({ preventScroll: true });
    if (position !== null && replacement?.setSelectionRange)
      replacement.setSelectionRange(position, position);
  }
}
function showPicker() {
  const items =
    kind === "item"
      ? [
          ...inventory.equipment,
          ...inventory.recipes,
          ...choices.filter((r) => r.kind === "ability" && !r.universal),
        ]
      : creatures;
  popup(
    kind === "item" ? "Choose item" : "Choose combat profile",
    `<label>Search<input id="catalog-search" type="search" aria-label="Search catalog" autocomplete="off"></label><div id="catalog-results" class="catalog-results"></div>`,
  );
  const fill = () => {
    const q = document.querySelector("#catalog-search").value.toLowerCase();
    document.querySelector("#catalog-results").innerHTML =
      items
        .filter((r) =>
          `${r.name} ${r.family ?? r.kind ?? "equipment"}`
            .toLowerCase()
            .includes(q),
        )
        .map(
          (r) =>
            `<div class="catalog-row">${kind !== "item" ? `<img src="${esc(art[r.id])}" alt="" loading="lazy">` : ""}<div><strong>${esc(r.name)}</strong><small>${esc(r.family ? `${r.family} · CV ${r.cv}` : title(r.kind ?? "equipment"))}</small></div>${btn("Choose", "pick", `data-id="${esc(r.id)}"`, "small")}</div>`,
        )
        .join("") || "<p>No matching entries.</p>";
  };
  document.querySelector("#catalog-search").addEventListener("input", fill);
  fill();
}
function randomDie(sides) {
  const a = new Uint32Array(1),
    limit = Math.floor(4294967296 / sides) * sides;
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return 1 + (a[0] % sides);
}
let rollAttribute = "agility",
  defenseAction = null;
function rollDialog(attribute, action = null) {
  rollAttribute = attribute;
  defenseAction = action;
  popup(
    action ? "Defend" : `${title(attribute)} roll`,
    `<div class="field-grid"><label>Attribute<select id="roll-attribute" aria-label="Roll attribute">${ATTRIBUTES.map((a) => `<option value="${a}" ${a === attribute ? "selected" : ""}>${title(a)}</option>`).join("")}</select></label><label>Attribute value<input id="roll-value" aria-label="Attribute value" type="number" min="-2" max="2" value="${action ? 0 : (state.attrs?.[attribute] ?? record()?.attributes?.[attribute] ?? 0)}"></label></div><div class="roll-net"><label class="roll-net-labels" for="roll-net"><span>Banes</span><output id="net-label">Even</output><span>Boons</span></label><input id="roll-net" aria-label="Banes / Boons" type="range" min="-3" max="3" value="0"></div><div id="roll-result" role="status" aria-live="polite"></div>${btn("Roll", "roll-now", "", "primary small")}`,
  );
  document.querySelector("#roll-attribute").addEventListener("change", (e) => {
    if (!defenseAction)
      document.querySelector("#roll-value").value =
        state.attrs?.[e.target.value] ??
        record()?.attributes?.[e.target.value] ??
        0;
  });
}
function library() {
  const saves = JSON.parse(localStorage.getItem(libraryKey) ?? "[]");
  popup(
    "Saved sheets",
    saves
      .map(
        (s) =>
          `<div class="stat-row"><span>${esc(s.name)}</span><div>${btn("Load", "load-saved", `data-id="${esc(s.id)}"`)}${btn("×", "delete-saved", `data-id="${esc(s.id)}" aria-label="Delete ${esc(s.name)}"`, "small quiet")}</div></div>`,
      )
      .join("") || "<p>No saved sheets yet.</p>",
  );
}
async function action(t) {
  const a = t.dataset.action,
    r = record();
  if (a === "close") return dialog.close();

  if (a === "edit") {
    edit = !edit;
    render();
    return;
  }
  if (a === "choose") {
    if (kind === "npc") {
      state = {
        ...defaults(),
        name: "New NPC",
        role: "",
        location: "",
        id: null,
        detail: "",
        want: "",
        knowledge: "",
        boundary: "",
        relationship: "",
      };
      edit = true;
      persist();
      render();
    } else showPicker();
    return;
  }
  if (a === "profile") return showPicker();
  if (a === "pick") {
    if (kind === "npc") {
      state.id = t.dataset.id;
      delete state.hp;
      delete state.maxHp;
      delete state.attrs;
    } else {
      state = { ...defaults(), id: t.dataset.id };
    }
    persist();
    render();
    dialog.close();
    if (kind !== "npc") document.querySelector("#panel").scrollTop = 0;
    return;
  }
  if (a === "unlink") {
    state.id = null;
    delete state.hp;
    delete state.attrs;
    persist();
    render();
    return;
  }
  if (a === "portrait")
    return popup(
      r.name,
      `<img class="portrait-large" src="${esc(art[r.id])}" alt="${esc(r.name)}">`,
    );
  if (a === "specialty") {
    const d = r.reference.specialtyDetails[Number(t.dataset.index)];
    return popup(d.title, markdown(d.markdown));
  }
  if (a === "action") {
    const group = t.dataset.group,
      entry = r.actions[group].actions[Number(t.dataset.index)];
    const d = r.reference.specialtyDetails.find(
      (d) => d.title.toLowerCase() === entry.name.toLowerCase(),
    );
    if (group !== "main")
      return popup(
        entry.name,
        d ? markdown(d.markdown) : `<p>${esc(entry.effect)}</p>`,
      );
    return popup(
      entry.name,
      `<div class="attack-card"><p><b>${esc(state.name ?? r.name)}</b> · Defend with ${esc(entry.defense.sourceText)}</p><table class="outcome-table">${["weak", "standard", "strong"].map((v) => `<tr><th>${title(v)} defense</th><td>${esc(entry.outcomes[v])}</td></tr>`).join("")}</table>${d ? markdown(d.markdown) : ""}${entry.defense.attribute ? btn("Defend", "defend", `data-index="${t.dataset.index}"`, "primary small") : ""}</div>`,
    );
  }
  if (a === "defend") {
    const entry = r.actions.main.actions[Number(t.dataset.index)];
    return rollDialog(entry.defense.attribute ?? "agility", entry);
  }
  if (a === "roll") return rollDialog(t.dataset.attribute);
  if (a === "roll-now") {
    const value = Number(document.querySelector("#roll-value").value),
      net = Number(document.querySelector("#roll-net").value);
    if (!Number.isInteger(value) || value < -2 || value > 2)
      throw new Error("Use an attribute from −2 to +2.");
    const plan = rollPlan({
        attribute: value,
        boons: Math.max(0, net),
        banes: Math.max(0, -net),
      }),
      faces = Array.from({ length: plan.count }, () => randomDie(6)),
      retained = [...faces]
        .sort((a, b) => (net < 0 ? a - b : b - a))
        .slice(0, 3),
      result = classifyRoll(retained, value);
    document.querySelector("#roll-result").innerHTML =
      `<h3>${title(result.tier)} · ${result.total}</h3><p>${faces.join(" · ")} → ${retained.join(" + ")} ${signed(value)}</p>${defenseAction ? `<p>${esc(defenseAction.outcomes[result.tier])}</p>` : ""}`;
    return;
  }
  if (a === "add-condition")
    return popup(
      "Add condition",
      `<label>Condition<select id="condition-key" aria-label="Condition">${Object.keys(
        CONDITION_KINDS,
      )
        .map((k) => `<option value="${k}">${title(k)}</option>`)
        .join(
          "",
        )}</select></label><label>Rating<input id="condition-rating" aria-label="Rating" type="number" min="1" max="99" value="1"></label>${btn("Add", "confirm-condition", "", "primary small")}`,
    );
  if (a === "confirm-condition") {
    const rating = Number(document.querySelector("#condition-rating").value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 99)
      throw new Error("Use a rating from 1 to 99.");
    state.conditions.push({
      key: document.querySelector("#condition-key").value,
      rating,
    });
    persist();
    render();
    dialog.close();
    return;
  }
  if (a === "remove-condition") {
    state.conditions.splice(Number(t.dataset.index), 1);
    persist();
    render();
    return;
  }
  if (a === "resupply")
    return popup(
      "Resupply",
      `<label>Steps<select id="refill-steps" aria-label="Resupply steps">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label>${btn("Resupply", "confirm-refill", "", "primary small")}`,
    );
  if (a === "confirm-refill") {
    state.supply = refillInventory({
      die: state.supply ?? r.inventoryDie,
      steps: Number(document.querySelector("#refill-steps").value),
      maximumDie: r.inventoryDie,
    }).after;
    persist();
    render();
    dialog.close();
    return;
  }
  if (a === "supply") {
    const die = state.supply ?? r.inventoryDie;
    if (!die) return;
    const face = randomDie(die);
    const result = inventoryCheck({ die, retained: face });
    state.supply = result.after;
    persist();
    render();
    return popup(
      r.name,
      `<p>d${die} → ${face} · ${result.after ? "d" + result.after : "Empty"}</p>`,
    );
  }
  if (a === "save") {
    const saves = JSON.parse(localStorage.getItem(libraryKey) ?? "[]");
    saves.push({
      id: crypto.randomUUID(),
      name: state.name ?? r?.name ?? "NPC",
      state: structuredClone(state),
    });
    localStorage.setItem(libraryKey, JSON.stringify(saves.slice(-50)));
    return note("Sheet saved.");
  }
  if (a === "load") return library();
  if (a === "load-saved") {
    edit = false;
    state = validate(
      JSON.parse(localStorage.getItem(libraryKey) ?? "[]").find(
        (s) => s.id === t.dataset.id,
      ).state,
    );
    persist();
    render();
    dialog.close();
    return;
  }
  if (a === "delete-saved") {
    localStorage.setItem(
      libraryKey,
      JSON.stringify(
        JSON.parse(localStorage.getItem(libraryKey) ?? "[]").filter(
          (s) => s.id !== t.dataset.id,
        ),
      ),
    );
    return library();
  }
  if (a === "import") return document.querySelector("#sheet-import").click();
  if (a === "export") {
    const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "hol.sheet.prototype",
              sourceCommit: inventory.sourceCommit,
              version: 1,
              kind,
              state,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `${kind}.hol-sheet.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
document.addEventListener("pointerdown", () => {
  pointerDown = true;
});
for (const event of ["pointerup", "pointercancel"])
  document.addEventListener(event, () => {
    pointerDown = false;
    setTimeout(() => {
      if (pendingRender) render();
    }, 0);
  });
dialog.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    dialog.close();
  }
});
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (t && !t.disabled)
    Promise.resolve(action(t)).catch((e) => note(e.message));
});
document.addEventListener("change", (e) => {
  const p = e.target.dataset.field;
  if (!p) return;
  try {
    const next = structuredClone(state),
      bits = p.split(".");
    if (bits.length === 2) {
      next[bits[0]] ??= {};
      next[bits[0]][bits[1]] = Number(e.target.value);
    } else
      next[p] =
        e.target.type === "number" ? Number(e.target.value) : e.target.value;
    state = validate(next);
    persist();
    if (pointerDown) pendingRender = true;
    else render();
  } catch (err) {
    note(err.message);
    render();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.field === "notes") {
    state.notes = e.target.value.slice(0, 10000);
    persist();
  }
  if (e.target.id === "roll-net") {
    const n = Number(e.target.value);
    document.querySelector("#net-label").textContent = n
      ? `${Math.abs(n)} ${n < 0 ? "Bane" : "Boon"}${Math.abs(n) > 1 ? "s" : ""}`
      : "Even";
  }
});
app.addEventListener(
  "click",
  (e) => {
    const summary = e.target.closest("summary"),
      section = summary?.parentElement;
    if (!section?.dataset.collapse || e.target.closest("button,input,select,a"))
      return;
    state.collapsed[section.dataset.collapse] = section.open;
    persist();
  },
  true,
);
app.addEventListener(
  "toggle",
  (e) => {
    if (e.target.dataset.collapse) {
      state.collapsed[e.target.dataset.collapse] = !e.target.open;
      persist();
    }
  },
  true,
);

document
  .querySelector("#sheet-import")
  .addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1000000) throw new Error("Sheet file is too large.");
      const data = JSON.parse(await file.text());
      if (
        data.format !== "hol.sheet.prototype" ||
        data.version !== 1 ||
        data.kind !== kind
      )
        throw new Error(
          `Choose ${kind === "item" ? "an item" : "a " + kind} sheet export.`,
        );
      state = validate(data.state);
      edit = false;
      persist();
      render();
      note("Sheet imported.");
    } catch (err) {
      note(err.message);
    } finally {
      e.target.value = "";
    }
  });
try {
  const load = async (n) => {
    const response = await fetch(`data/${n}.json`);
    if (!response.ok) throw new Error(`Cannot load ${n}.`);
    return response.json();
  };
  const [c, i, ch, ref, images] = await Promise.all([
    load("creatures"),
    load("inventory"),
    load("choices"),
    load("references"),
    load("sheet-art"),
  ]);
  if (
    c.source.commit !== i.sourceCommit ||
    c.source.commit !== ch.sourceCommit ||
    c.source.commit !== images.sourceCommit
  )
    throw new Error("Sheet catalogs must use the same rules edition.");
  creatures = c.creatures;
  inventory = i;
  choices = ch.records;
  refs = ref.records;
  art = Object.fromEntries(images.records.map((r) => [r.id, r.asset]));
  state = defaults();
  try {
    const saved = localStorage.getItem(key);
    if (saved) state = validate(JSON.parse(saved));
  } catch {
    note("Saved sheet could not be opened; the original save was retained.");
  }
  render();
} catch (e) {
  app.innerHTML = `<p class="loading">${esc(e.message)}</p>`;
  app.removeAttribute("aria-busy");
}
