const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const title = (v) => String(v ?? "").replace(/^./, (c) => c.toUpperCase());
const header = ({ actor, title: label, portrait, kind }) =>
  `<header class="hol-chat-header">${portrait ? `<img src="${esc(portrait)}" alt="">` : ""}<div><small>${esc(actor)} · ${esc(kind)}</small><h3>${esc(label)}</h3></div></header>`;
function dice(roll) {
  return `<div class="hol-chat-dice" aria-label="Rolled dice">${roll.faces.map((face, i) => `<span role="img" class="hol-chat-die ${roll.retainedIndices.includes(i) ? "kept" : "discarded"}" aria-label="${esc(face)}, ${roll.retainedIndices.includes(i) ? "kept" : "discarded"}" title="${roll.retainedIndices.includes(i) ? "Kept" : "Discarded"}">${esc(face)}</span>`).join("")}</div>`;
}
export function rollCard(message) {
  const { roll } = message;
  const tier = ["weak", "standard", "strong"].includes(roll.result.tier)
    ? roll.result.tier
    : "standard";
  const net = roll.plan.net;
  const references = (message.abilities ?? []).filter(
    (n) => n !== message.title,
  );
  return `<article class="hol-chat-card" data-chat-kind="${esc(message.mode)}">${header({ ...message, kind: message.mode === "defense" ? "Defense" : message.mode === "ability" ? "Attack" : "Check" })}<div class="hol-chat-bar">${message.target ? `<span>${message.mode === "defense" ? "Against" : "Target"} <b>${esc(message.target)}</b></span>` : ""}<span>${esc(title(message.attribute))} ${roll.plan.attribute >= 0 ? "+" : ""}${roll.plan.attribute}</span><span>${net ? `${Math.abs(net)} ${net < 0 ? "Bane" : "Boon"}${Math.abs(net) > 1 ? "s" : ""}` : "Even"}</span><span>${roll.plan.count}d6 · ${net ? `keep ${net > 0 ? "highest" : "lowest"} 3` : "keep 3"}</span></div><div class="hol-chat-resolution">${dice(roll)}<div class="hol-chat-verdict ${tier}"><strong>${roll.result.total}</strong><span>${title(tier)}${message.mode === "defense" ? " defense" : message.mode === "ability" ? " attack" : ""}</span></div></div>${roll.result.natural !== "none" ? `<div class="hol-chat-natural">${roll.result.natural === "critical" ? "✦ Natural 666 · additional benefit" : "◆ Natural 111 · complication"}</div>` : ""}${message.effect ? `<div class="hol-chat-effect">${esc(message.effect)}</div>` : ""}${references.length ? `<div class="hol-chat-abilities">${references.map(esc).join(" · ")}</div>` : ""}<footer class="hol-chat-footer"><span>${esc(message.effect ? "Not applied" : "Rolled")}</span><button type="button" class="quiet small" data-chat-reroll="${esc(message.mode)}">Roll again</button></footer><details class="hol-chat-details"><summary>Roll details</summary><p>${esc(roll.plan.formula)} · ${roll.retainedIndices.map((i) => roll.faces[i]).join(" + ")} ${roll.plan.attribute >= 0 ? "+" : ""}${roll.plan.attribute} = ${roll.result.total}</p></details></article>`;
}
export function attackCard({
  actor,
  action,
  portrait,
  threat = "None",
  suggestions = [],
  target,
  damageType,
}) {
  return `<article class="hol-chat-card" data-chat-kind="request">${header({ actor, title: action.name, portrait, kind: "Attack" })}<div class="hol-chat-bar"><span>${esc(action.defense.sourceText)} defense</span><span>Threat ${esc(threat)}</span></div><div class="hol-chat-description">${esc(target)}${damageType ? ` · ${esc(damageType)}` : ""}</div><table class="hol-chat-outcomes"><caption>Defense outcome</caption><thead><tr><th>Weak</th><th>Standard</th><th>Strong</th></tr></thead><tbody><tr>${["weak", "standard", "strong"].map((t) => `<td>${esc(action.outcomes[t])}</td>`).join("")}</tr></tbody></table>${suggestions.length ? `<div class="hol-chat-targets"><small>Suggested</small>${suggestions.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}<footer class="hol-chat-footer"><span>Awaiting defense</span><button type="button" class="primary small" data-chat-defend>Defend</button></footer></article>`;
}
export function resourceCard({
  actor,
  title: label,
  kind,
  effect,
  die,
  status = "Not applied",
  detail,
}) {
  return `<article class="hol-chat-card" data-chat-kind="${esc(kind)}">${header({ actor, title: label, kind })}${effect ? `<div class="hol-chat-effect">${esc(effect)}</div>` : ""}${die ? `<div class="hol-chat-supply"><span role="img" class="hol-chat-die kept" aria-label="Supply die ${esc(die.face)}">${esc(die.face)}</span><span>Supply d${esc(die.before)} → <strong>${die.after ? "d" + esc(die.after) : "Empty"}</strong></span></div>` : ""}${detail ? `<p class="hol-chat-resource-note">${esc(detail)}</p>` : ""}<footer class="hol-chat-footer"><span>${esc(status)}</span></footer></article>`;
}
