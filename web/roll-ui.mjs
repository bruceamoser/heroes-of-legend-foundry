import { rollPlan } from "./rules/roll.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const title = (v) => v[0].toUpperCase() + v.slice(1);
export const netLabel = (n) =>
  n
    ? `${Math.abs(n)} ${n < 0 ? "Bane" : "Boon"}${Math.abs(n) === 1 ? "" : "s"}`
    : "Even";
export function netControl({ id, labelId, value = 0 }) {
  return `<div class="hol-net" data-net-control><label class="hol-net-heading" for="${id}"><span>Banes</span><output id="${labelId}">${netLabel(value)}</output><span>Boons</span></label><div class="hol-net-track"><span class="hol-net-fill"></span><input id="${id}" aria-label="Banes / Boons" aria-valuetext="${netLabel(value)}" type="range" min="-3" max="3" step="1" value="${value}"></div><div class="hol-net-ticks" aria-label="Choose net Banes or Boons">${[-3, -2, -1, 0, 1, 2, 3].map((n) => `<button type="button" data-net-step="${n}" aria-label="${n === 0 ? "Even" : netLabel(n)}" aria-pressed="${n === value}" title="${n === 0 ? "Even" : netLabel(n)}">${n > 0 ? "+" : ""}${n === 0 ? "0" : n < 0 ? "−" + Math.abs(n) : n}</button>`).join("")}</div></div>`;
}
export function rollSetup({
  attributes,
  selected,
  attributeId,
  valueId,
  value = 0,
  editableValue = false,
  netId,
  labelId,
}) {
  return `<section class="hol-roll-setup"><div class="hol-roll-fields"><label>Attribute<select id="${attributeId}" aria-label="Roll attribute">${Object.entries(
    attributes,
  )
    .map(
      ([key]) =>
        `<option value="${key}" ${key === selected ? "selected" : ""}>${esc(title(key))}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Value${editableValue ? `<input id="${valueId}" aria-label="Attribute value" type="number" min="-2" max="2" value="${value}">` : `<output data-roll-value>${value >= 0 ? "+" : ""}${value}</output>`}</label></div>${netControl({ id: netId, labelId })}<div class="hol-roll-pool" aria-live="polite"><div class="hol-pool-count"><strong data-roll-count>3</strong><span>d6</span></div><div class="hol-pool-detail"><div data-roll-dice class="hol-pool-dice" aria-hidden="true"></div><strong data-roll-keep>Keep all three</strong><code data-roll-formula>3d6 + (${value})</code></div></div></section>`;
}
const die =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="7" cy="7" r="1.4"/><circle cx="17" cy="17" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg>';
export function bindRollSetup(root, { getAttributeValue }) {
  const input = root.querySelector('[data-net-control] input[type="range"]');
  const control = input.closest("[data-net-control]");
  function refresh() {
    const n = Number(input.value),
      value = Number(getAttributeValue());
    control.querySelector("output").textContent = netLabel(n);
    input.setAttribute("aria-valuetext", netLabel(n));
    control.dataset.polarity = n < 0 ? "bane" : n > 0 ? "boon" : "even";
    control.style.setProperty(
      "--net-start",
      `${Math.min(50, ((n + 3) / 6) * 100)}%`,
    );
    control.style.setProperty("--net-size", `${(Math.abs(n) / 6) * 100}%`);
    for (const button of control.querySelectorAll("[data-net-step]"))
      button.setAttribute("aria-pressed", Number(button.dataset.netStep) === n);
    const plan = rollPlan({
      attribute: Number.isSafeInteger(value) ? value : 0,
      boons: Math.max(0, n),
      banes: Math.max(0, -n),
    });
    const count = root.querySelector("[data-roll-count]");
    if (!count) return;
    count.textContent = plan.count;
    root.querySelector("[data-roll-keep]").textContent = n
      ? `Keep ${n > 0 ? "highest" : "lowest"} three`
      : "Keep all three";
    root.querySelector("[data-roll-formula]").textContent = plan.formula;
    root.querySelector("[data-roll-dice]").innerHTML = Array.from(
      { length: plan.count },
      (_, i) => `<span class="${i >= 3 ? "extra-die" : ""}">${die}</span>`,
    ).join("");
    const output = root.querySelector("[data-roll-value]");
    if (output) output.textContent = `${value >= 0 ? "+" : ""}${value}`;
  }
  root.addEventListener("click", (e) => {
    const tick = e.target.closest("[data-net-step]");
    if (!tick || !control.contains(tick)) return;
    input.value = tick.dataset.netStep;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  root.addEventListener("input", refresh);
  root.addEventListener("change", refresh);
  refresh();
  return refresh;
}
