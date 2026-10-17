import { ATTRIBUTES } from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
const { SchemaField, StringField } = foundry.data.fields;
const integer = (initial, min = 0, max) =>
  new NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial,
    min,
    max,
  });
const modifier = () =>
  new SchemaField({ boons: integer(0), banes: integer(0) });
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
      health: new SchemaField({ value: integer(12), baseMax: integer(12, 1) }),
      cv: integer(0),
      speed: integer(6),
      size: integer(1, 1),
      armor: integer(0, 0, 3),
      stability: integer(0, 0, 3),
      threat: modifier(),
      evasion: modifier(),
      basicMelee: new SchemaField({
        weak: integer(5),
        standard: integer(3),
        strong: integer(2),
      }),
      biography: new StringField({
        required: true,
        nullable: false,
        initial: "",
      }),
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
