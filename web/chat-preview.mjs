import { attackCard, rollCard, resourceCard } from "./chat-cards.mjs";
import { rollPlan, classifyRoll } from "./rules/roll.mjs";
import { inventoryCheck } from "./rules/inventory.mjs";
import { workshopSupplyUse } from "./rules/workshop-resources.mjs";
const [creatures, choices, inventory] = await Promise.all(
  ["creatures", "choices", "inventory"].map(async (name) => {
    const r = await fetch(`data/${name}.json`);
    if (!r.ok) throw new Error(`Cannot load ${name}`);
    return r.json();
  }),
);
const creature = creatures.creatures.find(
  (r) => r.id === "creature-goblin-scrapper",
);
const attack = creature.actions.main.actions.find(
  (a) => a.name === "Scrap knife",
);
const fields = creature.reference.specialtyDetails.find(
  (d) => d.title === attack.name,
).fields;
const field = (name) => fields.find((f) => f.label === name)?.text ?? "";
const action = choices.records.find((r) => r.id === "ability-hook-and-drive");
const log = document.querySelector(".chat-log");
function append(html) {
  log.insertAdjacentHTML("beforeend", html);
  log.scrollTop = log.scrollHeight;
}
function sample(mode, faces, net = 0, attribute = 1) {
  const retainedIndices = faces
    .map((face, index) => ({ face, index }))
    .sort(
      (a, b) =>
        (net < 0 ? a.face - b.face : b.face - a.face) || a.index - b.index,
    )
    .slice(0, 3)
    .map((d) => d.index);
  const result = classifyRoll(
    retainedIndices.map((i) => faces[i]),
    attribute,
  );
  return {
    actor: "Borin Bridgekeeper",
    target: mode === "attribute" ? null : creature.name,
    mode,
    attribute: mode === "defense" ? "agility" : "brawn",
    title:
      mode === "ability"
        ? "Hook and Drive"
        : mode === "defense"
          ? "Defend · Scrap knife"
          : "Attribute check",
    effect:
      mode === "ability"
        ? action.reference.rules.body
            .find((b) => b.outcomes)
            .outcomes.find((o) => o.label.toLowerCase() === result.tier).text
        : mode === "defense"
          ? `${attack.outcomes[result.tier]} ${field("Damage type").replace(/\.$/, "")} damage before resistance.`
          : null,
    abilities: mode === "ability" ? ["Hook and Drive"] : [],
    roll: {
      plan: rollPlan({
        attribute,
        boons: Math.max(0, net),
        banes: Math.max(0, -net),
      }),
      faces,
      retainedIndices,
      result,
    },
  };
}
function request() {
  return attackCard({
    actor: creature.name,
    action: attack,
    portrait: `assets/bestiary/${creature.id}.webp`,
    threat: creature.defenses.threat.sourceText,
    suggestions: ["Borin Bridgekeeper", "Lira Ashbow"],
    target: field("Target"),
    damageType: field("Damage type"),
  });
}
function reset() {
  log.innerHTML =
    request() +
    rollCard(sample("defense", [4, 3, 3], 0, 0)) +
    rollCard(sample("ability", [6, 5, 5, 2], 1));
  log.scrollTop = 0;
}
document.addEventListener("hol-preview-roll", (e) =>
  append(rollCard(e.detail)),
);
document.addEventListener("click", (e) => {
  const kind = e.target.closest("[data-example]")?.dataset.example;
  if (kind === "reset") reset();
  if (kind === "request") append(request());
  if (kind === "benefit") append(rollCard(sample("attribute", [6, 6, 6])));
  if (kind === "complication") append(rollCard(sample("attribute", [1, 1, 1])));
  if (kind === "supply") {
    const die = inventoryCheck({ die: 8, retained: 1 });
    append(
      resourceCard({
        actor: "Borin Bridgekeeper",
        title: "Food Bundle",
        kind: "Supply",
        die: { before: die.before, face: die.retained, after: die.after },
        effect: "Supply steps down",
        detail: "The final use still takes effect.",
      }),
    );
  }
  if (kind === "healing") {
    const r = workshopSupplyUse({
      item: {
        catalogId: "item-lesser-healing-bottle",
        inventoryDie: 4,
        quantity: 1,
      },
      face: 1,
      hp: 3,
      maxHp: 12,
      catalog: inventory,
    });
    append(
      resourceCard({
        actor: "Borin Bridgekeeper",
        title: inventory.equipment.find(
          (i) => i.id === "item-lesser-healing-bottle",
        ).name,
        kind: "Healing",
        effect: `Restore ${r.healed} HP · 3 / 12 → ${r.hp} / 12`,
        die: { before: r.before, face: r.retained, after: r.after },
        detail: "Final dose · healing still takes effect.",
      }),
    );
  }
});
reset();
