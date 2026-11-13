import { workshopCatalogs } from "./rules/workshop-forge-catalog.mjs";
import { noRollBrew } from "./rules/workshop-crafting.mjs";
import { localCraftingOutcome } from "./crafting-attempt.mjs";
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
  forgeBeginFirstAid,
  forgeCanSpendGrit,
  forgeDamage,
  forgeDeathRoll,
  forgeFinalizeDeath,
  forgeFinishFirstAid,
  forgeHeal,
  forgeInterruptFirstAid,
  forgeMaximums,
  forgeRecordScar,
  forgeRest,
  forgeSpendGrit,
  forgeSpendSp,
  forgeStabilize,
  forgeVitals,
} from "./rules/forge-vitals.mjs";
import { refillInventory, inventoryCheck } from "./rules/inventory.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { rollSetup, bindRollSetup } from "./roll-ui.mjs";
const view = document.body.dataset.tool,
  app = document.querySelector(".tools-content");
const [choices, inventory, creatures, party, journals, refs, forge, wounds] =
  await Promise.all(
    [
      "choices",
      "inventory",
      "creatures",
      "party",
      "forge-journals",
      "forge-references",
      "forge",
      "wounds",
    ].map(async (n) => {
      const r = await fetch(`data/${n}.json`);
      if (!r.ok) throw new Error(`Cannot load ${n}`);
      return r.json();
    }),
  );
const catalogs = workshopCatalogs(choices, inventory, wounds, forge, refs);
const heroes = party.map((p) => ({
  ...p,
  character: workshopCharacter(p.draft, catalogs),
}));
const hero = heroes[0],
  crafter = heroes.find((p) => craftingActions(p.character, catalogs).some(({ recipe }) => recipe.id === "recipe-travel-food"))
    ?? heroes.find((p) => craftingActions(p.character, catalogs).length);
