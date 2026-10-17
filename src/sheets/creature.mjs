import { declareNpcMelee } from "../services/npc-attacks.mjs";
import { CharacterSheet } from "./character.mjs";
export class CreatureSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hol-creature"],
    actions: { npcMelee: CreatureSheet.npcMelee },
    position: { width: 740, height: 800 },
  };
  async _prepareContext(options) {
    return { ...(await super._prepareContext(options)), gm: game.user.isGM };
  }
  static async npcMelee() {
    try {
      const blockable = this.element.querySelector("[data-npc-blockable]")
        ?.value;
      await declareNpcMelee(this.actor, {
        blockable: blockable === "" ? undefined : blockable === "true",
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/creature.hbs",
      scrollable: [""],
    },
  };
}
