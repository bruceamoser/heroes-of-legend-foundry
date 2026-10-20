import { ruleIndex, openLocalRule, importRuleJournals, localizeRuleLinks, searchLocalRules } from "../services/journals.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class RulesLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-rules-library"],
    window: { title: "Heroes of Legend · Rules library", resizable: true },
    position: { width: 700, height: 680 },
    actions: { openRule: RulesLibrary.openRule, importRules: RulesLibrary.importRules },
  };
  static PARTS = { main: { template: "systems/heroes-of-legend/templates/rules-library.hbs", scrollable: [".hol-library-list"] } };
  async _prepareContext() { return { records: await ruleIndex(), gm: game.user.isGM }; }
  _onRender(context, options) {
    super._onRender(context, options);
    let revision = 0;
    const filter = async () => {
      const current = ++revision;
      try {
        const matches = await searchLocalRules(this.element.querySelector("[data-library-search]").value, this.element.querySelector("[data-library-collection]").value);
        if (current !== revision) return;
        for (const row of this.element.querySelectorAll("[data-library-entry]")) row.hidden = !matches.has(row.dataset.path);
      } catch (error) { ui.notifications.error(error.message); }
    };
    this.element.querySelector("[data-library-search]").addEventListener("input", filter);
    this.element.querySelector("[data-library-collection]").addEventListener("change", filter);
  }
  static async openRule(event, target) {
    try { await openLocalRule(target.dataset.path); } catch (error) { ui.notifications.error(error.message); }
  }
  static async importRules() {
    try { const result = await importRuleJournals(); ui.notifications.info(`Rules journals: ${result.created} imported, ${result.retained} existing references preserved.`); }
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
    localizeRuleLinks(root).catch(error => console.error("heroes-of-legend | Local rule links", error));
  };
  Hooks.on("renderApplicationV2", links);
  Hooks.on("renderChatMessageHTML", links);
}