const entries = [
  ...journals.records.map((r) => ({ ...r, name: r.title, category: "Rules" })),
  ...catalogs.choices
    .filter((record) => record.kind === "ability" && (record.universal || record.classId))
    .map((record) => ({ ...record, category: record.universal ? "Basic Actions" : "Abilities" })),
  ...forge.nodes
    .filter((node) => node.effect && node.kind !== "section")
    .map((node) => ({ ...node, category: "Abilities", markdown: `## ${node.name}\n\n${node.effect}` })),
  ...forge.spells.map((spell) => ({
    ...spell,
    category: "Spells",
    markdown: [
      `## ${spell.name}`,
      `**${spell.action}** · ${spell.sp} SP · ${spell.attribute}`,
      `**Target / range** ${spell.target}`,
      `**Duration** ${spell.duration}`,
      spell.trigger ? `**Trigger** ${spell.trigger}` : "",
      spell.ritualTime ? `**Casting time** ${spell.ritualTime}` : "",
      spell.effect,
    ].filter(Boolean).join("\n\n"),
  })),
  ...catalogs.inventory.equipment.map((r) => ({ ...r, category: "Equipment" })),
  ...catalogs.inventory.recipes.map((r) => ({ ...r, category: "Recipes" })),
].map((r) => ({ ...r, markdown: r.markdown ?? refs.records[r.id]?.markdown }));
const byId = (id) => entries.find((r) => r.id === id);
const resolveLink = (path) => {
  const clean = path.split("#")[0].split("/").at(-1);
  return entries.find((r) => r.source?.path?.split("/").at(-1) === clean)?.id;
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
  ambush = null,
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
    `<div class="tool-actions">${btn(viewer === "da" ? "Player view" : "DA view", "viewer")}${btn("Opening roll", "opening")}${viewer === "da" ? btn("Ambush", "ambush") : ""}${btn("Reset", "reset-combat")}${ruleButton("rule-foundations")}</div><p class="tool-help">${ambush ? "Ambush" : `Opening ${encounter.opening.total}`} · ${encounter.startingSide === "players" ? "Players" : "Opposition"} start each round · 6 seconds per round.</p><div class="combat-roster">${[
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
  app.innerHTML = `<div class="journal-layout"><aside class="journal-index"><label>Find rules<input id="journal-search" type="search" value="${esc(query)}" placeholder="Search text…"></label><label>Collection<select id="journal-category" aria-label="Collection">${["Rules", "Basic Actions", "Abilities", "Spells", "Equipment", "Recipes"].map((c) => `<option ${c === category ? "selected" : ""}>${c}</option>`).join("")}</select></label><div class="journal-list"></div></aside><article class="journal-page" aria-label="Rule entry">${recordMarkup(current, resolveLink)}</article></div>`;
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
const recoveryLimits = hero.character.limits ?? forgeMaximums({
  level: 1,
  ancestryHp: 3,
  classHp: 3,
  fortitude: hero.draft.attributes.fortitude,
  fixedHp: 1,
});
const freshRecovery = () => forgeVitals({ hp: 3, sp: 4 }, recoveryLimits);
let health = freshRecovery();
let recoveryNotice = "";
let medicalSupply = 6;
let immediateDeathRoll = false;
let scarPending = false;

function recovery() {
  const status = health.dead ? "Dead" : health.dying ? "Dying" : health.hp === 0 ? "Stable at 0 HP" : "Conscious";
  const pendingDeath = health.failedDeathRolls === 3;
  const canAct = !health.dead && !pendingDeath && !immediateDeathRoll;
  const trigger = health.gritTrigger ?? "turn-start";
  const gritReady = !immediateDeathRoll && forgeCanSpendGrit(health, recoveryLimits, trigger);
  app.innerHTML =
    banner("Recovery", esc(hero.draft.name ?? "Borin Bridgekeeper") + " · Level 1 example") +
    `<div class="tool-stats">
      <span>HP <b>${health.hp} / ${recoveryLimits.maxHp}</b></span>
      <span>SP <b>${health.sp} / ${recoveryLimits.maxSp}</b></span>
      <span>Grit <b>${health.gritAvailable}</b></span>
      <span><b>${status}</b></span>
      ${health.dying ? `<span>Failures <b>${health.failedDeathRolls} / 3</b></span><span>Successes <b>${health.successfulDeathRolls} / 3</b></span>` : ""}
    </div>
    ${recoveryNotice ? `<div class="tool-result" role="status">${esc(recoveryNotice)}</div>` : ""}
    <div class="tool-grid">
      <section class="tool-box">
        <h2>Restore HP and SP</h2>
        <div class="tool-actions">
          ${btn("Healing", "healing", canAct ? "" : "disabled", "primary")}
          ${btn("Safe overnight rest", "rest", canAct && !health.dying ? "" : "disabled")}
        </div>
        <p>Eight safe hours restore HP and SP and renew first aid, once in 24 hours.</p>
        ${ruleButton("rule-recovery")}
      </section>
      <section class="tool-box">
        <h2>First aid</h2>
        <p>Spend ten uninterrupted minutes and use medical supplies. Roll Knowledge to restore 2/4/6 HP.</p>
        <p>Medical supplies <strong>${medicalSupply ? "d" + medicalSupply : "Empty"}</strong> · ${health.firstAidPending ? "Treatment in progress" : health.firstAidUsed ? "Treatment used" : "Treatment available"}</p>
        <div class="tool-actions">
          ${health.firstAidPending
            ? btn("Finish first aid", "finish-first-aid", canAct ? "" : "disabled") + btn("Interrupt treatment", "interrupt-first-aid")
            : btn("Give first aid", "first-aid", canAct && medicalSupply && !health.firstAidUsed ? "" : "disabled")}
        </div>
      </section>
      <section class="tool-box">
        <h2>At 0 HP</h2>
        <div class="tool-actions">
          ${btn("Take damage", "damage", canAct ? "" : "disabled")}
          ${immediateDeathRoll ? btn("Resolve immediate death roll", "death-immediate") : btn("Start Dying turn", "death-turn", canAct && health.dying ? "" : "disabled")}
          ${btn("Stabilize", "stabilize", canAct && health.dying ? "" : "disabled")}
          ${btn("Spend Grit", "grit", gritReady ? `data-trigger="${trigger}"` : "disabled")}
          ${pendingDeath ? btn("Last Words", "last-words") : ""}
        </div>
        <p>Roll Fortitude at the start of a Dying turn and after damage at 0 HP. Three successes stabilize the hero. Three failures are fatal unless Grit or an ability intervenes.</p>
      </section>
      <section class="tool-box">
        <h2>Scars</h2>
        <p>Record one lasting reminder after surviving an incident that brought you to 0 HP.</p>
        ${health.scars.length ? `<ul>${health.scars.map((scar) => `<li>${esc(scar)}</li>`).join("")}</ul>` : ""}
        <div class="tool-actions">${btn("Record scar", "scar", canAct && !health.dying && scarPending ? "" : "disabled")}</div>
        ${ruleButton("rule-wounds", "Scar prompts")}
      </section>
    </div>
    <div class="tool-actions">${btn("Reset example", "reset-recovery")}</div>`;
}

function healing() {
  const d = popup(
    "Healing",
    `<div class="hol-roll-fields">
      <label>Healing before resistance<input id="healing-amount" type="number" min="0" value="6"></label>
      <label>Life resistance<input id="healing-dr" type="number" min="0" max="3" value="0"></label>
      <label>SP cost<input id="healing-sp" type="number" min="0" max="${health.sp}" value="1"></label>
    </div>
    <div class="tool-result" id="healing-preview" aria-live="polite"></div>
    <div class="tool-actions">${btn("Apply healing", "apply-healing", "", "primary")}${ruleButton("rule-recovery")}</div>`,
  );
  const refresh = () => {
    const output = d.querySelector("#healing-preview");
    try {
      const next = plannedHealing();
      output.textContent = `Restore ${next.hp - health.hp} HP · ${health.hp} → ${next.hp} / ${recoveryLimits.maxHp} · ${next.sp} SP remaining`;
    } catch (error) {
      output.textContent = error.message;
    }
  };
  d.querySelector(".reference-body").addEventListener("input", refresh);
  refresh();
}

function plannedHealing() {
  const input = (id) => document.getElementById(id).valueAsNumber;
  const paid = forgeSpendSp(health, recoveryLimits, input("healing-sp"));
  return forgeHeal(paid, recoveryLimits, input("healing-amount"), {
    lifeResistance: input("healing-dr"),
  });
}

function recoveryRoll(attribute, net) {
  const plan = rollPlan({ attribute, boons: Math.max(0, net), banes: Math.max(0, -net) });
  const faces = Array.from({ length: plan.count }, () => die());
  const retained = net < 0
    ? faces.toSorted((a, b) => a - b).slice(0, 3)
    : faces.toSorted((a, b) => b - a).slice(0, 3);
  return { retained, ...classifyRoll(retained, attribute) };
}

function deathRollDialog(immediate) {
  const fortitude = hero.draft.attributes.fortitude;
  const d = popup(
    "Fortitude death roll",
    rollSetup({ attributes: { fortitude }, selected: "fortitude", attributeId: "recovery-attribute", value: fortitude, netId: "recovery-net", labelId: "recovery-net-label" }) +
    `<div class="tool-actions">${!immediate && forgeCanSpendGrit(health, recoveryLimits, "turn-start") ? btn("Spend Grit", "grit", 'data-trigger="turn-start"') : ""}${btn("Roll Fortitude", "death-roll", "", "primary")}</div>`,
  );
  bindRollSetup(d.querySelector(".reference-body"), { getAttributeValue: () => fortitude });
}

function firstAidDialog() {
  return popup(
    "First aid",
    `<p>After ten uninterrupted minutes of treatment, roll Knowledge.</p>
    <div class="tool-actions">${btn("Roll Knowledge", "apply-first-aid", "", "primary")}</div>`,
  );
}

function describeRecoveryRoll(label, result) {
  const tier = result.tier[0].toUpperCase() + result.tier.slice(1);
  return `${label} ${result.retained.join(" + ")} · ${result.total} · ${tier}`;
}
const recipes = crafter ? craftingActions(crafter.character, catalogs) : [];
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
  const selection = currentRecipe();
  if (!selection) {
    app.innerHTML = banner("Crafting", "") + '<p class="tool-help">The sample party has no learned crafting recipes.</p>';
    return;
  }
  const { recipe, ability } = selection;
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

function trailWorkshopSteps(tier) {
  if (!crafter.character.state.learned?.includes("craft:supplies:3")) return;
  return { weak: 1, standard: 3, strong: 4 }[tier];
}

function craftDialog(job) {
  const attr = job.attribute?.toLowerCase().split(" ")[0] ?? "knowledge";
  const attributes = crafter.draft.attributes;
  const d = popup(
    job.recipe.name,
    `<p class="tool-help">${esc(job.ability.name)} · ${job.recipe.attemptMinutes} min / attempt</p>${noRollBrew(job.ability.id, job.recipe) ? "<p>Brew to d4 without a roll.</p>" : rollSetup({ attributes, selected: attr, attributeId: "craft-attribute", value: attributes[attr] ?? 0, netId: "craft-net", labelId: "craft-net-label" })}${noRollBrew(job.ability.id, job.recipe) ? "" : `<p class="tool-help">Weak 1 · Standard ${trailWorkshopSteps("standard") ?? 2} · Strong ${trailWorkshopSteps("strong") ?? 3} ${job.recipe.maximumDie ? `inventory steps · cap d${job.recipe.maximumDie}` : `progress · target ${job.recipe.target}`}</p>`}<label><input type="checkbox" id="craft-carried"> Check a carried material supply (${materialDie ? "d" + materialDie : "Empty"}) after the attempt</label><div class="tool-actions">${btn("Complete attempt", "complete-craft", `data-id="${job.id}"`, "primary")}${ruleButton(job.recipe.id)}</div>`,
  );
  if (!noRollBrew(job.ability.id, job.recipe)) bindRollSetup(d.querySelector(".reference-body"), {
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
    if (a === "ambush") return popup(
      "Resolve an ambush",
      `<p>The DA decides whether either side caught the other unaware. The ambushing side opens each round. Alternate sides from the first turn.</p>
      <div class="tool-actions">${btn("Players ambush", "resolve-ambush", 'data-side="players"')}${btn("Opposition ambush", "resolve-ambush", 'data-side="opposition"')}${btn("Roll initiative", "opening")}</div>`,
    );
    if (a === "resolve-ambush") {
      ambush = b.dataset.side;
      const faces = ambush === "players" ? [4, 4, 4] : [3, 3, 3];
      // The preview's turn engine uses opening dice to seed the starting side.
      encounter = startEncounter(roster, faces);
      budgets = {};
      document.querySelector("#reference").close();
    }
    if (a === "opening" || a === "reset-combat") {
      ambush = null;
      if (document.querySelector("#reference").open) document.querySelector("#reference").close();
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
      const next = plannedHealing();
      recoveryNotice = `Restored ${next.hp - health.hp} HP.`;
      health = next;
    }
    if (a === "rest") return popup(
      "Safe overnight rest",
      `<p>Record the end of eight uninterrupted safe hours, including six hours of sleep or equivalent rest. Count elapsed hours from the start of the example.</p>
      <label>Hour rest finished <input id="rest-hour" type="number" min="${(health.lastRestHour ?? -16) + 24}" value="${(health.lastRestHour ?? -16) + 24}"></label>
      <div class="tool-actions">${btn("Complete safe rest", "complete-rest", "", "primary")}</div>`,
    );
    if (a === "complete-rest") {
      health = forgeRest(health, recoveryLimits, {
        hour: document.getElementById("rest-hour").valueAsNumber,
      });
      recoveryNotice = "Restored HP and SP and renewed first aid.";
    }
    if (a === "damage") return popup(
      "Take damage",
      `<label>Damage taken <input id="recovery-damage" type="number" min="0" value="${health.hp || 1}"></label>
      <div class="tool-actions">${btn("Apply damage", "apply-damage", "", "primary")}</div>`,
    );
    if (a === "apply-damage") {
      const before = health.hp;
      const outcome = forgeDamage(health, recoveryLimits, document.getElementById("recovery-damage").valueAsNumber);
      health = outcome.play;
      immediateDeathRoll = outcome.deathRollRequired;
      if (before > 0 && health.dying) scarPending = true;
      recoveryNotice = before && health.dying ? "The hero falls unconscious and begins Dying." : `HP ${before} → ${health.hp}.`;
      recovery();
      if (outcome.deathRollRequired) return deathRollDialog(true);
    }
    if (a === "death-turn" || a === "death-immediate") return deathRollDialog(a === "death-immediate");
    if (a === "death-roll") {
      const fortitude = hero.draft.attributes.fortitude;
      const roll = recoveryRoll(fortitude, Number(document.querySelector("#recovery-net")?.value ?? 0));
      health = forgeDeathRoll(health, recoveryLimits, { retained: roll.retained, fortitude }).play;
      immediateDeathRoll = false;
      recoveryNotice = describeRecoveryRoll("Fortitude", roll) + (health.dying ? "." : ". Stabilized at 0 HP.");
      if (health.failedDeathRolls === 3 && !forgeCanSpendGrit(health, recoveryLimits, "failure")) {
        health = forgeFinalizeDeath(health, recoveryLimits);
        recoveryNotice += " The hero dies and may speak their Last Words.";
      }
    }
    if (a === "stabilize") {
      health = forgeStabilize(health, recoveryLimits);
      recoveryNotice = "Stabilized at 0 HP. Both tallies cleared.";
    }
    if (a === "grit") {
      health = forgeSpendGrit(health, recoveryLimits, b.dataset.trigger);
      recoveryNotice = `Spent one Grit and returned to ${health.hp} HP.`;
    }
    if (a === "last-words") {
      health = forgeFinalizeDeath(health, recoveryLimits);
      recoveryNotice = "The hero dies. You can describe their final words, gesture, or silence.";
    }
    if (a === "first-aid") {
      health = forgeBeginFirstAid(health, recoveryLimits);
      medicalSupply = inventoryCheck({ die: medicalSupply, retained: die(medicalSupply) }).after;
      recoveryNotice = "First aid begun. Finish after ten uninterrupted minutes. A Dying patient still makes death rolls.";
      recovery();
      if (health.dying) return;
      return firstAidDialog();
    }
    if (a === "finish-first-aid") return firstAidDialog();
    if (a === "apply-first-aid") {
      const before = health.hp;
      const roll = recoveryRoll(hero.draft.attributes.knowledge, 0);
      health = forgeFinishFirstAid(health, recoveryLimits, roll.tier);
      recoveryNotice = describeRecoveryRoll("Knowledge", roll) + `. Restored ${health.hp - before} HP.`;
    }
    if (a === "interrupt-first-aid") {
      health = forgeInterruptFirstAid(health, recoveryLimits);
      recoveryNotice = "Treatment interrupted. The first-aid attempt is spent.";
    }
    if (a === "scar") return popup(
      "Record scar",
      `<label>Scar description <textarea id="scar-description" rows="3" maxlength="500"></textarea></label>
      <div class="tool-actions">${btn("Save scar", "save-scar", "", "primary")}</div>`,
    );
    if (a === "save-scar") {
      health = forgeRecordScar(health, recoveryLimits, document.getElementById("scar-description").value);
      scarPending = false;
      recoveryNotice = "Scar recorded.";
    }
    if (a === "reset-recovery") {
      health = freshRecovery();
      recoveryNotice = "";
      medicalSupply = 6;
      immediateDeathRoll = false;
      scarPending = false;
    }
    if (["apply-healing", "complete-rest", "apply-damage", "death-roll", "grit", "apply-first-aid", "save-scar"].includes(a)) {
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
      const attr = document.querySelector("#craft-attribute")?.value ?? "knowledge";
      const { automatic, faces, kept, result, steps: basicSteps } = localCraftingOutcome({
        abilityId: j.ability.id, recipe: j.recipe, attribute: crafter.draft.attributes[attr],
        net: Number(document.querySelector("#craft-net")?.value ?? 0), die,
      });
      const steps = trailWorkshopSteps(result.tier) ?? basicSteps;
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
      craftNotice += ` · ${j.recipe.attemptMinutes} min${automatic ? "" : `. ${faces.join(" · ")} → keep ${kept.join(" + ")}`}`;
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
