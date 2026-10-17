import { ATTRIBUTES, characterSummary, validateCharacter } from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
const { SchemaField, StringField } = foundry.data.fields;
const integer = (initial, min = 0, max) => new NumberField({ required: true, nullable: false, integer: true, initial, min, max });

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      schemaVersion: integer(1, 1, 1),
      attributes: new SchemaField(Object.fromEntries(ATTRIBUTES.map(key => [key,
        new SchemaField({ base: integer(0, -2, 2) })]))),
      health: new SchemaField({ value: integer(12), baseMax: integer(12, 1) }),
      grit: new SchemaField({ granted: integer(2), spent: integer(0) }),
      biography: new StringField({ required: true, nullable: false, initial: "" })
    };
  }
  static validateJoint(data) { validateCharacter(data); }
  prepareDerivedData() {
    const summary = characterSummary(this);
    this.health.max = summary.healthMax;
    this.grit.available = summary.gritAvailable;
    for (const key of ATTRIBUTES) this.attributes[key].effective = this.attributes[key].base;
  }
  get attributeTotal() { return characterSummary(this).attributeTotal; }
}
