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
    text.set(document.id, document.pages.map(page => page.text?.content ?? "").join(" ").replace(/<[^>]*>/g, " ").toLocaleLowerCase());
  }
  return new Set(records.filter(record => `${record.name} ${record.path}`.toLocaleLowerCase().includes(normalized) || text.get(record.id)?.includes(normalized)).map(record => record.path));
}
export async function openLocalRule(path) {
  const record = (await ruleIndex()).find(record => record.path === path);
  if (!record) throw new Error("This rule is unavailable to this user.");
  const imported = game.journal.find(entry => entry.getFlag(ID, "ruleSource")?.path === path && entry.testUserPermission(game.user, "OBSERVER"));
  const page = imported?.pages.find(page => page.id === record.pageId) ?? imported?.pages.contents?.[0];
  const document = page ?? await fromUuid(record.uuid);
  if (!document || !document.testUserPermission(game.user, "OBSERVER")) throw new Error("You cannot read this rule reference.");
  await (document.parent?.sheet ?? document.sheet).render({ force: true, pageId: document.id, mode: "single" });
  return document;
}
let importing;
/** Explicit GM import. Existing source identities are retained, including renamed/edited entries. */
export async function importRuleJournals() {
  if (!game.user.isGM) throw new Error("Only the Dungeon Architect can import rule journals.");
  if (importing) return importing;
  importing = (async () => {
    const records = await ruleIndex();
    let created = 0, retained = 0;
    const sources = new Map();
    for (const name of new Set(records.map(record => record.pack))) {
      const pack = game.packs.get(`${ID}.${name}`);
      if (!pack) throw new Error(`Missing rules compendium: ${name}`);
      sources.set(name, new Map((await pack.getDocuments()).map(document => [document.id, document])));
    }
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      try {
        const documents = await JournalEntry.createDocuments(batch, { keepId: true, keepEmbeddedIds: true });
        created += documents.length;
      } catch (error) {
        // Concurrent GM imports use the same IDs. A retry cannot create a second copy.
        if (!batch.every(data => game.journal.some(entry => entry.getFlag(ID, "ruleSource")?.path === data.flags[ID].ruleSource.path))) throw error;
        retained += batch.length;
      }
      batch = [];
    };
    for (const record of records) {
      if (game.journal.some(entry => entry.getFlag(ID, "ruleSource")?.path === record.path)) { retained++; continue; }
      const source = sources.get(record.pack)?.get(record.id);
      if (!source) throw new Error(`Missing local rule: ${record.name}`);
      const data = source.toObject();
      data._id = record.id;
      if (game.journal.some(entry => entry.id === record.id)) throw new Error(`An unrelated world journal occupies the rule ID for ${record.name}; it was preserved.`);
      data.ownership = { default: record.pack === "player-rules" ? 2 : 0 };
      batch.push(data);
      if (batch.length === 50) await flush();
    }
    await flush();
    return { created, retained };
  })();
  try { return await importing; } finally { importing = null; }
}

export function bindLocalRuleLinks(root) {
  for (const link of root.querySelectorAll('a[data-hol-rule-path]')) {
    if (link.dataset.holRuleBound) continue;
    link.dataset.holRuleBound = "true";
    link.addEventListener("click", event => {
      event.preventDefault();
      openLocalRule(link.dataset.holRulePath).catch(error => ui.notifications.error(error.message));
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
  bindLocalRuleLinks(root);
}
