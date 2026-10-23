import { ATTRIBUTES } from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
const { ArrayField, SchemaField, StringField, BooleanField } = foundry.data.fields;
const SPEED_MODES = ["burrow", "climb", "fly", "swim"];
const text = (initial = "", choices) =>
  new StringField({
    required: true,
    nullable: false,
    initial,
    // Preserve the complete pinned Markdown, including its final newline.
    trim: false,
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
/** A source reference profile, independent of character and NPC attack models. */
export class SummonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const boolean = initial => new BooleanField({ required: true, nullable: false, initial });
    return {
      schemaVersion: integer(1, 1, 1),
      attributes: new SchemaField(Object.fromEntries(ATTRIBUTES.map(key => [key,
        new SchemaField({ base: integer(0, -2, 2) })]))),
      health: new SchemaField({ value: integer(5), baseMax: integer(5, 1) }),
      cv: signedInteger(0), eligibility: text(), biography: text(),
      speed: integer(0), speedSource: text(),
      alternateSpeeds: new ArrayField(new SchemaField({ mode: text("", SPEED_MODES), value: integer(0) }),
        { required: true, nullable: false, initial: [] }),
      footprint: new SchemaField({ width: integer(1, 1), height: integer(1, 1) }),
      defenseModifier: modifier(), stability: integer(0, 0, 3), stabilitySource: text(),
      resistances: mitigations(), weaknesses: mitigations(),
      immunities: new ArrayField(text(), { required: true, nullable: false, initial: [] }),
      senses: text(), communication: text(),
      basicMelee: new SchemaField({
        orientation: text("attacker", ["attacker"]), attribute: text("brawn", ATTRIBUTES),
        attackModifier: modifier(), weak: integer(1), standard: integer(2), strong: integer(4),
      }),
      attacks: new ArrayField(new SchemaField({
        name: text(), attribute: text("brawn", ATTRIBUTES), orientation: text("attacker", ["attacker"]),
        attackModifier: modifier(), weak: text(), standard: text(), strong: text(),
      }), { required: true, nullable: false, initial: [] }),
      commandSource: text(), healingSource: text(),
      restrictions: new SchemaField({
        canReceiveHealing: boolean(false), reactions: boolean(false), opportunityAttacks: boolean(false),
        independentTurns: boolean(false), turnAnchor: text("controller", ["controller"]),
        maximumCommandsPerTurn: integer(1, 1, 1), tetherSquares: integer(6, 6, 6),
        disappearsAtHp: integer(0, 0, 0), permanentLoot: boolean(false),
      }),
      sourceMarkdown: text(), referenceMarkdown: text(),
    };
  }
  static validateJoint(data) {
    if (data.health.value > data.health.baseMax)
      throw new Error("Current HP cannot exceed maximum HP.");
    for (const key of ["canReceiveHealing", "reactions", "opportunityAttacks", "independentTurns", "permanentLoot"])
      if (data.restrictions[key] !== false) throw new Error(`Summon restriction ${key} must remain false.`);
  }
  prepareDerivedData() {
    this.health.max = this.health.baseMax;
    for (const key of ATTRIBUTES) this.attributes[key].effective = this.attributes[key].base;
  }
}
