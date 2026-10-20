import { ruleIndex, openLocalRule, importRuleJournals, localizeRuleLinks, searchLocalRules, renderInlineRule } from "../services/journals.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class RulesLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-rules-library"],
    window: { title: "Heroes of Legend · Rules library", resizable: true },
    position: { width: 700, height: 680 },
    actions: { openRule: RulesLibrary.openRule, importRules: RulesLibrary.importRules },
  };
  static PARTS = { main: { template: "systems/heroes-of-legend/templates/rules-library.hbs", scrollable: [".hol-library-list"] } };
  async _prepareContext() {
    const records = await ruleIndex();
    const books = [...new Set(records.map(record => record.pack))].map(pack => ({pack, name:pack === "player-rules" ? "Player’s Book" : "Dungeon Architect’s Guide & Bestiary", sections:[...new Set(records.filter(record => record.pack === pack).map(record => record.section))].map(name => ({name,records:records.filter(record => record.pack === pack && record.section === name)}))}));
    return {records,books,gm:game.user.isGM};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    let revision = 0;
    const filter = async () => {
      const current = ++revision;
      try {
        const matches = await searchLocalRules(this.element.querySelector("[data-library-search]").value, this.element.querySelector("[data-library-collection]").value);
        if (current !== revision) return;
        for (const row of this.element.querySelectorAll("[data-library-entry]")) row.hidden = !matches.has(row.dataset.path);
        for (const section of this.element.querySelectorAll(".hol-library-list details")) section.hidden = ![...section.querySelectorAll("[data-library-entry]")].some(row=>!row.hidden);
        for (const book of this.element.querySelectorAll("[data-library-book]")) book.hidden=![...book.querySelectorAll("[data-library-entry]")].some(row=>!row.hidden);
        this.element.querySelector("[data-library-empty]").hidden=matches.size>0;
      } catch (error) { ui.notifications.error(error.message); }
    };
    this.element.querySelector("[data-library-search]").addEventListener("input", filter);
    this.element.querySelector("[data-library-collection]").addEventListener("change", filter);
    this.rulePath??="design/rules/foundations.md";
    try {await renderInlineRule(this.rulePath,this.element.querySelector("[data-library-reader]"));this.markSelectedRule();}catch(error){ui.notifications.error(error.message);}
  }
  markSelectedRule(){
    for(const button of this.element.querySelectorAll("[data-library-entry] button"))button.setAttribute("aria-current",String(button.dataset.path===this.rulePath));
  }
  static async openRule(event, target) {
    try { this.rulePath=target.dataset.path;await renderInlineRule(this.rulePath, this.element.querySelector("[data-library-reader]"));this.markSelectedRule(); } catch (error) { ui.notifications.error(error.message); }
  }
  static async importRules() {
    try { const result = await importRuleJournals(); ui.notifications.info(`Rules books: ${result.created} imported, ${result.retained} existing books preserved.`); }
    catch (error) { ui.notifications.error(error.message); }
  }
}
export function registerRulesLibrary() {
  game.settings.registerMenu("heroes-of-legend", "rulesLibrary", { name: "Heroes of Legend rules", label: "Open rules library", hint: "Read bundled rules and catalogs. The Dungeon Architect can import editable world copies.", icon: "fa-solid fa-book-open", type: RulesLibrary, restricted: false });
  Hooks.on("renderJournalDirectory", (app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root || root.querySelector("[data-hol-library]")) return;
    const button = document.createElement("button"); button.type = "button";
    button.dataset.holLibrary = "true"; button.textContent = "Heroes of Legend rules";
    button.addEventListener("click", () => new RulesLibrary().render({ force: true }));
    (root.querySelector(".directory-header") ?? root).prepend(button);
  });
  const links = (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
    if (app.document?.getFlag?.("heroes-of-legend", "ruleBook")) root?.classList.add("hol-native-book");
    localizeRuleLinks(root).catch(error => console.error("heroes-of-legend | Local rule links", error));
  };
  Hooks.on("renderApplicationV2", links);
  Hooks.on("renderJournalEntrySheet", links);
  Hooks.on("renderChatMessageHTML", links);
}
