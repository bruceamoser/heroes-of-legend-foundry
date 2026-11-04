import {loadCatalogs} from "./catalog.mjs";
import {abilityRuleReferenceHTML} from "../rules/rule-reference-view.mjs";
const ID = "heroes-of-legend";
let indexPromise;
const searchDocuments = new Map();
export async function ruleIndex() {
  indexPromise ??= fetch(`systems/${ID}/data/journal-index.json`).then(response => {
    if (!response.ok) throw new Error("Cannot load local rules index.");
    return response.json();
  }).catch(error => { indexPromise = null; throw error; });
  const index = await indexPromise;
  return index.records.filter(record => game.user.isGM || record.pack === "player-rules");
}
export async function searchLocalRules(query, collection = "all") {
  const records = (await ruleIndex()).filter(record => collection === "all" || record.path.startsWith(collection));
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return new Set(records.map(record => record.path));
  for (const name of new Set(records.map(record => record.pack))) {
    if (!searchDocuments.has(name)) searchDocuments.set(name, game.packs.get(`${ID}.${name}`).getDocuments().catch(error => { searchDocuments.delete(name); throw error; }));
  }
  const text = new Map();
  for (const name of new Set(records.map(record => record.pack))) for (const document of await searchDocuments.get(name)) {
    if (!document.testUserPermission(game.user, "OBSERVER")) continue;
    for (const page of document.pages) text.set(page.id, (page.text?.content ?? "").replace(/<[^>]*>/g, " ").toLocaleLowerCase());
  }
  return new Set(records.filter(record => `${record.name} ${record.path}`.toLocaleLowerCase().includes(normalized) || text.get(record.pageId)?.includes(normalized)).map(record => record.path));
}
/** Read the installed rulebook page for the user's audience. */
export async function localRulePage(path) {
  const record = (await ruleIndex()).find(record => record.path === path);
  if (!record) throw new Error("This rule is unavailable to this user.");
  const page = await fromUuid(record.uuid);
  if (!page?.testUserPermission(game.user, "OBSERVER")) throw new Error("You cannot read this rule reference.");
  return page;
}
/** Explicit full-book navigation uses Foundry's native TOC, search and paging. */
export async function openLocalRule(path) {
  const page = await localRulePage(path);
  await page.parent.sheet.render({ force: true, pageId: page.id, mode: foundry.applications.sheets.journal.JournalEntrySheet.VIEW_MODES.SINGLE });
  return page;
}
/** Close a reference without destroying the host retained by a sheet or wizard. */
export function closeInlineRule(container) {
  if (container.hasAttribute("data-library-reader")) container.replaceChildren();
  else if (container.hasAttribute("data-rule-content")) {
    container.replaceChildren();
    const panel=container.closest("[data-character-reference],[data-creation-reference]");
    if(panel)panel.hidden=true;
  } else container.remove();
}
/** Inline presentation for ability cards, character choices and rule links. */
export async function renderInlineRule(path, container) {
  const page = await localRulePage(path);
  const ability = path.startsWith("design/cards/")
    ? (await loadCatalogs()).choices.find(record => record.kind === "ability" && record.source.path === path)
    : null;
  let markup = ability ? abilityRuleReferenceHTML(ability) : page.text.content;
  if (!ability){
    const heading=`<h2>${foundry.utils.escapeHTML(page.name)}</h2>`;
    markup=/^<article[^>]*>/.test(markup)?markup.replace(/^(<article[^>]*>)/,`$1${heading}`):`<article class="hol-journal-page">${heading}${markup}</article>`;
  }
  const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(markup, {async:true, relativeTo:page, secrets:game.user.isGM});
  // The content is sanitized by TextEditor; controls are built through DOM APIs.
  container.replaceChildren();
  container.classList.add("hol-inline-rule");
  const controls = document.createElement("header");
  const book = document.createElement("button"); book.type = "button"; book.textContent = "Open full book";
  book.addEventListener("click", () => openLocalRule(path).catch(error => ui.notifications.error(error.message)));
  const close = document.createElement("button"); close.type = "button"; close.textContent = "Close rules";
  close.addEventListener("click", () => {
    closeInlineRule(container);
  });
  controls.append(book, close);
  const content = document.createElement("div"); content.innerHTML = html;
  container.append(controls, content);
  await localizeRuleLinks(container);
  return page;
}
export function bindLocalRuleLinks(root) {
  for (const link of root.querySelectorAll('a[data-hol-rule-path]')) {
    if (link.dataset.holRuleBound) continue;
    link.dataset.holRuleBound = "true";
    link.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const existing = link.nextElementSibling;
      if (existing?.classList.contains("hol-inline-rule")) { existing.remove(); return; }
      const container = document.createElement("section");
      container.setAttribute("aria-label", "Rule reference");
      link.insertAdjacentElement("afterend", container);
      renderInlineRule(link.dataset.holRulePath, container).catch(error => { container.remove(); ui.notifications.error(error.message); });
    });
  }
}

/** Replace pinned source links at the presentation boundary, including wizard references. */
export async function localizeRuleLinks(root) {
  if (!root?.querySelectorAll) return;
  const records = await ruleIndex();
  const paths = new Set(records.map(record => record.path));
  for (const link of root.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(link.getAttribute("href")); } catch { continue; }
    if (url.hostname !== "github.com") continue;
    const match = url.pathname.match(/^\/bruceamoser\/heroes-of-legend\/blob\/[^/]+\/(design\/.+)$/);
    if (!match || !paths.has(decodeURIComponent(match[1]))) continue;
    link.dataset.holRulePath = decodeURIComponent(match[1]);
    link.href = "#";
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }
  const byUuid = new Map(records.flatMap(record => [[record.uuid, record.path], ...(record.legacyUuid ? [[record.legacyUuid, record.path]] : [])]));
  for (const link of root.querySelectorAll('a[data-uuid]')) {
    const path = byUuid.get(link.dataset.uuid);
    if (path) { link.dataset.holRulePath = path; link.href = "#"; }
  }
  bindLocalRuleLinks(root);
}
