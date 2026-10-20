import {createLandingScene} from "../services/landing.mjs";
import {RulesLibrary} from "./journals.mjs";
import {ruleIndex, openLocalRule} from "../services/journals.mjs";
const ID = "heroes-of-legend";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
export class LandingSetup extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [ID, "hol-landing-setup"], window: {title: "Heroes of Legend · The gathering"},
    position: {width: 650}, actions: {create: LandingSetup.create, view: LandingSetup.view},
  };
  static PARTS = {main: {template: `systems/${ID}/templates/landing-setup.hbs`}};
  async _prepareContext() {return {exists: game.scenes.some(scene => scene.getFlag(ID, "landing"))};}
  static async create() {
    try {await createLandingScene(); await this.render(); ui.notifications.info("The gathering is ready in Scenes. Activate it when your table is ready.");}
    catch (error) {ui.notifications.error(error.message);}
  }
  static async view() {
    try {const scene = await createLandingScene(); await scene.view(); await this.close();}
    catch (error) {ui.notifications.error(error.message);}
  }
}
function renderLandingNavigation() {
  document.getElementById("hol-landing-navigation")?.remove();
  if (!canvas.scene?.getFlag(ID, "landing")) return;
  const nav = document.createElement("nav"); nav.id = "hol-landing-navigation";
  nav.setAttribute("aria-label", "Heroes of Legend gathering");
  const button = (label, action) => {
    const item = document.createElement("button"); item.type = "button"; item.textContent = label;
    item.addEventListener("click", () => Promise.resolve().then(action).catch(error => ui.notifications.warn(error.message)));
    nav.append(item);
  };
  button("My hero", async () => {
    const actor = game.user.isGM ? canvas.tokens.controlled[0]?.actor ?? game.user.character : game.user.character;
    if (!actor) throw new Error(game.user.isGM ? "Open your hero from Actors, or assign a character in User Configuration." : "Ask your Dungeon Architect to assign your hero in User Configuration.");
    await actor.sheet.render({force: true});
  });
  button("Player’s Book", async () => {
    const first = (await ruleIndex()).find(record => record.pack === "player-rules");
    await openLocalRule(first.path);
  });
  button("Rules library", () => new RulesLibrary().render({force: true}));
  if (game.user.isGM) button("DA’s Guide", async () => {
    const first = (await ruleIndex()).find(record => record.pack === "da-rules");
    await openLocalRule(first.path);
  });
  document.body.append(nav);
}
export function registerHOLTheme() {
  game.settings.register(ID, "theme", {name: "Heroes of Legend interface", hint: "Forest green, gold and parchment for Foundry’s controls and sidebars.", scope: "client", config: true, type: Boolean, default: true,
    onChange: enabled => document.body.classList.toggle("hol-theme", enabled)});
  game.settings.registerMenu(ID, "landingScene", {name: "Heroes of Legend landing scene", label: "Prepare the gathering", hint: "Create an editable scene using the Player’s Book artwork. Existing scenes and edits are preserved.", icon: "fa-solid fa-panorama", type: LandingSetup, restricted: true});
  // Register canvas font loading as well as CSS: native Drawings use PIXI text.
  for (const [name, file] of [["HOL Cinzel", "Cinzel.ttf"], ["HOL Garamond", "EBGaramond.ttf"]]) {
    CONFIG.fontDefinitions[name] = {editor: true, fonts: [{urls: [`systems/${ID}/fonts/${file}`], weight: 400, style: "normal"}]};
  }
  Hooks.once("ready", () => document.body.classList.toggle("hol-theme", game.settings.get(ID, "theme")));
  Hooks.on("canvasReady", renderLandingNavigation);
  Hooks.on("canvasTearDown", () => document.getElementById("hol-landing-navigation")?.remove());
  Hooks.on("renderSceneDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
    if (!root || root.querySelector("[data-hol-landing]")) return;
    const button = document.createElement("button"); button.type = "button"; button.dataset.holLanding = "true";
    button.textContent = "Prepare the gathering";
    button.addEventListener("click", () => new LandingSetup().render({force: true}));
    (root.querySelector(".directory-header") ?? root).prepend(button);
  });
}
