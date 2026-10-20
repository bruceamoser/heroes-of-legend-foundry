import { StrictNumberField as NumberField } from "./fields.mjs";
const { HTMLField, StringField, BooleanField } = foundry.data.fields;
const integer = (initial, min, max) =>
  new NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial,
    min,
    max,
  });
export class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      schemaVersion: integer(1, 1, 1),
      catalogId: new StringField({
        required: true,
        nullable: false,
        initial: "",
      }),
      quantity: integer(1, 0),
      bulk: integer(1, 0),
      hands: integer(0, 0, 2),
      inventoryDie: integer(0, 0, 20),
      carried: new BooleanField({ initial: true }),
      held: new BooleanField({ initial: false }),
      worn: new BooleanField({ initial: false }),
      description: new HTMLField({
        required: true,
        nullable: false,
        initial: "",
      }),
    };
  }
  static validateJoint(data) {
    if (data.carried === false && (data.held || data.worn))
      throw new Error("Stored equipment cannot be held or worn.");
    if (![0, 4, 6, 8, 10, 12, 20].includes(data.inventoryDie))
      throw new Error("Invalid inventory die");
  }
}
