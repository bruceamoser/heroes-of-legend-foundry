import {
  ATTRIBUTES,
  characterSummary,
  validateCharacter,
} from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
import { normalizeRecovery } from "../rules/recovery.mjs";
const { SchemaField, StringField, BooleanField } = foundry.data.fields;
const integer = (initial, min = 0, max) =>
  new NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial,
    min,
    max,
  });

export class CharacterData extends foundry.abstract.TypeDataModel {
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
      grit: new SchemaField({ granted: integer(2), spent: integer(0) }),
      recovery: new SchemaField({
        unavailableHp: integer(0, 0, 1),
        debtUsed: new BooleanField({ required: true, nullable: false, initial: false }),
      }),
      memorizedMessage: new StringField({
        required: true,
        nullable: false,
        initial: "",
        maxLength: 5000,
      }),
      biography: new StringField({
        required: true,
        nullable: false,
        initial: "",
      }),
    };
  }
  static validateJoint(data) {
    validateCharacter(data);
    normalizeRecovery(data.recovery);
  }
  prepareDerivedData() {
    const summary = characterSummary(this);
    this.health.max = summary.healthMax;
    this.grit.available = summary.gritAvailable;
    for (const key of ATTRIBUTES)
      this.attributes[key].effective = this.attributes[key].base;
  }
  get attributeTotal() {
    return characterSummary(this).attributeTotal;
  }
}
