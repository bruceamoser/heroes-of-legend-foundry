const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const TAU = Math.PI * 2;
const SECTION = ["I", "II", "III", "IV"];
const WEBP_TOKENS = new Set([
  "arms", "armor", "guard", "marksmanship", "athletics", "subterfuge",
  "wilderness", "medicine", "craft", "scholarship", "influence", "life",
]);
const atlasCache = new WeakMap();
const point = (center, angle, distance) => ({
  x: Math.round(center.x + Math.cos(angle) * distance),
  y: Math.round(center.y + Math.sin(angle) * distance),
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function atlasLayout(graph) {
  if (atlasCache.has(graph)) return atlasCache.get(graph);
  const positions = new Map();
  const edges = [];
  const center = { x: 0, y: 0 };
  const outerCount = 12;
  const innerCount = 6;
  const ringRadius = [595, 307];

  graph.disciplines.forEach((discipline, index) => {
    let origin = center;
    if (index < outerCount)
      origin = point(center, -Math.PI / 2 + index * TAU / outerCount, ringRadius[0]);
    else if (index < outerCount + innerCount)
      origin = point(center, -Math.PI / 2 + (index - outerCount + 0.5) * TAU / innerCount, ringRadius[1]);
    positions.set(discipline.id, origin);
    discipline.paths.forEach((path, index) => {
      const direction = -Math.PI / 2 + index * TAU / discipline.paths.length;
      const radius = 31;
      const lobe = point(origin, direction, 52);
      path.steps.forEach((id, step) => {
        const angle = direction + Math.PI + step * 1.7 * Math.PI / (path.steps.length - 1);
        const target = point(lobe, angle, radius);
        const predecessor = path.steps[step - 1] ?? discipline.id;
        const previous = positions.get(predecessor);
        positions.set(id, target);
        edges.push({
          from: predecessor,
          to: id,
          draw: step
            ? `M ${previous.x} ${previous.y} A ${radius} ${radius} 0 0 1 ${target.x} ${target.y}`
            : `M ${previous.x} ${previous.y} L ${target.x} ${target.y}`,
        });
      });
    });
  });

  const clusters = graph.disciplines.map((discipline) => positions.get(discipline.id));
  const placed = [];
  for (const node of graph.nodes.filter((node) => node.kind === "combined")) {
    const contacts = node.requires.map((id) => positions.get(id));
    const midpoint = {
      x: contacts.reduce((sum, p) => sum + p.x, 0) / contacts.length,
      y: contacts.reduce((sum, p) => sum + p.y, 0) / contacts.length,
    };
    // Place the marker near its actual endpoints without obscuring a branch.
    let position;
    for (let radius = 0; !position && radius <= 1_440; radius += 21) {
      const candidates = Math.max(1, Math.ceil(TAU * radius / 25));
      for (let index = 0; index < candidates; index++) {
        const candidate = point(midpoint, index * TAU / candidates, radius);
        if (
          clusters.every((p) =>
            distance(p, candidate) > 95 &&
            (Math.abs(candidate.x - p.x) > 75 || Math.abs(candidate.y - p.y + 91) > 25),
          ) &&
          placed.every((p) => distance(p, candidate) > 45)
        ) {
          position = candidate;
          break;
        }
      }
    }
    position ??= midpoint;
    positions.set(node.id, position);
    placed.push(position);
  }
  const result = { positions, edges };
  atlasCache.set(graph, result);
  return result;
}

function control(action, id, label, attributes = "", className = "") {
  return `<button type="button" data-action="${action}" data-id="${escape(id)}" class="${className}" ${attributes}>${label}</button>`;
}

function disciplineToken(id) {
  const extension = WEBP_TOKENS.has(id) ? "webp" : "svg";
  return `<img class="forge-token" src="assets/${encodeURIComponent(id)}.${extension}" alt="" draggable="false">`;
}

function nodeStatus(model, id) {
  if (model.learned.has(id)) return "learned";
  return model.eligibility(id).eligible ? "available" : "later";
}

function nodeButton(model, node, content, { className = "", style = "", tabIndex } = {}) {
  const status = nodeStatus(model, node.id);
  const selected = model.selected?.id === node.id;
  const label = `${node.name}, ${status === "later" ? "requirements to meet" : status}`;
  return control(
    "forge-select",
    node.id,
    content,
    `aria-label="${escape(label)}" aria-pressed="${selected}" title="${escape(label)}"${style ? ` style="${style}"` : ""}${tabIndex === undefined ? "" : ` tabindex="${tabIndex}"`}`,
    `forge-node is-${status} ${className}`,
  );
}

function visibleDisciplines(model) {
  const { disciplines, discipline, nodes, selected, view, learned } = model;
  if (discipline && discipline !== "all") {
    const ids = new Set([discipline]);
    if (selected?.kind === "combined")
      for (const id of selected.requires) ids.add(nodes.get(id)?.disciplineId);
    return disciplines.filter((entry) => ids.has(entry.id));
  }
  if (view !== "owned") return disciplines;
  const ids = new Set(disciplines.filter((entry) => learned.has(entry.id)).map((entry) => entry.id));
  if (selected?.kind === "combined")
    for (const id of selected.requires) ids.add(nodes.get(id)?.disciplineId);
  return disciplines.filter((entry) => ids.has(entry.id));
}

function connectedCombinations(model, visible) {
  const disciplineIds = new Set(visible.map((entry) => entry.id));
  return model.combinations.filter((entry) =>
    entry.requires.some((id) => disciplineIds.has(model.nodes.get(id)?.disciplineId)),
  );
}

function mapView(model, visible) {
  if (!visible.length) return `<p class="forge-empty">Begin studying a discipline to see it here. ${control("forge-view", "atlas", "Show whole atlas", "", "small")}</p>`;

  const { positions, edges } = atlasLayout(model.graph);
  const paths = visible.flatMap((entry) => entry.paths);
  const combinations = connectedCombinations(model, visible);
  const overview = visible.length > 4;
  const mapCombinations = overview
    ? combinations
    : combinations.filter((node) => node.id === model.selected?.id);
  const focus = [
    ...visible.map((entry) => ({ id: entry.id, pad: 105 })),
    ...mapCombinations.map((entry) => ({ id: entry.id, pad: 25 })),
  ];
  const minX = Math.min(...focus.map(({ id, pad }) => positions.get(id).x - pad));
  const minY = Math.min(...focus.map(({ id, pad }) => positions.get(id).y - pad - 12));
  const width = Math.max(...focus.map(({ id, pad }) => positions.get(id).x + pad)) - minX;
  const height = Math.max(...focus.map(({ id, pad }) => positions.get(id).y + pad)) - minY;
  const toStyle = (p) => `--node-x:${100 * (p.x - minX) / width}%;--node-y:${100 * (p.y - minY) / height}%`;
  const visibleIds = new Set(paths.flatMap((entry) => entry.steps));
  const selection = model.selected;
  const relevantEdges = edges.filter(({ to }) => visibleIds.has(to));
  const branchPaths = relevantEdges.map(({ from, to, draw }) =>
    `<path class="forge-branch ${model.learned.has(to) ? "is-learned" : ""} ${selection?.id === to || selection?.id === from ? "is-highlighted" : ""}" data-from="${escape(from)}" data-to="${escape(to)}" d="${draw}"/>`,
  ).join("");
  const crossPaths = mapCombinations.filter((entry) =>
    entry.id === selection?.id || entry.requires.includes(selection?.id),
  ).flatMap((entry) => entry.requires.filter((id) => visibleIds.has(id)).map((id) => {
    const source = positions.get(id);
    const destination = positions.get(entry.id);
    const path = `M ${source.x} ${source.y} Q ${source.x} ${destination.y} ${destination.x} ${destination.y}`;
    return `<path class="forge-cross ${model.learned.has(id) ? "is-learned" : ""}" data-from="${escape(id)}" data-to="${escape(entry.id)}" d="${path}"/>`;
  })).join("");
  const roots = visible.map((entry) => {
    const p = positions.get(entry.id);
    return nodeButton(
      model,
      model.nodes.get(entry.id),
      disciplineToken(entry.id),
      { className: "forge-map-root", style: toStyle(p) },
    ) + `<span class="forge-map-name" style="${toStyle({ x: p.x, y: p.y - 91 })}" aria-hidden="true">${escape(entry.name)}</span>`;
  }).join("");
  const steps = paths.flatMap((path) => path.steps.map((id, index) => {
    const node = model.nodes.get(id);
    const end = index === path.steps.length - 1;
    return nodeButton(model, node, "", {
      className: `forge-map-step${end ? " forge-map-end" : ""}`,
      style: toStyle(positions.get(id)),
      tabIndex: overview ? -1 : undefined,
    });
  })).join("");
  const crossNodes = mapCombinations.map((node) =>
    nodeButton(model, node, String(node.requires.length), {
      className: "forge-map-combination",
      style: toStyle(positions.get(node.id)),
      tabIndex: overview ? -1 : undefined,
    }),
  ).join("");
  const mapRatio = width / height;
  return `<div class="forge-map-scroll" tabindex="0" aria-label="Discipline map"><div class="forge-map ${visible.length === 1 ? "forge-map-focus" : "forge-map-overview"}" style="--map-ratio:${mapRatio};--map-zoom:${model.zoom}"><svg viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${branchPaths}${crossPaths}</svg>${roots}${steps}${crossNodes}</div></div>`;
}

function spellCard(spell) {
  const fields = [
    ["Casting", spell.action],
    ["Time", spell.ritualTime ?? spell.time],
    ["Trigger", spell.trigger],
    ["Attribute", spell.attribute],
    ["Target / range", spell.target],
    ["Duration", spell.duration],
  ].filter(([, value]) => value);
  return `<details class="forge-spell"><summary><span>Page ${escape(spell.page)} · ${escape(spell.name)}</span><span>${spell.sp} SP</span></summary><dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl><p>${escape(spell.effect)}</p></details>`;
}

function pathCard(model, path) {
  const book = model.books.get(path.bookId);
  return `<section class="forge-path"><h4>${escape(path.name)}</h4>${book ? `<p>${escape(book.name)}</p>` : ""}<ol>${path.steps.map((id, index) => {
    const node = model.nodes.get(id);
    return `<li>${nodeButton(model, node, `<span>${escape(node.name)}</span><small>${model.learned.has(id) ? "Learned" : `${node.dp} DP${node.level ? ` · Level ${node.level}` : ""}`}</small>`, {
      className: `forge-path-step${index === path.steps.length - 1 ? " forge-path-end" : ""}`,
    })}</li>`;
  }).join("")}</ol></section>`;
}

function columnView(model, visible) {
  return visible.length
    ? visible.map((discipline) => {
      const root = model.nodes.get(discipline.id);
      const open = visible.length === 1 || model.discipline === discipline.id ||
        model.selected?.disciplineId === discipline.id || model.selected?.id === discipline.id;
      return `<details class="forge-columns-discipline" ${open ? "open" : ""}><summary>${disciplineToken(discipline.id)}<span>${escape(discipline.name)}</span><small>${model.learned.has(root.id) ? "Studying" : "1 DP"}</small></summary><div class="forge-columns-body">${nodeButton(model, root, `Study ${escape(root.name)}`, { className: "forge-column-root" })}<div class="forge-paths">${discipline.paths.map((path) => pathCard(model, path)).join("")}</div></div></details>`;
    }).join("")
    : '<p class="forge-empty">Begin studying a discipline to see it here.</p>';
}

function relatedList(model, nodes, label, showPath = false) {
  if (!nodes.length) return "";
  const rows = nodes.map((node) => {
    const discipline = showPath && model.disciplines.find((entry) => entry.id === node.disciplineId);
    const path = discipline && discipline.paths.find((entry) => entry.id === node.pathId);
    const context = path ? `<span class="forge-endpoint-context">${escape(discipline.name)} · ${escape(path.name)}</span>` : "";
    const title = `<span>${escape(node.name)}${context}</span>`;
    const status = `<small>${model.learned.has(node.id) ? "Learned" : "View path"}</small>`;
    return `<li>${nodeButton(model, node, title + status, { className: "forge-related-node" })}</li>`;
  }).join("");
  return `<section class="forge-related"><h4>${label}</h4><ul>${rows}</ul></section>`;
}

function inspector(model) {
  const node = model.selected;
  if (!node)
    return '<div class="forge-inspector"><p>Select a discipline, a step, or a combined ability to see what it teaches.</p></div>';
  const availability = model.eligibility(node.id);
  const learned = model.learned.has(node.id);
  const discipline = model.disciplines.find((entry) => entry.id === (node.disciplineId ?? node.id));
  const path = discipline?.paths.find((entry) => entry.id === node.pathId);
  const book = model.books.get(path?.bookId);
  const parentNodes = node.requires.map((id) => model.nodes.get(id));
  const children = model.graph.nodes.filter((entry) => entry.requires.includes(node.id));
  const next = children.filter((entry) => entry.kind !== "combined");
  const combined = children.filter((entry) => entry.kind === "combined");
  const canRefund = typeof model.canRefund === "function" ? model.canRefund(node.id) : model.canRefund;
  const currency = learned ? "Learned" : `${node.dp} DP`;
  const context = [discipline?.name, path?.name].filter((value) => value && value !== node.name).join(" · ");
  const sectionIndex = node.kind === "section" ? path?.steps.indexOf(node.id) : -1;
  const reasons = (availability.reasons ?? []).map((reason) => typeof reason === "string" ? reason : reason.text).filter(Boolean);
  const description = node.effect ?? (node.kind === "discipline" ? "Choose any of its four paths and learn the steps in order." : "");
  return `<section class="forge-inspector" id="forge-selection" aria-label="Selected learning" tabindex="-1">
    ${context ? `<p class="forge-context">${escape(context)}${sectionIndex >= 0 ? ` · Section ${SECTION[sectionIndex]}` : ""}</p>` : ""}
    <h3>${escape(node.name)}</h3>
    <p class="forge-meta">${currency}${node.level ? ` · Level ${node.level}` : ""}${node.kind === "combined" ? ` · ${node.requires.length} disciplines` : ""}</p>
    ${description ? `<p class="forge-effect">${escape(description)}</p>` : ""}
    ${!learned && reasons.length ? `<ul class="forge-reasons">${reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>` : ""}
    <div class="forge-inspector-actions">
      ${!learned ? control("forge-learn", node.id, node.kind === "discipline" ? "Begin studying" : "Learn", availability.eligible ? "" : "disabled", "primary") : ""}
      ${learned && canRefund ? control("forge-refund", node.id, "Undo learning") : ""}
      ${discipline && model.discipline !== discipline.id && model.view !== "columns" ? control("forge-filter", discipline.id, "View discipline", "", "small") : ""}
    </div>
    ${relatedList(model, parentNodes, node.kind === "combined" ? "Required endpoints" : "Earlier step", node.kind === "combined")}
    ${relatedList(model, next, node.kind === "discipline" ? "First steps" : "Next step")}
    ${relatedList(model, combined, "Combined abilities")}
    ${node.spellIds?.length ? `<section class="forge-pages"><h4>${escape(book?.name ?? "Spell pages")}</h4>${node.spellIds.map((id) => spellCard(model.spells.get(id))).join("")}</section>` : ""}
  </section>`;
}

/** Render learning controls inside the Workshop's delegated button dispatcher. */
export function renderForge(graph, state, options = {}) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const learned = new Set(state.learned ?? []);
  const view = ["atlas", "owned", "columns"].includes(options.view) ? options.view : "atlas";
  const requestedDiscipline = graph.disciplines.find((entry) => entry.id === options.discipline);
  const selected = nodes.get(options.selected) ?? nodes.get(requestedDiscipline?.id);
  const model = {
    graph, nodes, learned, view, selected,
    discipline: requestedDiscipline?.id,
    zoom: Math.min(2, Math.max(0.75, Number(options.zoom) || 1)),
    canRefund: options.canRefund ?? options.refundable,
    disciplines: graph.disciplines,
    combinations: graph.nodes.filter((node) => node.kind === "combined"),
    books: new Map(graph.books.map((book) => [book.id, book])),
    spells: new Map(graph.spells.map((spell) => [spell.id, spell])),
    eligibility: options.eligibility ?? ((id) => {
      const node = nodes.get(id);
      return {
        eligible: !learned.has(id) && state.level >= node.level &&
          state.dp >= node.dp && node.requires.every((required) => learned.has(required)),
        cost: node.dp,
        reasons: [],
      };
    }),
  };
  const visible = visibleDisciplines(model);
  const combinations = connectedCombinations(model, visible);
  const columns = view === "columns";
  const viewed = (id) => `aria-pressed="${view === id}"`;
  return `<div class="workshop-forge">
    <div class="forge-controls" aria-label="Learning views">
      <div class="forge-view-buttons">
        ${control("forge-view", "atlas", "Whole atlas", viewed("atlas"), "small")}
        ${control("forge-view", "owned", "My disciplines", viewed("owned"), "small")}
        ${control("forge-view", "columns", "Column view", viewed("columns"), "small")}
      </div>
      <strong class="forge-dp">${state.dp} DP available</strong>
    </div>
    <details class="forge-filters" ${requestedDiscipline ? "open" : ""}>
      <summary>${requestedDiscipline ? escape(requestedDiscipline.name) : "Find a discipline"}</summary>
      <div class="forge-filter-buttons">
        ${control("forge-filter", "all", "All disciplines", `aria-pressed="${!requestedDiscipline}"`, "small")}
        ${model.disciplines.map((entry) => control("forge-filter", entry.id, escape(entry.name), `aria-pressed="${requestedDiscipline?.id === entry.id}"`, "small")).join("")}
      </div>
    </details>
    <div class="forge-workspace">
      <div class="forge-surface">
        ${columns ? columnView(model, visible) : `<div class="forge-map-toolbar">
          ${control("forge-view", "zoom-out", "−", 'aria-label="Zoom out"', "small")}
          ${control("forge-view", "zoom-in", "+", 'aria-label="Zoom in"', "small")}
          <span class="forge-map-legend"><span class="forge-key forge-key-learned">Learned</span><span class="forge-key forge-key-available">Available</span><span class="forge-key">Requirements to meet</span></span>
        </div>${mapView(model, visible)}`}
      </div>
      ${inspector(model)}
      <div class="forge-more">
        ${relatedList(model, combinations, "Combined abilities")}
        ${relatedList(model, graph.nodes.filter((node) => node.kind === "talent"), "Talents")}
      </div>
    </div>
  </div>`;
}
