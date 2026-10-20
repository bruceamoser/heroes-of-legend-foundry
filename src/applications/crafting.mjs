import { openLocalRule } from "../services/journals.mjs";
import { bindNetChoices } from "../dialogs/net-control.mjs";
import { loadCatalogs } from "../services/catalog.mjs";
import { nativeCraftingRecipes, requestCrafting } from "../services/crafting.mjs";
const ID = "heroes-of-legend";
export class CraftingPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(actor) {
    super(); this.actor = actor;
    this.actorHook = Hooks.on("updateActor", changed => { if (changed.uuid === actor.uuid && this.rendered) void this.render(); });
  }
  async _onClose(options) { Hooks.off("updateActor", this.actorHook); return super._onClose(options); }
  static DEFAULT_OPTIONS = { classes: [ID, "hol-crafting"], window: { title: "Crafting", resizable: true }, position: { width: 660, height: 600 }, actions: { start: CraftingPanel.start, attempt: CraftingPanel.attempt, refresh: CraftingPanel.refresh, reference: CraftingPanel.reference, resume: CraftingPanel.resume, recover: CraftingPanel.recover } };
  static PARTS = { main: { template: `systems/${ID}/templates/crafting.hbs`, scrollable: [".hol-tool-content"] } };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OBSERVER")) throw new Error("This character is not readable.");
    const catalogs = await loadCatalogs();
    const recipes = nativeCraftingRecipes(this.actor, catalogs).map(recipe => ({ ...recipe,
      available: recipe.abilities.length > 0,
      supplies: this.actor.items.filter(i => i.type === "equipment" && i.system.catalogId === recipe.product && i.system.quantity > 0).map(i => ({ id: i.id, name: i.name, die: i.system.inventoryDie, selected: recipe.project?.supplyId === i.id })),
    }));
    return { name: this.actor.name, recipes, gm: game.user.isGM, owned: this.actor.isOwner, pending: this.actor.getFlag(ID, "pendingCrafting"), canResume: this.actor.getFlag(ID, "pendingCrafting")?.status === "rolled" };
  }
  async _onRender(context, options) { await super._onRender(context, options); bindNetChoices(this.element); }
  static async recover() {
    try {
      const faces = this.element.querySelector("[name=retainedCraftDice]").value.split(",").map(s => Number(s.trim()));
      await requestCrafting(this.actor, { kind: "recover", faces });
    } catch (e) { ui.notifications.error(e.message); }
  }
  static async resume() {
    try { await requestCrafting(this.actor, { kind: "resume" }); } catch (e) { ui.notifications.error(e.message); }
  }
  static async reference(event, target) {
    try { await openLocalRule(target.dataset.path); } catch (e) { ui.notifications.error(e.message); }
  }
  static async refresh() { await this.render(); }
  static async start(event, target) { await this.submitCraft(target, { kind: "start" }); }
  static async attempt(event, target) {
    const row = target.closest("[data-recipe]");
    await this.submitCraft(target, { kind: "attempt", abilityId: row.querySelector("[name=ability]").value, adjustment: Number(row.querySelector("[name=adjustment]").value), supplyId: row.querySelector("[name=supply]")?.value ?? "" });
  }
  async submitCraft(target, payload) {
    target.disabled = true;
    try { await requestCrafting(this.actor, { ...payload, recipeId: target.closest("[data-recipe]").dataset.recipe }); ui.notifications.info("Crafting request sent."); }
    catch (e) { ui.notifications.error(e.message); }
    finally { if (target.isConnected) target.disabled = false; }
  }
}
