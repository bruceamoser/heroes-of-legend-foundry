import { ATTRIBUTES } from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
const { ArrayField, SchemaField, StringField, BooleanField } =
  foundry.data.fields;
const SPEED_MODES = ["burrow", "climb", "fly", "swim"];
const text = (initial = "", choices) =>
  new StringField({
    required: true,
    nullable: false,
    initial,
    // V14 choice-backed strings reject blank values unless blank is enabled.
    blank: !choices || (Array.isArray(choices) && choices.includes("")),
    choices,
  });
const integer = (initial, min = 0, max) =>
  new NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial,
    min,
    max,
  });
const signedInteger = (initial) =>
  new NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial,
  });
const modifier = () =>
  new SchemaField({
    boons: integer(0),
    banes: integer(0),
    sourceText: text(),
  });
const numericMitigation = () =>
  new SchemaField({
    type: text(),
    value: integer(0, 0, 3),
  });
const specialMitigation = () =>
  new SchemaField({
    type: text(),
    reference: text(),
  });
const mitigations = () =>
  new SchemaField({
    numeric: new ArrayField(numericMitigation(), {
      required: true,
      nullable: false,
      initial: [],
    }),
    special: new ArrayField(specialMitigation(), {
      required: true,
      nullable: false,
      initial: [],
    }),
    sourceText: text(),
  });
/** Printed creature statistics are independent of character creation formulas. */
export class CreatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      schemaVersion: integer(1, 1, 1),
      attributes: new SchemaField(
        Object.fromEntries(
          ATTRIBUTES.map((key) => [
            key,
            new SchemaField({ base: integer(0, -2, 2) }),
          ]),
        ),
      ),
      attributesSource: text(),
      health: new SchemaField({
        value: integer(12),
        baseMax: integer(12, 1),
        sourceText: text(),
      }),
      // Source CV is signed and must not be clamped to the current roster.
      cv: signedInteger(0),
      speed: integer(6),
      speedSource: text(),
      alternateSpeeds: new ArrayField(
        new SchemaField({
          mode: text("", SPEED_MODES),
          value: integer(0),
        }),
        { required: true, nullable: false, initial: [] },
      ),
      size: integer(1, 1),
      sizeLabel: text(),
      sizeSource: text(),
      footprint: new SchemaField({
        width: integer(1, 1),
        height: integer(1, 1),
      }),
      armor: integer(0, 0, 3),
      armorMarker: text("", ["", "*"]),
      armorSource: text(),
      stability: integer(0, 0, 3),
      threat: modifier(),
      evasion: modifier(),
      weaknesses: mitigations(),
      resistances: mitigations(),
      immunities: new ArrayField(text(), {
        required: true,
        nullable: false,
        initial: [],
      }),
      basicMelee: new SchemaField({
        weak: integer(5),
        standard: integer(3),
        strong: integer(2),
        defenseAttribute: text("agility", ATTRIBUTES),
        orientation: text("player-defense", ["player-defense"]),
      }),
      actions: new SchemaField({
        orientation: text("player-defense", ["player-defense"]),
        entries: new ArrayField(
          new SchemaField({
            id: text(),
            abilityId: text(),
            category: text("main", ["main", "maneuver", "reaction"]),
            name: text(),
            attributeKey: text("", ["", ...ATTRIBUTES]),
            defenseSource: text(),
            harmfulOnly: new BooleanField({ initial: false }),
            hasOutcomes: new BooleanField({ initial: false }),
            outcomes: new SchemaField({
              weak: text(),
              standard: text(),
              strong: text(),
            }),
            effect: text(),
            referenceMarkdown: text(),
          }),
          { required: true, nullable: false, initial: [] },
        ),
        introductionMarkdown: text(),
        mainMarkdown: text(),
        maneuverMarkdown: text(),
        reactionMarkdown: text(),
      }),
      details: new SchemaField({
        flavorMarkdown: text(),
        specialtyMarkdown: text(),
        generalMarkdown: text(),
        designNotesMarkdown: text(),
      }),
      biography: text(),
    };
  }
  static validateJoint(data) {
    if (data.health.value > data.health.baseMax)
      throw new Error("Current HP cannot exceed maximum HP.");
  }
  prepareDerivedData() {
    this.health.max = this.health.baseMax;
    for (const key of ATTRIBUTES)
      this.attributes[key].effective = this.attributes[key].base;
  }
}
