import { ATTRIBUTES } from "../rules/character.mjs";
import { StrictNumberField as NumberField } from "./fields.mjs";
const { HTMLField, SchemaField, StringField } = foundry.data.fields;
const text = (initial = "", choices) => new StringField({ required: true, nullable: false, initial, choices });
export class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      schemaVersion: new NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1, max: 1 }),
      description: new HTMLField({ required: true, nullable: false, initial: "" }),
      activity: new SchemaField({
        action: text("main", ["main", "maneuver", "reaction", "passive", "movement", "other"]),
        rollMode: text("attribute", ["attribute", "none", "delegated"]),
        attribute: text("brawn", ATTRIBUTES),
        defenseAttribute: text("agility", ATTRIBUTES)
      }),
      outcomes: new SchemaField({ weak: text(), standard: text(), strong: text() })
    };
  }
}
