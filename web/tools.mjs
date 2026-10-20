import { esc, ruleMarkup, recordMarkup } from "./rules-view.mjs";
import {
  startEncounter,
  chooseParticipant,
  finishTurn,
  availableParticipants,
} from "./rules/encounter.mjs";
import {
  startTurn,
  convertAction,
  movementRemaining,
} from "./rules/actions.mjs";
import {
  workshopCharacter,
  craftingActions,
} from "./rules/workshop-character.mjs";
import {
  survivalState,
  receiveHealing,
  safeBreath,
  stabilize,
} from "./rules/survival.mjs";
import { healingPlan } from "./rules/damage.mjs";
import {
  rolledWorkshopWound,
  workshopWoundDetails,
  workshopTreatWound,
} from "./rules/workshop-resources.mjs";
import { refillInventory, inventoryCheck } from "./rules/inventory.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { rollSetup, bindRollSetup } from "./roll-ui.mjs";
const view = document.body.dataset.tool,
  app = document.querySelector(".tools-content");
const [choices, inventory, creatures, wounds, party, journals, refs] =
  await Promise.all(
    [
      "choices",
      "inventory",
      "creatures",
      "wounds",
      "party",
      "journals",
      "references",
    ].map(async (n) => {
      const r = await fetch(`data/${n}.json`);
      if (!r.ok) throw new Error(`Cannot load ${n}`);
      return r.json();
    }),
  );
const catalogs = {
  choices: choices.records,
  inventory,
  sourceCommit: choices.sourceCommit,
};
const heroes = party.map((p) => ({
  ...p,
  character: workshopCharacter(p.draft, catalogs),
}));
const hero = heroes[0],
  crafter = heroes.find((p) => p.character.state.recipes.length);
const entries = [
  ...journals.records.map((r) => ({ ...r, name: r.title, category: "Rules" })),
  ...choices.records
    .filter((r) => r.kind === "ability")
    .map((r) => ({ ...r, category: "Abilities" })),
  ...inventory.equipment.map((r) => ({ ...r, category: "Equipment" })),
  ...inventory.recipes.map((r) => ({ ...r, category: "Recipes" })),
].map((r) => ({ ...r, markdown: r.markdown ?? refs.records[r.id]?.markdown }));
const byId = (id) => entries.find((r) => r.id === id);
const resolveLink = (path) => {
  const clean = path.split("#")[0].split("/").at(-1);
  return entries.find((r) => r.source.path.split("/").at(-1) === clean)?.id;
};
const btn = (label, action, extra = "", cls = "small") =>
  `<button type="button" data-action="${action}" ${extra} class="${cls}">${label}</button>`;
const ruleButton = (id, label = "Read rules") =>
  `<button type="button" class="quiet small" data-rule="${id}">${label}</button>`;
const banner = (label, sub) =>
  `<header class="tool-banner"><div><h1>${label}</h1><small>${sub}</small></div></header>`;
const die = (sides = 6) => {
  const a = new Uint32Array(1),
    limit = Math.floor(4294967296 / sides) * sides;
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return (a[0] % sides) + 1;
};

