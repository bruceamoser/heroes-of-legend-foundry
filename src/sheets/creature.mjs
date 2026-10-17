import { CharacterSheet } from "./character.mjs";
export class CreatureSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hol-creature"],
    position: { width: 740, height: 800 },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/creature.hbs",
      scrollable: [""],
    },
  };
}
