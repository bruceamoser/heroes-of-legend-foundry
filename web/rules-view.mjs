export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function inline(text, resolve) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, path) => {
      const id = resolve?.(path);
      return id
        ? `<button type="button" class="rule-link" data-rule="${esc(id)}">${label}</button>`
        : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
export function ruleMarkup(markdown, resolve) {
  return String(markdown ?? "")
    .split(/\n\s*\n/)
    .map((block) => {
      const heading = block.match(/^(#{1,6}) (.*)$/);
      if (heading)
        return `<h${Math.min(4, heading[1].length + 1)}>${inline(heading[2], resolve)}</h${Math.min(4, heading[1].length + 1)}>`;
      if (block.startsWith("|"))
        return `<div class="rule-table"><table>${block
          .split("\n")
          .filter((r) => !/^\|[- :|]+$/.test(r))
          .map(
            (r, i) =>
              `<tr>${r
                .split("|")
                .slice(1, -1)
                .map(
                  (c) =>
                    `<${i ? "td" : "th"}>${inline(c.trim(), resolve)}</${i ? "td" : "th"}>`,
                )
                .join("")}</tr>`,
          )
          .join("")}</table></div>`;
      if (block.split("\n").every((l) => l.startsWith("- ")))
        return `<ul>${block
          .split("\n")
          .map((l) => `<li>${inline(l.slice(2), resolve)}</li>`)
          .join("")}</ul>`;
      return `<p>${inline(block, resolve).replace(/\n/g, " ")}</p>`;
    })
    .join("");
}
export function recordMarkup(record, resolve) {
  if (record.markdown) return ruleMarkup(record.markdown, resolve);
  const ref = record.reference;
  return `<h2>${esc(record.name)}</h2>${ref?.flavor?.map((t) => `<p class="flavor">${esc(t)}</p>`).join("") ?? ""}<dl>${ref?.rules?.details?.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("") ?? ""}</dl>${ref?.rules?.body?.map((b) => (b.outcomes ? `<table>${b.outcomes.map((o) => `<tr><th>${esc(o.label)}</th><td>${esc(o.text)}</td></tr>`).join("")}</table>` : b.text ? `<p>${esc(b.text)}</p>` : "")).join("") ?? ""}${ref?.rules?.notes?.map((n) => `<p>${esc(typeof n === "string" ? n : n.text)}</p>`).join("") ?? ""}`;
}