function popup(title, body) {
  const d = document.querySelector("#reference");
  d.innerHTML = `<header><h2 id="reference-title">${esc(title)}</h2>${btn("Close", "close")}</header><div class="reference-body">${body}</div>`;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  return d;
}
function showRules(id) {
  const r = byId(id);
  if (!r) return;
  const d = document.querySelector("#rules-reference");
  d.innerHTML = `<header><h2 id="rules-title">${esc(r.name)}</h2>${btn("Close", "close-rules")}</header><article class="journal-page">${recordMarkup(r, resolveLink)}</article>`;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
// Encounter state is a disposable browser example; native document authority is separate.
const roster = [
  ...heroes.slice(0, 2).map((p, i) => ({
    id: p.id,
    name: p.draft.name ?? p.id,
    side: "players",
    hp: p.character.summary.maximumHp,
    speed: p.character.summary.speed,
    portrait: "assets/crest.webp",
    source: p,
  })),
  ...["creature-goblin-scrapper", "creature-shield-soldier"].map((id) => {
    const r = creatures.creatures.find((r) => r.id === id);
    return {
      id,
      name: r.name,
      side: "opposition",
      hp: r.hp.max,
      speed: r.speed.ordinary,
      portrait: `assets/bestiary/${id}.webp`,
      source: r,
    };
  }),
];
let encounter = startEncounter(roster, [4, 4, 4]),
  budgets = {},
  viewer = "da",
  serial = 0;
function combat() {
  const active = roster.find((p) => p.id === encounter.current),
    eligible = availableParticipants(encounter).map((p) => p.id);
  const budget = active ? budgets[active.id] : null;
  app.innerHTML =
    banner(
      `Round ${encounter.round}`,
      active
        ? `${viewer === "player" && active.hidden ? "Hidden participant" : esc(active.name)} · turn in progress`
        : `${encounter.nextSide === "players" ? "Players" : "Opposition"} choose next`,
    ) +
    `<div class="tool-actions">${btn(viewer === "da" ? "Player view" : "DA view", "viewer")}${btn("Opening roll", "opening")}${btn("Reset", "reset-combat")}${ruleButton("rule-encounters")}</div><p class="tool-help">Opening ${encounter.opening.total} · ${encounter.startingSide === "players" ? "Players" : "Opposition"} start each round.</p><div class="combat-roster">${[
      "players",
      "opposition",
    ]
      .map(
        (side) =>
          `<section class="combat-side"><h2>${side === "players" ? "Players" : "Opposition"}<span>${roster.filter((p) => p.side === side && !(viewer === "player" && p.hidden) && !encounter.acted.includes(p.id) && p.id !== encounter.current).length} ready</span></h2>${roster
            .filter(
              (p) => p.side === side && !(viewer === "player" && p.hidden),
            )
            .map(
              (p) =>
                `<div class="combat-row ${p.id === encounter.current ? "active" : encounter.acted.includes(p.id) ? "acted" : ""}">${btn(`<img class="combat-portrait" src="${p.portrait}" alt="">`, "actor", `data-id="${p.id}" aria-label="Open ${esc(p.name)}"`, "quiet")}<div><strong>${esc(p.name)}</strong><small>${encounter.acted.includes(p.id) ? "✓ Acted" : p.id === encounter.current ? "◆ Active" : "Ready"}${viewer === "da" || p.side === "players" ? ` · HP ${p.hp}` : ""}${p.hidden ? " · Hidden" : ""}</small></div><div>${!active && eligible.includes(p.id) && (viewer === "da" || p.side === "players") ? btn("Choose", "choose", `data-id="${p.id}"`) : ""}${viewer === "da" && p.side === "opposition" ? btn(p.hidden ? "◉" : "◌", "hide", `data-id="${p.id}" aria-label="${p.hidden ? "Reveal" : "Hide"} ${esc(p.name)}"`, "quiet") : ""}</div></div>`,
            )
            .join("")}</section>`,
      )
      .join(
        "",
      )}</div>${budget && (viewer === "da" || active.side === "players") ? `<div class="combat-budget">${["main", "maneuver", "reaction"].map((k) => btn(`<strong>${budget.remaining[k]}</strong>${k[0].toUpperCase() + k.slice(1)}`, "spend", `data-category="${k}" aria-label="Spend ${k}"`)).join("")}${btn(`<strong>${movementRemaining(budget)}</strong>Move`, "move", 'aria-label="Use one square of movement"')}</div><div class="tool-actions">${btn("Main → Maneuver", "convert", 'data-from="main" data-to="maneuver"')}${btn("Maneuver → Move", "convert", 'data-from="maneuver" data-to="movement"')}${btn("Finish turn", "finish", "", "primary")}</div>` : ""}<p class="tool-help">Local encounter example · no scene or saved character changes.</p>`;
}
let journalId = location.hash.slice(1) || "rule-foundations",
  category = byId(location.hash.slice(1))?.category ?? "Rules",
  query = "";
function journal() {
  const current = byId(journalId) ?? journals.records[0];
  app.innerHTML = `<div class="journal-layout"><aside class="journal-index"><label>Find rules<input id="journal-search" type="search" value="${esc(query)}" placeholder="Search text…"></label><label>Collection<select id="journal-category" aria-label="Collection">${["Rules", "Abilities", "Equipment", "Recipes"].map((c) => `<option ${c === category ? "selected" : ""}>${c}</option>`).join("")}</select></label><div class="journal-list"></div></aside><article class="journal-page" aria-label="Rule entry">${recordMarkup(current, resolveLink)}</article></div>`;
  fillJournalList();
}
function fillJournalList() {
  document.querySelector(".journal-list").innerHTML =
    entries
      .filter(
        (r) =>
          r.category === category &&
          `${r.name} ${r.markdown ?? JSON.stringify(r.reference)}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .map(
        (r) =>
          `<button type="button" data-entry="${r.id}" aria-current="${r.id === journalId}">${esc(r.name)}</button>`,
      )
      .join("") || '<p class="tool-help">No matching entries.</p>';
}
function selectEntry(id) {
  const r = byId(id);
  if (!r) return;
  journalId = id;
  category = r.category;
  history.pushState(null, "", "#" + id);
  journal();
}
const maxHp = hero.character.summary.maximumHp;
let health = survivalState({
  hp: 3,
  maxHp,
  wounds: 1,
  gritAvailable: hero.character.summary.gritGranted,
});
const woundRecord = wounds.records.find(
  (r) => r.table === "physical" && r.recoveryValue === 2,
);
let wound = rolledWorkshopWound({
  catalog: wounds,
  damageType: "physical",
  priorWounds: 0,
  faces: woundRecord.key.split("").map(Number),
  id: "preview-wound",
}).wound;
let recoveryNotice = "";
function recovery() {
  const details = workshopWoundDetails(wound, wounds);
  app.innerHTML =
    banner("Recovery", hero.draft.name ?? "Borin Bridgekeeper") +
    `<div class="tool-stats"><span>HP <b>${health.hp} / ${health.maxHp}</b></span><span>Grit <b>${health.gritAvailable}</b></span><span>Wounds <b>1</b></span></div><div class="tool-grid"><section class="tool-box"><h2>Restore HP</h2><div class="tool-actions">${btn("Healing", "healing", "", "primary")}${btn("Safe breath", "breath")}</div><p>Safe breath restores HP. Wounds and spent Grit remain.</p>${ruleButton("rule-recovery")}</section><section class="tool-box"><h2>Stabilization</h2><p>Clear death marks at 0 HP after the stabilization Maneuver.</p>${btn("Preview Dying", "dying")}${btn("Stabilize", "stabilize")}</section></div>${recoveryNotice ? `<div class="tool-result" role="status">${esc(recoveryNotice)}</div>` : ""}<section class="tool-box"><h2>Wounds & scars</h2><table class="tool-wounds"><thead><tr><th>Scar / injury</th><th>Effects</th><th>Recovery</th><th></th></tr></thead><tbody><tr><td>${esc(woundRecord.injury)}</td><td>${
      details.healed
        ? "Removed · scar remains"
        : woundRecord.effects
            .map((e) => `${e.amount} ${e.polarity} · ${e.printedContext}`)
            .map(esc)
            .join("<br>")
    }</td><td>${esc(woundRecord.capability)}<div class="tool-progress"><progress value="${Math.min(details.progress, details.required)}" max="${details.required}"></progress><span>${Math.min(details.progress, details.required)} / ${details.required}</span></div></td><td>${btn("Treat", "treat")}${ruleButton("rule-wounds", "Details")}</td></tr></tbody></table></section><p class="tool-help">Local recovery example · saved characters stay unchanged.</p>`;
}
function healing() {
  const d = popup(
    "Healing",
    `<div class="hol-roll-fields"><label>Healing before resistance<input id="healing-amount" aria-label="Healing amount" type="number" min="0" value="6"></label><label>Life DR<input id="healing-dr" aria-label="Life resistance" type="number" min="0" max="3" value="0"></label></div><div class="tool-result" id="healing-preview" aria-live="polite"></div><div class="tool-actions">${btn("Apply to preview", "apply-healing", "", "primary")}${ruleButton("rule-recovery")}</div>`,
  );
  const refresh = () => {
    const p = healingPlan({
      amount: Number(document.querySelector("#healing-amount").value),
      current: health.hp,
      max: health.maxHp,
      lifeResistances: [Number(document.querySelector("#healing-dr").value)],
    });
    document.querySelector("#healing-preview").textContent =
      `Restore ${p.restored} HP · ${health.hp} → ${p.after} / ${health.maxHp}`;
  };
  d.querySelector(".reference-body").addEventListener("input", () => {
    try {
      refresh();
    } catch {
      document.querySelector("#healing-preview").textContent =
        "Use whole, nonnegative values.";
    }
  });
  refresh();
}
const recipes = craftingActions(crafter.character, catalogs);
let recipeId = "recipe-travel-food",
  stocks = {},
  products = {},
  materialDie = 8,
  jobs = [],
  jobSerial = 0,
  craftNotice = "";
function currentRecipe() {
  return recipes.find((r) => r.recipe.id === recipeId) ?? recipes[0];
}
function crafting() {
  const { recipe, ability } = currentRecipe();
  const metadata =
    refs.records[recipe.id]?.markdown.match(
      /^- \*\*(Tools|Materials per attempt):\*\*.*$/gm,
    ) ?? [];
  const cap = recipe.maximumDie
    ? `cap d${recipe.maximumDie}`
    : `target ${recipe.target}`;
  const result = recipe.maximumDie
    ? `<h2>Supply</h2><p>${esc(inventory.equipment.find((i) => i.id === recipe.product)?.name ?? recipe.name)} · <strong data-stock>${stocks[recipe.id] ? "d" + stocks[recipe.id] : "Empty"}</strong></p><label>Starting supply<select id="craft-stock">${[
        0, 4, 6, 8, 10, 12, 20,
      ]
        .filter((n) => n <= recipe.maximumDie)
        .map(
          (n) =>
            `<option value="${n}" ${n === (stocks[recipe.id] ?? 0) ? "selected" : ""}>${n ? "d" + n : "Empty"}</option>`,
        )
        .join("")}</select></label>`
    : `<h2>Project progress</h2><div class="tool-progress"><progress max="${recipe.target}" value="${stocks[recipe.id] ?? 0}"></progress><strong data-project-progress>${stocks[recipe.id] ?? 0} / ${recipe.target}</strong></div><p>${products[recipe.id] ?? 0} finished product${products[recipe.id] === 1 ? "" : "s"}</p>`;
  app.innerHTML =
    banner("Crafting", crafter.draft.name ?? "Oren Brass") +
    `<div class="craft-layout"><aside class="craft-list">${[...new Map(recipes.map((r) => [r.recipe.id, r.recipe])).values()].map((r) => btn(esc(r.name), "recipe", `data-id="${r.id}" aria-pressed="${r.id === recipe.id}"`)).join("")}</aside><div><section class="tool-box"><h2>${esc(recipe.name)}</h2><p>${esc(ability.name)} · ${recipe.attemptMinutes} min / attempt · ${cap}</p>${metadata.map((t) => ruleMarkup(t, resolveLink)).join("")}<div class="tool-actions">${btn("Begin attempt", "begin-craft", "", "primary")}${ruleButton(recipe.id)}</div></section><section class="tool-box">${result}</section>${craftNotice ? `<div class="tool-result" role="status">${esc(craftNotice)}</div>` : ""}<section class="tool-box"><h2>Attempts</h2>${jobs.length ? jobs.map((j) => `<div class="stat-row"><span>${esc(j.recipe.name)} · ${j.recipe.attemptMinutes} min${j.complete ? " · Complete" : ""}</span>${!j.complete ? btn("Resolve", "resolve-craft", `data-id="${j.id}"`) : ""}</div>`).join("") : "<p>No attempts in progress.</p>"}</section></div></div><p class="tool-help">Local crafting example · tools, materials and elapsed time are judged at the table. No world time or saved inventory changes.</p>`;
}

function craftDialog(job) {
  const attr = job.attribute?.toLowerCase().split(" ")[0] ?? "knowledge";
  const attributes = crafter.draft.attributes;
  const d = popup(
    job.recipe.name,
    `<p class="tool-help">${esc(job.ability.name)} · ${job.recipe.attemptMinutes} min / attempt</p>${rollSetup({ attributes, selected: attr, attributeId: "craft-attribute", value: attributes[attr] ?? 0, netId: "craft-net", labelId: "craft-net-label" })}<p class="tool-help">Weak 1 · Standard 2 · Strong 3 ${job.recipe.maximumDie ? `inventory steps · cap d${job.recipe.maximumDie}` : `progress · target ${job.recipe.target}`}</p><label><input type="checkbox" id="craft-carried"> Check a carried material supply (${materialDie ? "d" + materialDie : "Empty"}) after the attempt</label><div class="tool-actions">${btn("Complete attempt", "complete-craft", `data-id="${job.id}"`, "primary")}${ruleButton(job.recipe.id)}</div>`,
  );
  bindRollSetup(d.querySelector(".reference-body"), {
    getAttributeValue: () =>
      attributes[document.querySelector("#craft-attribute").value],
  });
}
function render() {
  if (view === "combat") combat();
  if (view === "journal") journal();
  if (view === "recovery") recovery();
  if (view === "crafting") crafting();
  app.removeAttribute("aria-busy");
}
document.addEventListener("click", (e) => {
  try {
    const rule = e.target.closest("[data-rule]");
    if (rule) {
      if (view === "journal" && !rule.closest("dialog"))
        selectEntry(rule.dataset.rule);
      else showRules(rule.dataset.rule);
      return;
    }
    const entry = e.target.closest("[data-entry]");
    if (entry) return selectEntry(entry.dataset.entry);
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if (a === "close") return document.querySelector("#reference").close();
    if (a === "close-rules")
      return document.querySelector("#rules-reference").close();
    if (a === "viewer") viewer = viewer === "da" ? "player" : "da";
    if (a === "opening" || a === "reset-combat") {
      encounter = startEncounter(
        roster,
        a === "opening" ? [die(), die(), die()] : [4, 4, 4],
      );
      budgets = {};
    }
    if (a === "hide")
      roster.find((p) => p.id === b.dataset.id).hidden = !roster.find(
        (p) => p.id === b.dataset.id,
      ).hidden;
    if (a === "choose") {
      encounter = chooseParticipant(encounter, b.dataset.id);
      const p = roster.find((p) => p.id === b.dataset.id);
      budgets[p.id] = startTurn({
        turnId: "preview-" + ++serial,
        speed: p.speed,
      });
    }
    if (a === "finish") encounter = finishTurn(encounter);
    if (a === "spend") {
      const v = budgets[encounter.current];
      v.remaining[b.dataset.category] = Math.max(
        0,
        v.remaining[b.dataset.category] - 1,
      );
    }
    if (a === "move") {
      const v = budgets[encounter.current];
      if (movementRemaining(v) > 0) v.movementSpent++;
    }
    if (a === "convert")
      budgets[encounter.current] = convertAction(budgets[encounter.current], {
        operationId: "convert-" + ++serial,
        from: b.dataset.from,
        to: b.dataset.to,
      });
    if (a === "actor") {
      const p = roster.find((p) => p.id === b.dataset.id);
      return popup(
        p.name,
        `<div class="tool-stats">${viewer === "da" || p.side === "players" ? `<span>HP ${p.hp}</span>` : ""}<span>Speed ${p.speed}</span></div><p class="tool-help">Native integration opens the Actor sheet from this portrait.</p>`,
      );
    }
    if (a === "healing") return healing();
    if (a === "apply-healing") {
      const p = healingPlan({
        amount: Number(document.querySelector("#healing-amount").value),
        current: health.hp,
        max: health.maxHp,
        lifeResistances: [Number(document.querySelector("#healing-dr").value)],
      });
      health = receiveHealing(health, p.restored);
      recoveryNotice = `Restored ${p.restored} HP.`;
      document.querySelector("#reference").close();
    }
    if (a === "breath") {
      health = safeBreath(health);
      recoveryNotice = "HP restored; Grit and wounds unchanged.";
    }
    if (a === "dying") {
      health = survivalState({
        hp: 0,
        maxHp,
        wounds: 1,
        gritAvailable: health.gritAvailable,
        marks: 1,
      });
      recoveryNotice = "Dying example · 0 HP, one death mark.";
    }
    if (a === "stabilize") {
      health = stabilize(health);
      recoveryNotice =
        health.status === "stable"
          ? `Stabilized at 0 HP · ${health.marks} death marks.`
          : "Already above 0 HP; no stabilization needed.";
    }
    if (a === "treat") {
      const details = workshopWoundDetails(wound, wounds);
      return popup(
        "Record treatment",
        `<p>${esc(woundRecord.injury)}</p><p>${esc(woundRecord.capability)} · ${details.progress} / ${details.required} recovery</p><p class="tool-help">After eligible treatment and its printed activity time, record the outcome. Scars remain.</p><div class="tool-actions">${[1, 2, 3].map((n) => btn(`${n} progress`, "apply-treatment", `data-steps="${n}"`)).join("")}${ruleButton("rule-recovery")}</div>`,
      );
    }
    if (a === "apply-treatment") {
      wound = workshopTreatWound({
        wound,
        steps: Number(b.dataset.steps),
        catalog: wounds,
      }).wound;
      recoveryNotice = "Treatment progress recorded; scar remains.";
      document.querySelector("#reference").close();
    }
    if (a === "recipe") {
      recipeId = b.dataset.id;
      craftNotice = "";
    }
    if (a === "begin-craft") {
      const selected = currentRecipe();
      if (
        selected.recipe.target &&
        (stocks[selected.recipe.id] ?? 0) >= selected.recipe.target
      )
        stocks[selected.recipe.id] = 0;
      jobs.push({ ...selected, id: String(++jobSerial), complete: false });
    }
    if (a === "resolve-craft")
      return craftDialog(
        jobs.find((j) => j.id === b.dataset.id && !j.complete),
      );
    if (a === "complete-craft") {
      const j = jobs.find((j) => j.id === b.dataset.id && !j.complete);
      if (!j) return;
      const attr = document.querySelector("#craft-attribute").value,
        n = Number(document.querySelector("#craft-net").value),
        plan = rollPlan({
          attribute: crafter.draft.attributes[attr],
          boons: Math.max(0, n),
          banes: Math.max(0, -n),
        }),
        faces = Array.from({ length: plan.count }, die),
        kept = [...faces].sort((a, b) => (n < 0 ? a - b : b - a)).slice(0, 3),
        result = classifyRoll(kept, plan.attribute),
        steps = { weak: 1, standard: 2, strong: 3 }[result.tier];
      const materialCheck = document.querySelector("#craft-carried").checked
        ? inventoryCheck({ die: materialDie, retained: die(materialDie) })
        : null;
      const before = stocks[j.recipe.id] ?? 0;
      if (j.recipe.maximumDie) {
        const r = refillInventory({
          die: before,
          steps,
          maximumDie: j.recipe.maximumDie,
        });
        stocks[j.recipe.id] = r.after;
        craftNotice = `${result.tier}: ${steps} step${steps === 1 ? "" : "s"} · ${before ? "d" + before : "Empty"} → d${r.after}`;
      } else {
        const after = Math.min(j.recipe.target, before + steps);
        stocks[j.recipe.id] = after;
        if (before < j.recipe.target && after >= j.recipe.target)
          products[j.recipe.id] = (products[j.recipe.id] ?? 0) + 1;
        craftNotice = `${result.tier}: ${steps} progress · ${after} / ${j.recipe.target}${after >= j.recipe.target ? " · One product finished" : ""}`;
      }
      j.complete = true;
      recipeId = j.recipe.id;
      craftNotice += ` · ${j.recipe.attemptMinutes} min. ${faces.join(" · ")} → keep ${kept.join(" + ")}`;
      if (materialCheck) {
        materialDie = materialCheck.after;
        craftNotice += ` · Material supply ${materialDie ? "d" + materialDie : "Empty"}`;
      }
      document.querySelector("#reference").close();
    }
    render();
  } catch (err) {
    popup("Table guidance", `<p>${esc(err.message)}</p>`);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "journal-search") {
    query = e.target.value;
    fillJournalList();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "journal-category") {
    category = e.target.value;
    fillJournalList();
  }
  if (e.target.id === "craft-stock") {
    stocks[currentRecipe().recipe.id] = Number(e.target.value);
    crafting();
  }
});
render();

window.addEventListener("popstate", () => {
  if (view === "journal") {
    journalId = location.hash.slice(1) || "rule-foundations";
    category = byId(journalId)?.category ?? "Rules";
    journal();
  }
});
